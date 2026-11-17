import { useNavigate } from "@tanstack/react-router";
import Brand from "@/components/common/Brand";
import ThemeLangMenu from "@/components/layout/ThemeLangMenu";
import NotificationBell from "@/components/layout/NotificationBell";

export default function TopBar({ title }) {
  const navigate = useNavigate();
  return (
    <header className="sticky top-0 z-30 flex min-w-0 items-center justify-between gap-2 border-b border-border/50 bg-background/75 px-3 py-3 backdrop-blur-xl lg:hidden">
      <div className="min-w-0 shrink"><Brand compact /></div>
      <div className="flex shrink-0 items-center gap-1.5">
        <ThemeLangMenu />
        <NotificationBell />
        <button
          type="button"
          onClick={() => navigate({ to: "/profile" })}
          className="grid h-10 w-10 place-items-center rounded-xl border border-border/70 bg-card/60 text-[11px] font-semibold text-muted-foreground"
          aria-label={title ?? "Profil"}
        >
          PP
        </button>
      </div>
    </header>
  );
}
