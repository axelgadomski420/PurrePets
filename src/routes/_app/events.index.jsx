import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AuthGateError, requireSignedIn } from "@/components/auth/AuthGate";
import { CalendarDays, MapPin, Ticket } from "lucide-react";
import { toast } from "sonner";
import TopBar from "@/components/layout/TopBar";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { CITY_NAMES } from "@/lib/geo";

export const Route = createFileRoute("/_app/events/")({
  ssr: false,
  beforeLoad: requireSignedIn,
  errorComponent: AuthGateError,
  head: () => ({ meta: [{ title: "PURRE PETS — Wydarzenia" }] }),
  component: EventsPage,
});

const RADAR = [
  {
    id: "radar-waw",
    title: "Międzynarodowa Wystawa Kotów",
    description: "Ringuje FIFE. Bilety dla publiczności za PURRE Coins.",
    city: "Warszawa",
    location: "Ptak Warsaw Expo",
    start_date: new Date(Date.now() + 1000 * 60 * 60 * 24 * 18).toISOString(),
    price_coins: 40,
    organizer_name: "PURRE PETS",
    going: 86,
    has_ticket: false,
    offline: true,
  },
  {
    id: "radar-krk",
    title: "Zuchwała Wystawa Psów",
    description: "Open show, ocena szczeniąt i spotkanie klubów rasowych.",
    city: "Kraków",
    location: "Tauron Arena",
    start_date: new Date(Date.now() + 1000 * 60 * 60 * 24 * 32).toISOString(),
    price_coins: 0,
    organizer_name: "PURRE PETS",
    going: 54,
    has_ticket: false,
    offline: true,
  },
  {
    id: "radar-wro",
    title: "Targi PURRE",
    description: "Hodowle, żywienie i adopcje.",
    city: "Wrocław",
    location: "Hala Stulecia",
    start_date: new Date(Date.now() + 1000 * 60 * 60 * 24 * 46).toISOString(),
    price_coins: 80,
    organizer_name: "PURRE PETS",
    going: 120,
    has_ticket: false,
    offline: true,
  },
];

function formatWhen(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pl-PL", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function EventsPage() {
  const { isAuthenticated, navigateToLogin } = useAuth();
  const [city, setCity] = useState("");
  const [events, setEvents] = useState([]);
  const [offline, setOffline] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: "",
    city: "Warszawa",
    location: "",
    start_date: "",
    price_coins: 0,
    description: "",
  });

  const load = () => {
    setLoading(true);
    setLoadError("");
    base44.social
      .events(city)
      .then((page) => {
        setEvents(Array.isArray(page?.items) ? page.items : []);
        setOffline(false);
      })
      .catch((error) => {
        // Przykładowy radar pokazujemy wyłącznie przy rzeczywistym
        // problemie sieciowym. Błędy HTTP nie mogą być maskowane.
        if (error?.name === "ApiNetworkError") {
          setOffline(true);
          setEvents(RADAR.filter((event) => !city || event.city === city));
          return;
        }

        setOffline(false);
        setEvents([]);

        const status = Number(error?.status || 0);
        if (status === 401) {
          setLoadError("Sesja wygasła. Zaloguj się ponownie i odśwież radar.");
        } else if (status === 403) {
          setLoadError("Nie masz uprawnień do wyświetlenia wydarzeń.");
        } else if (status >= 500) {
          setLoadError("Serwer nie może teraz pobrać wydarzeń. Spróbuj ponownie później.");
        } else {
          setLoadError(error?.message || "Nie udało się pobrać wydarzeń.");
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city]);

  const visible = useMemo(() => events, [events]);

  const buy = async (event) => {
    if (event.offline) {
      toast.error("Bilety ruszą po aktualizacji bazy (prisma db push).");
      return;
    }
    if (!isAuthenticated) {
      navigateToLogin();
      return;
    }
    setBusy(event.id);
    try {
      const result = await base44.social.buyTicket(event.id);
      toast.success(result.already ? "Masz już bilet" : `Bilet zapisany · ${result.coins_paid} monet`);
      load();
    } catch (error) {
      toast.error(error?.message ?? "Nie udało się kupić biletu");
    } finally {
      setBusy("");
    }
  };

  const create = async (submitEvent) => {
    submitEvent.preventDefault();
    if (!isAuthenticated) {
      navigateToLogin();
      return;
    }
    setBusy("create");
    try {
      await base44.social.createEvent({
        title: form.title,
        city: form.city,
        location: form.location || undefined,
        description: form.description || undefined,
        price_coins: Number(form.price_coins) || 0,
        start_date: new Date(form.start_date).toISOString(),
      });
      toast.success("Wydarzenie jest w radarze");
      setOpen(false);
      setForm({ title: "", city: form.city, location: "", start_date: "", price_coins: 0, description: "" });
      setCity("");
      load();
    } catch (error) {
      toast.error(error?.message ?? "Nie udało się dodać wydarzenia");
    } finally {
      setBusy("");
    }
  };

  return (
    <div>
      <TopBar title="Wydarzenia" />
      <div className="px-4 pb-12 pt-6 lg:px-8">
        <p className="text-[10px] uppercase tracking-[0.4em] text-muted-foreground">event radar</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-4xl tracking-tight">
              <span className="aura-text">Wydarzenia</span>
            </h1>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              Wystawy, targi i spotkania hodowców. Bilet schodzi z PURRE Coins — bez wypłat i bez hazardu.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="btn-aura rounded-xl px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em]"
          >
            Dodaj wydarzenie
          </button>
        </div>

        <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setCity("")}
            className={`rounded-full px-3 py-1.5 text-[11px] ${city === "" ? "bg-foreground text-background" : "border border-border/70 text-muted-foreground"}`}
          >
            Cała Polska
          </button>
          {CITY_NAMES.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => setCity(name)}
              className={`rounded-full px-3 py-1.5 text-[11px] ${city === name ? "bg-foreground text-background" : "border border-border/70 text-muted-foreground"}`}
            >
              {name}
            </button>
          ))}
        </div>

        {offline && (
          <p className="mt-4 rounded-xl border border-chart-4/40 bg-chart-4/10 px-3 py-2 text-[11px] text-muted-foreground">
            Brak połączenia z serwerem. Poniżej pokazano przykładowe wydarzenia — nie są to aktualne oferty, a zakup biletów i publikacja są chwilowo niedostępne.
          </p>
        )}

        {loadError && (
          <div
            role="alert"
            className="mt-4 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-3 text-sm text-foreground"
          >
            <p>{loadError}</p>
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="mt-2 rounded-lg border border-border/70 px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
            >
              {loading ? "Ładowanie…" : "Spróbuj ponownie"}
            </button>
          </div>
        )}

        {open && (
          <form onSubmit={create} className="mt-4 grid gap-3 rounded-[var(--radius)] border border-border/70 bg-card/60 p-4 sm:grid-cols-2">
            <label className="text-[11px] text-muted-foreground sm:col-span-2">
              Tytuł
              <input
                required
                minLength={3}
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
                className="mt-1 w-full rounded-xl border border-border/70 bg-background/40 px-3 py-2 text-sm text-foreground"
              />
            </label>
            <label className="text-[11px] text-muted-foreground">
              Miasto
              <select
                value={form.city}
                onChange={(event) => setForm({ ...form, city: event.target.value })}
                className="mt-1 w-full rounded-xl border border-border/70 bg-background/40 px-3 py-2 text-sm text-foreground"
              >
                {CITY_NAMES.map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
            </label>
            <label className="text-[11px] text-muted-foreground">
              Start
              <input
                required
                type="datetime-local"
                value={form.start_date}
                onChange={(event) => setForm({ ...form, start_date: event.target.value })}
                className="mt-1 w-full rounded-xl border border-border/70 bg-background/40 px-3 py-2 text-sm text-foreground"
              />
            </label>
            <label className="text-[11px] text-muted-foreground">
              Miejsce
              <input
                value={form.location}
                onChange={(event) => setForm({ ...form, location: event.target.value })}
                className="mt-1 w-full rounded-xl border border-border/70 bg-background/40 px-3 py-2 text-sm text-foreground"
              />
            </label>
            <label className="text-[11px] text-muted-foreground">
              Bilet (monety)
              <input
                type="number"
                min={0}
                max={20000}
                value={form.price_coins}
                onChange={(event) => setForm({ ...form, price_coins: event.target.value })}
                className="mt-1 w-full rounded-xl border border-border/70 bg-background/40 px-3 py-2 text-sm text-foreground"
              />
            </label>
            <label className="text-[11px] text-muted-foreground sm:col-span-2">
              Opis
              <textarea
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                className="mt-1 min-h-20 w-full rounded-xl border border-border/70 bg-background/40 px-3 py-2 text-sm text-foreground"
              />
            </label>
            <button
              type="submit"
              disabled={busy === "create"}
              className="btn-aura rounded-xl py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] sm:col-span-2"
            >
              {busy === "create" ? "Zapis…" : "Opublikuj w radarze"}
            </button>
          </form>
        )}

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {loading && <p className="text-sm text-muted-foreground">Ładowanie radaru…</p>}
          {!loading && visible.length === 0 && (
            <p className="text-sm text-muted-foreground">Brak wydarzeń w tym mieście.</p>
          )}
          {visible.map((event) => (
            <article key={event.id} className="flex flex-col rounded-[var(--radius)] border border-border/70 bg-card/60 p-4">
              <p className="text-[10px] uppercase tracking-[0.22em] text-aura">{event.organizer_name || "Hodowca"}</p>
              <h2 className="mt-1 font-display text-2xl leading-tight">{event.title}</h2>
              <p className="mt-2 flex items-center gap-1.5 text-[12px] text-muted-foreground">
                <CalendarDays className="h-3.5 w-3.5" /> {formatWhen(event.start_date)}
              </p>
              <p className="mt-1 flex items-center gap-1.5 text-[12px] text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" /> {event.location ? `${event.location}, ` : ""}
                {event.city}
              </p>
              {event.description && <p className="mt-3 text-sm text-muted-foreground">{event.description}</p>}
              <div className="mt-4 flex items-center justify-between gap-3">
                <span className="text-[11px] uppercase tracking-widest text-muted-foreground">
                  {event.going ?? 0} idzie · {event.price_coins ? `${event.price_coins} monet` : "wstęp wolny"}
                </span>
                <button
                  type="button"
                  disabled={busy === event.id || event.has_ticket}
                  onClick={() => buy(event)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-foreground px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-background disabled:opacity-60"
                >
                  <Ticket className="h-3.5 w-3.5" />
                  {event.has_ticket ? "Masz bilet" : "Bilet"}
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
