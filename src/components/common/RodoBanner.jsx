import { useState, useEffect } from "react";
import { Link } from "@tanstack/react-router";

const KEY = "purre_rodo_accepted";

/**
 * RodoBanner — jedyny baner zgody RODO w aplikacji (montowany w __root).
 * Zapis wyboru w localStorage (purre_rodo_accepted).
 */
export function RodoBanner() {
  const [accepted, setAccepted] = useState(true);

  useEffect(() => {
    try {
      if (!localStorage.getItem(KEY)) setAccepted(false);
    } catch {
      // brak localStorage — nie blokuj UI
    }
  }, []);

  const handleAccept = (value) => {
    try {
      localStorage.setItem(KEY, value);
    } catch { /* Brak dostępu do localStorage nie blokuje UI. */ }
    setAccepted(true);
  };

  if (accepted) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[70] border-t border-border/60 bg-popover/95 px-4 py-3.5 backdrop-blur-xl">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-3">
        <p className="min-w-0 flex-1 text-[11px] leading-relaxed text-muted-foreground">
          Używamy niezbędnych plików cookies (logowanie, bezpieczeństwo) oraz — za Twoją zgodą —
          narzędzi analitycznych. Szczegóły:{" "}
          <Link to="/privacy" className="text-aura hover:underline">
            Polityka prywatności (RODO)
          </Link>{" "}
          ·{" "}
          <Link to="/terms" className="text-aura hover:underline">
            Regulamin
          </Link>
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => handleAccept("necessary")}
            className="rounded-xl border border-border/70 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground transition hover:text-foreground"
          >
            Tylko niezbędne
          </button>
          <button
            type="button"
            onClick={() => handleAccept("all")}
            className="btn-aura rounded-xl px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.16em]"
          >
            Akceptuję
          </button>
        </div>
      </div>
    </div>
  );
}

export default RodoBanner;
