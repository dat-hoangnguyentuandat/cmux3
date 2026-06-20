import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";

interface Props {
  wsId: string;
  sId: string;
  paneId: string;
  notes?: string;
}

export function NotepadPane({ wsId, sId, paneId, notes }: Props) {
  const [text, setText] = useState(notes ?? "");
  const timer = useRef<number | null>(null);

  useEffect(() => { setText(notes ?? ""); }, [paneId]);

  const onChange = (value: string) => {
    setText(value);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      api.updatePane(wsId, sId, paneId, { notes: value }).catch(() => {});
    }, 500);
  };

  return (
    <textarea
      className="notepad-pane mono"
      value={text}
      placeholder="Notes (auto-saved)..."
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
