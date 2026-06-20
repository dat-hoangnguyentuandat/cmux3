import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type AppState, type Surface, type TerminalTheme, type Workspace } from "./lib/api";
import { terminalBus } from "./lib/terminalBus";
import { SplitView } from "./components/SplitView";
import { CommandPalette, type Command } from "./components/CommandPalette";
import { SettingsModal } from "./components/SettingsModal";
import { NotificationsPanel } from "./components/NotificationsPanel";
import { CommandLogsPanel } from "./components/CommandLogsPanel";
import { SessionVaultPanel } from "./components/SessionVaultPanel";
import { SnippetsPanel } from "./components/SnippetsPanel";
import { QuotaPanel } from "./components/QuotaPanel";
import { HistoryPicker } from "./components/HistoryPicker";
import { AgentsPanel } from "./components/AgentsPanel";
import { WorkspaceSettingsPanel } from "./components/WorkspaceSettingsPanel";
import { SearchOverlay } from "./components/SearchOverlay";
import { TemplatesPanel } from "./components/TemplatesPanel";
import { SourceTreePanel } from "./components/SourceTreePanel";
import { KnowledgeGraphPanel } from "./components/KnowledgeGraphPanel";
import { TrexRunner } from "./components/TrexRunner";
import { QuickOpen } from "./components/QuickOpen";
import { AgentChatPanel } from "./components/AgentChatPanel";
import { AgentSettingsPanel } from "./components/AgentSettingsPanel";

type Overlay = null | "palette" | "settings" | "notifications" | "logs" | "vault" | "snippets" | "quota" | "history" | "agents" | "wsSettings" | "templates" | "tree" | "kg" | "trex" | "quickOpen" | "agentChat" | "agentSettings";

export default function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [themes, setThemes] = useState<TerminalTheme[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [unread, setUnread] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [zoomedPaneId, setZoomedPaneId] = useState<string | null>(null);
  const [broadcast, setBroadcast] = useState(false);
  const [wsStatus, setWsStatus] = useState<Record<string, { branch?: string; workingDirectory?: string; unread: number }>>({});

  const refresh = useCallback(async () => setState(await api.getState()), []);
  const refreshUnread = useCallback(() => {
    api.getNotifications().then((r) => setUnread(r.unread)).catch(() => {});
    api.getWorkspaceStatus().then((rows) => {
      const map: Record<string, { branch?: string; workingDirectory?: string; unread: number }> = {};
      for (const r of rows) map[r.id] = { branch: r.branch, workingDirectory: r.workingDirectory, unread: r.unread };
      setWsStatus(map);
    }).catch(() => {});
  }, []);

  const onTerminalNotify = useCallback(() => {
    api.getNotifications().then((r) => {
      setUnread(r.unread);
      const latest = r.items.find((n) => !n.isRead);
      if (latest && "Notification" in window && Notification.permission === "granted") {
        try { new Notification(latest.title, { body: latest.body }); } catch { /* ignore */ }
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    api.getThemes().then(setThemes);
    api.getSettings().then(setSettings);
    refreshUnread();
    if ("Notification" in window && Notification.permission === "default")
      Notification.requestPermission().catch(() => {});
    const t = setInterval(refreshUnread, 5000);
    return () => clearInterval(t);
  }, [refresh, refreshUnread]);

  const workspace = useMemo<Workspace | undefined>(
    () => state?.workspaces.find((w) => w.id === state.selectedWorkspaceId) ?? state?.workspaces[0],
    [state]
  );
  const surface = useMemo<Surface | undefined>(
    () => workspace?.surfaces.find((s) => s.id === workspace.selectedSurfaceId) ?? workspace?.surfaces[0],
    [workspace]
  );

  const activeTheme = useMemo(
    () => themes.find((t) => t.name === settings?.themeName) ?? themes[0],
    [themes, settings]
  );
  const fontFamily = settings?.fontFamily ?? "Cascadia Code";
  const fontSize = settings?.fontSize ?? 14;
  const customColors = settings?.useCustomTerminalColors
    ? {
        background: settings?.customTerminalBackground,
        foreground: settings?.customTerminalForeground,
        cursor: settings?.customTerminalCursor,
        selection: settings?.customTerminalSelection,
      }
    : undefined;

  const focusedPaneId = surface?.focusedPaneId ?? (surface ? Object.keys(surface.panes)[0] : undefined);
  const focusedCwd = (focusedPaneId && surface?.panes[focusedPaneId]?.workingDirectory) || workspace?.workingDirectory || "";

  useEffect(() => { terminalBus.setBroadcast(broadcast); }, [broadcast]);

  useEffect(() => {
    const name = settings?.uiThemeName ?? "Dark+";
    document.documentElement.setAttribute("data-ui-theme", name);
  }, [settings]);

  // ── Actions ──────────────────────────────────────────────────────
  const newWorkspace = useCallback(async () => {
    const name = prompt("Workspace name", "Workspace");
    if (name === null) return;
    await api.createWorkspace(name || "Workspace");
    await refresh();
  }, [refresh]);

  const selectWorkspace = useCallback(async (id: string) => {
    await api.selectWorkspace(id);
    await refresh();
  }, [refresh]);

  const selectWorkspaceByIndex = useCallback((idx: number) => {
    const ws = state?.workspaces[idx];
    if (ws) selectWorkspace(ws.id);
  }, [state, selectWorkspace]);

  const closeWorkspace = useCallback(async (id: string) => {
    if (!confirm("Close this workspace and all its terminals?")) return;
    await api.deleteWorkspace(id);
    await refresh();
  }, [refresh]);

  const renameWorkspace = useCallback(async () => {
    if (!workspace) return;
    const name = prompt("Rename workspace", workspace.name);
    if (name) { await api.updateWorkspace(workspace.id, { name }); await refresh(); }
  }, [workspace, refresh]);

  const newSurface = useCallback(async () => {
    if (!workspace) return;
    await api.createSurface(workspace.id);
    await refresh();
  }, [workspace, refresh]);

  const selectSurface = useCallback(async (sId: string) => {
    if (!workspace) return;
    await api.selectSurface(workspace.id, sId);
    await refresh();
  }, [workspace, refresh]);

  const cycleSurface = useCallback((dir: 1 | -1) => {
    if (!workspace || !surface) return;
    const list = workspace.surfaces;
    const i = list.findIndex((s) => s.id === surface.id);
    const next = list[(i + dir + list.length) % list.length];
    if (next && next.id !== surface.id) selectSurface(next.id);
  }, [workspace, surface, selectSurface]);

  const closeSurface = useCallback(async (sId: string) => {
    if (!workspace) return;
    await api.deleteSurface(workspace.id, sId);
    await refresh();
  }, [workspace, refresh]);

  const splitPane = useCallback(async (dir: "vertical" | "horizontal") => {
    if (!workspace || !surface) return;
    const paneId = surface.focusedPaneId ?? Object.keys(surface.panes)[0];
    if (!paneId) return;
    await api.split(workspace.id, surface.id, paneId, dir);
    await refresh();
  }, [workspace, surface, refresh]);

  const closePane = useCallback(async (paneId: string) => {
    if (!workspace || !surface) return;
    await api.closePane(workspace.id, surface.id, paneId);
    await refresh();
  }, [workspace, surface, refresh]);

  const focusPane = useCallback(async (paneId: string) => {
    if (!workspace || !surface || surface.focusedPaneId === paneId) return;
    setState((prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev) as AppState;
      const w = next.workspaces.find((x) => x.id === workspace.id);
      const s = w?.surfaces.find((x) => x.id === surface.id);
      if (s) s.focusedPaneId = paneId;
      return next;
    });
    api.focusPane(workspace.id, surface.id, paneId).catch(() => {});
  }, [workspace, surface]);

  const setRatio = useCallback((nodeId: string, ratio: number) => {
    if (!workspace || !surface) return;
    setState((prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev) as AppState;
      const w = next.workspaces.find((x) => x.id === workspace.id);
      const s = w?.surfaces.find((x) => x.id === surface.id);
      const apply = (n: any): boolean => {
        if (n.id === nodeId) { n.splitRatio = ratio; return true; }
        if (n.isLeaf) return false;
        return apply(n.first) || apply(n.second);
      };
      if (s) apply(s.root);
      return next;
    });
    api.setRatio(workspace.id, surface.id, nodeId, ratio).catch(() => {});
  }, [workspace, surface]);

  const setPaneTitle = useCallback((paneId: string, title: string) => {
    setState((prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev) as AppState;
      for (const w of next.workspaces)
        for (const s of w.surfaces)
          if (s.panes[paneId]) s.panes[paneId].title = title;
      return next;
    });
  }, []);

  const setPaneCwd = useCallback((paneId: string, cwd: string) => {
    setState((prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev) as AppState;
      for (const w of next.workspaces)
        for (const s of w.surfaces)
          if (s.panes[paneId]) s.panes[paneId].workingDirectory = cwd;
      return next;
    });
  }, []);

  const setPaneType = useCallback(async (paneId: string, type: string) => {
    if (!workspace || !surface) return;
    setState((prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev) as AppState;
      for (const w of next.workspaces)
        for (const s of w.surfaces)
          if (s.panes[paneId]) s.panes[paneId].type = type as any;
      return next;
    });
    await api.updatePane(workspace.id, surface.id, paneId, { type }).catch(() => {});
  }, [workspace, surface]);

  const insertIntoFocused = useCallback((text: string) => {
    terminalBus.write(focusedPaneId, text);
  }, [focusedPaneId]);

  const orderedPaneIds = useMemo(() => {
    if (!surface) return [] as string[];
    const out: string[] = [];
    const walk = (n: any) => {
      if (!n) return;
      if (n.isLeaf) { if (n.paneId) out.push(n.paneId); return; }
      walk(n.first); walk(n.second);
    };
    walk(surface.root);
    return out;
  }, [surface]);

  const focusAdjacent = useCallback((dir: 1 | -1) => {
    if (orderedPaneIds.length < 2) return;
    const cur = focusedPaneId ?? orderedPaneIds[0];
    const i = Math.max(0, orderedPaneIds.indexOf(cur));
    const next = orderedPaneIds[(i + dir + orderedPaneIds.length) % orderedPaneIds.length];
    focusPane(next);
  }, [orderedPaneIds, focusedPaneId, focusPane]);

  const toggleZoom = useCallback(() => {
    if (!focusedPaneId) return;
    setZoomedPaneId((z) => (z === focusedPaneId ? null : focusedPaneId));
  }, [focusedPaneId]);

  // ── Keyboard shortcuts ───────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (!ctrl) return;
      const k = e.key.toLowerCase();
      const shift = e.shiftKey;
      const alt = e.altKey;

      if (shift && k === "p") { e.preventDefault(); setOverlay("palette"); }
      else if (!shift && !alt && k === "p") { e.preventDefault(); setOverlay("quickOpen"); }
      else if (!shift && e.key === ",") { e.preventDefault(); setOverlay("settings"); }
      else if (!shift && !alt && k === "b") { e.preventDefault(); setSidebarOpen((v) => !v); }
      else if (!shift && !alt && k === "n") { e.preventDefault(); newWorkspace(); }
      else if (shift && k === "r") { e.preventDefault(); renameWorkspace(); }
      else if (shift && k === "w") { e.preventDefault(); if (workspace) closeWorkspace(workspace.id); }
      else if (!shift && !alt && k === "t") { e.preventDefault(); newSurface(); }
      else if (!shift && !alt && k === "w") { e.preventDefault(); if (surface) closeSurface(surface.id); }
      else if (!shift && !alt && k === "d") { e.preventDefault(); splitPane("vertical"); }
      else if (shift && k === "d") { e.preventDefault(); splitPane("horizontal"); }
      else if (shift && k === "l") { e.preventDefault(); setOverlay("logs"); }
      else if (shift && k === "v") { e.preventDefault(); setOverlay("vault"); }
      else if (shift && k === "s") { e.preventDefault(); setOverlay("snippets"); }
      else if (shift && k === "q") { e.preventDefault(); setOverlay("quota"); }
      else if (alt && k === "h") { e.preventDefault(); setOverlay("history"); }
      else if (shift && k === "a") { e.preventDefault(); setOverlay("agents"); }
      else if (shift && k === "e") { e.preventDefault(); setOverlay("wsSettings"); }
      else if (shift && k === "f") { e.preventDefault(); setSearchOpen(true); }
      else if (shift && k === "z") { e.preventDefault(); toggleZoom(); }
      else if (shift && k === "t") { e.preventDefault(); setOverlay("templates"); }
      else if (alt && k === "b") { e.preventDefault(); setBroadcast((v) => !v); }
      else if (shift && k === "o") { e.preventDefault(); setOverlay("tree"); }
      else if (shift && k === "g") { e.preventDefault(); setOverlay("kg"); }
      else if (shift && k === "j") { e.preventDefault(); setOverlay("agentChat"); }
      else if (alt && (e.key === "ArrowLeft" || e.key === "ArrowUp")) { e.preventDefault(); focusAdjacent(-1); }
      else if (alt && (e.key === "ArrowRight" || e.key === "ArrowDown")) { e.preventDefault(); focusAdjacent(1); }
      else if (!shift && !alt && k === "i") { e.preventDefault(); setOverlay((o) => (o === "notifications" ? null : "notifications")); }
      else if (shift && k === "]") { e.preventDefault(); cycleSurface(1); }
      else if (shift && k === "[") { e.preventDefault(); cycleSurface(-1); }
      else if (e.key === "Tab") { e.preventDefault(); cycleSurface(shift ? -1 : 1); }
      else if (shift && k === "u") {
        e.preventDefault();
        api.getNotifications().then((r) => {
          const latest = r.items.find((n) => !n.isRead);
          if (latest) { setOverlay("notifications"); api.markNotificationRead(latest.id).then(refreshUnread); }
        });
      }
      else if (!shift && !alt && /^[1-9]$/.test(e.key)) {
        e.preventDefault();
        const n = Number(e.key);
        if (n === 9) selectWorkspaceByIndex((state?.workspaces.length ?? 1) - 1);
        else selectWorkspaceByIndex(n - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [newWorkspace, newSurface, splitPane, renameWorkspace, closeWorkspace, closeSurface, cycleSurface, selectWorkspaceByIndex, workspace, surface, state, toggleZoom, focusAdjacent, setBroadcast, refreshUnread]);

  const commands: Command[] = useMemo(() => [
    { id: "ws.new", title: "Workspace: New", hint: "Ctrl+N", run: newWorkspace },
    { id: "ws.rename", title: "Workspace: Rename", hint: "Ctrl+Shift+R", run: renameWorkspace },
    { id: "surface.new", title: "Surface: New", hint: "Ctrl+T", run: newSurface },
    { id: "pane.split.v", title: "Pane: Split Right", hint: "Ctrl+D", run: () => splitPane("vertical") },
    { id: "pane.split.h", title: "Pane: Split Down", hint: "Ctrl+Shift+D", run: () => splitPane("horizontal") },
    { id: "notifications", title: "Notifications", hint: "Ctrl+I", run: () => setOverlay("notifications") },
    { id: "jumpUnread", title: "Jump to Latest Unread", hint: "Ctrl+Shift+U", run: () => setOverlay("notifications") },
    { id: "logs", title: "Command Logs", hint: "Ctrl+Shift+L", run: () => setOverlay("logs") },
    { id: "vault", title: "Session Vault", hint: "Ctrl+Shift+V", run: () => setOverlay("vault") },
    { id: "snippets", title: "Snippets", hint: "Ctrl+Shift+S", run: () => setOverlay("snippets") },
    { id: "quota", title: "Agent Quota", hint: "Ctrl+Shift+Q", run: () => setOverlay("quota") },
    { id: "history", title: "Command History", hint: "Ctrl+Alt+H", run: () => setOverlay("history") },
    { id: "agents", title: "AI Agents", hint: "Ctrl+Shift+A", run: () => setOverlay("agents") },
    { id: "agentChat", title: "Agent Chat", hint: "Ctrl+Shift+J", run: () => setOverlay("agentChat") },
    { id: "agentSettings", title: "Agent Settings", run: () => setOverlay("agentSettings") },
    { id: "search", title: "Search in Terminal", hint: "Ctrl+Shift+F", run: () => setSearchOpen(true) },
    { id: "zoom", title: "Zoom/Unzoom Pane", hint: "Ctrl+Shift+Z", run: toggleZoom },
    { id: "templates", title: "Workspace Templates", hint: "Ctrl+Shift+T", run: () => setOverlay("templates") },
    { id: "tree", title: "Source Tree", hint: "Ctrl+Shift+O", run: () => setOverlay("tree") },
    { id: "kg", title: "Knowledge Graph", hint: "Ctrl+Shift+G", run: () => setOverlay("kg") },
    { id: "broadcast", title: "Toggle Broadcast Input", hint: "Ctrl+Alt+B", run: () => setBroadcast((v) => !v) },
    { id: "trex", title: "T-Rex Runner (game)", run: () => setOverlay("trex") },
    { id: "quickOpen", title: "Quick Open File", hint: "Ctrl+P", run: () => setOverlay("quickOpen") },
    { id: "wsSettings", title: "Workspace Settings (env / SSH)", hint: "Ctrl+Shift+E", run: () => setOverlay("wsSettings") },
    { id: "capture", title: "Capture Transcript (focused pane)", run: () => { if (focusedPaneId) api.capturePane(focusedPaneId); } },
    { id: "settings", title: "Open Settings", hint: "Ctrl+,", run: () => setOverlay("settings") },
    { id: "sidebar", title: "Toggle Sidebar", hint: "Ctrl+B", run: () => setSidebarOpen((v) => !v) },
  ], [newWorkspace, renameWorkspace, newSurface, splitPane, focusedPaneId, toggleZoom]);

  if (!state) return <div className="loading">Loading cmux3...</div>;

  return (
    <div className="app">
      {sidebarOpen && (
        <aside className="sidebar">
          <div className="sidebar-head">
            <span className="brand">cmux3</span>
            <button className="icon-btn" onClick={newWorkspace} title="New workspace (Ctrl+N)">+</button>
          </div>
          <div className="ws-list">
            {state.workspaces.map((w) => (
              <div
                key={w.id}
                className={"ws-item" + (w.id === workspace?.id ? " active" : "")}
                onClick={() => selectWorkspace(w.id)}
              >
                <span className="ws-dot" style={{ background: w.accentColor }} />
                <span className="ws-info">
                  <span className="ws-name">{w.name}</span>
                  {wsStatus[w.id]?.branch && <span className="ws-branch mono">⎇ {wsStatus[w.id]?.branch}</span>}
                </span>
                {(wsStatus[w.id]?.unread ?? 0) > 0 && <span className="badge">{wsStatus[w.id]?.unread}</span>}
                <button
                  className="ws-close"
                  onClick={(e) => { e.stopPropagation(); closeWorkspace(w.id); }}
                  title="Close workspace"
                >×</button>
              </div>
            ))}
          </div>
          <div className="sidebar-foot">
            <button className="side-tool" onClick={() => setOverlay("notifications")} title="Notifications (Ctrl+I)">
              🔔 {unread > 0 && <span className="badge">{unread}</span>}
            </button>
            <button className="side-tool" onClick={() => setOverlay("logs")} title="Command Logs (Ctrl+Shift+L)">📜</button>
            <button className="side-tool" onClick={() => setOverlay("vault")} title="Session Vault (Ctrl+Shift+V)">🗄️</button>
            <button className="side-tool" onClick={() => setOverlay("snippets")} title="Snippets (Ctrl+Shift+S)">✂️</button>
            <button className="side-tool" onClick={() => setOverlay("quota")} title="Agent Quota (Ctrl+Shift+Q)">📊</button>
            <button className="side-tool" onClick={() => setOverlay("agents")} title="AI Agents (Ctrl+Shift+A)">🤖</button>
            <button className="side-tool" onClick={() => setOverlay("wsSettings")} title="Workspace Settings (Ctrl+Shift+E)">🛠️</button>
          </div>
        </aside>
      )}

      <main className="main">
        <div className="tabbar">
          <button className="icon-btn" onClick={() => setSidebarOpen((v) => !v)} title="Toggle sidebar (Ctrl+B)">☰</button>
          <div className="tabs">
            {workspace?.surfaces.map((s) => (
              <div
                key={s.id}
                className={"tab" + (s.id === surface?.id ? " active" : "")}
                onClick={() => selectSurface(s.id)}
                onDoubleClick={async () => {
                  const name = prompt("Rename surface", s.name);
                  if (name && workspace) { await api.renameSurface(workspace.id, s.id, name); await refresh(); }
                }}
              >
                <span>{s.name}</span>
                <button
                  className="tab-close"
                  onClick={(e) => { e.stopPropagation(); closeSurface(s.id); }}
                >×</button>
              </div>
            ))}
            <button className="icon-btn" onClick={newSurface} title="New surface (Ctrl+T)">+</button>
          </div>
          <div className="tabbar-right">
            <button className="icon-btn" onClick={() => setOverlay("notifications")} title="Notifications (Ctrl+I)">
              🔔{unread > 0 && <span className="badge">{unread}</span>}
            </button>
            <button className={"icon-btn" + (broadcast ? " active-toggle" : "")} onClick={() => setBroadcast((v) => !v)} title="Broadcast input (Ctrl+Alt+B)">📢</button>
            <button className="icon-btn" onClick={() => splitPane("vertical")} title="Split right (Ctrl+D)">▯▯</button>
            <button className="icon-btn" onClick={() => splitPane("horizontal")} title="Split down (Ctrl+Shift+D)">▭</button>
            <button className="icon-btn" onClick={() => setOverlay("settings")} title="Settings (Ctrl+,)">⚙</button>
          </div>
        </div>

        <div className="surface-area">
          {searchOpen && <SearchOverlay paneId={focusedPaneId} onClose={() => setSearchOpen(false)} />}
          {surface ? (
            <SplitView
              wsId={workspace!.id}
              sId={surface.id}
              node={
                zoomedPaneId && surface.panes[zoomedPaneId]
                  ? { id: "zoom", isLeaf: true, direction: "vertical", splitRatio: 0.5, paneId: zoomedPaneId }
                  : surface.root
              }
              panes={surface.panes}
              focusedPaneId={surface.focusedPaneId}
              theme={activeTheme}
              fontFamily={fontFamily}
              fontSize={fontSize}
              customColors={customColors}
              onFocus={focusPane}
              onClosePane={closePane}
              onTitle={setPaneTitle}
              onCwd={setPaneCwd}
              onNotify={onTerminalNotify}
              onSetType={setPaneType}
              onRatio={setRatio}
            />
          ) : (
            <div className="empty-surface">
              <p>No surfaces. Create one to get started.</p>
              <button className="primary" onClick={newSurface}>New surface</button>
            </div>
          )}
        </div>
      </main>

      {overlay === "palette" && <CommandPalette commands={commands} onClose={() => setOverlay(null)} />}
      {overlay === "settings" && (
        <SettingsModal themes={themes} onClose={() => setOverlay(null)} onApplied={(s) => setSettings(s)} />
      )}
      {overlay === "notifications" && (
        <NotificationsPanel onClose={() => setOverlay(null)} onChanged={refreshUnread} />
      )}
      {overlay === "logs" && <CommandLogsPanel onClose={() => setOverlay(null)} />}
      {overlay === "vault" && <SessionVaultPanel onClose={() => setOverlay(null)} />}
      {overlay === "snippets" && (
        <SnippetsPanel onClose={() => setOverlay(null)} onInsert={insertIntoFocused} />
      )}
      {overlay === "quota" && <QuotaPanel onClose={() => setOverlay(null)} />}
      {overlay === "history" && (
        <HistoryPicker paneId={focusedPaneId} onClose={() => setOverlay(null)} onPick={insertIntoFocused} />
      )}
      {overlay === "agents" && <AgentsPanel onClose={() => setOverlay(null)} />}
      {overlay === "templates" && <TemplatesPanel onClose={() => setOverlay(null)} workspaceId={workspace?.id} workspaceName={workspace?.name} onApplied={refresh} />}
      {overlay === "tree" && <SourceTreePanel initialPath={focusedCwd} onClose={() => setOverlay(null)} />}
      {overlay === "kg" && <KnowledgeGraphPanel cwd={focusedCwd} onClose={() => setOverlay(null)} />}
      {overlay === "trex" && <TrexRunner onClose={() => setOverlay(null)} />}
      {overlay === "quickOpen" && (
        <QuickOpen root={focusedCwd} onClose={() => setOverlay(null)} onPick={(p) => insertIntoFocused(JSON.stringify(p))} />
      )}
      {overlay === "agentChat" && <AgentChatPanel paneId={focusedPaneId} onClose={() => setOverlay(null)} />}
      {overlay === "agentSettings" && <AgentSettingsPanel onClose={() => setOverlay(null)} />}
      {overlay === "wsSettings" && workspace && (
        <WorkspaceSettingsPanel workspace={workspace} onClose={() => setOverlay(null)} />
      )}
    </div>
  );
}

























