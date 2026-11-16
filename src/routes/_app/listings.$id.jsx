import { useEffect, useState } from "react";
import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { ArrowLeft, BadgeCheck, MapPin, MessageCircle, ShieldCheck, Sparkles } from "lucide-react";
import { Image } from "@/components/ui/image";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useI18n } from "@/lib/i18n";
import { formatPrice, ageLabel, timeAgo } from "@/lib/format";
import { distanceLabel } from "@/lib/geo";
import { openConversation } from "@/lib/conversations";

export const Route = createFileRoute("/_app/listings/$id")({
  head: () => ({
    meta: [{ title: "PURRE PETS — ogłoszenie" }],
  }),
  component: ListingPage,
});

function ListingPage() {
  const { id } = useParams({ from: "/_app/listings/$id" });
  const { t } = useI18n();
  const navigate = useNavigate();
  const { user, isAuthenticated, navigateToLogin } = useAuth();
  const [listing, setListing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [active, setActive] = useState(0);

  useEffect(() => {
    base44.entities.Listing.get(id)
      .then(setListing)
      .finally(() => setLoading(false));
  }, [id]);

  const contact = async () => {
    if (!isAuthenticated) {
      navigateToLogin();
      return;
    }
    setStarting(true);
    const conversation = await openConversation({
      me: user,
      otherId: listing.seller_id,
      otherName: listing.seller_name,
      listing,
    });
    if (conversation) navigate({ to: "/messages/$id", params: { id: conversation.id } });
  };

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">{t("common.loading")}</div>;
  }
  if (!listing) {
    return <div className="p-6 text-sm text-muted-foreground">{t("common.empty")}</div>;
  }

  const images = listing.image_urls?.length ? listing.image_urls : [null];
  const boosted = listing.boosted_until && new Date(listing.boosted_until) > new Date();

  return (
    <div className="pb-12">
      <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-border/50 bg-background/80 px-4 py-3 backdrop-blur-xl">
        <button
          type="button"
          onClick={() => navigate({ to: "/explore" })}
          className="grid h-9 w-9 place-items-center rounded-xl border border-border/70"
          aria-label={t("common.back")}
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <p className="truncate text-sm font-medium">{listing.title}</p>
      </div>

      <div className="mx-auto grid max-w-5xl gap-6 px-4 pt-5 lg:grid-cols-[1.15fr_0.85fr] lg:px-8">
        <div>
          <div className="overflow-hidden rounded-[var(--radius)] border border-border/70 bg-card/60">
            <Image
              src={images[active]}
              alt={listing.title}
              className="aspect-[4/3] w-full object-cover"
              originWidth={1200}
              originHeight={900}
            />
          </div>
          {images.length > 1 && (
            <div className="mt-3 flex gap-2">
              {images.map((url, index) => (
                <button
                  key={url ?? index}
                  type="button"
                  onClick={() => setActive(index)}
                  className={`h-16 w-16 overflow-hidden rounded-xl border ${
                    index === active ? "border-violet" : "border-border/60"
                  }`}
                >
                  <Image src={url} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}

          <div className="mt-5">
            <h1 className="font-display text-2xl leading-tight">{listing.title}</h1>
            <p className="mt-2 flex flex-wrap items-center gap-3 text-[12px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" /> {listing.city}
                {listing.city && <span className="text-foreground/60">· {distanceLabel("Warszawa", listing)}</span>}
              </span>
              {listing.breed && <span>{listing.breed}</span>}
              {listing.age_months ? <span>{ageLabel(listing.age_months)}</span> : null}
              {listing.sex && <span>{listing.sex === "male" ? "samiec" : "samica"}</span>}
              <span>{timeAgo(listing.created_date)}</span>
            </p>
            <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-foreground/85">
              {listing.description}
            </p>
          </div>
        </div>

        <aside className="flex flex-col gap-3">
          <div className="rounded-[var(--radius)] border border-border/70 bg-card/70 p-4">
            <div className="flex items-center justify-between">
              <p className="font-display text-2xl">
                {listing.kind === "adoption" ? t("explore.adoptions") : formatPrice(listing.price)}
              </p>
              {boosted && (
                <span className="flex items-center gap-1 rounded-full bg-aura/15 px-2 py-1 text-[9px] uppercase tracking-widest text-aura">
                  <Sparkles className="h-3 w-3" /> boost
                </span>
              )}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {listing.kind === "adoption"
                ? "Adopcja — rozmowa i weryfikacja domu przed przekazaniem."
                : "Cena orientacyjna — ustalana bezpośrednio z hodowlą."}
            </p>
            <button
              type="button"
              onClick={contact}
              disabled={starting}
              className="btn-aura mt-4 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-[11px] font-semibold uppercase tracking-[0.18em] disabled:opacity-60"
            >
              <MessageCircle className="h-4 w-4" />
              {starting ? t("common.loading") : t("explore.contact")}
            </button>
          </div>

          <div className="rounded-[var(--radius)] border border-border/70 bg-card/60 p-4">
            <div className="flex items-center gap-2">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-violet to-aura text-xs font-bold text-background">
                {(listing.seller_name || "PP").slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="flex items-center gap-1 truncate text-sm font-semibold">
                  {listing.seller_name || "Hodowca PURRE"}
                  {listing.seller_verified && <BadgeCheck className="h-3.5 w-3.5 text-aura" />}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {listing.seller_verified ? t("common.verified") : "Profil hodowcy"}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-[var(--radius)] border border-border/70 bg-card/60 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em]">
              <ShieldCheck className="h-4 w-4 text-aura" /> Bezpieczeństwo
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              {listing.risk >= 60
                ? "To ogłoszenie jest w trakcie weryfikacji przez moderatora."
                : "Ogłoszenie sprawdzone automatycznie przez PURRE AI. Nigdy nie wysyłaj zaliczki bez umowy i wizyty w hodowli."}
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
