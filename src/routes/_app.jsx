import { useEffect } from "react";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import AppShell from "@/components/layout/AppShell";
import AssistantPanel from "@/components/assistant/AssistantPanel";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user?.id) return undefined;

    const syncReminders = () => {
      base44.pets.syncReminders().catch((error) => {
        console.warn(
          "[PURRE PETS] Nie udało się zsynchronizować przypomnień:",
          error?.message || error
        );
      });
    };

    syncReminders();

    const timer = window.setInterval(
      syncReminders,
      6 * 60 * 60 * 1000
    );

    return () => window.clearInterval(timer);
  }, [user?.id]);

  return (
    <AppShell>
      <Outlet />
      <AssistantPanel />
    </AppShell>
  );
}
