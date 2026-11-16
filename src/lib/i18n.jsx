import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import pl from "@/lib/i18n/pl.json";
import en from "@/lib/i18n/en.json";

const DICTS = { pl, en };
const I18nContext = createContext(null);

function lookup(dict, key) {
  return key.split(".").reduce((acc, part) => (acc && acc[part] !== undefined ? acc[part] : undefined), dict);
}

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState("pl");

  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem("purre-lang") : null;
    if (saved && DICTS[saved]) setLangState(saved);
  }, []);

  const setLang = useCallback((next) => {
    if (!DICTS[next]) return;
    setLangState(next);
    if (typeof window !== "undefined") window.localStorage.setItem("purre-lang", next);
  }, []);

  const t = useCallback(
    (key, fallback) => {
      const value = lookup(DICTS[lang], key);
      if (typeof value === "string") return value;
      const base = lookup(DICTS.pl, key);
      return typeof base === "string" ? base : fallback ?? key;
    },
    [lang]
  );

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}
