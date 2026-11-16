import { useNavigate } from "@tanstack/react-router";
import Brand from "@/components/common/Brand";
import ThemeLangMenu from "@/components/layout/ThemeLangMenu";
import NotificationBell from "@/components/layout/NotificationBell";

export default function TopBar({ title }) {
  const navigate = useNavigate();
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border/50 bg-background/75 px-4 py-3 backdrop-blur-xl lg:hidden">
      <Brand />
      <div className="flex items-center gap-2">
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
