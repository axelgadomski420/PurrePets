import { createMiddleware } from "@tanstack/react-start";
import { getRequest, setResponseStatus } from "@tanstack/react-start/server";

// Standalone: brak platformy Base44 — middleware są przepustowe, a \`context.getBase44()\`
// zwraca null (żaden handler już nie korzysta z klienta platformy).
const withGetBase44 = (next) => next({ context: { getBase44: () => null } });

// Applied to every server function by src/start.js: sends the visitor's access
// token with the call. Anonymous visitors send nothing.
export const authMiddleware = createMiddleware({ type: "function" })
  .client(async ({ next }) => {
    let token = null;
    try {
      token = typeof window === "undefined" ? null : (localStorage.getItem("purre_access_token") ?? localStorage.getItem("purre:token"));
    } catch { /* localStorage może być niedostępny. */ }
    return next({ headers: token ? { Authorization: \`Bearer \${token}\` } : {} });
  })
  .server(({ next }) => withGetBase44(next));

// Applied to every request by src/start.js.
export const base44RequestMiddleware = createMiddleware({ type: "request" }).server(({ next }) =>
  withGetBase44(next),
);

// Only a present Bearer token means "possibly signed in" — pełną weryfikację JWT
// wykonuje backend (Express + /api/auth/me). Serwer-function nie korzysta już z sesji.
const bearerOf = () => {
  try {
    const header = getRequest().headers.get("authorization") ?? "";
    return header.startsWith("Bearer ") ? header.slice(7) : null;
  } catch {
    return null;
  }
};

// Middleware dla server function wymagającej zalogowanego wywołania:
//   createServerFn().middleware([requireUser]).handler(({ context }) => context.user)
export const requireUser = createMiddleware({ type: "function" }).server(async ({ next }) => {
  if (!bearerOf()) {
    setResponseStatus(401);
    throw Object.assign(new Error("Unauthorized"), { status: 401, code: "UNAUTHORIZED" });
  }
  return next({});
});

// The same for a server route: anonymous callers get 401.
export const requireUserRoute = createMiddleware({ type: "request" }).server(async ({ next }) => {
  if (!bearerOf()) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return next({});
});
