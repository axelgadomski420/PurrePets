import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Loader2, Search, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Image } from "@/components/ui/image";
import { useAuth } from "@/lib/AuthContext";
import { openConversation } from "@/lib/conversations";

export default function NewChatDialog({ open, onClose }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState(null);

  // Wyszukiwanie osób po stronie serwera. Nie zastępujemy pustych
  // wyników TOP-60, bo ukrywało to błędy i pomijało mniej popularne profile.
  useEffect(() => {
    if (!open) return undefined;

    let active = true;
    const needle = query.trim();
    setLoading(true);

    const timer = setTimeout(async () => {
      try {
        if (needle.length >= 2) {
          const res = await base44.search.search(needle, "people");
          if (active) {
            setProfiles(Array.isArray(res?.people) ? res.people : []);
          }
        } else {
          const page = await base44.entities.Profile.list({
            sort: "-followers",
            limit: 60,
          });
          if (active) setProfiles(page.items ?? []);
        }
      } catch (error) {
        if (active) {
          setProfiles([]);
          console.error("Wyszukiwanie osób nie powiodło się:", error);
        }
      } finally {
        if (active) setLoading(false);
      }
    }, 300);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [open, query]);

  if (!open) return null;

  const needle = query.trim().toLowerCase();
  // Serwer już przefiltrował wyniki. Nie filtrujemy ich ponownie,
  // bo odrzucało to dopasowania po rasie i opisie profilu.
  const results = profiles.filter(
    (profile) => profile.user_id && profile.user_id !== user?.id
  );

  const start = async (profile) => {
    setBusyId(profile.id);
    try {
      const conversation = await openConversation({
        me: user,
        otherId: profile.user_id,
        otherName: profile.kennel_name || profile.display_name,
      });
      if (conversation) {
        onClose();
        navigate({ to: "/messages/$id", params: { id: conversation.id } });
      }
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/60 backdrop-blur-sm sm:items-center sm:justify-center">
      <div className="flex max-h-[85vh] w-full max-w-md flex-col rounded-t-[var(--radius)] border border-border/70 bg-card/95 sm:rounded-[var(--radius)]">
        <header className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
          <p className="text-sm font-semibold">Nowa rozmowa</p>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto grid h-8 w-8 place-items-center rounded-lg border border-border/70"
            aria-label="Zamknij"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </header>

        <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2.5">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Szukaj hodowli lub użytkownika"
            className="h-9 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/70"
          />
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {!loading && results.length === 0 ? (
            <p className="px-3 py-8 text-center text-[11px] text-muted-foreground">
              {needle.length >= 2
                ? "Brak wyników dla tej frazy."
                : "Brak kont do wyświetlenia. Profile powstają przy pierwszym wejściu w swój profil."}
            </p>
          ) : (
            <ul className="space-y-1">
              {results.map((profile) => (
                <li key={profile.id}>
                  <button
                    type="button"
                    onClick={() => start(profile)}
                    disabled={!!busyId}
                    className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-secondary/60 disabled:opacity-60"
                  >
                    <Image
                      src={profile.avatar_url}
                      alt={profile.display_name}
                      className="h-9 w-9 rounded-full object-cover"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium">
                        {profile.kennel_name || profile.display_name}
                      </span>
                      <span className="block truncate text-[10px] text-muted-foreground">
                        {profile.handle}
                        {profile.city ? ` · ${profile.city}` : ""}
                        {profile.account_type === "breeder" ? " · hodowca" : ""}
                      </span>
                    </span>
                    {busyId === profile.id && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
