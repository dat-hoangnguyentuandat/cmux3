import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";

interface Props {
  root: string;
  onClose: () => void;
  onPick: (fullPath: string) => void;
}

export function QuickOpen({ root, onClose, onPick }: Props) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<{ fullPath: string; name: string }[]>([]);
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    if (!root) return;
    const t = setTimeout(() => { api.quickOpen(root, query).then((r) => { setItems(r); setIndex(0); }).catch(() => setItems([])); }, 120);
    return () => clearTimeout(t);
  }, [root, query]);

  const clamped = Math.min(index, Math.max(0, items.length - 1));
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
    else if (e.key === "ArrowDown") { e.preventDefault(); setIndex((i) => Math.min(i + 1, items.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setIndex((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); const it = items[clamped]; if (it) { onClose(); onPick(it.fullPath); } }
  };

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="palette" onMouseDown={(e) => e.stopPropagation()}>
        <input ref={inputRef} className="palette-input" placeholder={root ? "Quick open file..." : "No folder for active pane"}
          value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onKey} />
        <div className="palette-list">
          {items.map((it, i) => (
            <div key={it.fullPath} className={"palette-item" + (i === clamped ? " active" : "")}
              onMouseEnter={() => setIndex(i)} onClick={() => { onClose(); onPick(it.fullPath); }}>
              <span className="mono">{it.name}</span>
            </div>
          ))}
          {items.length === 0 && <div className="palette-empty">No files</div>}
        </div>
      </div>
    </div>
  );
}
