import AdSenseUnit from "@/components/ads/AdSenseUnit";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Coins, RotateCcw, Trophy } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export default function GameShell({ title, score, meta, onRestart, result, submitting, error, children }) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const finished = !!result || !!error;


  return (
    <div className="px-4 pb-10 pt-4 lg:px-8">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate({ to: "/arcade" })}
          className="grid h-9 w-9 place-items-center rounded-xl border border-border/70"
          aria-label={t("common.back")}
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0">
          <h1 className="truncate font-display text-lg">{title}</h1>
          {meta && <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{meta}</p>}
        </div>
        <div className="ml-auto text-right">
          <p className="text-[9px] uppercase tracking-[0.24em] text-muted-foreground">{t("arcade.score")}</p>
          <p className="font-display text-xl text-aura">{score}</p>
        </div>
      </div>

      <div className="relative mt-4">
        {children}

        {(finished || submitting) && (
          <div className="absolute inset-0 z-10 grid place-items-center rounded-[var(--radius)] bg-background/80 p-4 backdrop-blur-md">
            <div className="w-full max-w-sm rounded-[var(--radius)] border border-border/70 bg-card/90 p-5 text-center">
              <Trophy className="mx-auto h-6 w-6 text-aura" />
              <p className="mt-2 font-display text-xl">
                {submitting ? t("common.loading") : error ? "Błąd zapisu" : t("arcade.lost")}
              </p>
              {result && !result.guest && (
                <div className="mt-3 flex items-center justify-center gap-2 text-sm">
                  <Coins className="h-4 w-4 text-aura" />
                  <span>
                    +{result.earned} {t("common.coins")}
                    {result.dailyBonus ? " (bonus dnia)" : ""}
                  </span>
                </div>
              )}
              {result?.guest && (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Zaloguj się, aby zapisać wynik i zbierać monety.
                </p>
              )}
              {error && <p className="mt-2 text-[11px] text-destructive">{error}</p>}
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={onRestart}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-border/70 py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em]"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> {t("arcade.restart")}
                </button>
                <button
                  type="button"
                  onClick={() => navigate({ to: "/arcade" })}
                  className="btn-aura flex-1 rounded-xl py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em]"
                >
                  {t("nav.arcade")}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {result && !result.guest && !submitting && (
        <AdSenseUnit
          slotName="arcade"
          format="auto"
          className="mt-4 w-full"
        />
      )}
    </div>
  );
}
