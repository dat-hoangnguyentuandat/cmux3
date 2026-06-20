import { useEffect, useState } from "react";
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
    <div className="overlay" onMouseDown={onClose}>
      <div className="panel right" onMouseDown={(e) => e.stopPropagation()}>
        <div className="panel-head">
          <h2>Notifications</h2>
          <div className="panel-head-actions">
            <button onClick={markAll}>Mark all read</button>
            <button onClick={clear}>Clear</button>
            <button className="icon-btn" onClick={onClose}>×</button>
          </div>
        </div>
        <div className="panel-body">
          {items.length === 0 && <div className="empty">No notifications</div>}
          {items.map((n) => (
            <div
              key={n.id}
              className={"notif" + (n.isRead ? "" : " unread")}
              onClick={() => markRead(n.id)}
            >
              <div className="notif-title">{n.title}</div>
              {n.subtitle && <div className="notif-sub">{n.subtitle}</div>}
              <div className="notif-body">{n.body}</div>
              <div className="notif-time">{new Date(n.timestamp).toLocaleString()}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
