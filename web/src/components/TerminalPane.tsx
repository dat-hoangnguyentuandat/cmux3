import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { SearchAddon } from "@xterm/addon-search";
import "@xterm/xterm/css/xterm.css";
import type { TerminalTheme } from "../lib/api";
import { terminalBus } from "../lib/terminalBus";

interface Props {
  paneId: string;
  cwd?: string;
  focused: boolean;
  theme?: TerminalTheme;
  fontFamily: string;
  fontSize: number;
  onFocusRequest: () => void;
  onTitle?: (title: string) => void;
  onCwd?: (cwd: string) => void;
  onBell?: () => void;
  onNotify?: () => void;
  customColors?: { background?: string; foreground?: string; cursor?: string; selection?: string };
}

type CustomColors = { background?: string; foreground?: string; cursor?: string; selection?: string };

function toXtermTheme(t?: TerminalTheme, custom?: CustomColors) {
  if (!t) return undefined;
  const p = t.palette;
  const strip = (c: string) => (c.length === 9 ? "#" + c.slice(3) : c); // #AARRGGBB -> #RRGGBB
  const pick = (val: string | undefined, fallback: string) =>
    val && val.trim() ? strip(val) : strip(fallback);
  return {
    background: pick(custom?.background, t.background),
    foreground: pick(custom?.foreground, t.foreground),
    cursor: pick(custom?.cursor, t.cursor),
    selectionBackground: pick(custom?.selection, t.selection),
    black: strip(p[0]), red: strip(p[1]), green: strip(p[2]), yellow: strip(p[3]),
    blue: strip(p[4]), magenta: strip(p[5]), cyan: strip(p[6]), white: strip(p[7]),
    brightBlack: strip(p[8]), brightRed: strip(p[9]), brightGreen: strip(p[10]), brightYellow: strip(p[11]),
    brightBlue: strip(p[12]), brightMagenta: strip(p[13]), brightCyan: strip(p[14]), brightWhite: strip(p[15]),
  };
}

export function TerminalPane(props: Props) {
  const { paneId, cwd, focused, theme, fontFamily, fontSize, customColors } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

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

    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) ws.send("i" + enc(data));
      terminalBus.broadcastFrom(paneId, data);
    });

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

    return () => {
      unregister();
      ro.disconnect();
      containerRef.current?.removeEventListener("mousedown", onClick);
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

  return (
    <div
      ref={containerRef}
      className={"term-pane" + (focused ? " focused" : "")}
      style={{ width: "100%", height: "100%" }}
    />
  );
}




