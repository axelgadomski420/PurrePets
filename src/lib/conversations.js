import { base44 } from "@/api/base44Client";

// Otwiera (albo tworzy) rozmowę jeden-do-jednego. Używane z ogłoszeń, profili i listy czatów,
// żeby każdy mógł napisać do każdego.
export async function openConversation({ me, otherId, otherName, listing }) {
  if (!me?.id || !otherId || otherId === me.id) return null;

  const page = await base44.entities.Conversation.filter(
    { members: me.id },
    { sort: "-last_message_at", limit: 100 }
  );
  const existing = (page.items ?? []).find(
    (conversation) =>
      (conversation.members ?? []).includes(otherId) &&
      (listing?.id ? conversation.listing_id === listing.id : !conversation.listing_id)
  );
  if (existing) return existing;

  return base44.entities.Conversation.create({
    members: [me.id, otherId],
    member_names: [me.full_name || me.email, otherName || "Hodowca"],
    ...(listing?.id ? { listing_id: listing.id, listing_title: listing.title } : {}),
    last_message: "",
    last_message_at: new Date().toISOString(),
  });
}
