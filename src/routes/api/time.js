import { createFileRoute } from "@tanstack/react-router";

// Server route: returns the current server time. Kept for smoke tests and
// uptime checks — the self-hosted backend owns all real API endpoints under
// /api/* (proxied by nginx), so this route only serves /api/time on the
// frontend origin in local dev.
export const Route = createFileRoute("/api/time")({
  server: {
    handlers: {
      GET: async () => Response.json({ now: new Date().toISOString() }, { headers: { "cache-control": "no-store" } }),
    },
  },
});
