import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthGateError, requireSignedIn } from "@/components/auth/AuthGate";
import { toast } from "sonner";
import TopBar from "@/components/layout/TopBar";
import { groupsApi } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { formatNumber } from "@/lib/format";

export const Route = createFileRoute("/_app/community/")({
  ssr: false,
  beforeLoad: requireSignedIn,
  errorComponent: AuthGateError,
  head: () => ({ meta: [{ title: "PURRE PETS — Społeczność" }] }),
  component: CommunityPage,
});



const FILTERS = [
  { id: "all", label: "Wszystkie" },
  { id: "breed", label: "Rasowe" },
  { id: "regional", label: "Regionalne" },
  { id: "topic", label: "Tematyczne" },
];

function CommunityPage() {
  const { isAuthenticated, navigateToLogin } = useAuth();
  const [type, setType] = useState("all");
  const [groups, setGroups] = useState([]);
  const [offline, setOffline] = useState(false);
  const [busy, setBusy] = useState("");
  const [form, setForm] = useState({ name: "", type: "breed", description: "", city: "", breed: "" });

  const load = () => {
    groupsApi.list({ type })
      .then((page) => {
        setGroups(page.items ?? []);
        setOffline(false);
      })
      .catch(() => {
          setOffline(true);
          setGroups([]);
        });
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  const toggle = async (group) => {
    if (offline) {
      toast.error("Brak połączenia z serwerem. Nie można teraz zmienić członkostwa.");
      return;
    }
    if (!isAuthenticated) {
      navigateToLogin();
      return;
    }
    setBusy(group.id);
    try {
      const result = group.joined ? await groupsApi.leave(group.id) : await groupsApi.join(group.id);
      setGroups((current) =>
        current.map((item) =>
          item.id === group.id ? { ...item, joined: result.joined, members_count: result.members_count } : item
        )
      );
    } catch (error) {
      toast.error(error?.message ?? "Nie udało się zmienić członkostwa");
    } finally {
      setBusy("");
    }
  };

  const create = async (event) => {
    event.preventDefault();
    if (!isAuthenticated) {
      navigateToLogin();
      return;
    }
    setBusy("create");
    try {
      await groupsApi.create({
        name: form.name,
        type: form.type,
        description: form.description || undefined,
        city: form.city || undefined,
        breed: form.breed || undefined,
      });
      toast.success("Grupa powstała — jesteś w niej");
      setForm({ name: "", type: form.type, description: "", city: "", breed: "" });
      load();
    } catch (error) {
      toast.error(error?.message ?? "Nie udało się założyć grupy");
    } finally {
      setBusy("");
    }
  };

  return (
    <div>
      <TopBar title="Społeczność" />
      <div className="px-4 pb-12 pt-6 lg:px-8">
        <p className="text-[10px] uppercase tracking-[0.4em] text-muted-foreground">kluby</p>
        <h1 className="mt-2 font-display text-4xl tracking-tight">
          <span className="aura-text">Społeczność</span>
        </h1>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          Grupy rasowe, miasta i tematy. Jedno kliknięcie dołącza Cię do klubu.
        </p>

        <div className="mt-5 flex gap-2">
          {FILTERS.map((filter) => (
            <button
              key={filter.id}
              type="button"
              onClick={() => setType(filter.id)}
              className={`rounded-full px-3 py-1.5 text-[11px] ${type === filter.id ? "bg-foreground text-background" : "border border-border/70 text-muted-foreground"}`}
            >
              {filter.label}
            </button>
          ))}
        </div>

        {offline && (
          <p className="mt-4 rounded-xl border border-chart-4/40 bg-chart-4/10 px-3 py-2 text-[11px] text-muted-foreground">
            Brak połączenia z serwerem. Nie można teraz pobrać listy społeczności. Spróbuj ponownie później.
          </p>
        )}

        <form onSubmit={create} className="mt-5 grid gap-3 rounded-[var(--radius)] border border-border/70 bg-card/60 p-4 sm:grid-cols-2">
          <input
            required
            minLength={3}
            placeholder="Nazwa grupy"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            className="rounded-xl border border-border/70 bg-background/40 px-3 py-2 text-sm sm:col-span-2"
          />
          <select
            value={form.type}
            onChange={(event) => setForm({ ...form, type: event.target.value })}
            className="rounded-xl border border-border/70 bg-background/40 px-3 py-2 text-sm"
          >
            <option value="breed">Rasowa</option>
            <option value="regional">Regionalna</option>
            <option value="topic">Tematyczna</option>
          </select>
          <input
            placeholder={form.type === "breed" ? "Rasa" : "Miasto"}
            value={form.type === "breed" ? form.breed : form.city}
            onChange={(event) =>
              setForm(
                form.type === "breed"
                  ? { ...form, breed: event.target.value }
                  : { ...form, city: event.target.value }
              )
            }
            className="rounded-xl border border-border/70 bg-background/40 px-3 py-2 text-sm"
          />
          <input
            placeholder="Krótki opis"
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
            className="rounded-xl border border-border/70 bg-background/40 px-3 py-2 text-sm sm:col-span-2"
          />
          <button
            type="submit"
            disabled={busy === "create"}
            className="btn-aura rounded-xl py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] sm:col-span-2"
          >
            Załóż grupę
          </button>
        </form>

        <div className="mt-6 grid gap-3 md:grid-cols-2">
          {groups.map((group) => (
            <article key={group.id} className="rounded-[var(--radius)] border border-border/70 bg-card/60 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                    {group.type === "breed" ? "Rasa" : group.type === "regional" ? "Region" : "Temat"}
                    {group.breed ? ` · ${group.breed}` : ""}
                    {group.city ? ` · ${group.city}` : ""}
                  </p>
                  <h2 className="mt-1 font-display text-xl">{group.name}</h2>
                </div>
                <span className="text-[11px] text-aura">{formatNumber(group.members_count)} osób</span>
              </div>
              {group.description && <p className="mt-2 text-sm text-muted-foreground">{group.description}</p>}
              {!offline && (
                <Link
                  to="/community/$id"
                  params={{ id: group.id }}
                  className="mt-4 inline-flex min-h-10 w-full items-center justify-center rounded-xl bg-foreground px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-background"
                >
                  Otwórz grupę
                </Link>
              )}
              <button
                type="button"
                disabled={busy === group.id}
                onClick={() => toggle(group)}
                className="mt-4 rounded-xl border border-border/70 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em]"
              >
                {group.joined ? "Opuść" : "Dołącz"}
              </button>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
