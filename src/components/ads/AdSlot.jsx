import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";

/**
 * Wspólny status PURRE Premium.
 * Równoczesne komponenty współdzielą jedno zapytanie do API.
 */
let premiumStatusPromise = null;

function getPremiumStatus() {
  if (!premiumStatusPromise) {
    premiumStatusPromise = Promise.resolve()
      .then(() => base44.premium.status())
      .finally(() => {
        premiumStatusPromise = null;
      });
  }

  return premiumStatusPromise;
}

export function usePremium() {
  const [premium, setPremium] = useState(() => {
    try {
      return localStorage.getItem("purre:premium") === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    let alive = true;

    getPremiumStatus()
      .then((status) => {
        if (!alive) return;

        const active = status?.premium === true;
        setPremium(active);

        try {
          localStorage.setItem("purre:premium", active ? "1" : "0");
        } catch {
          // Brak localStorage nie może blokować aplikacji.
        }
      })
      .catch(() => {
        // Przy błędzie API zachowujemy ostatni lokalny status.
      });

    return () => {
      alive = false;
    };
  }, []);

  return premium;
}
