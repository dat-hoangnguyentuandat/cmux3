import { useRef } from "react";
import type { Pane, SplitNode, TerminalTheme } from "../lib/api";
import { TerminalPane } from "./TerminalPane";
import { WebPane } from "./WebPane";
import { NotepadPane } from "./NotepadPane";

interface Props {
  wsId: string;
  sId: string;
  node: SplitNode;
  panes: Record<string, Pane>;
  focusedPaneId?: string;
  theme?: TerminalTheme;
  fontFamily: string;
  fontSize: number;
  settings?: any;
  customColors?: { background?: string; foreground?: string; cursor?: string; selection?: string };
  onFocus: (paneId: string) => void;
  onClosePane: (paneId: string) => void;
  onTitle: (paneId: string, title: string) => void;
  onCwd: (paneId: string, cwd: string) => void;
  onBell?: (paneId: string) => void;
  onNotify?: () => void;
  onSearchRequest?: () => void;
  onSplitRight?: () => void;
  onSplitDown?: () => void;
  onZoom?: () => void;
  onCapture?: (paneId: string) => void;
  onSetType: (paneId: string, type: string) => void;
  onRatio: (nodeId: string, ratio: number) => void;
}

function PaneBody(props: Props, pane: Pane) {
  if (pane.type === "web") return <WebPane wsId={props.wsId} sId={props.sId} paneId={pane.id} url={pane.url} />;
  if (pane.type === "notepad") return <NotepadPane wsId={props.wsId} sId={props.sId} paneId={pane.id} notes={pane.notes} />;
  return (
    <TerminalPane
      paneId={pane.id}
      cwd={pane.workingDirectory}
      focused={props.focusedPaneId === pane.id}
      theme={props.theme}
      fontFamily={props.fontFamily}
      fontSize={props.fontSize}
      settings={props.settings}
      customColors={props.customColors}
      onFocusRequest={() => props.onFocus(pane.id)}
      onTitle={(t) => props.onTitle(pane.id, t)}
      onCwd={(c) => props.onCwd(pane.id, c)}
      onBell={() => props.onBell?.(pane.id)}
      onNotify={() => props.onNotify?.()}
      onSearchRequest={() => props.onSearchRequest?.()}
      onSplitRight={() => props.onSplitRight?.()}
      onSplitDown={() => props.onSplitDown?.()}
      onZoom={() => props.onZoom?.()}
      onClosePane={() => props.onClosePane(pane.id)}
      onCapture={() => props.onCapture?.(pane.id)}
    />
  );
}

export function SplitView(props: Props) {
  const { node } = props;
  const containerRef = useRef<HTMLDivElement>(null);

  if (node.isLeaf) {
    const pane = node.paneId ? props.panes[node.paneId] : undefined;
    if (!pane) return <div className="pane-empty" />;
    return (
      <div className="leaf-wrap">
        <div className="pane-header">
          <span className="pane-title">{pane.title || pane.workingDirectory || pane.type}</span>
          <div className="pane-tools">
            <button className="pane-close" onClick={() => props.onClosePane(pane.id)} title="Close pane">×</button>
          </div>
        </div>
        <div className={"leaf-body" + (pane.type === "terminal" ? " terminal-leaf-body" : "")}>{PaneBody(props, pane)}</div>
      </div>
    );
  }

  const horizontal = node.direction === "horizontal"; // stacked top/bottom
  const ratio = node.splitRatio;

  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    const rect = containerRef.current!.getBoundingClientRect();
    const move = (me: MouseEvent) => {
      let r = horizontal
        ? (me.clientY - rect.top) / rect.height
        : (me.clientX - rect.left) / rect.width;
      r = Math.max(0.1, Math.min(0.9, r));
      props.onRatio(node.id, r);
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  return (
    <div
      ref={containerRef}
      className="split"
      style={{ flexDirection: horizontal ? "column" : "row" }}
    >
      <div style={{ flexBasis: `${ratio * 100}%`, flexGrow: 0, flexShrink: 0, overflow: "hidden" }}>
        <SplitView {...props} node={node.first!} />
      </div>
      <div
        className={"divider " + (horizontal ? "horizontal" : "vertical")}
        onMouseDown={startDrag}
      />
      <div style={{ flexBasis: `${(1 - ratio) * 100}%`, flexGrow: 0, flexShrink: 0, overflow: "hidden" }}>
        <SplitView {...props} node={node.second!} />
      </div>
    </div>
  );
}

