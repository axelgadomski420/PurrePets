import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Coins, Loader2 } from "lucide-react";
import TopBar from "@/components/layout/TopBar";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useWallet } from "@/lib/useWallet";
import { useI18n } from "@/lib/i18n";
import { REWARDS } from "@/lib/rewards";
import { redeemReward } from "@/lib/server-fns";
import { formatNumber } from "@/lib/format";
import CoinShop from "@/components/rewards/CoinShop";

export const Route = createFileRoute("/_app/rewards")({
  ssr: false,
  head: () => ({ meta: [{ title: "PURRE PETS — Rewards" }] }),
  component: RewardsPage,
});

const LABELS = {
  boost_listing: "rewards.boost",
  boost_profile: "rewards.profileBoost",
  extra_media: "rewards.extraMedia",
  frame: "rewards.frame",
  badge: "rewards.badge",
  theme: "rewards.theme",
  event: "rewards.event",
  partner: "rewards.partner",
  verification: "rewards.verification",
};

function RewardsPage() {
  const { t } = useI18n();
  const { user, isAuthenticated, isLoadingAuth, navigateToLogin } = useAuth();
  const { coins, reload } = useWallet();
  const redeem = useServerFn(redeemReward);
  const [listings, setListings] = useState([]);
  const [targetId, setTargetId] = useState("");
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState("");

  useEffect(() => {
    if (!user?.id) return;
    base44.entities.Listing.filter({ seller_id: user.id }, { sort: "-created_date", limit: 20 }).then(
      (page) => {
        const items = page.items ?? [];
        setListings(items);
        setTargetId(items[0]?.id ?? "");
      }
    );
    base44.entities.Redemption.filter({ user_id: user.id }, { sort: "-created_date", limit: 8 }).then(
      (page) => setHistory(page.items ?? [])
    );
  }, [user?.id]);

  const apply = async (reward) => {
    if (!isAuthenticated) {
      navigateToLogin();
      return;
    }
    setBusy(reward.key);
    try {
      await redeem({ data: { reward_key: reward.key, target_id: reward.key === "boost_listing" ? targetId : undefined } });
      toast.success(t("rewards.redeemed"));
      await reload();
      const page = await base44.entities.Redemption.filter(
        { user_id: user.id },
        { sort: "-created_date", limit: 8 }
      );
      setHistory(page.items ?? []);
    } catch (error) {
      toast.error(error?.message ?? t("rewards.notEnough"));
    } finally {
      setBusy("");
    }
  };

  if (isLoadingAuth) {
    return <div className="p-6 text-sm text-muted-foreground">{t("common.loading")}</div>;
  }

  return (
    <div>
      <TopBar />
      <div className="px-4 pb-12 pt-6 lg:px-8">
        <h1 className="font-display text-3xl">
          <span className="aura-text">{t("rewards.title")}</span>
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("rewards.subtitle")}</p>

        <div className="mt-4 flex items-center gap-2 rounded-[var(--radius)] border border-border/70 bg-gradient-to-br from-violet/20 to-aura/10 px-4 py-3">
          <Coins className="h-5 w-5 text-aura" />
          <span className="font-display text-2xl">{formatNumber(coins)}</span>
          <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            {t("common.coins")}
          </span>
        </div>

        <CoinShop />

        {listings.length > 0 && (
          <label className="mt-4 block">
            <span className="mb-1.5 block text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Ogłoszenie do wyróżnienia
            </span>
            <select
              value={targetId}
              onChange={(event) => setTargetId(event.target.value)}
              className="w-full rounded-xl border border-border/70 bg-card/60 px-3 py-2.5 text-sm outline-none"
            >
              {listings.map((listing) => (
                <option key={listing.id} value={listing.id} className="bg-popover">
                  {listing.title}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {REWARDS.map((reward) => {
            const affordable = coins >= reward.cost;
            return (
              <div
                key={reward.key}
                className="flex flex-col justify-between rounded-[var(--radius)] border border-border/70 bg-card/60 p-4"
              >
                <div>
                  <p className="text-sm font-semibold leading-snug">{t(LABELS[reward.key])}</p>
                  <p className="mt-1 flex items-center gap-1 text-[11px] text-aura">
                    <Coins className="h-3 w-3" /> {formatNumber(reward.cost)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => apply(reward)}
                  disabled={!affordable || busy === reward.key}
                  className="mt-3 flex items-center justify-center gap-1.5 rounded-xl border border-border/70 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] transition enabled:hover:border-aura/60 enabled:hover:text-aura disabled:opacity-40"
                >
                  {busy === reward.key && <Loader2 className="h-3 w-3 animate-spin" />}
                  {affordable ? t("rewards.buy") : t("rewards.notEnough")}
                </button>
              </div>
            );
          })}
        </div>

        <section className="mt-6 rounded-[var(--radius)] border border-border/70 bg-card/60 p-4">
          <h2 className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
            {t("rewards.history")}
          </h2>
          <ul className="mt-3 space-y-1.5">
            {history.length === 0 && (
              <li className="text-[11px] text-muted-foreground">{t("common.empty")}</li>
            )}
            {history.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between rounded-xl bg-secondary/30 px-3 py-2 text-[12px]">
                <span className="truncate">{t(LABELS[entry.reward_key])}</span>
                <span className="shrink-0 text-muted-foreground">
                  −{formatNumber(entry.cost)} · {entry.status === "applied" ? "aktywne" : "w kolejce"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
