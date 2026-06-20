import { useEffect, useRef, useState } from "react";
import { terminalBus } from "../lib/terminalBus";

interface Props {
  paneId?: string;
  onClose: () => void;
}

export function SearchOverlay({ paneId, onClose }: Props) {
  const [term, setTerm] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const close = () => { terminalBus.clearSearch(paneId); onClose(); };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { close(); }
    else if (e.key === "Enter") { e.preventDefault(); terminalBus.search(paneId, term, { back: e.shiftKey }); }
  };

  return (
    <div className="search-overlay">
      <input
        ref={inputRef}
        placeholder="Search in terminal..."
        value={term}
        onChange={(e) => { setTerm(e.target.value); terminalBus.search(paneId, e.target.value); }}
        onKeyDown={onKey}
      />
      <button onClick={() => terminalBus.search(paneId, term, { back: true })} title="Previous (Shift+Enter)">↑</button>
      <button onClick={() => terminalBus.search(paneId, term)} title="Next (Enter)">↓</button>
      <button onClick={close} title="Close (Esc)">×</button>
    </div>
  );
}
