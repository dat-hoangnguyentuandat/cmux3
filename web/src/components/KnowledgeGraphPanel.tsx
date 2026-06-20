import { useEffect, useMemo, useState } from "react";
import { api, type KnowledgeGraph } from "../lib/api";

const PALETTE = ["#818cf8", "#f472b6", "#34d399", "#fbbf24", "#60a5fa", "#f87171", "#a78bfa", "#2dd4bf"];

export function KnowledgeGraphPanel({ cwd, onClose }: { cwd?: string; onClose: () => void }) {
  const [graph, setGraph] = useState<KnowledgeGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [path, setPath] = useState(cwd ?? "");

  const load = (p: string) => {
    if (!p) { setLoading(false); return; }
    setLoading(true);
    api.getKnowledgeGraph(p).then(setGraph).catch(() => setGraph(null)).finally(() => setLoading(false));
  };
  useEffect(() => { load(cwd ?? ""); }, [cwd]);

  const layout = useMemo(() => {
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
  }, [graph]);

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="panel wide" onMouseDown={(e) => e.stopPropagation()}>
        <div className="panel-head">
          <h2>Knowledge Graph</h2>
          <button className="icon-btn" onClick={onClose}>×</button>
        </div>
        <div className="panel-toolbar">
          <input value={path} placeholder="Repo path..." onChange={(e) => setPath(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") load(path); }} />
          <button onClick={() => load(path)}>Build</button>
          {graph && <span className="dim">{graph.nodes.length} nodes · {graph.edges.length} edges</span>}
        </div>
        <div className="panel-body">
          {loading && <div className="empty">Building graph…</div>}
          {!loading && (!layout) && <div className="empty">No graph data for this path</div>}
          {!loading && layout && (
            <svg width="100%" viewBox={`0 0 ${layout.W} ${layout.H}`} className="kg-svg">
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
    </div>
  );
}
