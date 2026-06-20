import { useEffect, useState } from "react";
import { api, type QuotaSnapshot } from "../lib/api";

const WINDOW_LABELS: Record<string, string> = {
  Last5Hours: "Last 5 Hours",
  Today: "Today",
  Last7Days: "Last 7 Days",
  Last30Days: "Last 30 Days",
  AllTime: "All Time",
};

export function QuotaPanel({ onClose }: { onClose: () => void }) {
  const [snap, setSnap] = useState<QuotaSnapshot | null>(null);
  const [window, setWindow] = useState("Today");

  useEffect(() => { api.getQuota().then(setSnap); }, []);

  const windows = snap ? Object.keys(snap.windows) : [];
  const data = snap?.windows[window];

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="panel wide" onMouseDown={(e) => e.stopPropagation()}>
        <div className="panel-head">
          <h2>Agent Quota</h2>
          <button className="icon-btn" onClick={onClose}>×</button>
        </div>
        <div className="panel-toolbar">
          <select value={window} onChange={(e) => setWindow(e.target.value)}>
            {windows.map((w) => <option key={w} value={w}>{WINDOW_LABELS[w] ?? w}</option>)}
          </select>
          {data && <span className="dim">{data.requests} requests · {data.totalTokens.toLocaleString()} tokens</span>}
        </div>
        <div className="panel-body">
          <table className="log-table">
            <thead>
              <tr><th>Provider</th><th>Model</th><th>Requests</th><th>Input</th><th>Output</th><th>Total</th><th>Last</th></tr>
            </thead>
            <tbody>
              {(data?.rows ?? []).map((r, i) => (
                <tr key={i}>
                  <td>{r.provider}</td><td>{r.model}</td><td>{r.requests}</td>
                  <td>{r.inputTokens.toLocaleString()}</td><td>{r.outputTokens.toLocaleString()}</td>
                  <td>{r.totalTokens.toLocaleString()}</td><td className="dim">{r.lastActivityLocal}</td>
                </tr>
              ))}
              {(!data || data.rows.length === 0) && <tr><td colSpan={7} className="empty">No agent activity</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
