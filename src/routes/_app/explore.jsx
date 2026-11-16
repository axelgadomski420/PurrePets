import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Search, SlidersHorizontal, MapPin } from "lucide-react";
import TopBar from "@/components/layout/TopBar";
import ListingCard from "@/components/explore/ListingCard";
import { base44 } from "@/api/base44Client";
import { useI18n } from "@/lib/i18n";
import { CITY_NAMES } from "@/lib/geo";
import { useProfile } from "@/lib/useProfile";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/explore")({
  head: () => ({
    meta: [
      { title: "PURRE PETS — Explore marketplace" },
      { name: "description", content: "Ogłoszenia hodowli psów i kotów rasowych z filtrem lokalizacji i ceny." },
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

function ExplorePage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { profile } = useProfile();
  const [kind, setKind] = useState("all");
  const [species, setSpecies] = useState("all");
  const [sort, setSort] = useState("new");
  const [city, setCity] = useState("");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const query = { status: { $in: ["active", "sold"] } };
    if (kind !== "all") query.kind = kind;
    if (species !== "all") query.species = species;
    if (city) query.city = city;
    if (search.trim()) query.title = { $regex: search.trim() };

    const order =
      sort === "price_asc" ? "price" : sort === "price_desc" ? "-price" : "-created_date";

    base44.entities.Listing.filter(query, { sort: order, limit: 48 })
      .then((page) => {
        if (active) setItems(page.items ?? []);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [kind, species, sort, city, search]);

  const fromCity = useMemo(() => city || profile?.city || "", [city, profile?.city]);

  const sorted = useMemo(() => {
    if (sort !== "distance") return items;
    const parse = (value) => (value ? Number.parseFloat(String(value)) : Infinity);
    return [...items].sort((a, b) => {
      const da = a.city === fromCity ? 0 : parse(a.city === fromCity ? "0" : null);
      const db = b.city === fromCity ? 0 : parse(b.city === fromCity ? "0" : null);
      return da - db;
    });
  }, [items, sort, fromCity]);

  return (
    <div>
      <TopBar />
      <div className="px-4 pb-12 pt-6 lg:px-8">
        <p className="text-[10px] uppercase tracking-[0.4em] text-muted-foreground">purre pets</p>
        <h1 className="mt-2 font-display text-4xl tracking-tight sm:text-5xl">
          <span className="aura-text">{t("explore.title")}</span>
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("explore.subtitle")}</p>

        <div className="mt-5 flex flex-col gap-3">
          <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-card/60 px-3">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={`${t("common.search")}: rasa, hodowla, miasto…`}
              className="h-11 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
            />
          </div>

          <div className="no-scrollbar flex items-center gap-2 overflow-x-auto pb-1">
            {[
              { id: "all", label: t("common.all") },
              { id: "sale", label: t("explore.listings") },
              { id: "adoption", label: t("explore.adoptions") },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setKind(item.id)}
                className={cn(
                  "shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition",
                  kind === item.id
                    ? "bg-foreground text-background"
                    : "border border-border/70 text-muted-foreground hover:text-foreground"
                )}
              >
                {item.label}
              </button>
            ))}
            <span className="mx-1 h-5 w-px bg-border" />
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
                  species === item.id
                    ? "bg-violet/20 text-violet"
                    : "border border-border/70 text-muted-foreground hover:text-foreground"
                )}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
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
                  sort === item.id
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t(`explore.${item.label}`)}
              </button>
            ))}
            <span className="ml-auto flex items-center gap-1 rounded-lg border border-border/70 px-2 py-1">
              <MapPin className="h-3 w-3 text-aura" />
              <select
                value={city}
                onChange={(event) => setCity(event.target.value)}
                className="bg-transparent text-[11px] text-foreground outline-none"
              >
                <option value="">{t("explore.nearMe")}</option>
                {CITY_NAMES.map((name) => (
                  <option key={name} value={name} className="bg-popover text-foreground">
                    {name}
                  </option>
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
      </div>
    </div>
  );
}
