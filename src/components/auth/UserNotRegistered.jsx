import { useI18n } from "@/lib/i18n";
import { UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/AuthContext";
import { AuthLayout } from "./AuthLayout";

// Signed in to Base44, but not a user of this app (invite-only apps).
export function UserNotRegistered() {
  const { t } = useI18n();
  const { logout } = useAuth();
  return (
    <AuthLayout icon={UserX} title={t("auth.accessDeniedTitle")} subtitle={t("auth.accessDeniedSubtitle")}>
      <p className="mb-6 text-center text-sm text-foreground">{t("auth.accessDeniedBody")}</p>
      <Button variant="outline" className="h-12 w-full font-medium" onClick={logout}>
        {t("auth.signOut")}
      </Button>
    </AuthLayout>
  );
}
