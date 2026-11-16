import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export const THEMES = [
  { id: "aura", label: "PURRE AURA", hint: "Dark Luxury", swatch: ["#050507", "#8B5CF6", "#2BE39B"] },
  { id: "light", label: "LIGHT", hint: "Crystal", swatch: ["#FAFAFC", "#7C4DFF", "#16A87A"] },
  { id: "midnight", label: "MIDNIGHT", hint: "Deep Blue", swatch: ["#060A14", "#38BDF8", "#22D3EE"] },
  { id: "forest", label: "FOREST", hint: "Emerald", swatch: ["#060B09", "#2FA36B", "#A3E635"] },
  { id: "royal", label: "ROYAL", hint: "Gold & Plum", swatch: ["#0B0714", "#F0C24B", "#9B5DE5"] },
  { id: "sunset", label: "SUNSET", hint: "Ember", swatch: ["#120A08", "#F97316", "#EC4899"] },
  { id: "mono", label: "MONO", hint: "Editorial", swatch: ["#101010", "#F5F5F5", "#9CA3AF"] },
  { id: "contrast", label: "HIGH CONTRAST", hint: "Accessible", swatch: ["#000000", "#FFE600", "#00E5FF"] },
];

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState("aura");

  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem("purre-theme") : null;
    if (saved && THEMES.some((item) => item.id === saved)) {
      setThemeState(saved);
      document.documentElement.dataset.theme = saved;
    }
  }, []);

  const setTheme = useCallback((next) => {
    if (!THEMES.some((item) => item.id === next)) return;
    setThemeState(next);
    document.documentElement.dataset.theme = next;
    if (typeof window !== "undefined") window.localStorage.setItem("purre-theme", next);
  }, []);

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
