using System.Collections.Concurrent;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Text.Json;
using Cmux.Core.Models;

namespace Cmux.Core.Services;

/// <summary>
/// Loads structural knowledge graphs from `gitnexus` indexes and serves
/// cwd-scoped snapshots for visualization.
///
/// Data source: shells out to `gitnexus cypher` so we don't need to bind
/// LadybugDB native libraries from .NET. The cypher queries return JSON which
/// we parse into <see cref="KnowledgeGraphSnapshot"/>.
///
/// Caching: full repo graph is cached per-repo. Cwd filtering is done on the
/// in-memory cache, so changing pwsh directory does NOT re-shell-out.
/// </summary>
public sealed class KnowledgeGraphService
{
    private readonly ConcurrentDictionary<string, RepoGraphCache> _cacheByRoot =
        new(StringComparer.OrdinalIgnoreCase);

    private readonly ConcurrentDictionary<string, Task<RepoGraphCache?>> _loadingByRoot =
        new(StringComparer.OrdinalIgnoreCase);

    public event Action<string>? GraphLoaded;
    public event Action<string, string>? GraphLoadFailed;

    /// <summary>
    /// Returns a snapshot containing only nodes whose filePath sits under
    /// <paramref name="cwd"/>. Loads the repo graph on first call.
    /// </summary>
    public async Task<KnowledgeGraphSnapshot> GetSnapshotForCwdAsync(string repoRoot, string cwd)
    {
        var cache = await EnsureLoadedAsync(repoRoot);
        if (cache == null)
        {
            return new KnowledgeGraphSnapshot { RepoRoot = repoRoot, Cwd = cwd };
        }

        return BuildScopedSnapshot(cache, cwd);
    }

    /// <summary>
    /// Synchronously returns the cached snapshot if the graph is already
    /// loaded; null otherwise (caller can fall back to async load).
    /// </summary>
    public KnowledgeGraphSnapshot? TryGetSnapshotForCwd(string repoRoot, string cwd)
    {
        if (!_cacheByRoot.TryGetValue(NormalizePath(repoRoot), out var cache))
            return null;
        return BuildScopedSnapshot(cache, cwd);
    }

    public bool IsLoaded(string repoRoot) => _cacheByRoot.ContainsKey(NormalizePath(repoRoot));

    /// <summary>
    /// Builds a structural File/Folder graph for an arbitrary folder using only
    /// a file-tree walk. Never shells out to the gitnexus CLI and never creates
    /// a .gitnexus folder — safe to run on any directory the user picks.
    /// </summary>
    public Task<KnowledgeGraphSnapshot> BuildFileTreeSnapshotAsync(string folderPath)
    {
        return Task.Run(() =>
        {
            var root = NormalizePath(folderPath);
            var snapshot = new KnowledgeGraphSnapshot
            {
                RepoRoot = root,
                Cwd = root,
                BuiltAt = DateTime.UtcNow,
            };
            try
            {
                var cache = BuildFileTreeFallback(root);
                snapshot.Nodes.AddRange(cache.Nodes);
                snapshot.Edges.AddRange(cache.Edges);
            }
            catch { }
            return snapshot;
        });
    }

    public void Invalidate(string repoRoot)
    {
        _cacheByRoot.TryRemove(NormalizePath(repoRoot), out _);
    }

    private Task<RepoGraphCache?> EnsureLoadedAsync(string repoRoot)
    {
        var key = NormalizePath(repoRoot);
        if (_cacheByRoot.TryGetValue(key, out var existing))
            return Task.FromResult<RepoGraphCache?>(existing);

        return _loadingByRoot.GetOrAdd(key, _ => Task.Run(() =>
        {
            try
            {
                var loaded = LoadRepoGraph(key);
                if (loaded != null)
                {
                    _cacheByRoot[key] = loaded;
                    GraphLoaded?.Invoke(key);
                }
                return loaded;
            }
            catch (Exception ex)
            {
                GraphLoadFailed?.Invoke(key, ex.Message);
                return null;
            }
            finally
            {
                _loadingByRoot.TryRemove(key, out Task<RepoGraphCache?>? _);
            }
        }));
    }

    private RepoGraphCache? LoadRepoGraph(string repoRoot)
    {
        // Strategy:
        //   1. If .gitnexus/ exists AND gitnexus CLI is on PATH → query the
        //      knowledge graph via `gitnexus cypher` for symbol-level detail.
        //   2. Always fall back to a structural file-tree graph so the overlay
        //      shows something useful even when gitnexus isn't installed.
        //
        // The file-tree fallback yields File + Folder nodes with CONTAINS
        // edges. Activity overlay still works because we map tool calls to
        // file paths regardless of how the node was sourced.
        var fromGitNexus = TryLoadFromGitNexus(repoRoot);
        if (fromGitNexus != null && fromGitNexus.Nodes.Count > 0)
            return fromGitNexus;

        return BuildFileTreeFallback(repoRoot);
    }

    private RepoGraphCache? TryLoadFromGitNexus(string repoRoot)
    {
        if (!Directory.Exists(Path.Combine(repoRoot, ".gitnexus")))
            return null;
        if (ResolveCliPath() == null)
            return null;

        const int NodeLimit = 8000;
        const int EdgeLimit = 30000;

        // Ladybug/Kuzu have separate node tables — query each kind individually
        // and union the results. We treat each kind's table name as the kind label.
        string[] kinds = ["File", "Folder", "Function", "Class", "Method", "Interface", "Struct", "Enum"];
        var nodes = new List<KnowledgeGraphNode>();

        foreach (var kind in kinds)
        {
            var perKind = NodeLimit / kinds.Length;
            var json = RunCypher(repoRoot,
                $"MATCH (n:{kind}) RETURN n.id AS id, n.name AS name, n.filePath AS filePath, " +
                $"n.startLine AS startLine, n.endLine AS endLine LIMIT {perKind}");
            foreach (var n in ParseNodes(json, kind))
                nodes.Add(n);
        }

        if (nodes.Count == 0)
            return null;

        var edgeJson = RunCypher(repoRoot,
            "MATCH (a)-[r:CodeRelation]->(b) " +
            "RETURN a.id AS sourceId, b.id AS targetId, r.type AS type, r.confidence AS confidence " +
            $"LIMIT {EdgeLimit}");
        var edges = ParseEdges(edgeJson, nodes);
        ComputeDegree(nodes, edges);
        return new RepoGraphCache(repoRoot, nodes, edges);
    }

    /// <summary>
    /// Walks the repo file tree and synthesizes File + Folder nodes with
    /// CONTAINS edges. Fast, dependency-free, works for any language.
    /// Skips well-known noise dirs (node_modules, bin, obj, .git, etc.).
    /// </summary>
    private static RepoGraphCache BuildFileTreeFallback(string repoRoot)
    {
        var nodes = new List<KnowledgeGraphNode>();
        var edges = new List<KnowledgeGraphEdge>();
        var nodeIdByPath = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        const int MaxNodes = 4000;

        var skipDirs = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            ".git", ".gitnexus", "node_modules", "bin", "obj", "dist", "out",
            ".next", ".nuxt", ".cache", ".venv", "venv", "__pycache__",
            "target", "build", ".idea", ".vs", ".vscode", "coverage", "publish",
        };

        try
        {
            var rootInfo = new DirectoryInfo(repoRoot);
            var rootId = $"Folder:{rootInfo.FullName}";
            nodes.Add(new KnowledgeGraphNode
            {
                Id = rootId,
                Name = rootInfo.Name,
                Kind = "Folder",
                FilePath = rootInfo.FullName,
            });
            nodeIdByPath[rootInfo.FullName] = rootId;

            var stack = new Stack<DirectoryInfo>();
            stack.Push(rootInfo);

            while (stack.Count > 0 && nodes.Count < MaxNodes)
            {
                var dir = stack.Pop();
                var parentId = nodeIdByPath[dir.FullName];

                IEnumerable<FileSystemInfo> entries;
                try { entries = dir.EnumerateFileSystemInfos(); }
                catch { continue; }

                foreach (var entry in entries)
                {
                    if (nodes.Count >= MaxNodes) break;

                    if (entry is DirectoryInfo sub)
                    {
                        if (skipDirs.Contains(sub.Name)) continue;
                        if (sub.Attributes.HasFlag(FileAttributes.Hidden) && sub.Name != ".github") continue;

                        var subId = $"Folder:{sub.FullName}";
                        nodes.Add(new KnowledgeGraphNode
                        {
                            Id = subId,
                            Name = sub.Name,
                            Kind = "Folder",
                            FilePath = sub.FullName,
                        });
                        nodeIdByPath[sub.FullName] = subId;
                        edges.Add(new KnowledgeGraphEdge
                        {
                            SourceId = parentId,
                            TargetId = subId,
                            Type = "CONTAINS",
                            Confidence = 1.0,
                        });
                        stack.Push(sub);
                    }
                    else if (entry is FileInfo file)
                    {
                        if (file.Attributes.HasFlag(FileAttributes.Hidden)) continue;
                        if (!IsSourceLikeFile(file.Name)) continue;
                        if (file.Length > 4 * 1024 * 1024) continue; // skip huge files

                        var fileId = $"File:{file.FullName}";
                        nodes.Add(new KnowledgeGraphNode
                        {
                            Id = fileId,
                            Name = file.Name,
                            Kind = "File",
                            FilePath = file.FullName,
                        });
                        nodeIdByPath[file.FullName] = fileId;
                        edges.Add(new KnowledgeGraphEdge
                        {
                            SourceId = parentId,
                            TargetId = fileId,
                            Type = "CONTAINS",
                            Confidence = 1.0,
                        });
                    }
                }
            }
        }
        catch { }

        ComputeDegree(nodes, edges);
        return new RepoGraphCache(repoRoot, nodes, edges);
    }

    private static bool IsSourceLikeFile(string name)
    {
        var ext = Path.GetExtension(name).ToLowerInvariant();
        return ext is ".cs" or ".ts" or ".tsx" or ".js" or ".jsx" or ".mjs" or ".cjs"
            or ".py" or ".java" or ".kt" or ".kts" or ".go" or ".rs" or ".swift"
            or ".rb" or ".php" or ".cpp" or ".cc" or ".cxx" or ".c" or ".h" or ".hpp"
            or ".dart" or ".vue" or ".svelte" or ".astro"
            or ".xaml" or ".axaml" or ".razor" or ".cshtml"
            or ".sql" or ".graphql" or ".proto"
            or ".json" or ".yaml" or ".yml" or ".toml"
            or ".md" or ".mdx";
    }

    private static string? RunCypher(string repoRoot, string query)
    {
        var cli = ResolveCliPath();
        if (cli == null) return null;

        var psi = new ProcessStartInfo
        {
            FileName = cli,
            WorkingDirectory = repoRoot,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
        };
        psi.ArgumentList.Add("cypher");
        psi.ArgumentList.Add("--json");
        psi.ArgumentList.Add(query);

        try
        {
            using var proc = Process.Start(psi);
            if (proc == null) return null;
            var sb = new StringBuilder();
            var reader = proc.StandardOutput;
            string? line;
            while ((line = reader.ReadLine()) != null)
                sb.AppendLine(line);

            if (!proc.WaitForExit(TimeSpan.FromMinutes(2)))
            {
                try { proc.Kill(entireProcessTree: true); } catch { }
                return null;
            }
            return sb.ToString();
        }
        catch
        {
            return null;
        }
    }

    private static List<KnowledgeGraphNode> ParseNodes(string? json, string? defaultKind = null)
    {
        var result = new List<KnowledgeGraphNode>();
        if (string.IsNullOrWhiteSpace(json)) return result;

        try
        {
            using var doc = JsonDocument.Parse(json);
            var arr = doc.RootElement;
            if (arr.ValueKind != JsonValueKind.Array)
            {
                if (arr.TryGetProperty("rows", out var rows) && rows.ValueKind == JsonValueKind.Array)
                    arr = rows;
                else if (arr.TryGetProperty("data", out var data) && data.ValueKind == JsonValueKind.Array)
                    arr = data;
                else return result;
            }

            foreach (var row in arr.EnumerateArray())
            {
                var kind = GetString(row, "kind");
                if (string.IsNullOrEmpty(kind))
                    kind = defaultKind ?? "";

                var node = new KnowledgeGraphNode
                {
                    Id = GetString(row, "id"),
                    Name = GetString(row, "name"),
                    Kind = kind,
                    FilePath = NormalizePath(GetString(row, "filePath")),
                    StartLine = GetInt(row, "startLine"),
                    EndLine = GetInt(row, "endLine"),
                    CommunityId = GetInt(row, "communityId", -1),
                };

                if (string.IsNullOrEmpty(node.Id))
                    node.Id = $"{node.Kind}:{node.FilePath}:{node.Name}";

                result.Add(node);
            }
        }
        catch { }

        return result;
    }

    private static List<KnowledgeGraphEdge> ParseEdges(string? json, List<KnowledgeGraphNode> nodes)
    {
        var result = new List<KnowledgeGraphEdge>();
        if (string.IsNullOrWhiteSpace(json)) return result;

        var nodeIds = new HashSet<string>(nodes.Select(n => n.Id), StringComparer.Ordinal);

        try
        {
            using var doc = JsonDocument.Parse(json);
            var arr = doc.RootElement;
            if (arr.ValueKind != JsonValueKind.Array)
            {
                if (arr.TryGetProperty("rows", out var rows) && rows.ValueKind == JsonValueKind.Array)
                    arr = rows;
                else if (arr.TryGetProperty("data", out var data) && data.ValueKind == JsonValueKind.Array)
                    arr = data;
                else return result;
            }

            foreach (var row in arr.EnumerateArray())
            {
                var src = GetString(row, "sourceId");
                var dst = GetString(row, "targetId");
                if (string.IsNullOrEmpty(src) || string.IsNullOrEmpty(dst)) continue;
                if (!nodeIds.Contains(src) || !nodeIds.Contains(dst)) continue;

                result.Add(new KnowledgeGraphEdge
                {
                    SourceId = src,
                    TargetId = dst,
                    Type = GetString(row, "type"),
                    Confidence = GetDouble(row, "confidence", 1.0),
                });
            }
        }
        catch { }

        return result;
    }

    private static void ComputeDegree(List<KnowledgeGraphNode> nodes, List<KnowledgeGraphEdge> edges)
    {
        var byId = nodes.ToDictionary(n => n.Id, StringComparer.Ordinal);
        foreach (var edge in edges)
        {
            if (byId.TryGetValue(edge.SourceId, out var src)) src.Degree++;
            if (byId.TryGetValue(edge.TargetId, out var dst)) dst.Degree++;
        }
    }

    private static KnowledgeGraphSnapshot BuildScopedSnapshot(RepoGraphCache cache, string cwd)
    {
        var snapshot = new KnowledgeGraphSnapshot
        {
            RepoRoot = cache.RepoRoot,
            Cwd = cwd,
            BuiltAt = DateTime.UtcNow,
        };

        var canonicalCwd = NormalizePath(cwd);
        var rootCwd = NormalizePath(cache.RepoRoot);
        var isRepoRoot = string.Equals(canonicalCwd, rootCwd, StringComparison.OrdinalIgnoreCase);

        // Pick nodes whose absolute filePath starts with cwd. Note: gitnexus
        // emits filePaths relative to repoRoot, so we resolve them against
        // repoRoot before comparing.
        var visibleIds = new HashSet<string>(StringComparer.Ordinal);
        foreach (var node in cache.Nodes)
        {
            var abs = ResolveAbsolutePath(cache.RepoRoot, node.FilePath);
            if (isRepoRoot || PathStartsWith(abs, canonicalCwd))
            {
                snapshot.Nodes.Add(node);
                visibleIds.Add(node.Id);
            }
        }

        foreach (var edge in cache.Edges)
        {
            if (visibleIds.Contains(edge.SourceId) && visibleIds.Contains(edge.TargetId))
                snapshot.Edges.Add(edge);
        }

        return snapshot;
    }

    private static string ResolveAbsolutePath(string repoRoot, string filePath)
    {
        if (string.IsNullOrEmpty(filePath)) return repoRoot;
        if (Path.IsPathRooted(filePath)) return NormalizePath(filePath);
        try
        {
            return NormalizePath(Path.GetFullPath(Path.Combine(repoRoot, filePath)));
        }
        catch
        {
            return filePath;
        }
    }

    private static bool PathStartsWith(string path, string prefix)
    {
        if (string.IsNullOrEmpty(prefix)) return true;
        if (string.IsNullOrEmpty(path)) return false;
        if (path.Equals(prefix, StringComparison.OrdinalIgnoreCase)) return true;
        var withSep = prefix.EndsWith(Path.DirectorySeparatorChar)
            ? prefix
            : prefix + Path.DirectorySeparatorChar;
        return path.StartsWith(withSep, StringComparison.OrdinalIgnoreCase);
    }

    private static string NormalizePath(string? path)
    {
        if (string.IsNullOrWhiteSpace(path)) return "";
        try
        {
            return path.Replace('/', Path.DirectorySeparatorChar)
                .TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        }
        catch
        {
            return path;
        }
    }

    private static string GetString(JsonElement row, string name)
    {
        if (row.ValueKind != JsonValueKind.Object) return "";
        if (!row.TryGetProperty(name, out var prop)) return "";
        return prop.ValueKind switch
        {
            JsonValueKind.String => prop.GetString() ?? "",
            JsonValueKind.Number => prop.GetRawText(),
            _ => "",
        };
    }

    private static int GetInt(JsonElement row, string name, int fallback = 0)
    {
        if (row.ValueKind != JsonValueKind.Object) return fallback;
        if (!row.TryGetProperty(name, out var prop)) return fallback;
        if (prop.ValueKind == JsonValueKind.Number && prop.TryGetInt32(out var n)) return n;
        if (prop.ValueKind == JsonValueKind.String && int.TryParse(prop.GetString(), out var s)) return s;
        return fallback;
    }

    private static double GetDouble(JsonElement row, string name, double fallback = 0)
    {
        if (row.ValueKind != JsonValueKind.Object) return fallback;
        if (!row.TryGetProperty(name, out var prop)) return fallback;
        if (prop.ValueKind == JsonValueKind.Number && prop.TryGetDouble(out var n)) return n;
        if (prop.ValueKind == JsonValueKind.String && double.TryParse(prop.GetString(), out var s)) return s;
        return fallback;
    }

    private static string? ResolveCliPath()
    {
        var pathEnv = Environment.GetEnvironmentVariable("PATH") ?? "";
        foreach (var dir in pathEnv.Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries))
        {
            try
            {
                foreach (var name in new[] { "gitnexus.cmd", "gitnexus.exe", "gitnexus" })
                {
                    var full = Path.Combine(dir.Trim(), name);
                    if (File.Exists(full)) return full;
                }
            }
            catch { }
        }
        var appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
        if (!string.IsNullOrEmpty(appData))
        {
            var npmCmd = Path.Combine(appData, "npm", "gitnexus.cmd");
            if (File.Exists(npmCmd)) return npmCmd;
        }
        return null;
    }

    private sealed record RepoGraphCache(
        string RepoRoot,
        List<KnowledgeGraphNode> Nodes,
        List<KnowledgeGraphEdge> Edges);
}
