import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Cookie } from "lucide-react";

const KEY = "purre:consent";

/**
 * ConsentBanner — baner RODO: zgoda na cookies (niezbędne + analityka).
 * Wybór zapisywany w localStorage (purre:consent), zgodnie z Polityką prywatności.
 */
export default function ConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(KEY)) setVisible(true);
    } catch {
      // brak dostępu do localStorage — nie blokuj UI
    }
  }, []);

  const decide = (value) => {
    try {
      localStorage.setItem(KEY, value);
    } catch { /* Brak dostępu do localStorage nie blokuje decyzji użytkownika. */ }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-x-3 bottom-20 z-[60] mx-auto max-w-lg rounded-2xl border border-border/70 bg-popover/95 p-4 shadow-2xl backdrop-blur-xl lg:bottom-6 lg:left-auto lg:right-6 lg:mx-0">
      <div className="flex items-start gap-2.5">
        <Cookie className="mt-0.5 h-4 w-4 shrink-0 text-aura" />
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Używamy niezbędnych plików cookies (logowanie, koszyk sesji) oraz — za Twoją zgodą —
          narzędzi analitycznych. Szczegóły w{" "}
          <Link to="/privacy" className="text-aura hover:underline">
            Polityce prywatności
          </Link>{" "}
          i{" "}
          <Link to="/terms" className="text-aura hover:underline">
            Regulaminie
          </Link>
          .
        </p>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => decide("all")}
          className="btn-aura flex-1 rounded-xl py-2 text-[10px] font-semibold uppercase tracking-[0.18em]"
        >
          Akceptuję
        </button>
        <button
          type="button"
          onClick={() => decide("necessary")}
          className="flex-1 rounded-xl border border-border/70 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground"
        >
          Tylko niezbędne
        </button>
      </div>
    </div>
  );
}
