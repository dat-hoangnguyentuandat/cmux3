// Lightweight registry mapping paneId -> handlers that drive the live
// xterm instance for that pane (input injection + in-terminal search).
// Used to inject snippets/history commands, run the search overlay, and
// fan out keystrokes when broadcast-input mode is enabled.
export interface TerminalHandle {
  write: (text: string) => void;
  search: (term: string, opts?: { back?: boolean }) => void;
  clearSearch: () => void;
}

const handles = new Map<string, TerminalHandle>();
let broadcast = false;

export const terminalBus = {
  register(paneId: string, handle: TerminalHandle) {
    handles.set(paneId, handle);
    return () => { if (handles.get(paneId) === handle) handles.delete(paneId); };
  },
  write(paneId: string | undefined, text: string) {
    if (!paneId) return;
    handles.get(paneId)?.write(text);
  },
  search(paneId: string | undefined, term: string, opts?: { back?: boolean }) {
    if (!paneId) return;
    handles.get(paneId)?.search(term, opts);
  },
  clearSearch(paneId: string | undefined) {
    if (!paneId) return;
    handles.get(paneId)?.clearSearch();
  },
  setBroadcast(on: boolean) { broadcast = on; },
  isBroadcast() { return broadcast; },
  // Fan out keystrokes from the origin pane to all other live panes.
  broadcastFrom(originPaneId: string, text: string) {
    if (!broadcast) return;
    for (const [id, handle] of handles)
      if (id !== originPaneId) handle.write(text);
  },
};
