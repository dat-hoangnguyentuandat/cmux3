using System.Collections.Concurrent;
using System.IO;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Cmux.Core.Services;

/// <summary>
/// Watches Claude Code session JSONL files for tool-use events and emits
/// "this file/symbol was just touched" notifications. Drives the highlight
/// glow on the knowledge graph overlay.
///
/// Maps each Claude tool to file paths it implies:
///   Read{file_path}                  → exact file
///   Edit{file_path}                  → exact file (higher heat)
///   Write{file_path}                 → exact file (higher heat)
///   Grep{pattern, path?}             → directory or repo-wide
///   Glob{pattern, path?}             → directory or repo-wide
///   Bash{command}                    → no file unless command names one
///
/// Heat values:
///   Read    1.0
///   Edit    3.0  (3x stronger; Claude editing a file is the strongest signal)
///   Write   3.0
///   Grep    0.5  (broad search, weak signal per file)
///   Glob    0.5
///   Bash    0.7  (medium; only if a path is parsed out of the command)
/// </summary>
public sealed class ActivityGraphService : IDisposable
{
    private readonly ConcurrentDictionary<string, FileSystemWatcher> _watchers = new();
    private readonly ConcurrentDictionary<string, long> _readOffsets = new();
    private readonly object _emitLock = new();

    public event Action<ToolActivityEvent>? ToolActivityObserved;

    /// <summary>
    /// Start watching the Claude project directory for the given workspace root.
    /// Claude Code stores sessions in <c>~/.claude/projects/&lt;encoded-cwd&gt;/*.jsonl</c>.
    /// </summary>
    public void WatchWorkspace(string repoRoot)
    {
        if (string.IsNullOrWhiteSpace(repoRoot)) return;

        var projectDir = GetClaudeProjectDir(repoRoot);
        if (_watchers.ContainsKey(projectDir)) return;

        try
        {
            Directory.CreateDirectory(projectDir);
            var watcher = new FileSystemWatcher(projectDir)
            {
                Filter = "*.jsonl",
                NotifyFilter = NotifyFilters.LastWrite | NotifyFilters.Size | NotifyFilters.FileName,
                IncludeSubdirectories = false,
                EnableRaisingEvents = true,
            };
            watcher.Changed += (_, e) => _ = ProcessJsonlAsync(e.FullPath, repoRoot);
            watcher.Created += (_, e) => _ = ProcessJsonlAsync(e.FullPath, repoRoot);
            _watchers[projectDir] = watcher;

            // Seed initial state: scan recent files but don't emit historical events.
            // We just record offsets so we only react to subsequent appends.
            foreach (var existing in Directory.EnumerateFiles(projectDir, "*.jsonl"))
            {
                try { _readOffsets[existing] = new FileInfo(existing).Length; } catch { }
            }
        }
        catch
        {
            // Sandbox / permission errors — silently disable activity tracking for this repo.
        }
    }

    public void StopWatching(string repoRoot)
    {
        var projectDir = GetClaudeProjectDir(repoRoot);
        if (_watchers.TryRemove(projectDir, out var watcher))
        {
            try { watcher.EnableRaisingEvents = false; } catch { }
            try { watcher.Dispose(); } catch { }
        }
    }

    public void Dispose()
    {
        foreach (var watcher in _watchers.Values)
        {
            try { watcher.EnableRaisingEvents = false; } catch { }
            try { watcher.Dispose(); } catch { }
        }
        _watchers.Clear();
    }

    private async Task ProcessJsonlAsync(string filePath, string repoRoot)
    {
        try
        {
            // Tiny debounce — Claude writes JSONL in small chunks; coalesce bursts.
            await Task.Delay(50);

            long startOffset = _readOffsets.GetValueOrDefault(filePath, 0);
            long fileLength;
            try { fileLength = new FileInfo(filePath).Length; } catch { return; }
            if (fileLength <= startOffset) return;

            using var fs = new FileStream(filePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
            fs.Seek(startOffset, SeekOrigin.Begin);
            using var reader = new StreamReader(fs);
            string? line;
            while ((line = await reader.ReadLineAsync()) != null)
            {
                if (string.IsNullOrWhiteSpace(line)) continue;
                ProcessJsonlLine(line, repoRoot);
            }
            _readOffsets[filePath] = fs.Position;
        }
        catch
        {
            // Best effort. Next change event will reprocess.
        }
    }

    private void ProcessJsonlLine(string line, string repoRoot)
    {
        try
        {
            using var doc = JsonDocument.Parse(line);
            var root = doc.RootElement;
            if (!root.TryGetProperty("type", out var typeEl)) return;
            if (typeEl.GetString() != "assistant") return;

            if (!root.TryGetProperty("message", out var msgEl)) return;
            if (!msgEl.TryGetProperty("content", out var contentEl)) return;
            if (contentEl.ValueKind != JsonValueKind.Array) return;

            foreach (var block in contentEl.EnumerateArray())
            {
                if (!block.TryGetProperty("type", out var blockTypeEl)) continue;
                if (blockTypeEl.GetString() != "tool_use") continue;

                var toolName = block.TryGetProperty("name", out var nEl) ? nEl.GetString() ?? "" : "";
                var input = block.TryGetProperty("input", out var iEl) ? iEl : default;
                EmitForToolUse(toolName, input, repoRoot);
            }
        }
        catch { }
    }

    private void EmitForToolUse(string toolName, JsonElement input, string repoRoot)
    {
        switch (toolName)
        {
            case "Read":
                EmitFile(input, "file_path", repoRoot, ToolKind.Read, heat: 1.0);
                break;
            case "Edit":
            case "MultiEdit":
            case "NotebookEdit":
                EmitFile(input, "file_path", repoRoot, ToolKind.Edit, heat: 3.0);
                break;
            case "Write":
                EmitFile(input, "file_path", repoRoot, ToolKind.Write, heat: 3.0);
                break;
            case "Grep":
                EmitDirOrPattern(input, repoRoot, ToolKind.Grep, heat: 0.5);
                break;
            case "Glob":
                EmitDirOrPattern(input, repoRoot, ToolKind.Glob, heat: 0.5);
                break;
            case "Bash":
                EmitBash(input, repoRoot, heat: 0.7);
                break;
        }
    }

    private void EmitFile(JsonElement input, string key, string repoRoot, ToolKind kind, double heat)
    {
        if (input.ValueKind != JsonValueKind.Object) return;
        if (!input.TryGetProperty(key, out var pathEl)) return;
        var path = pathEl.GetString();
        if (string.IsNullOrWhiteSpace(path)) return;

        Emit(new ToolActivityEvent
        {
            RepoRoot = repoRoot,
            Kind = kind,
            FilePath = NormalizeAbs(path, repoRoot),
            Heat = heat,
            ObservedAt = DateTime.UtcNow,
        });
    }

    private void EmitDirOrPattern(JsonElement input, string repoRoot, ToolKind kind, double heat)
    {
        if (input.ValueKind != JsonValueKind.Object) return;
        var path = input.TryGetProperty("path", out var pEl) ? pEl.GetString() : null;
        var pattern = input.TryGetProperty("pattern", out var ptEl) ? ptEl.GetString() : null;

        Emit(new ToolActivityEvent
        {
            RepoRoot = repoRoot,
            Kind = kind,
            FilePath = string.IsNullOrWhiteSpace(path) ? "" : NormalizeAbs(path, repoRoot),
            Pattern = pattern ?? "",
            Heat = heat,
            ObservedAt = DateTime.UtcNow,
        });
    }

    private void EmitBash(JsonElement input, string repoRoot, double heat)
    {
        if (input.ValueKind != JsonValueKind.Object) return;
        if (!input.TryGetProperty("command", out var cEl)) return;
        var command = cEl.GetString();
        if (string.IsNullOrWhiteSpace(command)) return;

        // Extract any file-looking tokens. This is heuristic but cheap and useful
        // for visualizing "Claude ran a script in this folder".
        var matches = Regex.Matches(command, @"[A-Za-z0-9_./\\-]+\.[A-Za-z0-9]+");
        if (matches.Count == 0)
        {
            Emit(new ToolActivityEvent
            {
                RepoRoot = repoRoot,
                Kind = ToolKind.Bash,
                FilePath = "",
                Pattern = command,
                Heat = heat,
                ObservedAt = DateTime.UtcNow,
            });
            return;
        }

        foreach (Match m in matches)
        {
            Emit(new ToolActivityEvent
            {
                RepoRoot = repoRoot,
                Kind = ToolKind.Bash,
                FilePath = NormalizeAbs(m.Value, repoRoot),
                Pattern = command,
                Heat = heat,
                ObservedAt = DateTime.UtcNow,
            });
        }
    }

    private void Emit(ToolActivityEvent ev)
    {
        lock (_emitLock)
        {
            ToolActivityObserved?.Invoke(ev);
        }
    }

    private static string NormalizeAbs(string path, string repoRoot)
    {
        try
        {
            if (Path.IsPathRooted(path))
                return Path.GetFullPath(path).TrimEnd(Path.DirectorySeparatorChar);
            return Path.GetFullPath(Path.Combine(repoRoot, path)).TrimEnd(Path.DirectorySeparatorChar);
        }
        catch
        {
            return path;
        }
    }

    private static readonly string ClaudeProjectsDir = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".claude", "projects");

    private static string GetClaudeProjectDir(string cwd)
    {
        var sb = new System.Text.StringBuilder(cwd.Length);
        foreach (var c in cwd)
            sb.Append(char.IsLetterOrDigit(c) ? c : '-');
        return Path.Combine(ClaudeProjectsDir, sb.ToString());
    }
}

public enum ToolKind
{
    Read,
    Edit,
    Write,
    Grep,
    Glob,
    Bash,
}

public sealed class ToolActivityEvent
{
    public string RepoRoot { get; set; } = "";
    public ToolKind Kind { get; set; }
    public string FilePath { get; set; } = "";
    public string Pattern { get; set; } = "";
    public double Heat { get; set; }
    public DateTime ObservedAt { get; set; }
}
