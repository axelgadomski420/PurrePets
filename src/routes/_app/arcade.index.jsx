import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Coins, Crown, Flame, Gift, Trophy } from "lucide-react";
import TopBar from "@/components/layout/TopBar";
import AdSenseUnit from "@/components/ads/AdSenseUnit";
import { base44 } from "@/api/base44Client";
import { useWallet } from "@/lib/useWallet";
import { useI18n } from "@/lib/i18n";
import { GAMES, dailyGame, dailyTarget, todayKey, DAILY_BONUS } from "@/lib/games";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/arcade/")({
  head: () => ({
    meta: [
      { title: "PURRE PETS — PURRE Arcade" },
      { name: "description", content: "Gry PURRE Arcade: 2048, Memory i Quiz. Zbieraj monety i wyróżniaj ogłoszenia." },
    ],
  }),
  component: ArcadePage,
});

function ArcadePage() {
  const { t } = useI18n();
  const { coins, xp, level, wallet } = useWallet();
  const [leaders, setLeaders] = useState([]);
  const daily = dailyGame(todayKey());
  const target = dailyTarget(daily);
  const dailyGameMeta = GAMES.find((game) => game.id === daily);

  useEffect(() => {
    base44.entities.GameScore.filter({}, { sort: "-score", limit: 8 }).then((page) =>
      setLeaders(page.items ?? [])
    );
  }, []);

  return (
    <div>
      <TopBar />
      <div className="px-4 pb-12 pt-6 lg:px-8">
        <p className="text-[10px] uppercase tracking-[0.4em] text-muted-foreground">purre pets</p>
        <h1 className="mt-2 font-display text-4xl tracking-tight sm:text-5xl">
          <span className="aura-text">{t("arcade.title")}</span>
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("arcade.subtitle")}</p>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-[var(--radius)] border border-border/70 bg-gradient-to-br from-violet/20 via-card/70 to-aura/10 p-4">
            <p className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">{t("arcade.coinsBalance")}</p>
            <p className="mt-1 flex items-center gap-2 font-display text-3xl">
              <Coins className="h-5 w-5 text-aura" /> {formatNumber(coins)}
            </p>
          </div>
          <div className="rounded-[var(--radius)] border border-border/70 bg-card/60 p-4">
            <p className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">{t("common.level")}</p>
            <p className="mt-1 font-display text-3xl">{level}</p>
            <p className="text-[11px] text-muted-foreground">{formatNumber(xp)} XP</p>
          </div>
          <div className="rounded-[var(--radius)] border border-border/70 bg-card/60 p-4">
            <p className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">{t("rewards.title")}</p>
            <Link
              to="/rewards"
              className="btn-aura mt-2 flex items-center justify-center gap-2 rounded-xl py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em]"
            >
              <Gift className="h-3.5 w-3.5" /> {t("arcade.rewards")}
            </Link>
          </div>
        </div>

        <AdSenseUnit slotName="arcade" format="auto" className="mt-6" />

        <section className="mt-5 rounded-[var(--radius)] border border-aura/30 bg-gradient-to-br from-aura/15 via-card/70 to-violet/10 p-4">
          <div className="flex items-center gap-2">
            <Flame className="h-4 w-4 text-aura" />
            <p className="text-[10px] uppercase tracking-[0.26em] text-muted-foreground">{t("arcade.daily")}</p>
            {wallet?.daily_done_on === todayKey() && (
              <span className="ml-auto rounded-full bg-aura/20 px-2 py-0.5 text-[9px] uppercase tracking-widest text-aura">
                {t("arcade.dailyDone")}
              </span>
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="font-display text-2xl">{dailyGameMeta?.label ?? "PURRE Arcade"}</p>
              <p className="text-[11px] text-muted-foreground">
                Cel {target} pkt · +{DAILY_BONUS} monet
              </p>
            </div>
            <Link
              to={`/arcade/${daily}`}
              className="rounded-xl bg-foreground px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-background"
            >
              {t("arcade.play")}
            </Link>
          </div>
        </section>

        <section className="mt-6">
          <h2 className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Gry</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {GAMES.map((game) => (
              <Link
                key={game.id}
                to={`/arcade/${game.id}`}
                className={cn(
                  "card-hover flex flex-col justify-between rounded-[var(--radius)] border border-border/70 bg-gradient-to-br p-4",
                  game.accent
                )}
              >
                <div>
                  <p className="font-display text-lg">{game.label}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{game.tagline}</p>
                </div>
                <span className="mt-6 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-aura">
                  {t("arcade.play")} →
                </span>
              </Link>
            ))}
          </div>
        </section>

        <AdSenseUnit slotName="arcade" format="auto" className="mt-6" />

        <section className="mt-6 rounded-[var(--radius)] border border-border/70 bg-card/60 p-4">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-chart-4" />
            <h2 className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
              {t("arcade.leaderboard")}
            </h2>
          </div>
          <ul className="mt-3 space-y-1.5">
            {leaders.length === 0 && <li className="text-[11px] text-muted-foreground">{t("common.empty")}</li>}
            {leaders.map((entry, index) => (
              <li
                key={entry.id}
                className="flex items-center gap-3 rounded-xl px-2 py-1.5 text-[12px] odd:bg-secondary/30"
              >
                <span className="w-5 text-center font-display text-muted-foreground">{index + 1}</span>
                {index === 0 ? <Crown className="h-3.5 w-3.5 text-chart-4" /> : null}
                <span className="min-w-0 flex-1 truncate">{entry.user_name || "Gracz PURRE"}</span>
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{entry.game}</span>
                <span className="font-semibold text-aura">{formatNumber(entry.score)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
