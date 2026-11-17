import { useEffect, useState } from "react";
import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useI18n } from "@/lib/i18n";
import ChatWindow from "@/components/messaging/ChatWindow";

export const Route = createFileRoute("/_app/_authed/messages/$id")({
  head: () => ({ meta: [{ title: "PURRE PETS — rozmowa" }] }),
  component: ThreadPage,
});

function ThreadPage() {
  const { id } = useParams({ from: "/_app/_authed/messages/$id" });
  const navigate = useNavigate();
  const { t } = useI18n();
  const { user } = useAuth();
  const [conversation, setConversation] = useState(null);

  useEffect(() => {
    let active = true;
    base44.entities.Conversation.get(id)
      .then((c) => {
        if (active) setConversation(c);
      })
      .catch(() => null);
    return () => {
      active = false;
    };
  }, [id]);

  const members = conversation?.members ?? [];
  const otherIndex = members.findIndex((member) => member !== user?.id);
  const otherId = otherIndex >= 0 ? members[otherIndex] : null;
  const otherName =
    conversation?.member_names?.[otherIndex === -1 ? 0 : otherIndex] || t("messages.conversation");
  const peer = { id: otherId, user_id: otherId, name: otherName, display_name: otherName };

  return (
    <div className="flex h-[100dvh] min-h-0 w-full min-w-0 max-w-full flex-col overflow-hidden lg:h-screen">
      <header className="flex min-w-0 shrink-0 items-center gap-3 border-b border-border/60 bg-background/80 px-3 py-3 backdrop-blur-xl sm:px-4">
        <button
          type="button"
          onClick={() => navigate({ to: "/messages" })}
          className="grid h-9 w-9 place-items-center rounded-xl border border-border/70"
          aria-label={t("common.back")}
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          {otherId ? (
            <Link
              to="/profile/$id"
              params={{ id: String(otherId) }}
              className="block truncate text-sm font-semibold hover:underline"
            >
              {otherName}
            </Link>
          ) : (
            <p className="truncate text-sm font-semibold">{otherName}</p>
          )}
          {conversation?.listing_title && (
            <p className="truncate text-[10px] text-aura">#{conversation.listing_title}</p>
          )}
        </div>
      </header>
      <div className="flex min-h-0 w-full min-w-0 flex-1">
        <ChatWindow conversationId={id} peer={peer} />
      </div>
    </div>
  );
}
