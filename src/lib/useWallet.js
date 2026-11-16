import { useCallback, useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";

export function useWallet() {
  const { user, isLoadingAuth } = useAuth();
  const [wallet, setWallet] = useState(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!user?.id) {
      setWallet(null);
      return null;
    }
    const page = await base44.entities.Wallet.filter({ user_id: user.id }, { limit: 1 });
    const next = page.items?.[0] ?? null;
    setWallet(next);
    return next;
  }, [user?.id]);

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

  useEffect(() => {
    if (!user?.id) return undefined;
    const unsubscribe = base44.entities.Wallet.subscribe((event) => {
      if (event.data?.user_id === user.id) setWallet(event.data);
    });
    return unsubscribe;
  }, [user?.id]);

  return {
    wallet,
    coins: wallet?.coins ?? 0,
    xp: wallet?.xp ?? 0,
    level: wallet?.level ?? 1,
    loading,
    reload,
  };
}
