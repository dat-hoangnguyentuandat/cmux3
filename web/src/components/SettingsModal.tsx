import { useEffect, useState } from "react";
import { api, type TerminalTheme } from "../lib/api";

interface Props {
  themes: TerminalTheme[];
  onClose: () => void;
  onApplied: (settings: any) => void;
}

type Tab = "appearance" | "terminal" | "behavior";

export function SettingsModal({ themes, onClose, onApplied }: Props) {
  const [settings, setSettings] = useState<any>(null);
  const [shells, setShells] = useState<{ name: string; path: string }[]>([]);
  const [tab, setTab] = useState<Tab>("appearance");

  useEffect(() => {
    api.getSettings().then(setSettings);
    api.getShells().then(setShells).catch(() => setShells([]));
  }, []);

  if (!settings) return null;
  const set = (patch: any) => setSettings({ ...settings, ...patch });

  const save = async () => {
    const updated = await api.saveSettings(settings);
    onApplied(updated);
    onClose();
  };

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="modal wide-modal" onMouseDown={(e) => e.stopPropagation()}>
        <h2>Settings</h2>
        <div className="panel-toolbar">
          <button className={tab === "appearance" ? "primary" : ""} onClick={() => setTab("appearance")}>Appearance</button>
          <button className={tab === "terminal" ? "primary" : ""} onClick={() => setTab("terminal")}>Terminal</button>
          <button className={tab === "behavior" ? "primary" : ""} onClick={() => setTab("behavior")}>Behavior</button>
        </div>

        {tab === "appearance" && (
          <div className="settings-grid">
            <label className="field"><span>UI theme</span>
              <select value={settings.uiThemeName} onChange={(e) => set({ uiThemeName: e.target.value })}>
                <option value="Dark+">Dark+</option><option value="Light">Light</option><option value="High Contrast">High Contrast</option>
              </select></label>
            <label className="field"><span>Terminal theme</span>
              <select value={settings.themeName} onChange={(e) => set({ themeName: e.target.value })}>
                {themes.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
              </select></label>
            <label className="field"><span>Font family</span>
              <input value={settings.fontFamily} onChange={(e) => set({ fontFamily: e.target.value })} /></label>
            <label className="field"><span>Font size</span>
              <input type="number" min={8} max={32} value={settings.fontSize} onChange={(e) => set({ fontSize: Number(e.target.value) })} /></label>
            <label className="field"><span>Line height</span>
              <input type="number" min={0.8} max={2} step={0.1} value={settings.lineHeight} onChange={(e) => set({ lineHeight: Number(e.target.value) })} /></label>
            <label className="field"><span>Cursor style</span>
              <select value={settings.cursorStyle} onChange={(e) => set({ cursorStyle: e.target.value })}>
                <option value="bar">bar</option><option value="block">block</option><option value="underline">underline</option>
              </select></label>
            <label className="field checkbox"><input type="checkbox" checked={settings.cursorBlink} onChange={(e) => set({ cursorBlink: e.target.checked })} /><span>Cursor blink</span></label>
            <label className="field checkbox"><input type="checkbox" checked={settings.useCustomTerminalColors} onChange={(e) => set({ useCustomTerminalColors: e.target.checked })} /><span>Custom terminal colors</span></label>
            {settings.useCustomTerminalColors && <>
              <label className="field"><span>Background</span><input type="color" value={(settings.customTerminalBackground || "#1a1b26").slice(0, 7)} onChange={(e) => set({ customTerminalBackground: e.target.value })} /></label>
              <label className="field"><span>Foreground</span><input type="color" value={(settings.customTerminalForeground || "#c0caf5").slice(0, 7)} onChange={(e) => set({ customTerminalForeground: e.target.value })} /></label>
              <label className="field"><span>Cursor</span><input type="color" value={(settings.customTerminalCursor || "#c0caf5").slice(0, 7)} onChange={(e) => set({ customTerminalCursor: e.target.value })} /></label>
              <label className="field"><span>Selection</span><input type="color" value={(settings.customTerminalSelection || "#283457").slice(0, 7)} onChange={(e) => set({ customTerminalSelection: e.target.value })} /></label>
            </>}
          </div>
        )}

        {tab === "terminal" && (
          <div className="settings-grid">
            <label className="field"><span>Default shell</span>
              <select value={settings.defaultShell} onChange={(e) => set({ defaultShell: e.target.value })}>
                <option value="">(auto)</option>
                {shells.map((s) => <option key={s.path} value={s.path}>{s.name}</option>)}
              </select></label>
            <label className="field"><span>Scrollback lines</span>
              <input type="number" min={0} max={100000} value={settings.scrollbackLines} onChange={(e) => set({ scrollbackLines: Number(e.target.value) })} /></label>
            <label className="field checkbox"><input type="checkbox" checked={settings.bellSound} onChange={(e) => set({ bellSound: e.target.checked })} /><span>Bell sound</span></label>
            <label className="field checkbox"><input type="checkbox" checked={settings.visualBell} onChange={(e) => set({ visualBell: e.target.checked })} /><span>Visual bell</span></label>
            <label className="field checkbox"><input type="checkbox" checked={settings.bracketedPaste} onChange={(e) => set({ bracketedPaste: e.target.checked })} /><span>Bracketed paste</span></label>
            <label className="field checkbox"><input type="checkbox" checked={settings.vimMode} onChange={(e) => set({ vimMode: e.target.checked })} /><span>Vim mode</span></label>
            <label className="field checkbox"><input type="checkbox" checked={settings.knowledgeGraphEnabled} onChange={(e) => set({ knowledgeGraphEnabled: e.target.checked })} /><span>Knowledge graph indexing</span></label>
          </div>
        )}

        {tab === "behavior" && (
          <div className="settings-grid">
            <label className="field checkbox"><input type="checkbox" checked={settings.restoreSessionOnStartup} onChange={(e) => set({ restoreSessionOnStartup: e.target.checked })} /><span>Restore session on startup</span></label>
            <label className="field checkbox"><input type="checkbox" checked={settings.confirmOnClose} onChange={(e) => set({ confirmOnClose: e.target.checked })} /><span>Confirm on close</span></label>
            <label className="field checkbox"><input type="checkbox" checked={settings.autoCopyOnSelect} onChange={(e) => set({ autoCopyOnSelect: e.target.checked })} /><span>Auto-copy on select</span></label>
            <label className="field checkbox"><input type="checkbox" checked={settings.ctrlClickOpensUrls} onChange={(e) => set({ ctrlClickOpensUrls: e.target.checked })} /><span>Ctrl+Click opens URLs</span></label>
            <label className="field checkbox"><input type="checkbox" checked={settings.adBlockEnabled} onChange={(e) => set({ adBlockEnabled: e.target.checked })} /><span>Ad block (web panes)</span></label>
            <label className="field checkbox"><input type="checkbox" checked={settings.captureTranscriptsOnClose} onChange={(e) => set({ captureTranscriptsOnClose: e.target.checked })} /><span>Capture transcripts on close</span></label>
            <label className="field"><span>Command log retention (days)</span>
              <input type="number" min={0} value={settings.commandLogRetentionDays} onChange={(e) => set({ commandLogRetentionDays: Number(e.target.value) })} /></label>
            <label className="field"><span>Transcript retention (days)</span>
              <input type="number" min={0} value={settings.transcriptRetentionDays} onChange={(e) => set({ transcriptRetentionDays: Number(e.target.value) })} /></label>
          </div>
        )}

        <div className="modal-actions">
          <button onClick={() => {
            const blob = new Blob([JSON.stringify(settings, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url; a.download = "cmux-settings.json"; a.click();
            URL.revokeObjectURL(url);
          }}>Export</button>
          <label className="import-btn">
            Import
            <input type="file" accept="application/json" style={{ display: "none" }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                file.text().then((t) => { try { setSettings({ ...settings, ...JSON.parse(t) }); } catch { /* ignore */ } });
              }} />
          </label>
          <span style={{ flex: 1 }} />
          <button onClick={onClose}>Cancel</button>
          <button className="primary" onClick={save}>Save</button>
        </div>
      </div>
    </div>
  );
}



