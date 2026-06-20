import { useEffect, useState } from "react";
import { api, type WorkspaceTemplate } from "../lib/api";

interface Props {
  onClose: () => void;
  workspaceId?: string;
  workspaceName?: string;
  onApplied?: () => void;
}

export function TemplatesPanel({ onClose, workspaceId, workspaceName, onApplied }: Props) {
  const [items, setItems] = useState<WorkspaceTemplate[]>([]);

  const load = () => api.getTemplates().then(setItems);
  useEffect(() => { load(); }, []);

  const remove = async (id: string) => { await api.deleteTemplate(id); await load(); };
  const apply = async (id: string) => { await api.applyTemplate(id); onApplied?.(); onClose(); };
  const saveCurrent = async () => {
    if (!workspaceId) return;
    const name = prompt("Template name", workspaceName || "Template");
    if (!name) return;
    await api.saveTemplateFromWorkspace(workspaceId, name);
    await load();
  };

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="panel" onMouseDown={(e) => e.stopPropagation()}>
        <div className="panel-head">
          <h2>Workspace Templates</h2>
          <div className="panel-head-actions">
            {workspaceId && <button onClick={saveCurrent}>Save current</button>}
            <button className="icon-btn" onClick={onClose}>×</button>
          </div>
        </div>
        <div className="panel-body">
          {items.length === 0 && <div className="empty">No templates saved</div>}
          {items.map((t) => (
            <div key={t.id} className="snippet-item">
              <div className="snippet-info">
                <div className="snippet-name">{t.name}</div>
                <div className="snippet-content dim">{t.description || `${t.surfaces.length} surface(s)`}</div>
              </div>
              <div className="snippet-actions">
                <button onClick={() => apply(t.id)}>Apply</button>
                <button onClick={() => remove(t.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

