import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Search, SlidersHorizontal, MapPin, X, Users, PawPrint,
  FileText, UsersRound, CalendarDays, Music2, Hash, Loader2,
} from "lucide-react";
import TopBar from "@/components/layout/TopBar";
import ListingCard from "@/components/explore/ListingCard";
import { base44, searchApi } from "@/api/base44Client";
import { useI18n } from "@/lib/i18n";
import { CITY_NAMES } from "@/lib/geo";
import { useProfile } from "@/lib/useProfile";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/explore")({
  head: () => ({
    meta: [
      { title: "PURRE PETS — Explore" },
      { name: "description", content: "Wyszukuj osoby, hodowle, zwierzęta, ogłoszenia i społeczność PURRE PETS." },
    ],
  }),
  component: ExplorePage,
});

const SORTS = [
  { id: "new", label: "sortNewest" },
  { id: "distance", label: "sortDistance" },
  { id: "price_asc", label: "sortPriceAsc" },
  { id: "price_desc", label: "sortPriceDesc" },
];

function ResultSection({ title, icon: Icon, items, children }) {
  if (!items?.length) return null;
  return (
    <section className="min-w-0">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <Icon className="h-4 w-4 text-aura" />
        {title}
        <span className="text-xs font-normal text-muted-foreground">{items.length}</span>
      </h2>
      <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {children}
      </div>
    </section>
  );
}

function ResultCard({ children, to, params, search, onClick }) {
  const cls = "flex min-w-0 items-center gap-3 rounded-xl border border-border/70 bg-card/60 p-3 text-left transition hover:border-aura/50";
  if (onClick) {
    return <button type="button" onClick={onClick} className={cls}>{children}</button>;
  }
  if (to) {
    return <Link to={to} params={params} search={search} className={cls}>{children}</Link>;
  }
  return <div className={cls}>{children}</div>;
}

function ResultAvatar({ src, fallback }) {
  return (
    <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full bg-secondary text-sm font-semibold">
      {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : (fallback || "PP")}
    </div>
  );
}

function ExplorePage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { profile } = useProfile();

  const [kind, setKind] = useState("all");
  const [species, setSpecies] = useState("all");
  const [sort, setSort] = useState("new");
  const [city, setCity] = useState("");
  const [search, setSearch] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [searchAttempt, setSearchAttempt] = useState(0);
  const [globalResults, setGlobalResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const query = search.trim();
  const hasGlobalQuery = query.length >= 2;

  // Globalne wyszukiwanie: automatycznie po wpisaniu oraz natychmiast po Enter.
  useEffect(() => {
    if (query.length < 2) {
      setGlobalResults(null);
      setSearchError("");
      setSearching(false);
      return undefined;
    }

    let active = true;
    const timer = window.setTimeout(async () => {
      setSearching(true);
      setSearchError("");
      try {
        const result = await searchApi.search(query, "all");
        if (active) setGlobalResults(result || {});
      } catch (error) {
        if (active) {
          setGlobalResults(null);
          setSearchError(
            error?.message || "Nie udało się wyszukać. Sprawdź połączenie i spróbuj ponownie."
          );
        }
      } finally {
        if (active) setSearching(false);
      }
    }, submittedQuery === query ? 0 : 350);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [query, submittedQuery, searchAttempt]);

  // Zwykła lista ogłoszeń, gdy użytkownik nie prowadzi wyszukiwania globalnego.
  useEffect(() => {
    if (hasGlobalQuery) {
      setLoading(false);
      return undefined;
    }

    let active = true;
    setLoading(true);
    const where = { status: { $in: ["active", "sold"] } };
    if (kind !== "all") where.kind = kind;
    if (species !== "all") where.species = species;
    if (city) where.city = city;

    const order =
      sort === "price_asc" ? "price" :
      sort === "price_desc" ? "-price" : "-created_date";

    base44.entities.Listing.filter(where, { sort: order, limit: 48 })
      .then((page) => {
        if (active) setItems(page.items ?? []);
      })
      .catch(() => {
        if (active) setItems([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [kind, species, sort, city, hasGlobalQuery]);

  const fromCity = useMemo(() => city || profile?.city || "", [city, profile?.city]);

  const sorted = useMemo(() => {
    if (sort !== "distance") return items;
    return [...items].sort((a, b) => {
      const da = a.city === fromCity ? 0 : 1;
      const db = b.city === fromCity ? 0 : 1;
      return da - db;
    });
  }, [items, sort, fromCity]);

  const totalResults = globalResults
    ? ["people", "posts", "listings", "groups", "audio", "events", "pets", "tags"]
        .reduce((sum, key) => sum + (globalResults[key]?.length || 0), 0)
    : 0;

  const clearSearch = () => {
    setSearch("");
    setGlobalResults(null);
    setSearchError("");
    setSubmittedQuery("");
  };

  return (
    <div className="min-w-0 w-full">
      <TopBar />
      <div className="mx-auto min-w-0 max-w-7xl px-3 pb-12 pt-5 sm:px-4 lg:px-8">
        <p className="text-[10px] uppercase tracking-[0.4em] text-muted-foreground">purre pets</p>
        <h1 className="mt-2 font-display text-4xl tracking-tight sm:text-5xl">
          <span className="aura-text">{t("explore.title")}</span>
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Szukaj osób, hodowli, zwierząt, ogłoszeń i całej społeczności.
        </p>

        <form
          className="mt-5 flex min-w-0 items-center gap-2 rounded-xl border border-border/70 bg-card/60 px-3 focus-within:border-aura/60"
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            setSubmittedQuery(search.trim());
            setSearchAttempt((value) => value + 1);
          }}
        >
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Osoba, @profil, hodowla, rasa, zwierzę, ogłoszenie…"
            aria-label="Szukaj w PURRE PETS"
            className="h-12 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
          />
          {searching && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-aura" />}
          {search && (
            <button
              type="button"
              onClick={clearSearch}
              aria-label="Wyczyść wyszukiwanie"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-secondary"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <button
            type="submit"
            className="min-h-9 shrink-0 rounded-lg bg-foreground px-3 text-xs font-semibold text-background"
          >
            Szukaj
          </button>
        </form>

        {hasGlobalQuery ? (
          <div className="mt-6 min-w-0 space-y-6">
            <div className="flex min-w-0 items-center justify-between gap-3">
              <p className="min-w-0 truncate text-xs text-muted-foreground">
                Wyniki dla: <strong className="text-foreground">{query}</strong>
              </p>
              {searching && <span className="shrink-0 text-xs text-muted-foreground">Wyszukiwanie…</span>}
              {!searching && globalResults && (
                <span className="shrink-0 text-xs text-muted-foreground">{totalResults} wyników</span>
              )}
            </div>

            {searchError && (
              <div className="rounded-xl border border-destructive/40 p-4 text-sm text-destructive">
                {searchError}
                <button
                  type="button"
                  onClick={() => {
                    setSubmittedQuery(search.trim());
                    setSearchAttempt((value) => value + 1);
                  }}
                  className="ml-2 underline"
                >
                  Spróbuj ponownie
                </button>
              </div>
            )}

            {!globalResults && searching && (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" /> Szukam w PURRE PETS…
              </div>
            )}

            {globalResults && (
              <>
                <ResultSection title="Osoby i hodowle" icon={Users} items={globalResults.people}>
                  {globalResults.people.map((person) => (
                    <ResultCard key={person.id} to="/profile/$id" params={{ id: person.user_id }}>
                      <ResultAvatar src={person.avatar_url} fallback={(person.display_name || "U").slice(0, 1)} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">
                          {person.kennel_name || person.display_name || "Użytkownik"}
                          {person.verified ? " ✓" : ""}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {person.handle ? `@${person.handle.replace(/^@/, "")} · ` : ""}
                          {person.city || (person.account_type === "breeder" ? "Hodowca" : "Użytkownik")}
                        </p>
                      </div>
                    </ResultCard>
                  ))}
                </ResultSection>

                <ResultSection title="Ogłoszenia" icon={FileText} items={globalResults.listings}>
                  {globalResults.listings.map((listing) => (
                    <ResultCard key={listing.id} to="/listings/$id" params={{ id: listing.id }}>
                      <ResultAvatar src={listing.image_urls?.[0]} fallback="🐾" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{listing.title}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {[listing.breed, listing.city, listing.price != null ? `${listing.price} zł` : ""].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                    </ResultCard>
                  ))}
                </ResultSection>

                <ResultSection title="Zwierzęta" icon={PawPrint} items={globalResults.pets}>
                  {globalResults.pets.map((pet) => (
                    <ResultCard key={pet.id} to="/pets/$id" params={{ id: pet.id }}>
                      <ResultAvatar src={pet.photos?.[0]} fallback="🐾" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{pet.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {[pet.breed, pet.city, pet.owner_name].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                    </ResultCard>
                  ))}
                </ResultSection>

                <ResultSection title="Posty i publikacje" icon={FileText} items={globalResults.posts}>
                  {globalResults.posts.map((post) => (
                    <ResultCard
                      key={post.id}
                      to={!post.video_url && post.author_id ? "/profile/$id" : undefined}
                      params={!post.video_url && post.author_id ? { id: post.author_id } : undefined}
                      onClick={post.video_url ? () => navigate({ to: "/reels" }) : undefined}
                    >
                      <ResultAvatar src={post.image_url || post.author_avatar} fallback="✦" />
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-sm">{post.caption}</p>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {post.author_name || "PURRE PETS"} · {post.likes || 0} polubień
                        </p>
                      </div>
                    </ResultCard>
                  ))}
                </ResultSection>

                <ResultSection title="Grupy i społeczności" icon={UsersRound} items={globalResults.groups}>
                  {globalResults.groups.map((group) => (
                    <ResultCard key={group.id} to="/community/$id" params={{ id: group.id }}>
                      <ResultAvatar src={group.cover_url} fallback="👥" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{group.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {group.members_count || 0} członków
                          {group.breed ? ` · ${group.breed}` : ""}
                        </p>
                      </div>
                    </ResultCard>
                  ))}
                </ResultSection>

                <ResultSection title="Wydarzenia" icon={CalendarDays} items={globalResults.events}>
                  {globalResults.events.map((event) => (
                    <ResultCard key={event.id} to="/events">
                      <ResultAvatar src={event.cover_url} fallback="📅" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{event.title}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {[event.city, event.start_date ? new Date(event.start_date).toLocaleDateString("pl-PL") : ""].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                    </ResultCard>
                  ))}
                </ResultSection>

                <ResultSection title="Audio i muzyka" icon={Music2} items={globalResults.audio}>
                  {globalResults.audio.map((audio) => (
                    <ResultCard
              key={audio.id}
              to="/video-editor"
              search={{
                music: JSON.stringify({
                  id: audio.id,
                  title: audio.title,
                  artist: audio.artist ?? null,
                  url: audio.url,
                  duration: audio.duration ?? null,
                  mood: audio.mood ?? null,
                  source: audio.source ?? null,
                }),
              }}
            >
                      <ResultAvatar fallback="♫" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{audio.title}</p>
                        <p className="truncate text-xs text-muted-foreground">{audio.artist || audio.mood || "Audio PURRE PETS"}</p>
                      </div>
                    </ResultCard>
                  ))}
                </ResultSection>

                <ResultSection title="Hashtagi" icon={Hash} items={globalResults.tags}>
                  {globalResults.tags.map((tag) => (
                    <button
                      key={tag.name}
                      type="button"
                      onClick={() => {
                        const nextQuery = `#${tag.name.replace(/^#/, "")}`;
                        setSearch(nextQuery);
                        setSubmittedQuery(nextQuery);
                        setSearchAttempt((value) => value + 1);
                      }}
                      className="rounded-xl border border-border/70 bg-card/60 p-3 text-left text-sm hover:border-aura/50"
                    >
                      <span className="font-semibold text-aura">#{tag.name.replace(/^#/, "")}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{tag.count} postów</span>
                    </button>
                  ))}
                </ResultSection>

                {!searching && totalResults === 0 && !searchError && (
                  <div className="rounded-xl border border-dashed border-border/70 p-8 text-center">
                    <Search className="mx-auto h-7 w-7 text-muted-foreground" />
                    <p className="mt-3 text-sm font-medium">Nie znaleziono wyników</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Spróbuj wpisać nazwę hodowli, osobę, rasę lub inne hasło.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          <>
            <div className="mt-5 flex flex-col gap-3">
              <div className="flex min-w-0 items-center gap-2 pb-1 flex-wrap">
                {[
                  { id: "all", label: t("common.all") },
                  { id: "sale", label: "Reproduktor" },
                  { id: "adoption", label: "Adopcja" },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setKind(item.id)}
                    className={cn(
                      "shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition",
                      kind === item.id ? "bg-foreground text-background" : "border border-border/70 text-muted-foreground"
                    )}
                  >
                    {item.label}
                  </button>
                ))}
                <span className="mx-1 h-5 w-px shrink-0 bg-border" />
                {[
                  { id: "all", label: t("common.all") },
                  { id: "dog", label: t("explore.dogs") },
                  { id: "cat", label: t("explore.cats") },
                ].map((item) => (
                  <button
                    key={`species-${item.id}`}
                    type="button"
                    onClick={() => setSpecies(item.id)}
                    className={cn(
                      "shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition",
                      species === item.id ? "bg-violet/20 text-violet" : "border border-border/70 text-muted-foreground"
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="flex items-center gap-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  <SlidersHorizontal className="h-3 w-3" /> {t("explore.sortNewest").split(" ")[0]}
                </span>
                {SORTS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSort(item.id)}
                    className={cn(
                      "rounded-lg px-2.5 py-1 text-[11px] transition",
                      sort === item.id ? "bg-secondary text-foreground" : "text-muted-foreground"
                    )}
                  >
                    {t(`explore.${item.label}`)}
                  </button>
                ))}
                <span className="flex min-w-0 items-center gap-1 rounded-lg border border-border/70 px-2 py-1 sm:ml-auto">
                  <MapPin className="h-3 w-3 shrink-0 text-aura" />
                  <select
                    value={city}
                    onChange={(event) => setCity(event.target.value)}
                    className="max-w-[180px] min-w-0 bg-transparent text-[11px] text-foreground outline-none"
                  >
                    <option value="">{t("explore.nearMe")}</option>
                    {CITY_NAMES.map((name) => (
                      <option key={name} value={name} className="bg-popover text-foreground">{name}</option>
                    ))}
                  </select>
                </span>
              </div>
            </div>

            <p className="mt-6 text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
              {sorted.length} {t("explore.results")}
            </p>

            {loading ? (
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                {Array.from({ length: 8 }).map((_, index) => (
                  <div key={index} className="h-56 animate-pulse rounded-[var(--radius)] bg-secondary/40" />
                ))}
              </div>
            ) : sorted.length === 0 ? (
              <div className="mt-10 rounded-[var(--radius)] border border-dashed border-border/70 p-10 text-center">
                <p className="text-sm text-muted-foreground">{t("explore.noResults")}</p>
                <button
                  type="button"
                  onClick={() => navigate({ to: "/create" })}
                  className="btn-aura mt-4 rounded-xl px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em]"
                >
                  {t("nav.add")}
                </button>
              </div>
            ) : (
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                {sorted.map((listing) => (
                  <ListingCard key={listing.id} listing={listing} fromCity={fromCity} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
