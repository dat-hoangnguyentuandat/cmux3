namespace Cmux.Core.Models;

/// <summary>
/// A single graph node — file, folder, class, function, etc.
/// Mirrors the GitNexus LadybugDB schema: identity = (Kind, FilePath, Name).
/// </summary>
public sealed class KnowledgeGraphNode
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string Kind { get; set; } = "";          // File | Folder | Class | Function | Method | Interface | ...
    public string FilePath { get; set; } = "";
    public int StartLine { get; set; }
    public int EndLine { get; set; }
    public int Degree { get; set; }                  // Total in+out edges. Drives node radius.
    public int CommunityId { get; set; }             // Leiden cluster id; -1 if unassigned. Drives node color.

    /// <summary>Live activity heat (0..1). Decays over time, bumps on tool-call hits.</summary>
    public double Heat { get; set; }
}

public sealed class KnowledgeGraphEdge
{
    public string SourceId { get; set; } = "";
    public string TargetId { get; set; } = "";
    public string Type { get; set; } = "";           // CALLS | IMPORTS | EXTENDS | CONTAINS | ...
    public double Confidence { get; set; }
}

/// <summary>
/// Snapshot of the graph filtered down to a specific cwd. Both lists are
/// already pruned: every edge endpoint is guaranteed to exist in Nodes.
/// </summary>
public sealed class KnowledgeGraphSnapshot
{
    public string RepoRoot { get; set; } = "";
    public string Cwd { get; set; } = "";
    public List<KnowledgeGraphNode> Nodes { get; } = [];
    public List<KnowledgeGraphEdge> Edges { get; } = [];
    public DateTime BuiltAt { get; set; } = DateTime.UtcNow;

    public bool IsEmpty => Nodes.Count == 0;
}
