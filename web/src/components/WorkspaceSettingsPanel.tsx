import { useEffect, useState } from "react";
import { api, type SshProfile, type Workspace } from "../lib/api";

interface Props {
  workspace: Workspace;
  onClose: () => void;
}

export function WorkspaceSettingsPanel({ workspace, onClose }: Props) {
  const [tab, setTab] = useState<"env" | "ssh">("env");
  const [envText, setEnvText] = useState("");
  const [ssh, setSsh] = useState<SshProfile[]>([]);

  useEffect(() => {
    api.getWorkspaceEnv(workspace.id).then((env) => {
      setEnvText(Object.entries(env).map(([k, v]) => `${k}=${v}`).join("\n"));
    });
    api.getWorkspaceSsh(workspace.id).then(setSsh);
  }, [workspace.id]);

  const saveEnv = async () => {
    const env: Record<string, string> = {};
    for (const line of envText.split("\n")) {
      const i = line.indexOf("=");
      if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
    await api.setWorkspaceEnv(workspace.id, env);
    onClose();
  };
  const saveSsh = async () => { await api.setWorkspaceSsh(workspace.id, ssh); onClose(); };

  const addProfile = () =>
    setSsh([...ssh, { id: crypto.randomUUID(), name: "New Profile", host: "hostname", port: 22, user: "user" }]);
  const updateProfile = (id: string, patch: Partial<SshProfile>) =>
    setSsh(ssh.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const removeProfile = (id: string) => setSsh(ssh.filter((p) => p.id !== id));

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="panel wide" onMouseDown={(e) => e.stopPropagation()}>
        <div className="panel-head">
          <h2>{workspace.name} — Settings</h2>
          <button className="icon-btn" onClick={onClose}>×</button>
        </div>
        <div className="panel-toolbar">
          <button className={tab === "env" ? "primary" : ""} onClick={() => setTab("env")}>Environment</button>
          <button className={tab === "ssh" ? "primary" : ""} onClick={() => setTab("ssh")}>SSH Profiles</button>
        </div>
        {tab === "env" ? (
          <div className="panel-body">
            <p className="dim">One <code>KEY=value</code> per line. Injected into every new terminal in this workspace.</p>
            <textarea className="mono" rows={12} style={{ width: "100%" }}
              value={envText} onChange={(e) => setEnvText(e.target.value)} />
            <div className="modal-actions"><button onClick={onClose}>Cancel</button><button className="primary" onClick={saveEnv}>Save</button></div>
          </div>
        ) : (
          <div className="panel-body">
            {ssh.map((p) => (
              <div key={p.id} className="ssh-row">
                <input placeholder="name" value={p.name} onChange={(e) => updateProfile(p.id, { name: e.target.value })} />
                <input placeholder="user" value={p.user} onChange={(e) => updateProfile(p.id, { user: e.target.value })} />
                <input placeholder="host" value={p.host} onChange={(e) => updateProfile(p.id, { host: e.target.value })} />
                <input placeholder="port" type="number" style={{ width: 70 }} value={p.port}
                  onChange={(e) => updateProfile(p.id, { port: Number(e.target.value) })} />
                <button onClick={() => removeProfile(p.id)}>×</button>
              </div>
            ))}
            <div className="modal-actions">
              <button onClick={addProfile}>Add profile</button>
              <button className="primary" onClick={saveSsh}>Save</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
