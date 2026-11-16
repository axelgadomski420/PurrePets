// Standalone replacement for the Base44 SDK app-params helper.
// Keeps only what still makes sense without the Base44 platform:
// the ?clear_access_token=true escape hatch used by auth flows.

const isBrowser = typeof window !== "undefined";

const isClearAccessTokenRequested = () =>
  isBrowser && new URLSearchParams(window.location.search).get("clear_access_token") === "true";

const clearStoredAccessToken = () => {
  try {
    window.localStorage.removeItem("purre_access_token");
    window.localStorage.removeItem("purre:token");
    window.localStorage.removeItem("base44_access_token");
    window.localStorage.removeItem("token");
  } catch {
    // localStorage może być zablokowany (tryb prywatny) — ignorujemy.
  }
};

export function getAppParams() {
  if (isClearAccessTokenRequested()) clearStoredAccessToken();
  return {
    appId: null,
    token: null,
    functionsVersion: null,
    appBaseUrl: null,
  };
}

export { clearStoredAccessToken };
