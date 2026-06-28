import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { SearchAddon } from "@xterm/addon-search";
import "@xterm/xterm/css/xterm.css";
import type { TerminalTheme } from "../lib/api";
import { terminalBus } from "../lib/terminalBus";

function WritePopup({ onSend, onClose }: { onSend: (text: string) => void; onClose: () => void }) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const send = () => {
    if (!text) return;
    onSend(text);
    onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="write-popup-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="write-popup" onMouseDown={(e) => e.stopPropagation()}>
        <div className="write-popup-row">
          <textarea
            ref={inputRef}
            className="write-popup-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Type here, Enter to send…"
            rows={1}
          />
          <button className="write-popup-send" onClick={send} disabled={!text} title="Send">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M1 8L15 1L8 15L6 9L1 8Z" fill="currentColor" stroke="currentColor" strokeWidth="1" strokeLinejoin="round"/>
              <path d="M8 15L6 9L15 1" stroke="white" strokeWidth="0.5" fill="none"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

interface Props {
  paneId: string;
  cwd?: string;
  focused: boolean;
  theme?: TerminalTheme;
  fontFamily: string;
  fontSize: number;
  settings?: any;
  onFocusRequest: () => void;
  onTitle?: (title: string) => void;
  onCwd?: (cwd: string) => void;
  onBell?: () => void;
  onNotify?: () => void;
  onSearchRequest?: () => void;
  onSplitRight?: () => void;
  onSplitDown?: () => void;
  onZoom?: () => void;
  onClosePane?: () => void;
  onCapture?: () => void;
  customColors?: { background?: string; foreground?: string; cursor?: string; selection?: string };
}

type CustomColors = { background?: string; foreground?: string; cursor?: string; selection?: string };

function toCssColor(c?: string) {
  if (!c) return undefined;
  return c.length === 9 ? "#" + c.slice(3) : c;
}

function toXtermTheme(t?: TerminalTheme, custom?: CustomColors) {
  if (!t) return undefined;
  const p = t.palette;
  const pick = (val: string | undefined, fallback: string) =>
    val && val.trim() ? toCssColor(val) : toCssColor(fallback);
  return {
    background: pick(custom?.background, t.background),
    foreground: pick(custom?.foreground, t.foreground),
    cursor: pick(custom?.cursor, t.cursor),
    selectionBackground: pick(custom?.selection, t.selection),
    black: toCssColor(p[0]), red: toCssColor(p[1]), green: toCssColor(p[2]), yellow: toCssColor(p[3]),
    blue: toCssColor(p[4]), magenta: toCssColor(p[5]), cyan: toCssColor(p[6]), white: toCssColor(p[7]),
    brightBlack: toCssColor(p[8]), brightRed: toCssColor(p[9]), brightGreen: toCssColor(p[10]), brightYellow: toCssColor(p[11]),
    brightBlue: toCssColor(p[12]), brightMagenta: toCssColor(p[13]), brightCyan: toCssColor(p[14]), brightWhite: toCssColor(p[15]),
  };
}

export function TerminalPane(props: Props) {
  const { paneId, cwd, focused, theme, fontFamily, fontSize, customColors } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [menuFlipY, setMenuFlipY] = useState(false);
  const [menuFlipX, setMenuFlipX] = useState(false);
  const [measured, setMeasured] = useState(false);
  const [writeOpen, setWriteOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<number>(0);

  const writeInput = (text: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const enc = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
    ws.send("i" + enc(text));
  };

  const copySelection = async () => {
    const selected = termRef.current?.getSelection();
    if (selected) await navigator.clipboard.writeText(selected).catch(() => {});
    termRef.current?.clearSelection();
  };

  const pasteClipboard = async () => {
    const text = await navigator.clipboard.readText().catch(() => "");
    if (text) writeInput(text);
  };

  const clearTerminal = () => {
    termRef.current?.clear();
    writeInput("\x0c");
  };

  useEffect(() => {
    const term = new Terminal({
      fontFamily: `${fontFamily}, "Cascadia Code", Consolas, monospace`,
      fontSize,
      cursorBlink: true,
      allowProposedApi: true,
      theme: toXtermTheme(theme, customColors),
    });
    const fit = new FitAddon();
    const search = new SearchAddon();
    term.loadAddon(fit);
    term.loadAddon(search);
    term.loadAddon(new WebLinksAddon());
    term.open(containerRef.current!);
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;

    const proto = location.protocol === "https:" ? "wss" : "ws";
    const params = new URLSearchParams({ cols: String(term.cols), rows: String(term.rows) });
    if (cwd) params.set("cwd", cwd);
    const ws = new WebSocket(`${proto}://${location.host}/ws/terminal/${paneId}?${params}`);
    wsRef.current = ws;

    const enc = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
    const dec = (b64: string) => {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return bytes;
    };

    ws.onmessage = (e) => {
      const msg = typeof e.data === "string" ? e.data : "";
      if (!msg) return;
      const kind = msg[0];
      const body = msg.slice(1);
      if (kind === "o") {
        term.write(dec(body));
      } else if (kind === "e") {
        try {
          const ev = JSON.parse(body);
          if (ev.type === "title" && ev.data) props.onTitle?.(ev.data);
          if (ev.type === "cwd" && ev.data) props.onCwd?.(ev.data);
          if (ev.type === "bell") { term.write("\x07"); props.onBell?.(); }
          if (ev.type === "notify") props.onNotify?.();
        } catch { /* ignore */ }
      }
    };

    const sendTerminalInput = (text: string) => {
      if (!text) return;
      if (ws.readyState === WebSocket.OPEN) ws.send("i" + enc(text));
      terminalBus.broadcastFrom(paneId, text);
    };

    // Forward every xterm `onData` chunk straight to the server. xterm.js
    // owns the hidden textarea and already binds keypress + IME composition
    // (Windows TSF on Edge/Chrome will commit precomposed Vietnamese runes
    // to the hidden textarea; xterm surfaces them as onData strings).
    // We deliberately do NOT add our own textarea or composition listeners:
    // doing so double-sent every keystroke (the original "duplicate" bug
    // when typing into codex). We also do NOT run a JS-side Telex/VNI
    // composer — raw keystroke interception fights the OS IME and produces
    // the wrong bytes for xterm's composition surface. The OS TSF IME
    // already emits the right "\b<composed>" sequence, and the server's
    // ConPTY forwards it verbatim. This matches the cmux2 (WPF) behavior
    // of trusting the host's text input.
    term.onData((data) => { sendTerminalInput(data); });

    const unregister = terminalBus.register(paneId, {
      write: (text) => { if (ws.readyState === WebSocket.OPEN) ws.send("i" + enc(text)); },
      search: (term2, opts) => { if (opts?.back) search.findPrevious(term2); else search.findNext(term2); },
      clearSearch: () => search.clearDecorations(),
    });

    const sendResize = () => {
      if (ws.readyState === WebSocket.OPEN) ws.send(`r${term.cols},${term.rows}`);
    };
    term.onResize(sendResize);
    ws.onopen = sendResize;

    const ro = new ResizeObserver(() => {
      try { fit.fit(); } catch { /* not visible */ }
    });
    ro.observe(containerRef.current!);

    const onClick = () => props.onFocusRequest();
    containerRef.current!.addEventListener("mousedown", onClick);
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      props.onFocusRequest();
      setMeasured(false);
      setMenu({ x: e.clientX, y: e.clientY });
    };
    containerRef.current!.addEventListener("contextmenu", onContextMenu);

    return () => {
      unregister();
      ro.disconnect();
      containerRef.current?.removeEventListener("mousedown", onClick);
      containerRef.current?.removeEventListener("contextmenu", onContextMenu);
      ws.close();
      term.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paneId]);

  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.theme = toXtermTheme(theme, customColors);
      termRef.current.options.fontFamily = `${fontFamily}, "Cascadia Code", Consolas, monospace`;
      termRef.current.options.fontSize = fontSize;
      try { fitRef.current?.fit(); } catch { /* */ }
    }
  }, [theme, fontFamily, fontSize, customColors]);

  useEffect(() => {
    if (focused) {
      termRef.current?.focus();
      try { fitRef.current?.fit(); } catch { /* */ }
    }
  }, [focused]);

  useEffect(() => {
    if (!menu) return;
    // Reset inline styles before measuring so a previous open (e.g. taller
    // pinned-to-top layout) doesn't leak into the next paint.
    const el0 = menuRef.current;
    if (el0) {
      el0.style.maxHeight = "";
      el0.style.overflowY = "";
      el0.style.top = `${menu.y}px`;
      el0.style.bottom = "";
      el0.style.left = `${menu.x}px`;
      el0.style.right = "";
      el0.style.visibility = "";
      el0.style.transform = "";
    }
    // Two RAFs: first paint with default position so the browser can compute
    // a real layout, then measure and reposition.
    const raf1 = window.requestAnimationFrame(() => {
      const raf2 = window.requestAnimationFrame(() => {
        const el = menuRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const margin = 8;
        const vh = window.innerHeight;
        const vw = window.innerWidth;
        const cursorX = menu.x;
        const cursorY = menu.y;
        const menuH = rect.height;
        const menuW = rect.width;
        const spaceAbove = cursorY - margin;
        const spaceBelow = vh - cursorY - margin;
        // Position by anchoring the menu so it stays within the viewport.
        // Strategy: keep the menu entirely above the cursor's row whenever
        // there's enough space above; otherwise pin it just below the cursor.
        let top: number;
        let maxHeight: number | undefined;
        let overflowY: string | undefined;
        if (menuH <= spaceAbove) {
          // Comfortably fits above.
          top = cursorY - menuH - margin;
        } else if (menuH <= spaceBelow) {
          // Doesn't fit above but fits below — drop down.
          top = cursorY + margin;
        } else {
          // Doesn't fit either side — pick the side with more room and scroll.
          if (spaceAbove >= spaceBelow) {
            top = margin;
            maxHeight = Math.max(80, spaceAbove);
          } else {
            top = cursorY + margin;
            maxHeight = Math.max(80, spaceBelow);
          }
          overflowY = "auto";
        }
        let left: number;
        if (cursorX + menuW <= vw - margin) {
          left = cursorX;
        } else if (cursorX - menuW >= margin) {
          left = cursorX - menuW;
        } else {
          left = Math.max(margin, Math.min(cursorX, vw - menuW - margin));
        }
        el.style.top = `${top}px`;
        el.style.left = `${left}px`;
        el.style.right = "";
        el.style.bottom = "";
        el.style.transform = "";
        if (maxHeight != null) el.style.maxHeight = `${maxHeight}px`;
        else el.style.maxHeight = "";
        if (overflowY) el.style.overflowY = overflowY;
        else el.style.overflowY = "";
        setMeasured(true);
      });
      cancelRef.current = raf2;
    });
    cancelRef.current = raf1;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.cancelAnimationFrame(cancelRef.current);
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  const chooseFile = () => {
    fileInputRef.current?.click();
  };

  const onFileChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Paste the full file path into the terminal.
    // On modern browsers we don't get the real filesystem path for
    // security reasons — use file.name as a fallback.
    const path = (file as any).path || file.name;
    writeInput(path + " ");
    // Reset so the same file can be re-chosen.
    e.target.value = "";
  };

  const runMenuAction = (action: () => void | Promise<void>) => {
    setMenu(null);
    void action();
  };

  return (
    <>
      <div
        ref={containerRef}
        className={"term-pane" + (focused ? " focused" : "")}
        style={{
          width: "100%",
          height: "100%",
          background: toCssColor(customColors?.background || theme?.background),
        }}
      />
      {menu && (
        <div
          ref={menuRef}
          className="terminal-context-menu"
          style={{
            left: menu.x,
            top: menu.y,
            visibility: measured ? "visible" : "hidden",
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button onClick={() => runMenuAction(copySelection)}>Copy<span>Ctrl+C</span></button>
          <button onClick={() => runMenuAction(pasteClipboard)}>Paste<span>Ctrl+V</span></button>
          <button onClick={() => runMenuAction(() => termRef.current?.selectAll())}>Select All</button>
          <button onClick={() => runMenuAction(chooseFile)}>Choose File</button>
          <button onClick={() => runMenuAction(() => setWriteOpen(true))}>Write…</button>
          <div className="terminal-context-sep" />
          <button onClick={() => runMenuAction(() => props.onSplitRight?.())}>Split Right<span>Ctrl+D</span></button>
          <button onClick={() => runMenuAction(() => props.onSplitDown?.())}>Split Down<span>Ctrl+Shift+D</span></button>
          <button onClick={() => runMenuAction(() => props.onZoom?.())}>Zoom Pane<span>Ctrl+Shift+Z</span></button>
          <button className="danger" onClick={() => runMenuAction(() => props.onClosePane?.())}>Close Pane</button>
          <div className="terminal-context-sep" />
          <button onClick={() => runMenuAction(() => props.onCapture?.())}>Capture Transcript</button>
          <button onClick={() => runMenuAction(clearTerminal)}>Clear Terminal</button>
          <button onClick={() => runMenuAction(() => props.onSearchRequest?.())}>Search<span>Ctrl+Shift+F</span></button>
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        style={{ display: "none" }}
        onChange={onFileChosen}
      />
      {writeOpen && (
        <WritePopup
          onSend={(text) => writeInput(text)}
          onClose={() => setWriteOpen(false)}
        />
      )}
    </>
  );
}




