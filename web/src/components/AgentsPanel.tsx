import { useEffect, useState } from "react";
import { api, type ExternalAgent } from "../lib/api";
import { renderMarkdown } from "../lib/markdown";

export function AgentsPanel({ onClose }: { onClose: () => void }) {
  const [agents, setAgents] = useState<ExternalAgent[]>([]);
  const [selected, setSelected] = useState<ExternalAgent | null>(null);
  const [convo, setConvo] = useState<{ role: string; content: string; timestamp: string }[]>([]);

  const load = () => api.getAgents().then(setAgents).catch(() => setAgents([]));
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, []);
  useEffect(() => {
    if (selected?.sessionFilePath) api.getAgentConversation(selected.sessionFilePath).then(setConvo).catch(() => setConvo([]));
    else setConvo([]);
  }, [selected]);

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="panel wide split-panel" onMouseDown={(e) => e.stopPropagation()}>
        <div className="panel-head">
          <h2>AI Agents</h2>
          <button className="icon-btn" onClick={onClose}>×</button>
        </div>
        <div className="vault-body">
          <div className="vault-list">
            {agents.length === 0 && <div className="empty">No agents detected</div>}
            {agents.map((a) => (
              <div key={a.pid + a.sessionId} className={"vault-item" + (selected?.sessionId === a.sessionId ? " active" : "")}
                onClick={() => setSelected(a)}>
                <div className="vault-name">{a.typeLabel} <span className="dim">· {a.statusLabel}</span></div>
                <div className="vault-meta dim mono">{a.projectPath || a.summary}</div>
              </div>
            ))}
          </div>
          <div className="vault-content">
            {convo.length === 0 && <div className="empty">Select an agent</div>}
            {convo.map((m, i) => (
              <div key={i} className="agent-msg">
                <div className="agent-role dim">{m.role}</div>
                <div className="agent-content md" dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

