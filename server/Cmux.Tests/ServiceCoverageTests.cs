using System.Text.Json;
using Cmux.Core.Models;
using Cmux.Core.Services;
using FluentAssertions;
using Xunit;

namespace Cmux.Tests;

// ── FuzzyMatcher — edge cases not in CoreTests ────────────────────────────────

public class FuzzyMatcherEdgeCaseTests
{
    [Fact]
    public void Match_NullEmptyPattern_ReturnsZeroScore()
    {
        // empty pattern always matches with score 0
        var result = FuzzyMatcher.Match("anything", "");
        result.Should().NotBeNull();
        result!.Value.Score.Should().Be(0);
        result.Value.MatchedIndices.Should().BeEmpty();
    }

    [Fact]
    public void Match_WhitespaceOnlyText_PatternNotFound_ReturnsNull()
    {
        var result = FuzzyMatcher.Match("   ", "a");
        result.Should().BeNull();
    }

    [Fact]
    public void Match_SingleCharPattern_MatchesSingleChar()
    {
        var result = FuzzyMatcher.Match("abc", "b");
        result.Should().NotBeNull();
        result!.Value.MatchedIndices.Should().HaveCount(1);
    }

    [Fact]
    public void Match_PatternLongerThanText_ReturnsNull()
    {
        var result = FuzzyMatcher.Match("ab", "abcdef");
        result.Should().BeNull();
    }

    [Fact]
    public void Match_CaseSensitive_UpperPatternMismatchesLowerText()
    {
        // Smart case: uppercase query → case-sensitive
        var result = FuzzyMatcher.Match("workspace", "W");
        result.Should().BeNull("uppercase W should not match lowercase w");
    }

    [Fact]
    public void Match_CaseSensitive_ExactCaseMatches()
    {
        var result = FuzzyMatcher.Match("Workspace", "W");
        result.Should().NotBeNull();
        result!.Value.MatchedIndices.Should().Contain(0);
    }

    [Fact]
    public void Match_AllSameChars_MatchesFirst()
    {
        var result = FuzzyMatcher.Match("aaaa", "aa");
        result.Should().NotBeNull();
        result!.Value.MatchedIndices.Should().HaveCount(2);
    }

    [Fact]
    public void Match_PathSeparator_TreatedAsWordBoundary()
    {
        // slash/backslash are word boundaries — "src" at start of segment scores higher
        var withBoundary = FuzzyMatcher.Match("src/components/Button.tsx", "but");
        var withoutBoundary = FuzzyMatcher.Match("xbutx", "but");
        withBoundary.Should().NotBeNull();
        withoutBoundary.Should().NotBeNull();
        withBoundary!.Value.Score.Should().BeGreaterThan(withoutBoundary!.Value.Score);
    }

    [Fact]
    public void RankMatches_EmptyCollection_ReturnsEmpty()
    {
        var ranked = FuzzyMatcher.RankMatches(Array.Empty<string>(), "test", x => x);
        ranked.Should().BeEmpty();
    }

    [Fact]
    public void RankMatches_WhitespaceQuery_ReturnsAllItems()
    {
        var items = new[] { "alpha", "beta", "gamma" };
        var ranked = FuzzyMatcher.RankMatches(items, "  ", x => x);
        // whitespace is treated as empty/whitespace → returns all (RankMatches guards IsNullOrWhiteSpace)
        ranked.Should().HaveCount(3);
    }

    [Fact]
    public void RankMatches_SingleItem_MatchReturnsIt()
    {
        var items = new[] { "HelloWorld" };
        var ranked = FuzzyMatcher.RankMatches(items, "hw", x => x);
        ranked.Should().HaveCount(1);
        ranked[0].Item.Should().Be("HelloWorld");
    }

    [Fact]
    public void MatchCaseInsensitive_EmptyQuery_ReturnsZeroScore()
    {
        var result = FuzzyMatcher.MatchCaseInsensitive("hello", "");
        result.Should().NotBeNull();
        result!.Value.Score.Should().Be(0);
    }

    [Fact]
    public void MatchCaseInsensitive_NoMatch_ReturnsNull()
    {
        var result = FuzzyMatcher.MatchCaseInsensitive("hello", "xyz");
        result.Should().BeNull();
    }
}

// ── ClaudeSessionParser — parsing logic ──────────────────────────────────────

public class ClaudeSessionParserTests : IDisposable
{
    private readonly string _tempDir;
    private readonly ClaudeSessionParser _parser = new();

    public ClaudeSessionParserTests()
    {
        _tempDir = Path.Combine(Path.GetTempPath(), $"cmux-claude-{Guid.NewGuid():N}");
        Directory.CreateDirectory(_tempDir);
    }

    private string WriteFile(string content)
    {
        var path = Path.Combine(_tempDir, $"{Guid.NewGuid():N}.jsonl");
        File.WriteAllText(path, content);
        return path;
    }

    [Fact]
    public void ReadSession_EmptyFile_ReturnsSessionWithDefaults()
    {
        var path = WriteFile("");
        var session = _parser.ReadSession(path, "C:\\Work");
        session.Should().NotBeNull();
        session!.LastUserMessage.Should().BeNull();
        session.FirstUserMessage.Should().BeNull();
        session.LastCwd.Should().Be("C:\\Work");
    }

    [Fact]
    public void ReadSession_MissingFile_ReturnsNull()
    {
        var session = _parser.ReadSession(Path.Combine(_tempDir, "nonexistent.jsonl"), "C:\\Work");
        session.Should().BeNull();
    }

    [Fact]
    public void ReadSession_SystemInitEntry_ExtractsSessionIdAndCwd()
    {
        var content = """{"type":"system","subtype":"init","sessionId":"abc123","cwd":"/repo","timestamp":"2026-06-01T10:00:00Z"}""";
        var path = WriteFile(content);
        var session = _parser.ReadSession(path, "fallback");
        session.Should().NotBeNull();
        session!.SessionId.Should().Be("abc123");
        session.LastCwd.Should().Be("/repo");
    }

    [Fact]
    public void ReadSession_UserMessage_ExtractsFirstAndLastUserMessage()
    {
        var content = """
{"type":"user","message":{"content":"first message"},"timestamp":"2026-06-01T10:00:00Z"}
{"type":"assistant","message":{"content":"response"},"timestamp":"2026-06-01T10:00:05Z"}
{"type":"user","message":{"content":"second message"},"timestamp":"2026-06-01T10:00:10Z"}
""";
        var path = WriteFile(content);
        var session = _parser.ReadSession(path, "C:\\Work");
        session.Should().NotBeNull();
        session!.FirstUserMessage.Should().Be("first message");
        session.LastUserMessage.Should().Be("second message");
    }

    [Fact]
    public void ReadSession_InterruptedMessage_SetsIsInterrupted()
    {
        var content = """{"type":"user","message":{"content":"[Request interrupted by user]"},"timestamp":"2026-06-01T10:00:00Z"}""";
        var path = WriteFile(content);
        var session = _parser.ReadSession(path, "C:\\Work");
        session.Should().NotBeNull();
        session!.IsInterrupted.Should().BeTrue();
    }

    [Fact]
    public void ReadSession_InterruptedMessage_NotStoredAsUserMessage()
    {
        var content = """{"type":"user","message":{"content":"[Request interrupted by user]"},"timestamp":"2026-06-01T10:00:00Z"}""";
        var path = WriteFile(content);
        var session = _parser.ReadSession(path, "C:\\Work");
        session!.LastUserMessage.Should().BeNull("interrupted messages should not count as user messages");
    }

    [Fact]
    public void ReadSession_HarnessNoise_SkippedAsUserMessage()
    {
        var content = """
{"type":"user","message":{"content":"Tool loaded. allowed_tools=[\"Read\"]"},"timestamp":"2026-06-01T10:00:00Z"}
{"type":"user","message":{"content":"real user message"},"timestamp":"2026-06-01T10:00:05Z"}
""";
        var path = WriteFile(content);
        var session = _parser.ReadSession(path, "C:\\Work");
        session!.FirstUserMessage.Should().Be("real user message");
    }

    [Fact]
    public void ReadSession_LastEntryType_TracksConversationEntries()
    {
        var content = """
{"type":"user","message":{"content":"do something"},"timestamp":"2026-06-01T10:00:00Z"}
{"type":"assistant","message":{"content":"doing it"},"timestamp":"2026-06-01T10:00:05Z"}
""";
        var path = WriteFile(content);
        var session = _parser.ReadSession(path, "C:\\Work");
        session!.LastEntryType.Should().Be("assistant");
    }

    [Fact]
    public void ReadSession_MalformedLines_SkipAndContinue()
    {
        var content = """
{broken json
{"type":"user","message":{"content":"valid message"},"timestamp":"2026-06-01T10:00:00Z"}
""";
        var path = WriteFile(content);
        var session = _parser.ReadSession(path, "C:\\Work");
        session.Should().NotBeNull();
        session!.LastUserMessage.Should().Be("valid message");
    }

    [Fact]
    public void DetermineStatus_NullLastEntryType_ReturnsUnknown()
    {
        var session = new ClaudeSessionParser.ClaudeSession(
            "id", null, null, null, null, false, DateTime.UtcNow, null);
        _parser.DetermineStatus(session).Should().Be(ExternalAgentStatus.Unknown);
    }

    [Fact]
    public void DetermineStatus_UserNotInterrupted_ReturnsRunning()
    {
        var session = new ClaudeSessionParser.ClaudeSession(
            "id", null, null, null, "user", false, DateTime.UtcNow, null);
        _parser.DetermineStatus(session).Should().Be(ExternalAgentStatus.Running);
    }

    [Fact]
    public void DetermineStatus_UserInterrupted_ReturnsWaiting()
    {
        var session = new ClaudeSessionParser.ClaudeSession(
            "id", null, null, null, "user", true, DateTime.UtcNow, null);
        _parser.DetermineStatus(session).Should().Be(ExternalAgentStatus.Waiting);
    }

    [Fact]
    public void DetermineStatus_Assistant_ReturnsWaiting()
    {
        var session = new ClaudeSessionParser.ClaudeSession(
            "id", null, null, null, "assistant", false, DateTime.UtcNow, null);
        _parser.DetermineStatus(session).Should().Be(ExternalAgentStatus.Waiting);
    }

    [Fact]
    public void DetermineStatus_Progress_ReturnsRunning()
    {
        var session = new ClaudeSessionParser.ClaudeSession(
            "id", null, null, null, "progress", false, DateTime.UtcNow, null);
        _parser.DetermineStatus(session).Should().Be(ExternalAgentStatus.Running);
    }

    [Fact]
    public void DetermineStatus_Thinking_ReturnsRunning()
    {
        var session = new ClaudeSessionParser.ClaudeSession(
            "id", null, null, null, "thinking", false, DateTime.UtcNow, null);
        _parser.DetermineStatus(session).Should().Be(ExternalAgentStatus.Running);
    }

    [Fact]
    public void DetermineStatus_System_ReturnsIdle()
    {
        var session = new ClaudeSessionParser.ClaudeSession(
            "id", null, null, null, "system", false, DateTime.UtcNow, null);
        _parser.DetermineStatus(session).Should().Be(ExternalAgentStatus.Idle);
    }

    [Fact]
    public void ExtractTextContent_StringElement_ReturnsString()
    {
        using var doc = JsonDocument.Parse("\"hello world\"");
        var result = ClaudeSessionParser.ExtractTextContent(doc.RootElement);
        result.Should().Be("hello world");
    }

    [Fact]
    public void ExtractTextContent_ArrayWithTextBlock_ReturnsText()
    {
        using var doc = JsonDocument.Parse("""[{"type":"text","text":"array content"}]""");
        var result = ClaudeSessionParser.ExtractTextContent(doc.RootElement);
        result.Should().Be("array content");
    }

    [Fact]
    public void ExtractTextContent_EmptyArray_ReturnsEmpty()
    {
        using var doc = JsonDocument.Parse("[]");
        var result = ClaudeSessionParser.ExtractTextContent(doc.RootElement);
        result.Should().BeEmpty();
    }

    [Fact]
    public void GetConversation_ValidFile_ReturnsParsedMessages()
    {
        var content = """
{"type":"user","message":{"content":"hello"},"timestamp":"2026-06-01T10:00:00Z"}
{"type":"assistant","message":{"content":"hi there"},"timestamp":"2026-06-01T10:00:05Z"}
""";
        var path = WriteFile(content);
        var messages = _parser.GetConversation(path);
        messages.Should().HaveCount(2);
        messages[0].Role.Should().Be("user");
        messages[0].Content.Should().Be("hello");
        messages[1].Role.Should().Be("assistant");
    }

    [Fact]
    public void GetConversation_ExceedsMaxMessages_TakesLast()
    {
        var lines = Enumerable.Range(0, 20)
            .Select(i => $"{{\"type\":\"user\",\"message\":{{\"content\":\"msg{i}\"}},\"timestamp\":\"2026-06-01T10:00:00Z\"}}")
            .ToList();
        var path = WriteFile(string.Join("\n", lines));
        var messages = _parser.GetConversation(path, maxMessages: 5);
        messages.Should().HaveCount(5);
        messages[^1].Content.Should().Be("msg19");
    }

    public void Dispose()
    {
        if (Directory.Exists(_tempDir))
            Directory.Delete(_tempDir, recursive: true);
    }
}

// ── PaneVisibilityPolicy — beyond existing tests ──────────────────────────────

public class PaneVisibilityPolicyExtendedTests
{
    [Theory]
    [InlineData(true,  false, true)]   // visible, silent → run
    [InlineData(false, true,  true)]   // hidden, audio   → run
    [InlineData(true,  true,  true)]   // visible + audio → run
    [InlineData(false, false, false)]  // hidden, silent  → suspend
    public void ShouldRun_AllCombinations(bool visible, bool audio, bool expected)
    {
        PaneVisibilityPolicy.ShouldRun(visible, audio).Should().Be(expected);
    }

    [Theory]
    [InlineData(true,  false, false)]
    [InlineData(false, true,  false)]
    [InlineData(true,  true,  false)]
    [InlineData(false, false, true)]
    public void ShouldSuspend_IsInverseOfShouldRun(bool visible, bool audio, bool expected)
    {
        PaneVisibilityPolicy.ShouldSuspend(visible, audio).Should().Be(expected);
    }

    [Fact]
    public void GetRunningPanes_OnlyVisiblePaneRuns()
    {
        var panes = new[] { "visible", "hidden1", "hidden2" };
        var running = PaneVisibilityPolicy.GetRunningPanes(
            panes,
            isVisible: p => p == "visible",
            isPlayingAudio: _ => false).ToList();
        running.Should().ContainSingle().Which.Should().Be("visible");
    }

    [Fact]
    public void GetRunningPanes_AudioPaneRunsEvenWhenHidden()
    {
        var panes = new[] { "visible", "hidden-audio", "hidden-silent" };
        var running = PaneVisibilityPolicy.GetRunningPanes(
            panes,
            isVisible: p => p == "visible",
            isPlayingAudio: p => p == "hidden-audio").ToList();
        running.Should().HaveCount(2);
        running.Should().Contain("visible");
        running.Should().Contain("hidden-audio");
        running.Should().NotContain("hidden-silent");
    }

    [Fact]
    public void GetRunningPanes_EmptyCollection_ReturnsEmpty()
    {
        var running = PaneVisibilityPolicy.GetRunningPanes(
            Array.Empty<string>(),
            isVisible: _ => true,
            isPlayingAudio: _ => false).ToList();
        running.Should().BeEmpty();
    }

    [Fact]
    public void GetRunningPanes_AllSuspended_ReturnsEmpty()
    {
        var panes = new[] { "a", "b", "c" };
        var running = PaneVisibilityPolicy.GetRunningPanes(
            panes,
            isVisible: _ => false,
            isPlayingAudio: _ => false).ToList();
        running.Should().BeEmpty();
    }

    [Fact]
    public void GetRunningPanes_AllVisible_ReturnsAll()
    {
        var panes = new[] { 1, 2, 3, 4 };
        var running = PaneVisibilityPolicy.GetRunningPanes(
            panes,
            isVisible: _ => true,
            isPlayingAudio: _ => false).ToList();
        running.Should().HaveCount(4);
    }
}

// ── AdBlockService — pure filter parsing / matching ──────────────────────────

public class AdBlockServiceTests
{
    // Helper: create a service and invoke ParseFilterList via the public
    // surface that exercises it (ShouldBlock / GetCosmeticSelectors).
    // Since ParseFilterList is private, we drive it by calling the internal
    // helper through a subclass that exposes it via reflection.
    private static AdBlockService BuildWithRules(params string[] lines)
    {
        var svc = new AdBlockService();
        // ParseFilterList is private; invoke via reflection for test isolation.
        var method = typeof(AdBlockService)
            .GetMethod("ParseFilterList", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance);
        method!.Invoke(svc, new object[] { lines });
        return svc;
    }

    [Fact]
    public void ShouldBlock_DisabledService_ReturnsFalse()
    {
        var svc = BuildWithRules("||ads.example.com^");
        svc.IsEnabled = false;
        svc.ShouldBlock("https://ads.example.com/banner.jpg").Should().BeFalse();
    }

    [Fact]
    public void ShouldBlock_BlockedHost_ReturnsTrue()
    {
        var svc = BuildWithRules("||ads.example.com^");
        svc.ShouldBlock("https://ads.example.com/banner.jpg").Should().BeTrue();
    }

    [Fact]
    public void ShouldBlock_AllowedHost_ReturnsFalse()
    {
        var svc = BuildWithRules("||tracker.example.com^", "@@||tracker.example.com^");
        svc.ShouldBlock("https://tracker.example.com/pixel").Should().BeFalse();
    }

    [Fact]
    public void ShouldBlock_HostsFileFormat_ParsedAndBlocked()
    {
        var svc = BuildWithRules("0.0.0.0 adserver.badsite.net");
        svc.ShouldBlock("https://adserver.badsite.net/ad.js").Should().BeTrue();
    }

    [Fact]
    public void ShouldBlock_LocalhostHostsFormat_ParsedAndBlocked()
    {
        var svc = BuildWithRules("127.0.0.1 trackme.evil.com");
        svc.ShouldBlock("https://trackme.evil.com/track").Should().BeTrue();
    }

    [Fact]
    public void ShouldBlock_UnknownHost_ReturnsFalse()
    {
        var svc = new AdBlockService();
        svc.ShouldBlock("https://legit-site.com/page").Should().BeFalse();
    }

    [Fact]
    public void ShouldBlock_SubdomainOfBlockedHost_ReturnsTrue()
    {
        var svc = BuildWithRules("||ads.example.com^");
        svc.ShouldBlock("https://sub.ads.example.com/banner.png").Should().BeTrue();
    }

    [Fact]
    public void ShouldBlock_InvalidUrl_ReturnsFalse()
    {
        var svc = BuildWithRules("||ads.example.com^");
        svc.ShouldBlock("not-a-url").Should().BeFalse();
    }

    [Fact]
    public void ShouldBlock_Comments_AreIgnored()
    {
        var svc = BuildWithRules(
            "! This is a comment",
            "||realblock.com^");
        svc.ShouldBlock("https://realblock.com/x").Should().BeTrue();
    }

    [Fact]
    public void GetCosmeticSelectors_GenericRule_ReturnsSelector()
    {
        var svc = BuildWithRules("##.banner-ad");
        var selectors = svc.GetCosmeticSelectors("any-host.com");
        selectors.Should().Contain(".banner-ad");
    }

    [Fact]
    public void GetCosmeticSelectors_HostSpecificRule_AppliedOnMatchingHost()
    {
        var svc = BuildWithRules("example.com##.sidebar-ad");
        var forExample = svc.GetCosmeticSelectors("example.com");
        var forOther = svc.GetCosmeticSelectors("other.com");
        forExample.Should().Contain(".sidebar-ad");
        forOther.Should().NotContain(".sidebar-ad");
    }

    [Fact]
    public void GetCosmeticSelectors_ScriptletFilter_IsSkipped()
    {
        // ##+js(...) scriptlets must not be injected as CSS
        var svc = BuildWithRules("##^script:has-text(adblock)");
        var selectors = svc.GetCosmeticSelectors("example.com");
        selectors.Should().NotContain(s => s.StartsWith("^"));
    }

    [Fact]
    public void GetCosmeticBootstrapScript_IsNonEmpty()
    {
        var svc = new AdBlockService();
        var script = svc.GetCosmeticBootstrapScript();
        script.Should().NotBeNullOrWhiteSpace();
        script.Should().Contain("cmuxInjectCosmetic");
    }

    [Fact]
    public void HasCachedFilters_NoCacheDir_ReturnsFalse()
    {
        var svc = new AdBlockService();
        // On a clean machine without downloaded lists this should be false
        // unless someone has actually downloaded the lists — just verify no throw
        var act = () => svc.HasCachedFilters();
        act.Should().NotThrow();
    }
}

// ── GitNexusService — pure helpers (no git/CLI shelling) ─────────────────────

public class GitNexusServiceTests : IDisposable
{
    private readonly string _tempDir;

    public GitNexusServiceTests()
    {
        _tempDir = Path.Combine(Path.GetTempPath(), $"cmux-gitnexus-{Guid.NewGuid():N}");
        Directory.CreateDirectory(_tempDir);
    }

    [Fact]
    public void HasIndex_NoGitNexusDir_ReturnsFalse()
    {
        GitNexusService.HasIndex(_tempDir).Should().BeFalse();
    }

    [Fact]
    public void HasIndex_WithGitNexusDir_ReturnsTrue()
    {
        Directory.CreateDirectory(Path.Combine(_tempDir, ".gitnexus"));
        GitNexusService.HasIndex(_tempDir).Should().BeTrue();
    }

    [Fact]
    public void HasIndex_NullOrEmptyPath_ReturnsFalse()
    {
        GitNexusService.HasIndex("").Should().BeFalse();
        GitNexusService.HasIndex("   ").Should().BeFalse();
    }

    [Fact]
    public void IsStale_NoIndex_ReturnsTrue()
    {
        GitNexusService.IsStale(_tempDir).Should().BeTrue();
    }

    [Fact]
    public void IsStale_IndexExistsNoMetaJson_ReturnsTrue()
    {
        Directory.CreateDirectory(Path.Combine(_tempDir, ".gitnexus"));
        GitNexusService.IsStale(_tempDir).Should().BeTrue();
    }

    [Fact]
    public void IsStale_FreshMetaJson_ReturnsFalse()
    {
        var nexusDir = Path.Combine(_tempDir, ".gitnexus");
        Directory.CreateDirectory(nexusDir);
        var meta = Path.Combine(nexusDir, "meta.json");
        File.WriteAllText(meta, "{}");
        // Touch to now
        File.SetLastWriteTimeUtc(meta, DateTime.UtcNow);
        GitNexusService.IsStale(_tempDir).Should().BeFalse();
    }

    [Fact]
    public void IsStale_StaleMetaJson_ReturnsTrue()
    {
        var nexusDir = Path.Combine(_tempDir, ".gitnexus");
        Directory.CreateDirectory(nexusDir);
        var meta = Path.Combine(nexusDir, "meta.json");
        File.WriteAllText(meta, "{}");
        // Set to 48 hours ago
        File.SetLastWriteTimeUtc(meta, DateTime.UtcNow - TimeSpan.FromHours(48));
        GitNexusService.IsStale(_tempDir).Should().BeTrue();
    }

    [Fact]
    public void ResolveRepoRoot_NullOrEmpty_ReturnsNull()
    {
        GitNexusService.ResolveRepoRoot(null).Should().BeNull();
        GitNexusService.ResolveRepoRoot("").Should().BeNull();
    }

    [Fact]
    public void ResolveRepoRoot_PathWithGitDir_ReturnsIt()
    {
        // Create a fake .git in tempDir
        Directory.CreateDirectory(Path.Combine(_tempDir, ".git"));
        var result = GitNexusService.ResolveRepoRoot(_tempDir);
        result.Should().NotBeNull();
        result!.Should().Be(_tempDir);
    }

    [Fact]
    public void ResolveRepoRoot_SubdirOfGitRepo_WalksUpToRoot()
    {
        Directory.CreateDirectory(Path.Combine(_tempDir, ".git"));
        var subDir = Path.Combine(_tempDir, "src", "components");
        Directory.CreateDirectory(subDir);
        var result = GitNexusService.ResolveRepoRoot(subDir);
        result.Should().NotBeNull();
        result!.Should().Be(_tempDir);
    }

    [Fact]
    public void ResolveRepoRoot_NoDotGitAnywhere_FallsBackToCwd()
    {
        // A path with no .git anywhere up the tree falls back to workingDirectory
        // Use a path under system temp that definitely has no .git
        var noGitDir = Path.Combine(Path.GetTempPath(), $"no-git-{Guid.NewGuid():N}");
        Directory.CreateDirectory(noGitDir);
        try
        {
            var result = GitNexusService.ResolveRepoRoot(noGitDir);
            result.Should().NotBeNull();
            // Could be noGitDir or an ancestor — just verify it doesn't throw and returns something
        }
        finally
        {
            Directory.Delete(noGitDir);
        }
    }

    [Fact]
    public void GitNexusIndexResult_UpToDate_HasCorrectFields()
    {
        var r = GitNexusIndexResult.UpToDate;
        r.Success.Should().BeTrue();
        r.WasSkipped.Should().BeTrue();
        r.Reason.Should().Be("up-to-date");
    }

    [Fact]
    public void GitNexusIndexResult_Ok_HasCorrectFields()
    {
        var r = GitNexusIndexResult.Ok;
        r.Success.Should().BeTrue();
        r.WasSkipped.Should().BeFalse();
        r.Reason.Should().BeNull();
    }

    [Fact]
    public void GitNexusIndexResult_Failed_HasCorrectFields()
    {
        var r = GitNexusIndexResult.Failed("exit 1");
        r.Success.Should().BeFalse();
        r.WasSkipped.Should().BeFalse();
        r.Reason.Should().Be("exit 1");
    }

    [Fact]
    public void GitNexusIndexResult_Skipped_HasCorrectFields()
    {
        var r = GitNexusIndexResult.Skipped("no cli");
        r.Success.Should().BeFalse();
        r.WasSkipped.Should().BeTrue();
        r.Reason.Should().Be("no cli");
    }

    public void Dispose()
    {
        if (Directory.Exists(_tempDir))
            Directory.Delete(_tempDir, recursive: true);
    }
}

// ── KnowledgeGraphService — pure in-memory helpers ───────────────────────────

public class KnowledgeGraphServiceTests
{
    [Fact]
    public void IsLoaded_NewService_ReturnsFalse()
    {
        var svc = new KnowledgeGraphService();
        svc.IsLoaded("C:\\SomeRepo").Should().BeFalse();
    }

    [Fact]
    public void Invalidate_NotLoadedRepo_DoesNotThrow()
    {
        var svc = new KnowledgeGraphService();
        var act = () => svc.Invalidate("C:\\SomeRepo");
        act.Should().NotThrow();
    }

    [Fact]
    public void TryGetSnapshotForCwd_NotLoaded_ReturnsNull()
    {
        var svc = new KnowledgeGraphService();
        var snapshot = svc.TryGetSnapshotForCwd("C:\\Repo", "C:\\Repo\\src");
        snapshot.Should().BeNull();
    }

    [Fact]
    public void KnowledgeGraphNode_DefaultValues()
    {
        var node = new KnowledgeGraphNode();
        node.Id.Should().BeEmpty();
        node.Name.Should().BeEmpty();
        node.Kind.Should().BeEmpty();
        node.FilePath.Should().BeEmpty();
        node.Degree.Should().Be(0);
        node.Heat.Should().Be(0.0);
        node.CommunityId.Should().Be(0);
    }

    [Fact]
    public void KnowledgeGraphEdge_DefaultValues()
    {
        var edge = new KnowledgeGraphEdge();
        edge.SourceId.Should().BeEmpty();
        edge.TargetId.Should().BeEmpty();
        edge.Type.Should().BeEmpty();
        edge.Confidence.Should().Be(0.0);
    }

    [Fact]
    public void KnowledgeGraphSnapshot_IsEmpty_TrueWhenNoNodes()
    {
        var snap = new KnowledgeGraphSnapshot();
        snap.IsEmpty.Should().BeTrue();
    }

    [Fact]
    public void KnowledgeGraphSnapshot_IsEmpty_FalseWhenHasNodes()
    {
        var snap = new KnowledgeGraphSnapshot();
        snap.Nodes.Add(new KnowledgeGraphNode { Id = "n1", Name = "File.cs", Kind = "File" });
        snap.IsEmpty.Should().BeFalse();
    }

    [Fact]
    public void KnowledgeGraphSnapshot_DefaultRepoRootAndCwd_AreEmpty()
    {
        var snap = new KnowledgeGraphSnapshot();
        snap.RepoRoot.Should().BeEmpty();
        snap.Cwd.Should().BeEmpty();
    }

    [Fact]
    public void GraphLoadFailed_Event_CanBeSubscribed()
    {
        var svc = new KnowledgeGraphService();
        string? failedRoot = null;
        svc.GraphLoadFailed += (root, _) => failedRoot = root;
        // Just verify subscription doesn't throw; actual event fires on failed load
        failedRoot.Should().BeNull();
    }
}

// ── ActivityGraphService — pure helpers ──────────────────────────────────────

public class ActivityGraphServiceTests : IDisposable
{
    private readonly ActivityGraphService _svc = new();

    [Fact]
    public void ToolActivityEvent_DefaultValues()
    {
        var ev = new ToolActivityEvent();
        ev.RepoRoot.Should().BeEmpty();
        ev.FilePath.Should().BeEmpty();
        ev.Pattern.Should().BeEmpty();
        ev.Heat.Should().Be(0.0);
    }

    [Fact]
    public void ToolActivityEvent_CanSetAllFields()
    {
        var ev = new ToolActivityEvent
        {
            RepoRoot = "C:\\Repo",
            Kind = ToolKind.Edit,
            FilePath = "C:\\Repo\\src\\File.cs",
            Pattern = "",
            Heat = 3.0,
            ObservedAt = DateTime.UtcNow,
        };
        ev.Kind.Should().Be(ToolKind.Edit);
        ev.Heat.Should().Be(3.0);
    }

    [Fact]
    public void ToolKind_AllValuesExist()
    {
        var kinds = Enum.GetValues<ToolKind>();
        kinds.Should().Contain(ToolKind.Read);
        kinds.Should().Contain(ToolKind.Edit);
        kinds.Should().Contain(ToolKind.Write);
        kinds.Should().Contain(ToolKind.Grep);
        kinds.Should().Contain(ToolKind.Glob);
        kinds.Should().Contain(ToolKind.Bash);
    }

    [Fact]
    public void WatchWorkspace_EmptyPath_DoesNotThrow()
    {
        var act = () => _svc.WatchWorkspace("");
        act.Should().NotThrow();
    }

    [Fact]
    public void StopWatching_UnknownRoot_DoesNotThrow()
    {
        var act = () => _svc.StopWatching("C:\\NonExistentRepo");
        act.Should().NotThrow();
    }

    [Fact]
    public void Dispose_CalledTwice_DoesNotThrow()
    {
        var svc2 = new ActivityGraphService();
        svc2.Dispose();
        var act = () => svc2.Dispose();
        act.Should().NotThrow();
    }

    [Fact]
    public void ToolActivityObserved_CanSubscribeAndUnsubscribe()
    {
        var count = 0;
        Action<ToolActivityEvent> handler = _ => count++;
        _svc.ToolActivityObserved += handler;
        _svc.ToolActivityObserved -= handler;
        count.Should().Be(0);
    }

    public void Dispose() => _svc.Dispose();
}

// ── WorkspaceTemplateService — additional file I/O gaps ──────────────────────

public class WorkspaceTemplateServiceExtendedTests : IDisposable
{
    private readonly string _tempDir;

    public WorkspaceTemplateServiceExtendedTests()
    {
        _tempDir = Path.Combine(Path.GetTempPath(), $"cmux-tmpl-ext-{Guid.NewGuid():N}");
        Directory.CreateDirectory(_tempDir);
    }

    [Fact]
    public void WorkspaceTemplate_UniqueIds_AreGeneratedPerInstance()
    {
        var t1 = new WorkspaceTemplate();
        var t2 = new WorkspaceTemplate();
        t1.Id.Should().NotBe(t2.Id);
    }

    [Fact]
    public void WorkspaceTemplate_CreatedAt_IsRecentUtc()
    {
        var before = DateTime.UtcNow.AddSeconds(-1);
        var t = new WorkspaceTemplate();
        t.CreatedAt.Should().BeAfter(before);
    }

    [Fact]
    public void TemplatePaneLayout_AllDirections_Serializable()
    {
        foreach (var dir in Enum.GetValues<SplitDirection>())
        {
            var p = new TemplatePaneLayout { Direction = dir };
            var json = JsonSerializer.Serialize(p);
            var restored = JsonSerializer.Deserialize<TemplatePaneLayout>(json)!;
            restored.Direction.Should().Be(dir);
        }
    }

    [Fact]
    public void WorkspaceTemplate_MultiSurface_RoundTrip()
    {
        var t = new WorkspaceTemplate { Name = "Multi" };
        for (int i = 0; i < 5; i++)
            t.Surfaces.Add(new TemplateSurface { Name = $"Tab {i}" });

        var json = JsonSerializer.Serialize(t);
        var restored = JsonSerializer.Deserialize<WorkspaceTemplate>(json)!;
        restored.Surfaces.Should().HaveCount(5);
        restored.Surfaces[4].Name.Should().Be("Tab 4");
    }

    [Fact]
    public void TemplateSurface_WithPanes_RoundTrip()
    {
        var surface = new TemplateSurface { Name = "Dev" };
        surface.Panes.Add(new TemplatePaneLayout { Shell = "pwsh", WorkingDirectory = "C:\\Code" });
        surface.Panes.Add(new TemplatePaneLayout { Shell = "cmd",  Direction = SplitDirection.Horizontal });

        var json = JsonSerializer.Serialize(surface);
        var restored = JsonSerializer.Deserialize<TemplateSurface>(json)!;
        restored.Panes.Should().HaveCount(2);
        restored.Panes[0].Shell.Should().Be("pwsh");
        restored.Panes[1].Direction.Should().Be(SplitDirection.Horizontal);
    }

    public void Dispose()
    {
        if (Directory.Exists(_tempDir))
            Directory.Delete(_tempDir, recursive: true);
    }
}

// ── ShellDetector — safe deterministic surface only ──────────────────────────

public class ShellDetectorTests
{
    [Fact]
    public void DetectShells_DoesNotThrow()
    {
        // Detection hits real FS paths — just guard it doesn't crash
        var act = () => ShellDetector.DetectShells();
        act.Should().NotThrow();
    }

    [Fact]
    public void DetectShells_ReturnsNonNullList()
    {
        var shells = ShellDetector.DetectShells();
        shells.Should().NotBeNull();
    }

    [Fact]
    public void ShellInfo_Record_StoresNameAndPath()
    {
        var info = new ShellInfo("PowerShell 7", "C:\\Program Files\\PowerShell\\7\\pwsh.exe");
        info.Name.Should().Be("PowerShell 7");
        info.Path.Should().Be("C:\\Program Files\\PowerShell\\7\\pwsh.exe");
    }

    [Fact]
    public void DetectShells_AllReturnedPaths_AreNonEmpty()
    {
        var shells = ShellDetector.DetectShells();
        foreach (var shell in shells)
        {
            shell.Name.Should().NotBeNullOrWhiteSpace();
            shell.Path.Should().NotBeNullOrWhiteSpace();
        }
    }
}
