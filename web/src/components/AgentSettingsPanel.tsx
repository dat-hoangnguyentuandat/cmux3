import { useEffect, useState } from "react";
import { api } from "../lib/api";

export function AgentSettingsPanel({ onClose }: { onClose: () => void }) {
  const [s, setS] = useState<any>(null);
  const [apiKey, setApiKey] = useState("");

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
    <div className="overlay" onMouseDown={onClose}>
      <div className="modal wide-modal" onMouseDown={(e) => e.stopPropagation()}>
        <h2>Agent Settings</h2>
        <div className="settings-grid">
          <label className="field checkbox"><input type="checkbox" checked={s.enabled} onChange={(e) => set({ enabled: e.target.checked })} /><span>Enable agent</span></label>
          <label className="field checkbox"><input type="checkbox" checked={s.enableStreaming} onChange={(e) => set({ enableStreaming: e.target.checked })} /><span>Streaming</span></label>
          <label className="field"><span>Agent name</span><input value={s.agentName} onChange={(e) => set({ agentName: e.target.value })} /></label>
          <label className="field"><span>Handler token</span><input value={s.handler} onChange={(e) => set({ handler: e.target.value })} /></label>
          <label className="field"><span>Provider</span>
            <select value={s.activeProvider} onChange={(e) => set({ activeProvider: e.target.value })}>
              <option value="openai">openai</option><option value="anthropic">anthropic</option><option value="gemini">gemini</option>
            </select></label>
          <label className="field"><span>Model (OpenAI)</span><input value={s.openAi?.model ?? ""} onChange={(e) => setOpenAi({ model: e.target.value })} /></label>
          <label className="field"><span>Base URL (OpenAI)</span><input value={s.openAi?.baseUrl ?? ""} onChange={(e) => setOpenAi({ baseUrl: e.target.value })} /></label>
          <label className="field"><span>API key</span><input type="password" placeholder="(unchanged)" value={apiKey} onChange={(e) => setApiKey(e.target.value)} /></label>
          <label className="field checkbox"><input type="checkbox" checked={s.enableBashTool} onChange={(e) => set({ enableBashTool: e.target.checked })} /><span>Bash tool</span></label>
          <label className="field checkbox"><input type="checkbox" checked={s.enableConversationMemory} onChange={(e) => set({ enableConversationMemory: e.target.checked })} /><span>Conversation memory</span></label>
        </div>
        <label className="field"><span>System prompt</span>
          <textarea rows={3} value={s.systemPrompt} onChange={(e) => set({ systemPrompt: e.target.value })} /></label>
        <div className="modal-actions">
          <button onClick={onClose}>Cancel</button>
          <button className="primary" onClick={save}>Save</button>
        </div>
      </div>
    </div>
  );
}
