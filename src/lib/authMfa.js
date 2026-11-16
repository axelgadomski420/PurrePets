// Simplified sign-in helpers for the self-hosted backend (replaces the Base44
// platform MFA routes). The backend does not enable MFA, so login always returns
// { access_token, user } and the MFA UI path stays dormant.

import base44 from "@/api/base44Client";
import { safeReturnTo } from "@/lib/authReturnTo";

export async function loginWithMfa(email, password) {
  // Same call/signature as before; the backend never returns mfa_required.
  return base44.auth.loginWithPassword(email, password);
}

// MFA is disabled on the self-hosted backend: finishing sign-in is a plain redirect.
export async function continueMfa(_result, returnTo) {
  window.location.href = returnTo || safeReturnTo();
}

// Social login is not configured on the self-hosted backend.
export async function loginWithSocial(provider, returnTo) {
  if (provider === "google") {
    window.location.assign(\`/api/auth/google?returnTo=\${encodeURIComponent(returnTo ?? window.location.href)}\`);
    return;
  }
  window.location.assign(\`/login?returnTo=\${encodeURIComponent(returnTo ?? window.location.href)}\`);
}

export function loginWithGoogle(returnTo) {
  return loginWithSocial("google", returnTo);
}
