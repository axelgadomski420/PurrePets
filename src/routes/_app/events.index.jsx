import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AuthGateError, requireSignedIn } from "@/components/auth/AuthGate";
import { CalendarDays, MapPin, Users } from "lucide-react";
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
          setEvents([]);
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

  const toggleAttendance = async (event) => {
    if (!isAuthenticated) {
      navigateToLogin();
      return;
    }

    setBusy(event.id);
    try {
      if (event.current_user_attending) {
        await base44.social.leaveEvent(event.id);
        toast.success("Zrezygnowano z udziału");
      } else {
        await base44.social.joinEvent(event.id);
        toast.success("Dodano Cię do uczestników wydarzenia");
      }
      await load();
    } catch (error) {
      toast.error(error?.message ?? "Nie udało się zmienić udziału");
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
              Oficjalne wystawy kotów i psów w systemach WCF, TICA, FPL/FIFe i FCI.
            </p>
          </div>
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
            Brak połączenia z serwerem. Nie można teraz pobrać wydarzeń. Spróbuj ponownie później.
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
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-muted-foreground">
                  <Users className="h-3.5 w-3.5" />
                  {event.attendance_count ?? 0} uczestników
                </span>
                <button
                  type="button"
                  disabled={busy === event.id}
                  onClick={() => toggleAttendance(event)}
                  aria-pressed={Boolean(event.current_user_attending)}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] disabled:opacity-60 ${
                    event.current_user_attending
                      ? "border border-border/70 text-foreground"
                      : "bg-foreground text-background"
                  }`}
                >
                  {event.current_user_attending ? "Rezygnuję" : "Wezmę udział"}
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
