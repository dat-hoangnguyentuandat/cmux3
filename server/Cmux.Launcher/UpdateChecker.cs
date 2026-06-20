using System.Net.Http;
using System.Net.Http.Json;
using System.Text.Json;

namespace Cmux.Launcher;

/// <summary>
/// Best-effort update check against the GitHub releases API. The launcher only
/// reports the latest tag; it never auto-downloads. Network failures are
/// silently ignored so the menu always works offline.
/// </summary>
internal static class UpdateChecker
{
    // Override with CMUX_REPO=owner/name if the project moves.
    private static string Repo =>
        Environment.GetEnvironmentVariable("CMUX_REPO") ?? "dat-hoangnguyentuandat/cmux3";

    private static readonly HttpClient Http = CreateClient();

    private static HttpClient CreateClient()
    {
        var http = new HttpClient { Timeout = TimeSpan.FromSeconds(4) };
        http.DefaultRequestHeaders.UserAgent.ParseAdd("cmux3-launcher");
        http.DefaultRequestHeaders.Accept.ParseAdd("application/vnd.github+json");
        return http;
    }

    internal static string? LatestVersion { get; private set; }

    /// <summary>Returns the latest tag if it is newer than the current build.</summary>
    internal static string? CheckForUpdate()
    {
        try
        {
            var url = $"https://api.github.com/repos/{Repo}/releases/latest";
            using var resp = Http.GetAsync(url).GetAwaiter().GetResult();
            if (!resp.IsSuccessStatusCode)
                return null;

            var json = resp.Content.ReadAsStringAsync().GetAwaiter().GetResult();
            using var doc = JsonDocument.Parse(json);
            if (!doc.RootElement.TryGetProperty("tag_name", out var tag))
                return null;

            var latest = (tag.GetString() ?? "").TrimStart('v', 'V');
            if (string.IsNullOrWhiteSpace(latest))
                return null;

            LatestVersion = latest;
            return IsNewer(latest, Program.CurrentVersion) ? latest : null;
        }
        catch
        {
            return null;
        }
    }

    private static bool IsNewer(string latest, string current)
    {
        if (Version.TryParse(latest, out var l) && Version.TryParse(current, out var c))
            return l > c;
        return !string.Equals(latest, current, StringComparison.OrdinalIgnoreCase);
    }
}
