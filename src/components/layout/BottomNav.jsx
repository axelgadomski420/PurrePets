import { useNavigate, useRouterState } from "@tanstack/react-router";
import { NAV_ITEMS } from "@/lib/nav";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export default function BottomNav() {
  const navigate = useNavigate();
  const { t, lang, setLang } = useI18n();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/80 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
      <div className="mx-auto flex w-full min-w-0 max-w-lg flex-col px-2">
        <div className="flex items-center justify-end gap-1 border-b border-border/40 px-2 py-1">
          <span className="mr-1 text-[9px] uppercase tracking-widest text-muted-foreground">
            {lang === "pl" ? "Język" : "Language"}
          </span>
          {["pl", "en"].map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => setLang(code)}
              aria-pressed={lang === code}
              className={cn(
                "min-w-9 rounded-lg px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest transition",
                lang === code
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {code}
            </button>
          ))}
        </div>
        <div className="flex w-full min-w-0 items-stretch justify-between">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.to;
          if (item.primary) {
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => navigate({ to: item.to })}
                className="relative -mt-5 grid h-12 w-12 place-items-center self-center rounded-2xl bg-gradient-to-br from-violet to-aura text-background shadow-[0_16px_32px_-16px_hsl(var(--violet))]"
                aria-label={t(`nav.${item.key}`)}
              >
                <Icon className="h-5 w-5" strokeWidth={2.6} />
              </button>
            );
          }
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => navigate({ to: item.to })}
              className={cn(
                "flex min-w-0 flex-1 flex-col items-center gap-1 px-0.5 py-2.5 text-[9px] uppercase tracking-[0.14em] transition",
                active ? "text-foreground" : "text-muted-foreground"
              )}
            >
              <Icon className={cn("h-[19px] w-[19px]", active && "text-aura")} strokeWidth={active ? 2.4 : 1.8} />
              <span className="block w-full truncate text-center leading-tight">
                {t(`nav.${item.key}`)}
              </span>
            </button>
          );
        })}
        </div>
      </div>
    </nav>
  );
}
