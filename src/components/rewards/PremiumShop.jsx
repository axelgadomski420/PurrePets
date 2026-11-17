import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Crown, Loader2, Check } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";

const plans = [
  { id: "month", name: "Miesięczny", price: "29,99", detail: "Płatność co miesiąc" },
  { id: "year", name: "Roczny", price: "249,99", detail: "Oszczędzasz względem płatności miesięcznej" },
];

export default function PremiumShop() {
  const { isAuthenticated, navigateToLogin } = useAuth();
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState("");

  useEffect(() => {
    if (!isAuthenticated) return;

    let active = true;
    const loadStatus = () =>
      base44.premium.status()
        .then((value) => { if (active) setStatus(value); })
        .catch(() => { if (active) setStatus(null); });

    loadStatus();

    const params = new URLSearchParams(window.location.search);
    const result = params.get("pro");
    const sessionId = params.get("session_id");

    const cleanUrl = () => {
      params.delete("pro");
      params.delete("session_id");
      const query = params.toString();
      window.history.replaceState({}, "", window.location.pathname + (query ? `?${query}` : ""));
    };

    if (result === "cancelled") {
      toast.info("Zakup Purre Pets PRO został anulowany.");
      cleanUrl();
    } else if (result === "success" && sessionId) {
      setBusy("confirm");
      base44.billing.confirm(sessionId)
        .then((response) => {
          if (response?.credited === "premium") {
            toast.success("Purre Pets PRO jest aktywne!");
          } else {
            toast.info("Płatność została potwierdzona.");
          }
          return loadStatus();
        })
        .catch((error) => {
          toast.error(error?.message || "Nie udało się potwierdzić Premium. Spróbuj odświeżyć Portfel.");
        })
        .finally(() => {
          if (active) setBusy("");
          cleanUrl();
        });
    }

    return () => { active = false; };
  }, [isAuthenticated]);

  const buy = async (plan) => {
    if (!isAuthenticated) {
      navigateToLogin();
      return;
    }

    setBusy(plan);
    try {
      const session = await base44.premium.proCheckout(plan);
      const url = session?.url || session?.checkout_url;
      if (!url) throw new Error("Stripe nie zwrócił adresu płatności.");
      window.location.assign(url);
    } catch (error) {
      toast.error(error?.message || "Nie udało się rozpocząć płatności Stripe.");
      setBusy("");
    }
  };

  const isPremium = Boolean(status?.is_premium || status?.premium);
  const until = status?.premium_until
    ? new Date(status.premium_until).toLocaleDateString("pl-PL")
    : null;

  return (
    <section className="mt-6 overflow-hidden rounded-2xl border border-aura/30 bg-gradient-to-br from-violet/15 via-card to-aura/10 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="rounded-xl bg-aura/15 p-2">
            <Crown className="h-5 w-5 text-aura" />
          </div>
          <div>
            <h2 className="font-display text-xl">Purre Pets PRO</h2>
            <p className="text-xs text-muted-foreground">Odblokuj pełne możliwości konta</p>
          </div>
        </div>
        {isPremium && (
          <span className="flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-500">
            <Check className="h-3.5 w-3.5" /> Aktywne
          </span>
        )}
      </div>

      <ul className="mt-4 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
        <li>✓ Korzyści konta PRO</li>
        <li>✓ Wyłączenie reklam</li>
        <li>✓ Wyróżnienie PRO</li>
        <li>✓ Dostęp do funkcji Premium</li>
      </ul>

      {isPremium ? (
        <p className="mt-4 rounded-xl bg-secondary/40 px-3 py-2 text-sm">
          Twoje konto ma aktywne Premium{until ? ` do ${until}` : ""}.
        </p>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {plans.map((plan) => (
            <button
              key={plan.id}
              type="button"
              disabled={Boolean(busy)}
              onClick={() => buy(plan.id)}
              className="flex min-w-0 flex-col rounded-xl border border-border/70 bg-background/60 p-4 text-left transition hover:border-aura/70 hover:bg-aura/5 disabled:opacity-60"
            >
              <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {plan.name}
              </span>
              <span className="mt-2 font-display text-3xl">{plan.price} zł</span>
              <span className="mt-1 text-xs text-muted-foreground">{plan.detail}</span>
              <span className="mt-4 flex min-h-10 items-center justify-center gap-2 rounded-lg bg-aura px-3 py-2 text-xs font-bold text-white">
                {busy === plan.id || busy === "confirm"
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : "Kup Premium"}
              </span>
            </button>
          ))}
        </div>
      )}

      {busy === "confirm" && (
        <p className="mt-3 text-xs text-muted-foreground">Potwierdzamy płatność Stripe…</p>
      )}
    </section>
  );
}
