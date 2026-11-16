import { useCallback, useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";

function handleFromEmail(email) {
  const base = (email ?? "purre").split("@")[0].toLowerCase();
  return "@" + base.replace(/[^a-z0-9._]/g, "") || "@purre";
}

export async function ensureProfile(user) {
  if (!user?.id) return null;
  const page = await base44.entities.Profile.filter({ user_id: user.id }, { limit: 1 });
  const existing = page.items?.[0];
  if (existing) return existing;
  return base44.entities.Profile.create({
    user_id: user.id,
    display_name: user.full_name || user.email?.split("@")[0] || "Hodowca PURRE",
    handle: handleFromEmail(user.email),
  });
}

export function useProfile() {
  const { user, isAuthenticated, isLoadingAuth } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!isAuthenticated || !user?.id) {
      setProfile(null);
      return null;
    }
    const page = await base44.entities.Profile.filter({ user_id: user.id }, { limit: 1 });
    const next = page.items?.[0] ?? null;
    setProfile(next);
    return next;
  }, [isAuthenticated, user?.id]);

  useEffect(() => {
    if (isLoadingAuth) return;
    let active = true;
    setLoading(true);
    reload()
      .catch(() => null)
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isLoadingAuth, reload]);

  return { profile, loading, reload, setProfile };
}
