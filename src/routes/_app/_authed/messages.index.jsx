import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { MessageCircle, Plus, Search } from "lucide-react";
import TopBar from "@/components/layout/TopBar";
import NewChatDialog from "@/components/messaging/NewChatDialog";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useI18n } from "@/lib/i18n";
import { timeAgo } from "@/lib/format";

export const Route = createFileRoute("/_app/_authed/messages/")({
  head: () => ({ meta: [{ title: "PURRE PETS — PURRE Messenger" }] }),
  component: MessagesPage,
});

function MessagesPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [composerOpen, setComposerOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    base44.entities.Conversation.filter({ members: user.id }, { sort: "-last_message_at", limit: 50 })
      .then((page) => {
        if (active) setItems(page.items ?? []);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user?.id]);

  // H: lokalny filtr listy rozmów (nazwa, ogłoszenie, ostatnia wiadomość).
  const needle = query.trim().toLowerCase();
  const visible = needle
    ? items.filter((conversation) => {
        const names = (conversation.member_names ?? []).join(" ").toLowerCase();
        return (
          names.includes(needle) ||
          (conversation.listing_title ?? "").toLowerCase().includes(needle) ||
          (conversation.last_message ?? "").toLowerCase().includes(needle)
        );
      })
    : items;

  return (
    <div>
      <TopBar />
      <div className="px-4 pb-12 pt-6 lg:px-8">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-3xl">
              <span className="aura-text">{t("messages.title")}</span>
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("messages.subtitle")}</p>
          </div>
          <button
            type="button"
            onClick={() => setComposerOpen(true)}
            className="btn-aura flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.16em]"
          >
            <Plus className="h-3.5 w-3.5" /> Nowa
          </button>
        </div>

        <NewChatDialog open={composerOpen} onClose={() => setComposerOpen(false)} />

        {items.length > 0 && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-border/70 bg-card/60 px-3 py-2">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Szukaj w rozmowach…"
              className="h-8 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
            />
          </div>
        )}

        {loading ? (
          <div className="mt-6 space-y-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-16 animate-pulse rounded-2xl bg-secondary/40" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="mt-10 rounded-[var(--radius)] border border-dashed border-border/70 p-10 text-center">
            <MessageCircle className="mx-auto h-6 w-6 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">
              {needle ? "Brak rozmów pasujących do frazy." : t("messages.noThreads")}
            </p>
          </div>
        ) : (
          <ul className="mt-6 space-y-2">
            {visible.map((conversation) => {
              const otherIndex = (conversation.members ?? []).findIndex((member) => member !== user.id);
              const otherName =
                conversation.member_names?.[otherIndex === -1 ? 0 : otherIndex] || "Rozmowa";
              return (
                <li key={conversation.id}>
                  <Link
                    to="/messages/$id"
                    params={{ id: conversation.id }}
                    className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card/60 p-3 transition hover:border-foreground/20"
                  >
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-violet to-aura text-xs font-bold text-background">
                      {otherName.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold">{otherName}</span>
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {timeAgo(conversation.last_message_at)}
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                        {conversation.listing_title && (
                          <span className="text-aura">#{conversation.listing_title} · </span>
                        )}
                        {conversation.last_message || t("messages.startChat")}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
