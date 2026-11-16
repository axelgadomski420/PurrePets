import { useEffect, useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { cn } from "@/lib/utils";

/**
 * NotificationBell — dzwonek z licznikiem nieprzeczytanych, lista powiadomień
 * (polubienia, komentarze, relacje, wiadomości, moderacja) i oznaczaniem jako przeczytane.
 */
export default function NotificationBell({ onNavigate }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);

  const load = () => {
    base44.notifications
      .list()
      .then((r) => {
        setItems(r?.items ?? []);
        setUnread(r?.unread ?? 0);
      })
      .catch(() => null);
  };

  useEffect(() => {
    load();
    const timer = setInterval(load, 20000);
    return () => clearInterval(timer);
  }, []);

  const markAll = async () => {
    await base44.notifications.markAllRead().catch(() => null);
    load();
  };

  const openItem = async (n) => {
    base44.notifications.markRead(n.id).catch(() => null);
    setOpen(false);
    load();
    if (n.link && onNavigate) onNavigate(n.link);
    else if (n.link) window.location.href = n.link;
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative grid h-10 w-10 place-items-center rounded-full border border-border/60"
        aria-label="Powiadomienia"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-aura px-1 text-[9px] font-bold text-black">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-2xl border border-border/70 bg-card shadow-2xl">
          <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wider">Powiadomienia</p>
            <button type="button" onClick={markAll} className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground">
              <CheckCheck className="h-3 w-3" /> Odczytaj wszystkie
            </button>
          </div>
          <ul className="max-h-80 overflow-y-auto">
            {items.length === 0 && (
              <li className="px-4 py-6 text-center text-xs text-muted-foreground">Brak powiadomień.</li>
            )}
            {items.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => openItem(n)}
                  className={cn(
                    "w-full border-b border-border/40 px-3 py-2.5 text-left hover:bg-secondary/40",
                    !n.read && "bg-aura/10"
                  )}
                >
                  <p className="text-xs font-semibold">{n.title}</p>
                  {n.body && <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{n.body}</p>}
                  <p className="mt-0.5 text-[9px] text-muted-foreground">
                    {new Date(n.created_date).toLocaleString("pl-PL")}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
