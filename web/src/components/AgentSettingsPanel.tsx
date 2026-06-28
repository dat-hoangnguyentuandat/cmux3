import { useEffect, useState } from "react";
import { api } from "../lib/api";

type Tab = "agent" | "tools" | "memory" | "prompts" | "mcp";

export function AgentSettingsPanel({ onClose }: { onClose: () => void }) {
  const [s, setS] = useState<any>(null);
  const [apiKey, setApiKey] = useState("");
  const [tab, setTab] = useState<Tab>("agent");

  useEffect(() => { api.getAgentSettings().then(setS); }, []);
  if (!s) return null;
  const set = (patch: any) => setS({ ...s, ...patch });
  const setOpenAi = (patch: any) => setS({ ...s, openAi: { ...s.openAi, ...patch } });

  const save = async () => {
    await api.saveAgentSettings(s);
    if (apiKey.trim()) await api.setAgentSecret(s.openAi?.apiKeySecretName || "agent.openai.apiKey", apiKey.trim());
    onClose();
  };

  return (
    <div className="cmux-popup-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cmux-popup-panel" onMouseDown={(e) => e.stopPropagation()} style={{ maxWidth: 580, maxHeight: 540 }}>
        <div className="cmux-panel-toolbar">
          <div className="cmux-panel-toolbar-row">
            <span className="cmux-panel-title">AGENT SETTINGS</span>
            <span className="cmux-spacer" />
            <button className="cmux-icon-btn" onClick={onClose}>×</button>
          </div>
        </div>
      <div className="cmux-modal-toolbar">
        <button className={tab === "agent" ? "primary" : ""} onClick={() => setTab("agent")}>Agent</button>
        <button className={tab === "tools" ? "primary" : ""} onClick={() => setTab("tools")}>Tools</button>
        <button className={tab === "memory" ? "primary" : ""} onClick={() => setTab("memory")}>Memory</button>
        <button className={tab === "prompts" ? "primary" : ""} onClick={() => setTab("prompts")}>Custom Tools</button>
        <button className={tab === "mcp" ? "primary" : ""} onClick={() => setTab("mcp")}>MCP Servers</button>
      </div>

      {tab === "agent" && (
        <div className="cmux-settings-grid">
          <label className="cmux-field checkbox"><input type="checkbox" checked={!!s.enabled} onChange={(e) => set({ enabled: e.target.checked })} /><span>Enable agent</span></label>
          <label className="cmux-field checkbox"><input type="checkbox" checked={!!s.enableStreaming} onChange={(e) => set({ enableStreaming: e.target.checked })} /><span>Streaming</span></label>
          <label className="cmux-field"><span>Agent name</span><input value={s.agentName ?? ""} onChange={(e) => set({ agentName: e.target.value })} /></label>
          <label className="cmux-field"><span>Handler token</span><input value={s.handler ?? ""} onChange={(e) => set({ handler: e.target.value })} /></label>
          <label className="cmux-field"><span>Active provider</span>
            <select value={s.activeProvider ?? "openai"} onChange={(e) => set({ activeProvider: e.target.value })}>
              <option value="openai">openai</option><option value="anthropic">anthropic</option><option value="gemini">gemini</option>
            </select></label>
          <label className="cmux-field"><span>Model (OpenAI)</span><input value={s.openAi?.model ?? ""} onChange={(e) => setOpenAi({ model: e.target.value })} /></label>
          <label className="cmux-field"><span>Base URL (OpenAI)</span><input value={s.openAi?.baseUrl ?? ""} onChange={(e) => setOpenAi({ baseUrl: e.target.value })} /></label>
          <label className="cmux-field"><span>API key</span><input type="password" placeholder="(unchanged)" value={apiKey} onChange={(e) => setApiKey(e.target.value)} /></label>
        </div>
      )}

      {tab === "tools" && (
        <div className="cmux-settings-grid">
          <label className="cmux-field checkbox"><input type="checkbox" checked={!!s.enableBashTool} onChange={(e) => set({ enableBashTool: e.target.checked })} /><span>Bash tool</span></label>
          <label className="cmux-field checkbox"><input type="checkbox" checked={!!s.enableWebSearch} onChange={(e) => set({ enableWebSearch: e.target.checked })} /><span>Web search</span></label>
          <label className="cmux-field checkbox"><input type="checkbox" checked={!!s.enableExa} onChange={(e) => set({ enableExa: e.target.checked })} /><span>Exa search</span></label>
          <label className="cmux-field"><span>Tool timeout (seconds)</span><input type="number" min={1} value={s.toolTimeoutSeconds ?? 30} onChange={(e) => set({ toolTimeoutSeconds: Number(e.target.value) })} /></label>
          <label className="cmux-field"><span>Default submit key</span>
            <select value={s.defaultSubmitKey ?? "Enter"} onChange={(e) => set({ defaultSubmitKey: e.target.value })}>
              <option>Enter</option><option>Shift+Enter</option>
            </select></label>
        </div>
      )}

      {tab === "memory" && (
        <div className="cmux-settings-grid">
          <label className="cmux-field checkbox"><input type="checkbox" checked={!!s.enableConversationMemory} onChange={(e) => set({ enableConversationMemory: e.target.checked })} /><span>Conversation memory</span></label>
          <label className="cmux-field checkbox"><input type="checkbox" checked={!!s.enableAutoCompact} onChange={(e) => set({ enableAutoCompact: e.target.checked })} /><span>Auto-compact context</span></label>
          <label className="cmux-field"><span>Max messages</span><input type="number" min={1} value={s.maxMessages ?? 200} onChange={(e) => set({ maxMessages: Number(e.target.value) })} /></label>
          <label className="cmux-field"><span>Context budget (tokens)</span><input type="number" min={1000} value={s.contextBudget ?? 200000} onChange={(e) => set({ contextBudget: Number(e.target.value) })} /></label>
          <label className="cmux-field"><span>Compact threshold</span><input type="number" min={0} max={1} step={0.05} value={s.compactThreshold ?? 0.85} onChange={(e) => set({ compactThreshold: Number(e.target.value) })} /></label>
          <label className="cmux-field"><span>Keep recent</span><input type="number" min={1} value={s.keepRecent ?? 20} onChange={(e) => set({ keepRecent: Number(e.target.value) })} /></label>
        </div>
      )}

      {tab === "prompts" && (
        <div className="cmux-settings-grid">
          <label className="cmux-field full"><span>System prompt</span>
            <textarea rows={6} value={s.systemPrompt ?? ""} onChange={(e) => set({ systemPrompt: e.target.value })} /></label>
          <label className="cmux-field full"><span>Custom tools (JSON array)</span>
            <textarea rows={6} value={JSON.stringify(s.customTools ?? [], null, 2)} onChange={(e) => { try { set({ customTools: JSON.parse(e.target.value) }); } catch { /* ignore */ } }} /></label>
        </div>
      )}

      {tab === "mcp" && (
        <div className="cmux-settings-grid">
          <label className="cmux-field full"><span>MCP servers (JSON)</span>
            <textarea rows={8} value={JSON.stringify(s.mcpServers ?? {}, null, 2)} onChange={(e) => { try { set({ mcpServers: JSON.parse(e.target.value) }); } catch { /* ignore */ } }} /></label>
        </div>
      )}

      <div className="cmux-modal-actions">
        <button onClick={onClose}>Cancel</button>
        <button className="primary" onClick={save}>Save</button>
      </div>
      </div>
    </div>
  );
}
