import { useNavigate, useRouterState } from "@tanstack/react-router";
import { CalendarDays, Clapperboard, Coins, ShieldCheck, Sparkles, Users } from "lucide-react";
import Brand from "@/components/common/Brand";
import ThemeLangMenu from "@/components/layout/ThemeLangMenu";
import { NAV_ITEMS } from "@/lib/nav";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/AuthContext";

const MORE = [
  { to: "/events", label: "Wydarzenia", icon: CalendarDays },
  { to: "/community", label: "Społeczność", icon: Users },
  { to: "/video-editor", label: "Edytor", icon: Clapperboard },
  { to: "/verify", label: "Weryfikacja", icon: ShieldCheck },
];

export default function SideNav({ coins = 0, level = 1 }) {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { t } = useI18n();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <aside className="sticky top-0 hidden h-screen w-[260px] shrink-0 flex-col px-5 py-7 lg:flex">
      <Brand />

      <nav className="mt-10 flex flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.to;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => navigate({ to: item.to })}
              className={cn(
                "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition",
                active
                  ? "bg-secondary/80 text-foreground"
                  : "text-muted-foreground hover:bg-secondary/40 hover:text-foreground"
              )}
            >
              <Icon
                className={cn("h-[18px] w-[18px]", active && "text-aura")}
                strokeWidth={active ? 2.4 : 1.9}
              />
              <span className={cn("tracking-wide", item.primary && "font-semibold text-foreground")}>
                {t(`nav.${item.key}`)}
              </span>
              {item.primary && (
                <span className="ml-auto rounded-full bg-violet/20 px-2 py-0.5 text-[9px] uppercase tracking-widest text-violet">
                  new
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="mt-6 flex flex-col gap-1 border-t border-border/50 pt-4">
        {MORE
          .filter((item) =>
            isAuthenticated || !["/events", "/community"].includes(item.to)
          )
          .map((item) => {
          const Icon = item.icon;
          const active = pathname === item.to || pathname.startsWith(`${item.to}/`);
          return (
            <button
              key={item.to}
              type="button"
              onClick={() => navigate({ to: item.to })}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2 text-[13px] transition",
                active ? "bg-secondary/80 text-foreground" : "text-muted-foreground hover:bg-secondary/40 hover:text-foreground"
              )}
            >
              <Icon className={cn("h-4 w-4", active && "text-aura")} />
              {item.label}
            </button>
          );
        })}
      </div>

      <div className="mt-8 rounded-2xl border border-border/70 bg-gradient-to-br from-violet/15 via-card/60 to-aura/10 p-4">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
            {t("arcade.coinsBalance")}
          </span>
          <Sparkles className="h-3.5 w-3.5 text-aura" />
        </div>
        <div className="mt-2 flex items-center gap-2">
          <Coins className="h-5 w-5 text-aura" />
          <span className="font-display text-2xl text-foreground">{coins}</span>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {t("common.level")} {level}
        </p>
        <button
          type="button"
          onClick={() => navigate({ to: "/rewards" })}
          className="mt-3 w-full rounded-xl bg-foreground/90 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-background transition hover:bg-foreground"
        >
          {t("arcade.rewards")}
        </button>
      </div>

      <div className="mt-auto flex items-center justify-between pt-6">
        <span className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">bengos.pl</span>
        <ThemeLangMenu />
      </div>
    </aside>
  );
}
