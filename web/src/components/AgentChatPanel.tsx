import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { renderMarkdown } from "../lib/markdown";

interface Msg { id: string; role: string; content: string; }

interface Props {
  paneId?: string;
  onClose: () => void;
}

export function AgentChatPanel({ paneId, onClose }: Props) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const threadRef = useRef<string | undefined>(undefined);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws/agent`);
    ws.onmessage = (e) => {
      try {
        const u = JSON.parse(e.data);
        if (paneId && u.paneId && u.paneId !== paneId) return;
        if (u.type === "ThreadChanged") threadRef.current = u.threadId;
        else if (u.type === "UserMessage") {
          setMessages((m) => [...m, { id: u.messageId || crypto.randomUUID(), role: "user", content: u.message }]);
        } else if (u.type === "AssistantDelta") {
          setBusy(true);
          setMessages((m) => {
            const last = m[m.length - 1];
            if (last && last.role === "assistant" && last.id === u.messageId)
              return [...m.slice(0, -1), { ...last, content: last.content + u.message }];
            return [...m, { id: u.messageId || crypto.randomUUID(), role: "assistant", content: u.message }];
          });
        } else if (u.type === "AssistantCompleted") {
          setBusy(false);
          setMessages((m) => {
            const last = m[m.length - 1];
            if (last && last.role === "assistant" && u.message)
              return [...m.slice(0, -1), { ...last, content: u.message }];
            return m;
          });
        } else if (u.type === "Status") setStatus(u.message);
        else if (u.type === "Error") { setBusy(false); setStatus("Error: " + u.message); }
      } catch { /* ignore */ }
    };
    return () => ws.close();
  }, [paneId]);

  useEffect(() => { bodyRef.current?.scrollTo(0, bodyRef.current.scrollHeight); }, [messages]);

  const send = async () => {
    const prompt = input.trim();
    if (!prompt || !paneId) return;
    setInput("");
    const r = await api.sendAgentPrompt(paneId, prompt, threadRef.current);
    if (!r.ok) setStatus(r.error || "Failed to send");
    else if (r.threadId) threadRef.current = r.threadId;
  };

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="panel right" onMouseDown={(e) => e.stopPropagation()}>
        <div className="panel-head">
          <h2>Agent Chat</h2>
          <button className="icon-btn" onClick={onClose}>×</button>
        </div>
        <div className="panel-body" ref={bodyRef}>
          {!paneId && <div className="empty">Focus a pane to chat</div>}
          {messages.length === 0 && paneId && <div className="empty dim">Ask the agent anything. Configure it in Settings → Agent.</div>}
          {messages.map((m) => (
            <div key={m.id} className={"chat-msg " + m.role}>
              <div className="chat-role dim">{m.role}</div>
              <div className="agent-content md" dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }} />
            </div>
          ))}
          {busy && <div className="dim">…thinking</div>}
        </div>
        {status && <div className="chat-status dim">{status}</div>}
        <div className="chat-input">
          <textarea
            placeholder="Message the agent (Enter to send, Shift+Enter for newline)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          />
          <button className="primary" onClick={send} disabled={!paneId}>Send</button>
        </div>
      </div>
    </div>
  );
}
