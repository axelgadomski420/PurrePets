import { useEffect, useState } from "react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useWallet } from "@/lib/useWallet";

export default function CoinShop() {
  const { isAuthenticated, navigateToLogin } = useAuth();
  const { reload } = useWallet();
  const [catalog, setCatalog] = useState({ configured: false, packages: [] });
  const [busy, setBusy] = useState("");
  const [confirming, setConfirming] = useState(false);

  // I: powrót z Stripe Checkout (?paid=1&session_id=) — księgujemy monety
  // natychmiast przez /api/stripe/confirm (fallback webhooka; idempotentny).
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const paid = params.get("paid");
      const sessionId = params.get("session_id");
      if (paid !== "1" || !sessionId) return;
      setConfirming(true);
      base44.billing
        .confirm(sessionId)
        .then((result) => {
          if (result?.credited === "premium") toast.success("Purre Pets PRO aktywne 🏆");
          else if (result?.duplicate) toast.info("Ta płatność została już zaksięgowana");
          else toast.success(`+${result?.credited ?? 0} monet na koncie 🪙`);
          reload();
        })
        .catch((err) => toast.error(err?.message ?? "Nie udało się potwierdzić płatności — webhook doliczy monety automatycznie"))
        .finally(() => {
          setConfirming(false);
          params.delete("paid");
          params.delete("session_id");
          const qs = params.toString();
          window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
        });
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    base44.billing
      .packages()
      .then(setCatalog)
      .catch(() => setCatalog({ configured: false, packages: [] }));
  }, []);

  const buy = async (packageId) => {
    if (!isAuthenticated) {
      navigateToLogin();
      return;
    }
    setBusy(packageId);
    try {
      const session = await base44.billing.checkout(packageId);
      if (session?.url) window.location.assign(session.url);
    } catch (error) {
      toast.error(error?.message ?? "Płatność Stripe nie jest jeszcze włączona");
    } finally {
      setBusy("");
    }
  };

  if (!catalog.packages?.length) return null;

  return (
    <section className="mt-8">
      <h2 className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Dokup PURRE Coins</h2>
      <p className="mt-1 text-[12px] text-muted-foreground">
        {confirming
          ? "Potwierdzamy płatność…"
          : catalog.configured
            ? "Płatność Stripe. Monety księgują się od razu po powrocie (webhook jako drugie potwierdzenie)."
            : "Pakiety są gotowe. Płatność ruszy, gdy w backendzie pojawi się STRIPE_SECRET_KEY."}
      </p>
      <div className="mt-3 grid max-w-2xl gap-3 sm:grid-cols-2">
        {catalog.packages.map((pack) => (
          <button
            key={pack.id}
            type="button"
            disabled={busy === pack.id || confirming}
            onClick={() => buy(pack.id)}
            className="rounded-[var(--radius)] border border-border/70 bg-gradient-to-br from-violet/15 to-aura/10 p-4 text-left transition enabled:hover:border-aura/60 disabled:opacity-60"
          >
            <p className="font-display text-2xl">{pack.coins.toLocaleString("pl-PL")}</p>
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground">monet</p>
            <p className="mt-3 text-sm">{(pack.amount / 100).toFixed(2).replace(".", ",")} zł</p>
          </button>
        ))}
      </div>
    </section>
  );
}
