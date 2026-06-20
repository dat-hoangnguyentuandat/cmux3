using System.Collections.Concurrent;
using System.Diagnostics;
using System.IO;

namespace Cmux.Core.Services;

/// <summary>
/// Auto-runs `gitnexus analyze` on a workspace root when a pwsh terminal opens
/// inside it. Indexes are stored in &lt;repo&gt;/.gitnexus/lbug and reused across runs.
///
/// Behavior:
///   1. Caller invokes EnsureIndexedAsync(repoRoot) when a terminal session starts.
///   2. If `.gitnexus/` already exists and is fresh enough → no-op.
///   3. If gitnexus CLI is not installed → emit InstallationStateChanged(false) and stop.
///   4. Otherwise → spawn `gitnexus analyze` in background, emit IndexingStateChanged.
///
/// Concurrency:
///   - At most one analyze per repoRoot at a time (deduped via _activeRoots).
///   - At most one global "installing" task at a time.
/// </summary>
public sealed class GitNexusService
{
    private static readonly ConcurrentDictionary<string, Task<GitNexusIndexResult>> _activeRoots =
        new(StringComparer.OrdinalIgnoreCase);

    private static readonly TimeSpan _staleAfter = TimeSpan.FromHours(24);

    private static volatile bool _cliCheckedOnce;
    private static volatile bool _cliAvailable;
    private static readonly object _cliCheckLock = new();

    private static volatile Task<bool>? _installTask;
    private static readonly object _installLock = new();

    /// <summary>Fires when an analyze starts/finishes for a given repo root.</summary>
    public event Action<string, GitNexusIndexState>? IndexingStateChanged;

    /// <summary>Fires when CLI install attempt starts/finishes.</summary>
    public event Action<bool>? InstallationStateChanged;

    /// <summary>Fires with each output line from `gitnexus analyze` for diagnostics.</summary>
    public event Action<string, string>? IndexLogLine;

    /// <summary>Returns true if the gitnexus CLI is on PATH.</summary>
    public bool IsCliAvailable
    {
        get
        {
            EnsureCliCheck();
            return _cliAvailable;
        }
    }

    /// <summary>
    /// Looks for `<root>/.gitnexus/` (a directory created by gitnexus analyze).
    /// </summary>
    public static bool HasIndex(string repoRoot)
    {
        if (string.IsNullOrWhiteSpace(repoRoot))
            return false;
        try
        {
            return Directory.Exists(Path.Combine(repoRoot, ".gitnexus"));
        }
        catch
        {
            return false;
        }
    }

    /// <summary>
    /// Checks whether the index in <paramref name="repoRoot"/> is older than
    /// <see cref="_staleAfter"/>. A repo with no index is also considered stale.
    /// </summary>
    public static bool IsStale(string repoRoot)
    {
        if (!HasIndex(repoRoot)) return true;
        try
        {
            var meta = Path.Combine(repoRoot, ".gitnexus", "meta.json");
            if (!File.Exists(meta)) return true;
            var age = DateTime.UtcNow - File.GetLastWriteTimeUtc(meta);
            return age > _staleAfter;
        }
        catch
        {
            return true;
        }
    }

    /// <summary>
    /// Returns the directory that should be indexed for the given working
    /// directory: walks up looking for a .git folder; falls back to the cwd.
    /// </summary>
    public static string? ResolveRepoRoot(string? workingDirectory)
    {
        if (string.IsNullOrWhiteSpace(workingDirectory)) return null;
        try
        {
            var dir = new DirectoryInfo(workingDirectory);
            while (dir != null)
            {
                if (Directory.Exists(Path.Combine(dir.FullName, ".git")))
                    return dir.FullName;
                dir = dir.Parent;
            }
            return workingDirectory;
        }
        catch
        {
            return workingDirectory;
        }
    }

    /// <summary>
    /// Idempotent. Spawns `gitnexus analyze <repoRoot>` once per root. Returns
    /// the in-flight task so multiple terminal panes pointed at the same repo
    /// share one analyze run.
    /// </summary>
    public Task<GitNexusIndexResult> EnsureIndexedAsync(string repoRoot, bool force = false)
    {
        if (!Config.SettingsService.Current.KnowledgeGraphEnabled)
            return Task.FromResult(GitNexusIndexResult.Skipped("knowledge graph disabled"));

        if (string.IsNullOrWhiteSpace(repoRoot))
            return Task.FromResult(GitNexusIndexResult.Skipped("empty path"));

        var canonical = TryCanonicalize(repoRoot);
        if (canonical == null)
            return Task.FromResult(GitNexusIndexResult.Skipped("invalid path"));

        if (!force && !IsStale(canonical))
            return Task.FromResult(GitNexusIndexResult.UpToDate);

        return _activeRoots.GetOrAdd(canonical, root => Task.Run(() => RunAnalyze(root)));
    }

    private GitNexusIndexResult RunAnalyze(string repoRoot)
    {
        try
        {
            EnsureCliCheck();
            if (!_cliAvailable)
            {
                var installed = TryInstallCliBlocking();
                if (!installed)
                {
                    IndexingStateChanged?.Invoke(repoRoot, GitNexusIndexState.SkippedNoCli);
                    return GitNexusIndexResult.Skipped("gitnexus CLI not available");
                }
            }

            IndexingStateChanged?.Invoke(repoRoot, GitNexusIndexState.Started);

            var psi = new ProcessStartInfo
            {
                FileName = ResolveCliPath(),
                WorkingDirectory = repoRoot,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true,
            };
            psi.ArgumentList.Add("analyze");
            psi.ArgumentList.Add(repoRoot);
            psi.ArgumentList.Add("--skip-skills");
            psi.ArgumentList.Add("--skip-agents-md");

            using var proc = Process.Start(psi);
            if (proc == null)
            {
                IndexingStateChanged?.Invoke(repoRoot, GitNexusIndexState.Failed);
                return GitNexusIndexResult.Failed("failed to start gitnexus");
            }

            proc.OutputDataReceived += (_, e) => { if (e.Data != null) IndexLogLine?.Invoke(repoRoot, e.Data); };
            proc.ErrorDataReceived += (_, e) => { if (e.Data != null) IndexLogLine?.Invoke(repoRoot, e.Data); };
            proc.BeginOutputReadLine();
            proc.BeginErrorReadLine();

            // Cap at 15 minutes — analyze on a huge monorepo can be slow but should never hang here.
            if (!proc.WaitForExit(TimeSpan.FromMinutes(15)))
            {
                try { proc.Kill(entireProcessTree: true); } catch { }
                IndexingStateChanged?.Invoke(repoRoot, GitNexusIndexState.Failed);
                return GitNexusIndexResult.Failed("gitnexus analyze timed out");
            }

            var ok = proc.ExitCode == 0;
            IndexingStateChanged?.Invoke(repoRoot, ok ? GitNexusIndexState.Completed : GitNexusIndexState.Failed);
            return ok ? GitNexusIndexResult.Ok : GitNexusIndexResult.Failed($"exit {proc.ExitCode}");
        }
        catch (Exception ex)
        {
            IndexingStateChanged?.Invoke(repoRoot, GitNexusIndexState.Failed);
            return GitNexusIndexResult.Failed(ex.Message);
        }
        finally
        {
            _activeRoots.TryRemove(repoRoot, out _);
        }
    }

    private void EnsureCliCheck()
    {
        if (_cliCheckedOnce) return;
        lock (_cliCheckLock)
        {
            if (_cliCheckedOnce) return;
            _cliAvailable = ResolveCliPath() != null;
            _cliCheckedOnce = true;
        }
    }

    private static string? ResolveCliPath()
    {
        var pathEnv = Environment.GetEnvironmentVariable("PATH") ?? "";
        var separators = new[] { Path.PathSeparator };
        foreach (var dir in pathEnv.Split(separators, StringSplitOptions.RemoveEmptyEntries))
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

        // Fallback: well-known npm install location
        var appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
        if (!string.IsNullOrEmpty(appData))
        {
            var npmCmd = Path.Combine(appData, "npm", "gitnexus.cmd");
            if (File.Exists(npmCmd)) return npmCmd;
        }
        return null;
    }

    private bool TryInstallCliBlocking()
    {
        Task<bool> task;
        lock (_installLock)
        {
            task = _installTask ??= Task.Run(InstallCliCore);
        }
        try
        {
            return task.Wait(TimeSpan.FromMinutes(5)) && task.Result;
        }
        catch
        {
            return false;
        }
    }

    private bool InstallCliCore()
    {
        InstallationStateChanged?.Invoke(true);
        try
        {
            var npm = FindOnPath("npm.cmd") ?? FindOnPath("npm.exe") ?? FindOnPath("npm");
            if (npm == null)
                return false;

            var psi = new ProcessStartInfo
            {
                FileName = npm,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true,
            };
            psi.ArgumentList.Add("install");
            psi.ArgumentList.Add("-g");
            psi.ArgumentList.Add("gitnexus@latest");
            psi.Environment["GITNEXUS_SKIP_OPTIONAL_GRAMMARS"] = "1";

            using var proc = Process.Start(psi);
            if (proc == null) return false;

            proc.OutputDataReceived += (_, e) => { if (e.Data != null) IndexLogLine?.Invoke("(install)", e.Data); };
            proc.ErrorDataReceived += (_, e) => { if (e.Data != null) IndexLogLine?.Invoke("(install)", e.Data); };
            proc.BeginOutputReadLine();
            proc.BeginErrorReadLine();

            if (!proc.WaitForExit(TimeSpan.FromMinutes(5)))
            {
                try { proc.Kill(entireProcessTree: true); } catch { }
                return false;
            }

            if (proc.ExitCode != 0) return false;

            // Re-check CLI availability after install.
            _cliCheckedOnce = false;
            EnsureCliCheck();
            return _cliAvailable;
        }
        catch
        {
            return false;
        }
        finally
        {
            InstallationStateChanged?.Invoke(false);
        }
    }

    private static string? FindOnPath(string name)
    {
        var pathEnv = Environment.GetEnvironmentVariable("PATH") ?? "";
        foreach (var dir in pathEnv.Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries))
        {
            try
            {
                var full = Path.Combine(dir.Trim(), name);
                if (File.Exists(full)) return full;
            }
            catch { }
        }
        return null;
    }

    private static string? TryCanonicalize(string path)
    {
        try
        {
            var full = Path.GetFullPath(path);
            return full.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        }
        catch
        {
            return null;
        }
    }
}

public enum GitNexusIndexState
{
    Started,
    Completed,
    Failed,
    SkippedNoCli,
}

public readonly record struct GitNexusIndexResult(bool Success, bool WasSkipped, string? Reason)
{
    public static GitNexusIndexResult Ok { get; } = new(true, false, null);
    public static GitNexusIndexResult UpToDate { get; } = new(true, true, "up-to-date");
    public static GitNexusIndexResult Skipped(string reason) => new(false, true, reason);
    public static GitNexusIndexResult Failed(string reason) => new(false, false, reason);
}
