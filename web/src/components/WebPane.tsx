import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";

interface Props {
  wsId: string;
  sId: string;
  paneId: string;
  url?: string;
}

export function WebPane({ wsId, sId, paneId, url }: Props) {
  const [draft, setDraft] = useState(url ?? "");
  const [current, setCurrent] = useState(url ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (!url) inputRef.current?.focus(); }, [url]);

  const go = async () => {
    let target = draft.trim();
    if (!target) return;
    if (!/^https?:\/\//i.test(target)) target = "https://" + target;
    setCurrent(target);
    setDraft(target);
    await api.updatePane(wsId, sId, paneId, { url: target }).catch(() => {});
  };

  return (
    <div className="web-pane">
      <div className="web-bar">
        <input
          ref={inputRef}
          value={draft}
          placeholder="Enter a URL..."
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") go(); }}
        />
        <button onClick={go}>Go</button>
      </div>
      {current ? (
        <iframe className="web-frame" src={current} title={paneId} sandbox="allow-scripts allow-same-origin allow-forms allow-popups" />
      ) : (
        <div className="empty">Enter a URL to load a page</div>
      )}
    </div>
  );
}
