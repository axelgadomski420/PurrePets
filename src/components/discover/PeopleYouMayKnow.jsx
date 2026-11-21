import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { BadgeCheck, Users, UserPlus, RefreshCw } from "lucide-react";
import { Image } from "@/components/ui/image";
import { profileApi } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";

export default function PeopleYouMayKnow() {
  const { isAuthenticated, isLoadingAuth, navigateToLogin } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [followError, setFollowError] = useState("");

  const load = useCallback(async () => {
    if (isLoadingAuth || !isAuthenticated) return;
    setLoading(true);
    try {
      const result = await profileApi.suggestions(12);
      setError("");
      setItems(Array.isArray(result?.items) ? result.items : []);
    } catch {
      setError("Nie udało się pobrać rekomendacji.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, isLoadingAuth]);

  useEffect(() => {
    load();
  }, [load]);

  const follow = async (item) => {
    if (!isAuthenticated) {
      navigateToLogin();
      return;
    }
    if (!item?.user_id || busyId) return;
    setBusyId(item.user_id);
    setFollowError("");
    try {
      await profileApi.follow(item.user_id);
      setItems((current) => current.filter((row) => row.user_id !== item.user_id));
    } catch (err) {
      setFollowError(
        err?.message || "Nie udało się rozpocząć obserwowania. Spróbuj ponownie."
      );
    } finally {
      setBusyId("");
    }
  };

  if (isLoadingAuth || !isAuthenticated) return null;
  if (!loading && items.length === 0 && !error) return null;

  return (
    <section className="mb-5 min-w-0 rounded-2xl border border-border/70 bg-card/60 p-3 sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Users className="h-4 w-4 shrink-0 text-aura" />
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold">Osoby, które możesz znać</h2>
            <p className="text-[10px] text-muted-foreground">
              Wspólne kontakty, miasto i zainteresowania
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          aria-label="Odśwież rekomendacje"
          className="shrink-0 rounded-full border border-border/70 p-2 text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {error && <p role="status" className="mb-2 text-xs text-muted-foreground">{error}</p>}
      {followError && (
        <p role="alert" className="mb-2 text-xs text-destructive">
          {followError}
        </p>
      )}

      {loading && items.length === 0 ? (
        <div className="flex gap-3 overflow-hidden">
          {[0, 1, 2].map((n) => (
            <div key={n} className="h-28 min-w-[190px] animate-pulse rounded-xl bg-secondary/50" />
          ))}
        </div>
      ) : (
        <div className="flex snap-x gap-3 overflow-x-auto pb-1">
          {items.map((item) => (
            <article
              key={item.user_id}
              className="flex min-w-[190px] max-w-[220px] snap-start flex-col rounded-xl border border-border/60 bg-background/60 p-3"
            >
              <Link
                to="/profile/$id"
                params={{ id: item.user_id }}
                className="flex min-w-0 items-center gap-2"
              >
                <Image
                  src={item.avatar_url}
                  alt={item.name || item.display_name}
                  className="h-10 w-10 shrink-0 rounded-full object-cover"
                />
                <div className="min-w-0">
                  <p className="flex items-center gap-1 truncate text-xs font-semibold">
                    <span className="truncate">{item.name || item.display_name}</span>
                    {item.verified && <BadgeCheck className="h-3 w-3 shrink-0 text-aura" />}
                  </p>
                  <p className="truncate text-[10px] text-muted-foreground">
                    {item.city || item.breeds?.[0] || "Społeczność PURRE PETS"}
                  </p>
                </div>
              </Link>

              {item.mutual_count > 0 && (
                <p className="mt-2 text-[10px] text-muted-foreground">
                  {item.mutual_count} osób, które obserwujesz, obserwuje ten profil
                </p>
              )}

              <button
                type="button"
                onClick={() => follow(item)}
                disabled={!!busyId}
                className="mt-auto inline-flex items-center justify-center gap-1.5 rounded-lg bg-foreground px-3 py-2 text-[11px] font-semibold text-background transition hover:opacity-85 disabled:opacity-50"
              >
                <UserPlus className="h-3.5 w-3.5" />
                {busyId === item.user_id ? "Zapisywanie..." : "Obserwuj"}
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
