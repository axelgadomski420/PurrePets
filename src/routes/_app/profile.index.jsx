import { createFileRoute } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import TopBar from "@/components/layout/TopBar";
import ProfileView from "@/components/profile/ProfileView";
import { useAuth } from "@/lib/AuthContext";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_app/profile/")({
  ssr: false,
  head: () => ({ meta: [{ title: "PURRE PETS — profil" }] }),
  component: OwnProfilePage,
});

/** Profil własny = ten sam wspólny komponent co profil publiczny (PROFIL ULTRA). */
function OwnProfilePage() {
  const { t } = useI18n();
  const { user, isAuthenticated, isLoadingAuth, navigateToLogin, logout } = useAuth();

  if (isLoadingAuth) {
    return <div className="p-6 text-sm text-muted-foreground">{t("common.loading")}</div>;
  }

  if (!isAuthenticated || !user) {
    return (
      <div>
        <TopBar />
        <div className="px-4 py-16 text-center">
          <h1 className="font-display text-3xl">{t("auth.welcome")}</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">{t("auth.signInHint")}</p>
          <button
            type="button"
            onClick={navigateToLogin}
            className="btn-aura mt-6 rounded-xl px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.2em]"
          >
            {t("common.login")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <TopBar />
      <div className="px-4 pb-12 pt-6 lg:px-8">
        <ProfileView profileId={user.id} />
        <button
          type="button"
          onClick={logout}
          className="mt-8 flex items-center gap-2 rounded-xl border border-border/70 px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground transition hover:text-destructive"
        >
          <LogOut className="h-3.5 w-3.5" /> {t("common.logout")}
        </button>
      </div>
    </div>
  );
}
