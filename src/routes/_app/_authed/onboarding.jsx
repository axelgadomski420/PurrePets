import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Dog, Heart, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { ensureProfile } from "@/lib/useProfile";
import { CITY_NAMES } from "@/lib/geo";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/_authed/onboarding")({
  head: () => ({ meta: [{ title: "PURRE PETS — rodzaj konta" }] }),
  component: OnboardingPage,
});

const OPTIONS = [
  {
    id: "breeder",
    title: "Konto hodowcy",
    desc: "Dodajesz ogłoszenia, prowadzisz profil hodowli i sprzedajesz za PURRE coiny.",
    icon: Dog,
  },
  {
    id: "enthusiast",
    title: "Konto użytkownika",
    desc: "Obserwujesz hodowle, piszesz wiadomości, szukasz zwierzaka i grasz w Arcade.",
    icon: Heart,
  },
];

function OnboardingPage() {
  const { user } = useAuth();
  const [type, setType] = useState("breeder");
  const [kennel, setKennel] = useState("");
  const [city, setCity] = useState("Warszawa");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const stored = localStorage.getItem("purre:account_type");
    if (stored === "breeder" || stored === "enthusiast") setType(stored);
  }, []);

  const finish = async () => {
    setBusy(true);
    setError("");
    try {
      const profile = await ensureProfile(user);
      await base44.entities.Profile.update(profile.id, {
        account_type: type,
        city,
        ...(type === "breeder" ? { kennel_name: kennel.trim() } : {}),
      });
      localStorage.removeItem("purre:account_type");
      // Wymuszamy natychmiastowe, niezawodne przekierowanie na profil
      window.location.href = "/profile";
    } catch (err) {
      setError(err?.message ?? "Nie udało się zapisać konta");
      setBusy(false);
    }
  };

  return (
    <div className="px-4 pb-12 pt-8 lg:px-8">
      <div className="mx-auto max-w-xl">
        <p className="text-[10px] uppercase tracking-[0.4em] text-muted-foreground">purre pets</p>
        <h1 className="mt-2 font-display text-3xl leading-tight">
          <span className="aura-text">Jakim kontem chcesz być?</span>
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Możesz to zmienić w każdej chwili w ustawieniach profilu.
        </p>

        <div className="mt-5 space-y-3">
          {OPTIONS.map((option) => {
            const Icon = option.icon;
            const selected = type === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setType(option.id)}
                className={cn(
                  "flex w-full items-start gap-3 rounded-[var(--radius)] border p-4 text-left transition",
                  selected ? "border-violet/70 bg-violet/10" : "border-border/70 bg-card/60"
                )}
              >
                <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", selected ? "bg-violet/25 text-violet" : "bg-secondary/60 text-muted-foreground")}>
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{option.title}</span>
                  <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">{option.desc}</span>
                </span>
              </button>
            );
          })}
        </div>

        {type === "breeder" && (
          <label className="mt-4 block">
            <span className="mb-1.5 block text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Nazwa hodowli (opcjonalnie)
            </span>
            <input
              value={kennel}
              onChange={(event) => setKennel(event.target.value)}
              placeholder="Hodowla Aura"
              className="w-full rounded-xl border border-border/70 bg-background/40 px-3 py-2.5 text-sm outline-none focus:border-violet/60"
            />
          </label>
        )}

        <label className="mt-3 block">
          <span className="mb-1.5 block text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Miasto</span>
          <select
            value={city}
            onChange={(event) => setCity(event.target.value)}
            className="w-full rounded-xl border border-border/70 bg-background/40 px-3 py-2.5 text-sm outline-none focus:border-violet/60"
          >
            {CITY_NAMES.map((name) => (
              <option key={name} value={name} className="bg-popover">
                {name}
              </option>
            ))}
          </select>
        </label>

        {error && <p className="mt-3 text-[12px] text-destructive">{error}</p>}

        <button
          type="button"
          onClick={finish}
          disabled={busy}
          className="btn-aura mt-5 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-[11px] font-semibold uppercase tracking-[0.2em] disabled:opacity-60"
        >
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {busy ? "Zapisuję…" : "Zaczynamy"}
        </button>
      </div>
    </div>
  );
}
