import { useEffect, useState } from "react";
import { api, type CommandLogEntry } from "../lib/api";

export function CommandLogsPanel({ onClose }: { onClose: () => void }) {
  const [dates, setDates] = useState<string[]>([]);
  const [date, setDate] = useState<string>("");
  const [query, setQuery] = useState("");
  const [entries, setEntries] = useState<CommandLogEntry[]>([]);

  useEffect(() => {
    api.getLogDates().then((d) => {
      setDates(d);
      setDate(d[0] ?? new Date().toISOString().slice(0, 10));
    });
  }, []);

  useEffect(() => {
    if (query.trim()) api.getLogs({ q: query }).then(setEntries);
    else if (date) api.getLogs({ date }).then(setEntries);
  }, [date, query]);

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="panel wide" onMouseDown={(e) => e.stopPropagation()}>
        <div className="panel-head">
          <h2>Command Logs</h2>
          <button className="icon-btn" onClick={onClose}>×</button>
        </div>
        <div className="panel-toolbar">
          <select value={date} onChange={(e) => { setQuery(""); setDate(e.target.value); }}>
            {dates.length === 0 && <option value={date}>{date}</option>}
            {dates.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <input
            placeholder="Search all logs..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="panel-body">
          <table className="log-table">
            <thead>
              <tr><th>Status</th><th>Command</th><th>Duration</th><th>Directory</th><th>Started</th></tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td>{e.exitCode == null ? "…" : e.exitCode === 0 ? "✓" : "✗"}</td>
                  <td className="mono">{e.command}</td>
                  <td>{e.durationDisplay}</td>
                  <td className="mono dim">{e.workingDirectory}</td>
                  <td className="dim">{new Date(e.startedAt).toLocaleTimeString()}</td>
                </tr>
              ))}
              {entries.length === 0 && <tr><td colSpan={5} className="empty">No commands</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

