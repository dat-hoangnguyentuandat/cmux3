import { useEffect, useState } from "react";
import { api, type FileEntry, type KnowledgeGraph } from "../lib/api";
import { ChevronDownIcon, ChevronRightIcon, DownloadIcon, FolderIcon, RefreshIcon } from "./icons";

interface Props {
  initialPath?: string;
  onClose: () => void;
  onOpenFile?: (path: string) => void;
}

interface DirState { entries: FileEntry[]; expanded: Set<string>; childrenOf: Record<string, FileEntry[]>; }

const PALETTE = ["#818cf8", "#f472b6", "#34d399", "#fbbf24", "#60a5fa", "#f87171", "#a78bfa", "#2dd4bf"];

function layoutGraph(graph: KnowledgeGraph | null) {
  if (!graph || graph.nodes.length === 0) return null;
  const W = 760, H = 460, cx = W / 2, cy = H / 2;
  const n = graph.nodes.length;
  const nodes = graph.nodes.slice(0, 200);
  const radius = Math.min(W, H) / 2 - 40;
  const pos: Record<string, { x: number; y: number }> = {};
  nodes.forEach((nd, i) => {
    const a = (i / Math.min(n, 200)) * Math.PI * 2;
    const r = radius * (0.4 + 0.6 * ((nd.degree % 7) / 7));
    pos[nd.id] = { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  });
  return { W, H, pos, nodes };
}

export function SourceTreePanel({ initialPath, onClose, onOpenFile }: Props) {
  const [path, setPath] = useState(initialPath ?? "");
  const [draft, setDraft] = useState(initialPath ?? "");
  const [parent, setParent] = useState<string | undefined>();
  const [dir, setDir] = useState<DirState>({ entries: [], expanded: new Set(), childrenOf: {} });
  const [error, setError] = useState<string | undefined>();
  const [preview, setPreview] = useState<{ path: string; text: string } | null>(null);
  const [graph, setGraph] = useState<KnowledgeGraph | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);

  const loadRoot = (p: string) => {
    api.getFiles(p).then((r) => {
      setPath(r.path); setDraft(r.path); setParent(r.parent); setError(r.error);
      setDir({ entries: r.entries, expanded: new Set(), childrenOf: {} });
    });
    if (p) {
      setGraphLoading(true);
      api.getKnowledgeGraph(p).then(setGraph).catch(() => setGraph(null)).finally(() => setGraphLoading(false));
    } else setGraph(null);
  };
  useEffect(() => { if (path) loadRoot(path); }, []);

  const toggle = async (entry: FileEntry) => {
    if (!entry.isDirectory) {
      const text = await api.getFileContent(entry.fullPath);
      setPreview({ path: entry.fullPath, text });
      onOpenFile?.(entry.fullPath);
      return;
    }
    setDir((d) => {
      const expanded = new Set(d.expanded);
      if (expanded.has(entry.fullPath)) expanded.delete(entry.fullPath);
      else {
        expanded.add(entry.fullPath);
        if (!d.childrenOf[entry.fullPath])
          api.getFiles(entry.fullPath).then((r) =>
            setDir((dd) => ({ ...dd, childrenOf: { ...dd.childrenOf, [entry.fullPath]: r.entries } })));
      }
      return { ...d, expanded };
    });
  };

  const renderEntries = (entries: FileEntry[], depth: number): React.ReactNode =>
    entries.map((e) => (
      <div key={e.fullPath}>
        <div className="cmux-tree-row" style={{ paddingLeft: 8 + depth * 14 }} onClick={() => toggle(e)}>
          <span className="cmux-tree-icon" style={{ color: e.isDirectory ? "#818cf8" : "#6b7280" }}>
            {e.isDirectory ? (dir.expanded.has(e.fullPath) ? <ChevronDownIcon /> : <ChevronRightIcon />) : <span className="cmux-tree-dot" />}
          </span>
          <span className={e.isDirectory ? "cmux-tree-dir" : "cmux-tree-file"}>{e.name}</span>
        </div>
        {e.isDirectory && dir.expanded.has(e.fullPath) &&
          renderEntries(dir.childrenOf[e.fullPath] ?? [], depth + 1)}
      </div>
    ));

  const layout = layoutGraph(graph);

  return (
    <div className="cmux-panel">
      <div className="cmux-panel-toolbar">
        <div className="cmux-panel-toolbar-row">
          <span className="cmux-panel-title">SOURCE TREE</span>
          <span className="cmux-list-title dim" style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{path || "No folder selected"}</span>
          <button className="cmux-icon-btn" title="Select folder" onClick={() => { const p = prompt("Folder path", draft || path); if (p) loadRoot(p); }}><FolderIcon /></button>
          <button className="cmux-icon-btn" title="Export to .claude/Srctree" disabled={!path}><DownloadIcon /></button>
          <button className="cmux-icon-btn" title="Refresh (F5)" onClick={() => loadRoot(path)}><RefreshIcon /></button>
        </div>
      </div>
      <div className="cmux-panel-body cmux-split-body">
        <div className="cmux-tree">
          {error && <div className="cmux-empty">{error}</div>}
          {!error && dir.entries.length === 0 && <div className="cmux-empty">Empty or no folder</div>}
          {renderEntries(dir.entries, 0)}
        </div>
        <div className="cmux-split-divider" />
        <div className="cmux-split-content cmux-kg-host">
          {!layout && <div className="cmux-empty">{graphLoading ? "Building graph…" : "Select a folder to view its knowledge graph"}</div>}
          {layout && (
            <svg width="100%" viewBox={`0 0 ${layout.W} ${layout.H}`} className="cmux-kg-svg">
              {graph!.edges.slice(0, 600).map((e, i) => {
                const a = layout.pos[e.sourceId], b = layout.pos[e.targetId];
                if (!a || !b) return null;
                return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="rgba(255,255,255,0.08)" />;
              })}
              {layout.nodes.map((nd) => {
                const p = layout.pos[nd.id];
                const r = 3 + Math.min(10, nd.degree);
                const color = PALETTE[((nd.communityId % PALETTE.length) + PALETTE.length) % PALETTE.length];
                return (
                  <g key={nd.id}>
                    <circle cx={p.x} cy={p.y} r={r} fill={color} opacity={0.85}>
                      <title>{nd.name} ({nd.kind})</title>
                    </circle>
                  </g>
                );
              })}
            </svg>
          )}
        </div>
      </div>
      <div className="cmux-panel-footer">
        <span className="dim">F5 refresh · Esc close</span>
        <span className="cmux-spacer" />
        <span className="dim">{preview ? `${preview.path}` : ""}</span>
      </div>
    </div>
  );
}
