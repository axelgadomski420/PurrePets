import { Link } from "@tanstack/react-router";
import { BadgeCheck, MapPin, Sparkles } from "lucide-react";
import { Image } from "@/components/ui/image";
import { formatPrice, ageLabel } from "@/lib/format";
import { distanceLabel } from "@/lib/geo";
import { useI18n } from "@/lib/i18n";

export default function ListingCard({ listing, fromCity }) {
  const { t } = useI18n();
  const boosted = listing.boosted_until && new Date(listing.boosted_until) > new Date();
  const distance = distanceLabel(fromCity, listing);
  const cover = listing.image_urls?.[0];

  return (
    <Link
      to="/listings/$id"
      params={{ id: listing.id }}
      className="card-hover group flex flex-col overflow-hidden rounded-[var(--radius)] border border-border/70 bg-card/60"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-secondary/40">
        <Image
          src={cover}
          alt={listing.title}
          className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.04]"
        />
        {boosted && (
          <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-background/80 px-2 py-1 text-[9px] font-semibold uppercase tracking-widest text-aura backdrop-blur">
            <Sparkles className="h-3 w-3" /> {t("explore.boosted")}
          </span>
        )}
        <span className="absolute bottom-2 right-2 rounded-full bg-background/85 px-2.5 py-1 text-[11px] font-semibold backdrop-blur">
          {listing.kind === "adoption" ? t("explore.adoptions") : formatPrice(listing.price)}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <p className="line-clamp-1 text-sm font-semibold">{listing.title}</p>
        <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <MapPin className="h-3 w-3" />
          {listing.city}
          {distance && <span className="text-foreground/60">· {distance}</span>}
        </p>
        <div className="mt-auto flex items-center justify-between pt-1">
          <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            {listing.breed || (listing.species === "cat" ? t("explore.cats") : t("explore.dogs"))}
            {listing.age_months ? ` · ${ageLabel(listing.age_months)}` : ""}
          </span>
          {listing.seller_verified && <BadgeCheck className="h-3.5 w-3.5 text-aura" />}
        </div>
      </div>
    </Link>
  );
}
