import { useEffect, useState } from "react";
import { api, type TranscriptEntry } from "../lib/api";

export function SessionVaultPanel({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<TranscriptEntry[]>([]);
  const [selected, setSelected] = useState<TranscriptEntry | null>(null);
  const [content, setContent] = useState("");

  useEffect(() => { api.getTranscripts().then(setItems); }, []);
  useEffect(() => {
    if (selected) api.getTranscriptContent(selected.filePath).then(setContent);
    else setContent("");
  }, [selected]);

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="panel wide split-panel" onMouseDown={(e) => e.stopPropagation()}>
        <div className="panel-head">
          <h2>Session Vault</h2>
          <button className="icon-btn" onClick={onClose}>×</button>
        </div>
        <div className="vault-body">
          <div className="vault-list">
            {items.length === 0 && <div className="empty">No captured transcripts</div>}
            {items.map((t) => (
              <div
                key={t.filePath}
                className={"vault-item" + (selected?.filePath === t.filePath ? " active" : "")}
                onClick={() => setSelected(t)}
              >
                <div className="vault-name">{new Date(t.capturedAt).toLocaleString()}</div>
                <div className="vault-meta dim mono">{t.workingDirectory ?? t.reason} · {(t.sizeBytes / 1024).toFixed(1)} KB</div>
              </div>
            ))}
          </div>
          <pre className="vault-content mono">{content || "Select a transcript"}</pre>
        </div>
      </div>
    </div>
  );
}
