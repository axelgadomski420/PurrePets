// PURRE PETS — custom server entry TanStack Start: uniwersalny handler \`{ fetch }\` (Request → Response),
// zgodny z dokumentacją (guide/server-entry-point) i z runtime Node.js/Nitro. Raportowanie błędów tras
// (error-capture) działa jak poprzednio; dla odwiedzającego odpowiedź jest niezmieniona.
import { createStartHandler, defaultStreamHandler } from "@tanstack/react-start/server";
import { recordRouteError } from "@/lib/error-capture.server";

// Runs once the router has loaded the page.
const handler = createStartHandler((ctx) => {
  for (const match of ctx.router.state.matches) {
    if (match.status === "error") recordRouteError(ctx.request, match.error, match.routeId);
  }
  return defaultStreamHandler(ctx);
});

export default { fetch: handler };
