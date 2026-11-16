import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Bell, CheckCheck } from "lucide-react";
import { io } from "socket.io-client";
import { base44 } from "@/api/base44Client";
import { cn } from "@/lib/utils";

const TOKEN_KEY = "purre_access_token";
const meOf = () => {
  try {
    return JSON.parse(localStorage.getItem("purre:user") || "null");
  } catch {
    return null;
  }
};

const TYPE_ICON = { like: "❤️", comment: "💬", follow: "👤", message: "✉️", system: "🏆", verification: "🛡️", group: "👥", moderation: "⚠️" };

/**
 * NotificationBell — dzwonek w TopBar: licznik nieprzeczytanych, lista,
 * realtime przez Socket.IO (notification:new), oznaczanie jako przeczytane.
 */
export default function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const boxRef = useRef(null);

  const load = useCallback(() => {
    base44.notifications
      .list()
      .then((res) => {
        setItems(res?.items ?? []);
        setUnread(res?.unread ?? 0);
      })
      .catch(() => null);
  }, []);

  useEffect(() => {
    load();
    let token = null;
    try {
      token = localStorage.getItem(TOKEN_KEY);
    } catch { /* Powiadomienia pozostają niedostępne bez tokenu. */ }
    if (!token) return undefined;
    const socket = io(base44.socketUrl ?? window.location.origin, {
      path: "/socket.io",
      auth: { token },
      transports: ["websocket", "polling"],
    });
    socket.on("connect", () => {
      const me = meOf();
      const myId = me?.id ?? me?.user_id;
      if (myId) socket.emit("subscribe", { room: `user:${myId}` });
    });
    socket.on("notification:new", () => load());
    socket.on("notification:read-all", () => load());
    return () => socket.disconnect();
  }, [load]);

  useEffect(() => {
    if (!open) return undefined;
    const onClick = (event) => {
      if (boxRef.current && !boxRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const openItem = async (item) => {
    setOpen(false);
    if (!item.read) {
      setUnread((u) => Math.max(0, u - 1));
      setItems((list) => list.map((n) => (n.id === item.id ? { ...n, read: true } : n)));
      base44.notifications.markRead(item.id).catch(() => null);
    }
    if (item.link) navigate({ to: item.link });
  };

  const markAll = () => {
    setUnread(0);
    setItems((list) => list.map((n) => ({ ...n, read: true })));
    base44.notifications.markAllRead().catch(() => null);
  };

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          if (!open) load();
        }}
        className="relative grid h-10 w-10 place-items-center rounded-xl border border-border/70 bg-card/60 text-muted-foreground transition hover:text-foreground"
        aria-label="Powiadomienia"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-aura px-1 text-[9px] font-bold text-black">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-2xl border border-border/70 bg-popover shadow-2xl">
          <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Powiadomienia</p>
            {unread > 0 && (
              <button type="button" onClick={markAll} className="flex items-center gap-1 text-[10px] text-aura hover:underline">
                <CheckCheck className="h-3 w-3" /> Oznacz wszystkie
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">Brak powiadomień — wszystko przeczytane.</p>
            ) : (
              items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openItem(item)}
                  className={cn(
                    "flex w-full items-start gap-2 border-b border-border/40 px-3 py-2.5 text-left transition hover:bg-secondary/40",
                    !item.read && "bg-aura/5"
                  )}
                >
                  <span className="mt-0.5 text-base">{TYPE_ICON[item.type] ?? "🔔"}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold">{item.title}</span>
                    {item.body && <span className="mt-0.5 block line-clamp-2 text-[11px] text-muted-foreground">{item.body}</span>}
                    <span className="mt-0.5 block text-[9px] text-muted-foreground">
                      {new Date(item.created_date).toLocaleString("pl-PL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </span>
                  {!item.read && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-aura" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
