import { createFileRoute, Outlet } from "@tanstack/react-router";
import AppShell from "@/components/layout/AppShell";
import AssistantPanel from "@/components/assistant/AssistantPanel";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  return (
    <AppShell>
      <Outlet />
      <AssistantPanel />
    </AppShell>
  );
}
