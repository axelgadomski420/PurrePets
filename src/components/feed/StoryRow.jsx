import { useState } from "react";
import { BadgeCheck, X } from "lucide-react";
import { Image } from "@/components/ui/image";
import { useI18n } from "@/lib/i18n";

export default function StoryRow({ breeders = [] }) {
  const { t } = useI18n();
  const [active, setActive] = useState(null);

  return (
    <>
      <section className="mb-6">
        <p className="mb-3 text-[10px] uppercase tracking-[0.34em] text-muted-foreground">
          {t("feed.stories")}
        </p>
        <div className="no-scrollbar -mx-4 flex gap-4 overflow-x-auto px-4 pb-1">
          {breeders.map((breeder) => (
            <button
              key={breeder.id}
              type="button"
              onClick={() => setActive(breeder)}
              className="flex w-[74px] shrink-0 flex-col items-center gap-2"
            >
              <span className="rounded-full bg-gradient-to-br from-violet via-aura to-violet p-[2px]">
                <span className="block rounded-full bg-background p-[2px]">
                  <Image
                    src={breeder.avatar}
                    alt={breeder.name}
                    className="h-16 w-16 rounded-full object-cover"
                  />
                </span>
              </span>
              <span className="flex items-center gap-0.5 text-center text-[10px] leading-tight text-muted-foreground">
                <span className="line-clamp-2">{breeder.handle}</span>
                {breeder.verified && <BadgeCheck className="h-3 w-3 shrink-0 text-aura" />}
              </span>
            </button>
          ))}
        </div>
      </section>

      {active && (
        <div
          className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/95 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setActive(null)}
        >
          <button
            type="button"
            className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white"
            onClick={() => setActive(null)}
            aria-label="Zamknij"
          >
            <X className="h-5 w-5" />
          </button>
          <div
            className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-white/10 bg-zinc-950"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative aspect-[9/16] w-full bg-gradient-to-b from-violet/40 to-black">
              <Image
                src={active.avatar}
                alt={active.name}
                className="h-full w-full object-cover opacity-90"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-4 pt-16 text-white">
                <p className="flex items-center gap-1.5 font-semibold">
                  {active.name}
                  {active.verified && <BadgeCheck className="h-4 w-4 text-aura" />}
                </p>
                <p className="mt-1 text-[12px] text-white/70">
                  {[active.breed, active.city].filter(Boolean).join(" · ") || active.handle}
                </p>
                <p className="mt-3 text-[11px] text-white/50">
                  Story hodowli — pełne nagrania wideo pojawią się tutaj, gdy hodowca doda story.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
