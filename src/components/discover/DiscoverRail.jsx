import { BadgeCheck, Gamepad2, Coins, ArrowUpRight, ShieldCheck, Sparkles } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Image } from "@/components/ui/image";
import { useI18n } from "@/lib/i18n";
import { SAMPLE_DAILY } from "@/data/sample";

export default function DiscoverRail({ breeders = [], onNavigate, followingIds = [], onFollow }) {
  const { t } = useI18n();

  return (
    <aside className="hidden w-[320px] shrink-0 flex-col gap-4 xl:flex">
      <section className="rounded-[var(--radius)] border border-border/70 bg-card/60 p-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-violet" />
          <h3 className="text-xs font-semibold uppercase tracking-[0.24em]">Smart Match</h3>
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
          Hodowle dopasowane do Twojej rasy, miasta i historii wyszukiwań.
        </p>
        <ul className="mt-3 space-y-3">
          {breeders.slice(0, 3).map((breeder) => (
            <li key={breeder.id} className="flex items-center gap-3">
              <Link
                to="/profile/$id"
                params={{ id: breeder.user_id || breeder.id }}
                aria-label={`Profil: ${breeder.name}`}
                className="shrink-0"
              >
                <Image src={breeder.avatar} alt={breeder.name} className="h-9 w-9 rounded-full object-cover" />
              </Link>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1 truncate text-xs font-medium">
                  <Link
                    to="/profile/$id"
                    params={{ id: breeder.user_id || breeder.id }}
                    className="truncate hover:text-aura"
                  >
                    {breeder.name}
                  </Link>
                  {breeder.verified && <BadgeCheck className="h-3 w-3 text-aura" />}
                </p>
                <p className="truncate text-[10px] text-muted-foreground">
                  {breeder.breed} · {breeder.city}
                </p>
              </div>
              <button
                type="button"
                disabled={!breeder.user_id || !onFollow || followingIds.includes(breeder.user_id)}
                onClick={() => onFollow?.(breeder.user_id)}
                className="rounded-lg border border-border/70 px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground transition hover:border-aura/60 hover:text-aura disabled:opacity-40"
              >
                {followingIds.includes(breeder.user_id) ? "Obserwujesz" : t("common.follow")}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-[var(--radius)] border border-border/70 bg-gradient-to-br from-violet/20 via-card/70 to-aura/10 p-4">
        <div className="flex items-center gap-2">
          <Gamepad2 className="h-4 w-4 text-aura" />
          <h3 className="text-xs font-semibold uppercase tracking-[0.24em]">{t("arcade.daily")}</h3>
        </div>
        <p className="mt-2 font-display text-xl">{SAMPLE_DAILY.game}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Cel: {SAMPLE_DAILY.target} pkt · nagroda {SAMPLE_DAILY.reward} monet
        </p>
        <button
          type="button"
          onClick={() => onNavigate?.("/arcade")}
          className="btn-aura mt-3 flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-[11px] font-semibold uppercase tracking-[0.18em]"
        >
          <Coins className="h-3.5 w-3.5" /> {t("arcade.play")}
        </button>
      </section>

      <section className="rounded-[var(--radius)] border border-border/70 bg-card/60 p-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-aura" />
          <h3 className="text-xs font-semibold uppercase tracking-[0.24em]">Bezpieczna hodowla</h3>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          Każde ogłoszenie przechodzi moderację AI, a hodowcy z certyfikatem otrzymują odznakę
          weryfikacji po sprawdzeniu dokumentów.
        </p>
        <button
          type="button"
          onClick={() => onNavigate?.("/explore")}
          className="mt-3 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-aura"
        >
          Sprawdź hodowle <ArrowUpRight className="h-3.5 w-3.5" />
        </button>
      </section>
    </aside>
  );
}
