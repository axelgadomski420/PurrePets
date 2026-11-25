export async function signInWithProvider(provider, returnTo) {
  if (provider !== "google") {
    throw new Error("Ta metoda logowania nie jest dostępna.");
  }

  const target = new URL("/api/auth/google", window.location.origin);
  target.searchParams.set("returnTo", returnTo ?? window.location.href);
  window.location.assign(target.href);
}
