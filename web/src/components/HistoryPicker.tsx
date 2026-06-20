import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";

interface Props {
  paneId?: string;
  onClose: () => void;
  onPick: (command: string) => void;
}

export function HistoryPicker({ paneId, onClose, onPick }: Props) {
  const [all, setAll] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { api.getHistory(paneId).then(setAll); inputRef.current?.focus(); }, [paneId]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return all.filter((c) => c.toLowerCase().includes(q));
  }, [all, query]);
  const clamped = Math.min(index, Math.max(0, filtered.length - 1));

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
    else if (e.key === "ArrowDown") { e.preventDefault(); setIndex((i) => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setIndex((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); const c = filtered[clamped]; if (c) { onClose(); onPick(c); } }
  };

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="palette" onMouseDown={(e) => e.stopPropagation()}>
        <input ref={inputRef} className="palette-input" placeholder="Command history..."
          value={query} onChange={(e) => { setQuery(e.target.value); setIndex(0); }} onKeyDown={onKey} />
        <div className="palette-list">
          {filtered.map((c, i) => (
            <div key={i} className={"palette-item" + (i === clamped ? " active" : "")}
              onMouseEnter={() => setIndex(i)} onClick={() => { onClose(); onPick(c); }}>
              <span className="mono">{c}</span>
            </div>
          ))}
          {filtered.length === 0 && <div className="palette-empty">No history</div>}
        </div>
      </div>
    </div>
  );
}
