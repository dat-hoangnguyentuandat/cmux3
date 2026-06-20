import { useEffect, useState } from "react";
import { api, type Snippet } from "../lib/api";

interface Props {
  onClose: () => void;
  onInsert?: (text: string) => void;
}

export function SnippetsPanel({ onClose, onInsert }: Props) {
  const [items, setItems] = useState<Snippet[]>([]);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Partial<Snippet> | null>(null);

  const load = () => api.getSnippets(query).then(setItems);
  useEffect(() => { load(); }, [query]);

  const save = async () => {
    if (!editing) return;
    if (editing.id) await api.updateSnippet(editing.id, editing as Snippet);
    else await api.createSnippet(editing);
    setEditing(null);
    await load();
  };
  const remove = async (id: string) => { await api.deleteSnippet(id); await load(); };
  const insert = async (s: Snippet) => { await api.useSnippet(s.id); onInsert?.(s.content); onClose(); };

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="panel wide" onMouseDown={(e) => e.stopPropagation()}>
        <div className="panel-head">
          <h2>Snippets</h2>
          <div className="panel-head-actions">
            <button onClick={() => setEditing({ name: "", content: "", category: "General", tags: [] })}>New</button>
            <button className="icon-btn" onClick={onClose}>×</button>
          </div>
        </div>
        {editing ? (
          <div className="panel-body snippet-edit">
            <label className="field"><span>Name</span>
              <input value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></label>
            <label className="field"><span>Category</span>
              <input value={editing.category ?? ""} onChange={(e) => setEditing({ ...editing, category: e.target.value })} /></label>
            <label className="field"><span>Content</span>
              <textarea rows={6} value={editing.content ?? ""} onChange={(e) => setEditing({ ...editing, content: e.target.value })} /></label>
            <div className="modal-actions">
              <button onClick={() => setEditing(null)}>Cancel</button>
              <button className="primary" onClick={save}>Save</button>
            </div>
          </div>
        ) : (
          <>
            <div className="panel-toolbar">
              <input placeholder="Search snippets..." value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <div className="panel-body">
              {items.length === 0 && <div className="empty">No snippets</div>}
              {items.map((s) => (
                <div key={s.id} className="snippet-item">
                  <div className="snippet-info" onClick={() => insert(s)}>
                    <div className="snippet-name">{s.name} <span className="dim">· {s.category}</span></div>
                    <div className="snippet-content mono dim">{s.content}</div>
                  </div>
                  <div className="snippet-actions">
                    <button onClick={() => setEditing(s)}>Edit</button>
                    <button onClick={() => remove(s.id)}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
