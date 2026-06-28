import { useEffect, useRef, useState } from "react";
import { api, type Notification } from "../lib/api";

interface Props {
  onClose: () => void;
  onChanged?: () => void;
}

export function NotificationsPanel({ onClose, onChanged }: Props) {
  const [items, setItems] = useState<Notification[]>([]);

  const load = () => api.getNotifications().then((r) => setItems(r.items));
  useEffect(() => { load(); }, []);

  const markRead = async (id: string) => { await api.markNotificationRead(id); await load(); onChanged?.(); };
  const markAll = async () => { await api.markAllNotificationsRead(); await load(); onChanged?.(); };
  const clear = async () => { await api.clearNotifications(); await load(); onChanged?.(); };

  return (
    <div className="cmux-popup-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cmux-popup-panel" onMouseDown={(e) => e.stopPropagation()} style={{ maxWidth: 500, maxHeight: 480 }}>
      <div className="cmux-panel-toolbar">
        <div className="cmux-panel-toolbar-row">
          <span className="cmux-panel-title">NOTIFICATIONS</span>
          <span className="cmux-spacer" />
          <button className="cmux-btn" onClick={markAll}>Mark all read</button>
          <button className="cmux-btn" onClick={clear}>Clear</button>
          <button className="cmux-icon-btn" onClick={onClose}>×</button>
        </div>
      </div>
      <div className="cmux-panel-body" style={{ maxHeight: 400, overflow: "auto" }}>
        {items.length === 0 && <div className="cmux-empty">No notifications</div>}
        {items.map((n) => (
          <div
            key={n.id}
            className={"cmux-notif-row" + (n.isRead ? "" : " unread")}
            onClick={() => markRead(n.id)}
          >
            <div className="cmux-notif-title">{n.title}</div>
            {n.subtitle && <div className="cmux-notif-sub">{n.subtitle}</div>}
            <div className="cmux-notif-body">{n.body}</div>
            <div className="cmux-notif-time dim">{new Date(n.timestamp).toLocaleString()}</div>
          </div>
        ))}
      </div>
      </div>
    </div>
  );
}
