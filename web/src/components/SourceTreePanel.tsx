import { useEffect, useState } from "react";
import { api, type FileEntry } from "../lib/api";

interface Props {
  initialPath?: string;
  onClose: () => void;
  onOpenFile?: (path: string) => void;
}

interface DirState { entries: FileEntry[]; expanded: Set<string>; childrenOf: Record<string, FileEntry[]>; }

export function SourceTreePanel({ initialPath, onClose, onOpenFile }: Props) {
  const [path, setPath] = useState(initialPath ?? "");
  const [draft, setDraft] = useState(initialPath ?? "");
  const [parent, setParent] = useState<string | undefined>();
  const [dir, setDir] = useState<DirState>({ entries: [], expanded: new Set(), childrenOf: {} });
  const [error, setError] = useState<string | undefined>();
  const [preview, setPreview] = useState<{ path: string; text: string } | null>(null);

  const loadRoot = (p: string) => {
    api.getFiles(p).then((r) => {
      setPath(r.path); setDraft(r.path); setParent(r.parent); setError(r.error);
      setDir({ entries: r.entries, expanded: new Set(), childrenOf: {} });
    });
  };
  useEffect(() => { if (path) loadRoot(path); }, []);

  const toggle = async (entry: FileEntry) => {
    if (!entry.isDirectory) {
      const text = await api.getFileContent(entry.fullPath);
      setPreview({ path: entry.fullPath, text });
      onOpenFile?.(entry.fullPath);
      return;
    }
    setDir((d) => {
      const expanded = new Set(d.expanded);
      if (expanded.has(entry.fullPath)) expanded.delete(entry.fullPath);
      else {
        expanded.add(entry.fullPath);
        if (!d.childrenOf[entry.fullPath])
          api.getFiles(entry.fullPath).then((r) =>
            setDir((dd) => ({ ...dd, childrenOf: { ...dd.childrenOf, [entry.fullPath]: r.entries } })));
      }
      return { ...d, expanded };
    });
  };

  const renderEntries = (entries: FileEntry[], depth: number): React.ReactNode =>
    entries.map((e) => (
      <div key={e.fullPath}>
        <div className="tree-row" style={{ paddingLeft: 8 + depth * 14 }} onClick={() => toggle(e)}>
          <span className="tree-icon">{e.isDirectory ? (dir.expanded.has(e.fullPath) ? "▾" : "▸") : "·"}</span>
          <span className={e.isDirectory ? "tree-dir" : "tree-file"}>{e.name}</span>
        </div>
        {e.isDirectory && dir.expanded.has(e.fullPath) &&
          renderEntries(dir.childrenOf[e.fullPath] ?? [], depth + 1)}
      </div>
    ));

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="panel wide split-panel" onMouseDown={(e) => e.stopPropagation()}>
        <div className="panel-head">
          <h2>Source Tree</h2>
          <button className="icon-btn" onClick={onClose}>×</button>
        </div>
        <div className="panel-toolbar">
          {parent && <button onClick={() => loadRoot(parent)} title="Up">↑</button>}
          <input value={draft} placeholder="Folder path..." onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") loadRoot(draft); }} />
          <button onClick={() => loadRoot(draft)}>Open</button>
        </div>
        <div className="vault-body">
          <div className="vault-list tree">
            {error && <div className="empty">{error}</div>}
            {!error && dir.entries.length === 0 && <div className="empty">Empty or no folder</div>}
            {renderEntries(dir.entries, 0)}
          </div>
          <pre className="vault-content mono">{preview ? preview.text : "Select a file to preview"}</pre>
        </div>
      </div>
    </div>
  );
}
