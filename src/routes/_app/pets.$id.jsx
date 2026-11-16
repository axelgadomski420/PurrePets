import { useCallback, useEffect, useState } from "react";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { toast } from "sonner";
import { BadgeCheck, CalendarDays, Dna, MapPin, Plus, Trash2, User } from "lucide-react";
import TopBar from "@/components/layout/TopBar";
import { Image } from "@/components/ui/image";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/pets/$id")({
  head: () => ({ meta: [{ title: "PURRE PETS — profil zwierzaka" }] }),
  component: PetProfilePage,
});

const TABS = [
  { id: "card", label: "Karta" },
  { id: "health", label: "Zdrowie" },
  { id: "calendar", label: "Kalendarz" },
  { id: "weight", label: "Waga" },
  { id: "achievements", label: "Osiągnięcia" },
];

const SPECIES_LABEL = { dog: "Pies", cat: "Kot" };
const SEX_LABEL = { male: "Samiec", female: "Samica" };
const STATUS_LABEL = { active: "Aktywny", deceased: "Pamiętamy 💛", rehomed: "Nowy dom", memorial: "Profil pamięci" };

const HEALTH_KINDS = [
  { id: "vaccine", label: "Szczepienie" },
  { id: "deworming", label: "Odrobaczanie" },
  { id: "flea_tick", label: "Kleszcze/pchły" },
  { id: "test", label: "Badanie" },
  { id: "visit", label: "Wizyta u weterynarza" },
  { id: "treatment", label: "Zabieg" },
  { id: "allergy", label: "Alergia" },
  { id: "illness", label: "Choroba/uraz" },
  { id: "medication", label: "Lek" },
  { id: "note", label: "Notatka" },
];

const EVENT_KINDS = [
  { id: "vaccine", label: "Szczepienie" },
  { id: "deworming", label: "Odrobaczanie" },
  { id: "vet", label: "Wizyta" },
  { id: "grooming", label: "Pielęgnacja" },
  { id: "bath", label: "Kąpiel" },
  { id: "nails", label: "Pazury" },
  { id: "training", label: "Trening" },
  { id: "show", label: "Wystawa" },
  { id: "medication", label: "Lek" },
  { id: "breeding", label: "Termin hodowlany" },
  { id: "birthday", label: "Urodziny" },
  { id: "other", label: "Inne" },
];

const ACH_CATEGORIES = [
  { id: "custom", label: "Własne" },
  { id: "show", label: "Wystawa" },
  { id: "sport", label: "Sport" },
  { id: "training", label: "Szkolenie" },
  { id: "breeding", label: "Hodowla" },
  { id: "community", label: "Społeczność" },
];

function petAge(birthDate) {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  const months = (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());
  if (months < 1) return "mniej niż miesiąc";
  if (months < 12) return months + " mies.";
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return rest ? years + " l. " + rest + " mies." : years + " lat";
}

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("pl-PL") : "");

function Field({ label, value }) {
  if (!value) return null;
  return (
    <span className="flex items-center gap-1.5 rounded-full border border-border/70 px-3 py-1.5 text-[11px] text-muted-foreground">
      <b className="font-medium text-foreground">{label}:</b> {value}
    </span>
  );
}

const inputCls = "w-full rounded-xl border border-border/70 bg-card/60 px-3 py-2 text-sm outline-none focus:border-aura/60";
const btnPrimary = "btn-aura rounded-xl px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.16em] disabled:opacity-60";
const btnGhost = "rounded-xl border border-border/70 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] disabled:opacity-50";

function PetProfilePage() {
  const { id } = useParams({ from: "/_app/pets/$id" });
  const { user } = useAuth();
  const [tab, setTab] = useState("card");
  const [pet, setPet] = useState(null);
  const [owner, setOwner] = useState(null);
  const [isEditor, setIsEditor] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [health, setHealth] = useState([]);
  const [events, setEvents] = useState([]);
  const [measurements, setMeasurements] = useState([]);
  const [achievements, setAchievements] = useState([]);

  const load = useCallback(async () => {
    try {
      const record = await base44.pets.get(id);
      setPet(record);
      const mine = user ? await base44.pets.mine().catch(() => ({ items: [] })) : { items: [] };
      const editor = (mine.items ?? []).some((p) => p.id === id);
      setIsEditor(editor);
      if (record?.owner_id) {
        try {
          const page = await base44.entities.Profile.filter({ user_id: record.owner_id }, { limit: 1 });
          setOwner(page.items?.[0] ?? null);
        } catch {}
      }
      if (editor) {
        const [h, c, m, a] = await Promise.all([
          base44.pets.health(id).catch(() => ({ items: [] })),
          base44.pets.calendar(id).catch(() => ({ items: [] })),
          base44.pets.measurements(id).catch(() => ({ items: [] })),
          base44.pets.achievements(id).catch(() => ({ items: [] })),
        ]);
        setHealth(h.items ?? []);
        setEvents(c.items ?? []);
        setMeasurements(m.items ?? []);
        setAchievements(a.items ?? []);
      }
    } catch {
      setPet(null);
    } finally {
      setLoading(false);
    }
  }, [id, user]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (fn, okMsg) => {
    if (saving) return;
    setSaving(true);
    try {
      await fn();
      if (okMsg) toast.success(okMsg);
      await load();
    } catch (error) {
      toast.error(error?.data?.error?.message ?? error?.message ?? "Nie udało się zapisać");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (<div><TopBar /><div className="p-6 text-sm text-muted-foreground">Ładowanie…</div></div>);
  if (!pet) return (<div><TopBar /><div className="p-6 text-sm text-muted-foreground">Nie znaleziono zwierzaka.</div></div>);

  const photos = (pet.photos ?? []).filter(Boolean);
  const age = petAge(pet.birth_date);

  return (
    <div>
      <TopBar />
      <div className="mx-auto max-w-3xl px-4 pb-12 pt-6 lg:px-8">
        {/* Nagłówek wizytówki */}
        <div className="relative overflow-hidden rounded-[var(--radius)] border border-border/70 bg-card/60">
          <div className="absolute inset-0 bg-gradient-to-br from-violet/25 via-aura/10 to-transparent" />
          <div className="relative flex flex-col items-center gap-4 p-6 sm:flex-row sm:items-end">
            <span className="rounded-full bg-gradient-to-br from-violet to-aura p-[2px]">
              <span className="block rounded-full bg-background p-1">
                <Image src={photos[0]} alt={pet.name} className="h-24 w-24 rounded-full object-cover sm:h-28 sm:w-28" />
              </span>
            </span>
            <div className="min-w-0 flex-1 text-center sm:pb-1 sm:text-left">
              <h1 className="flex items-center justify-center gap-2 font-display text-2xl sm:justify-start">
                <span className="truncate">{pet.name}</span>
                {pet.pedigree_no && (
                  <span className="flex shrink-0 items-center gap-1 rounded-full bg-gradient-to-r from-violet/20 to-aura/20 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-aura">
                    <BadgeCheck className="h-3.5 w-3.5" /> Rodowód
                  </span>
                )}
              </h1>
              <p className="text-[11px] text-muted-foreground">
                {pet.owner_name && "Właściciel: " + pet.owner_name}
                {pet.status && pet.status !== "active" ? " · " + (STATUS_LABEL[pet.status] ?? pet.status) : ""}
              </p>
            </div>
            {owner && (
              <Link to="/profile/$id" params={{ id: owner.id }} className={btnPrimary + " flex shrink-0 items-center gap-2"}>
                <User className="h-3.5 w-3.5" /> Profil właściciela
              </Link>
            )}
          </div>
        </div>

        {/* Zakładki */}
        <div className="no-scrollbar mt-4 flex gap-1 overflow-x-auto border-b border-border/50 pb-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "shrink-0 rounded-t-xl px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.14em]",
                tab === t.id ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="mt-4">
          {tab === "card" && <CardTab pet={pet} photos={photos} age={age} isEditor={isEditor} saving={saving} run={run} />}
          {tab === "health" && <HealthTab items={health} isEditor={isEditor} saving={saving} run={run} petId={pet.id} />}
          {tab === "calendar" && <CalendarTab items={events} pet={pet} isEditor={isEditor} saving={saving} run={run} petId={pet.id} />}
          {tab === "weight" && <WeightTab items={measurements} isEditor={isEditor} saving={saving} run={run} petId={pet.id} />}
          {tab === "achievements" && <AchievementsTab items={achievements} isEditor={isEditor} saving={saving} run={run} petId={pet.id} />}
        </div>
      </div>
    </div>
  );
}

function CardTab({ pet, photos, age, isEditor, saving, run }) {
  const [form, setForm] = useState(null);
  const editing = form !== null;
  const f = form ?? {};

  const facts = [
    pet.species && { label: "Gatunek", value: SPECIES_LABEL[pet.species] ?? pet.species },
    pet.breed && { label: "Rasa", value: pet.breed },
    pet.sex && { label: "Płeć", value: SEX_LABEL[pet.sex] ?? pet.sex },
    age && { label: "Wiek", value: age },
    pet.birth_date && { label: "Urodzony", value: fmtDate(pet.birth_date) },
    pet.adoption_date && { label: "Adopcja", value: fmtDate(pet.adoption_date) },
    pet.color && { label: "Umaszczenie", value: pet.color },
    pet.origin_country && { label: "Kraj pochodzenia", value: pet.origin_country },
    pet.origin_kennel && { label: "Hodowla pochodzenia", value: pet.origin_kennel },
    pet.mother_name && { label: "Matka", value: pet.mother_name },
    pet.father_name && { label: "Ojciec", value: pet.father_name },
    pet.temperament && { label: "Temperament", value: pet.temperament },
  ].filter(Boolean);

  return (
    <div className="space-y-4">
      {facts.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {facts.map((item, i) => <Field key={i} label={item.label} value={item.value} />)}
        </div>
      )}
      {pet.bio && <p className="whitespace-pre-line text-[13px] leading-relaxed text-foreground/85">{pet.bio}</p>}
      {pet.siblings && <p className="text-[12px] text-muted-foreground"><b>Rodzeństwo:</b> {pet.siblings}</p>}
      {pet.interests && <p className="text-[12px] text-muted-foreground"><b>Zainteresowania:</b> {pet.interests}</p>}
      {pet.special_needs && <p className="text-[12px] text-amber-600"><b>Specjalne potrzeby:</b> {pet.special_needs}</p>}

      {isEditor && !editing && (
        <button type="button" className={btnGhost} onClick={() => setForm({ ...pet })}>Edytuj kartę</button>
      )}
      {isEditor && editing && (
        <div className="grid gap-2 rounded-[var(--radius)] border border-border/70 bg-card/40 p-4 sm:grid-cols-2">
          <input className={inputCls} placeholder="Imię" value={f.name ?? ""} onChange={(e) => setForm({ ...f, name: e.target.value })} />
          <select className={inputCls} value={f.species ?? ""} onChange={(e) => setForm({ ...f, species: e.target.value || null })}>
            <option value="" className="bg-popover">Gatunek…</option>
            <option value="dog" className="bg-popover">Pies</option>
            <option value="cat" className="bg-popover">Kot</option>
          </select>
          <input className={inputCls} placeholder="Rasa" value={f.breed ?? ""} onChange={(e) => setForm({ ...f, breed: e.target.value || null })} />
          <select className={inputCls} value={f.sex ?? ""} onChange={(e) => setForm({ ...f, sex: e.target.value || null })}>
            <option value="" className="bg-popover">Płeć…</option>
            <option value="male" className="bg-popover">Samiec</option>
            <option value="female" className="bg-popover">Samica</option>
          </select>
          <input type="date" className={inputCls} value={f.birth_date ? String(f.birth_date).slice(0, 10) : ""} onChange={(e) => setForm({ ...f, birth_date: e.target.value || null })} />
          <input type="date" className={inputCls} value={f.adoption_date ? String(f.adoption_date).slice(0, 10) : ""} onChange={(e) => setForm({ ...f, adoption_date: e.target.value || null })} />
          <input className={inputCls} placeholder="Umaszczenie" value={f.color ?? ""} onChange={(e) => setForm({ ...f, color: e.target.value || null })} />
          <input className={inputCls} placeholder="Numer mikroczipu (prywatny)" value={f.microchip ?? ""} onChange={(e) => setForm({ ...f, microchip: e.target.value || null })} />
          <input className={inputCls} placeholder="Numer rodowodu" value={f.pedigree_no ?? ""} onChange={(e) => setForm({ ...f, pedigree_no: e.target.value || null })} />
          <input className={inputCls} placeholder="Kraj pochodzenia" value={f.origin_country ?? ""} onChange={(e) => setForm({ ...f, origin_country: e.target.value || null })} />
          <input className={inputCls} placeholder="Hodowla pochodzenia" value={f.origin_kennel ?? ""} onChange={(e) => setForm({ ...f, origin_kennel: e.target.value || null })} />
          <input className={inputCls} placeholder="Matka" value={f.mother_name ?? ""} onChange={(e) => setForm({ ...f, mother_name: e.target.value || null })} />
          <input className={inputCls} placeholder="Ojciec" value={f.father_name ?? ""} onChange={(e) => setForm({ ...f, father_name: e.target.value || null })} />
          <input className={inputCls + " sm:col-span-2"} placeholder="Temperament" value={f.temperament ?? ""} onChange={(e) => setForm({ ...f, temperament: e.target.value || null })} />
          <input className={inputCls + " sm:col-span-2"} placeholder="Zainteresowania" value={f.interests ?? ""} onChange={(e) => setForm({ ...f, interests: e.target.value || null })} />
          <input className={inputCls + " sm:col-span-2"} placeholder="Specjalne potrzeby" value={f.special_needs ?? ""} onChange={(e) => setForm({ ...f, special_needs: e.target.value || null })} />
          <textarea className={inputCls + " sm:col-span-2"} rows={3} placeholder="Opis charakteru" value={f.bio ?? ""} onChange={(e) => setForm({ ...f, bio: e.target.value || null })} />
          <label className="flex items-center gap-2 text-[11px] text-muted-foreground sm:col-span-2">
            <input type="checkbox" checked={!!f.is_public} onChange={(e) => setForm({ ...f, is_public: e.target.checked })} />
            Profil publiczny (E8) — mikroczip i numer rodowodu pozostają prywatne zawsze
          </label>
          <div className="flex gap-2 sm:col-span-2">
            <button
              type="button"
              className={btnPrimary}
              disabled={saving}
              onClick={() => run(async () => {
                const payload = { ...f };
                delete payload.id; delete payload.owner_id; delete payload.owner_name;
                delete payload.created_by_id; delete payload.created_date; delete payload.updated_date;
                await base44.pets.update(pet.id, payload);
                setForm(null);
              }, "Karta zapisana")}
            >
              Zapisz kartę
            </button>
            <button type="button" className={btnGhost} onClick={() => setForm(null)}>Anuluj</button>
          </div>
        </div>
      )}

      {photos.length > 0 && (
        <section>
          <h2 className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Galeria</h2>
          <div className="mt-3 grid grid-cols-3 gap-1.5 sm:grid-cols-4">
            {photos.map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="overflow-hidden rounded-xl border border-border/70">
                <Image src={url} alt={pet.name + " — zdjęcie " + (i + 1)} className={cn("aspect-square w-full object-cover transition hover:scale-105", i === 0 && "col-span-2 row-span-2 aspect-auto")} />
              </a>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function HealthTab({ items, isEditor, saving, run, petId }) {
  const [form, setForm] = useState({ kind: "vaccine", title: "", date: "", next_date: "", details: "", vet_name: "" });
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="space-y-4">
      {isEditor && (
        <div>
          {!showForm && <button type="button" className={btnGhost} onClick={() => setShowForm(true)}><Plus className="mr-1 inline h-3 w-3" />Dodaj wpis</button>}
          {showForm && (
            <div className="grid gap-2 rounded-[var(--radius)] border border-border/70 bg-card/40 p-4 sm:grid-cols-2">
              <select className={inputCls} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                {HEALTH_KINDS.map((k) => <option key={k.id} value={k.id} className="bg-popover">{k.label}</option>)}
              </select>
              <input className={inputCls} placeholder="Tytuł (np. szczepienie na nosówkę)" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              <label className="text-[10px] text-muted-foreground">Data
                <input type="date" className={inputCls} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </label>
              <label className="text-[10px] text-muted-foreground">Kolejna dawka / termin
                <input type="date" className={inputCls} value={form.next_date} onChange={(e) => setForm({ ...form, next_date: e.target.value })} />
              </label>
              <input className={inputCls} placeholder="Lekarz weterynarii" value={form.vet_name} onChange={(e) => setForm({ ...form, vet_name: e.target.value })} />
              <textarea className={inputCls + " sm:col-span-2"} rows={2} placeholder="Szczegóły — dawkowanie/zalecenia wprowadzaj WYŁĄCZNIE wg zaleceń weterynarza" value={form.details} onChange={(e) => setForm({ ...form, details: e.target.value })} />
              <div className="flex gap-2 sm:col-span-2">
                <button type="button" className={btnPrimary} disabled={saving || !form.title.trim()}
                  onClick={() => run(async () => { await base44.pets.addHealth(petId, form); setShowForm(false); setForm({ kind: "vaccine", title: "", date: "", next_date: "", details: "", vet_name: "" }); }, "Wpis dodany")}>
                  Zapisz wpis
                </button>
                <button type="button" className={btnGhost} onClick={() => setShowForm(false)}>Anuluj</button>
              </div>
            </div>
          )}
        </div>
      )}
      {items.length === 0 && <p className="text-sm text-muted-foreground">Brak wpisów zdrowotnych.</p>}
      <div className="space-y-2">
        {items.map((record) => (
          <div key={record.id} className="flex items-start justify-between gap-3 rounded-2xl border border-border/70 bg-card/60 p-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">{record.title}</p>
              <p className="text-[11px] text-muted-foreground">
                {(HEALTH_KINDS.find((k) => k.id === record.kind)?.label ?? record.kind)}
                {record.date ? " · " + fmtDate(record.date) : ""}
                {record.next_date ? " · następna: " + fmtDate(record.next_date) : ""}
                {record.vet_name ? " · " + record.vet_name : ""}
              </p>
              {record.details && <p className="mt-1 whitespace-pre-line text-[12px] text-foreground/80">{record.details}</p>}
            </div>
            {isEditor && (
              <button type="button" className="text-muted-foreground hover:text-red-500" disabled={saving} onClick={() => run(() => base44.pets.removeHealth(petId, record.id), "Wpis usunięty")}>
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function CalendarTab({ items, pet, isEditor, saving, run, petId }) {
  const [form, setForm] = useState({ kind: "vet", title: "", date: "", repeat: "none", remind_days_before: 3, note: "" });
  const [showForm, setShowForm] = useState(false);
  const sorted = [...items].sort((a, b) => new Date(a.date) - new Date(b.date));

  return (
    <div className="space-y-4">
      {isEditor && (
        <div>
          {!showForm && <button type="button" className={btnGhost} onClick={() => setShowForm(true)}><Plus className="mr-1 inline h-3 w-3" />Dodaj termin</button>}
          {showForm && (
            <div className="grid gap-2 rounded-[var(--radius)] border border-border/70 bg-card/40 p-4 sm:grid-cols-2">
              <select className={inputCls} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                {EVENT_KINDS.map((k) => <option key={k.id} value={k.id} className="bg-popover">{k.label}</option>)}
              </select>
              <input className={inputCls} placeholder="Tytuł" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              <label className="text-[10px] text-muted-foreground">Termin
                <input type="date" className={inputCls} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </label>
              <select className={inputCls} value={form.repeat} onChange={(e) => setForm({ ...form, repeat: e.target.value })}>
                <option value="none" className="bg-popover">Bez powtarzania</option>
                <option value="weekly" className="bg-popover">Co tydzień</option>
                <option value="monthly" className="bg-popover">Co miesiąc</option>
                <option value="yearly" className="bg-popover">Co rok</option>
              </select>
              <label className="text-[10px] text-muted-foreground sm:col-span-2">Przypomnienie {form.remind_days_before} dni przed (0 = bez)
                <input type="range" min={0} max={14} value={form.remind_days_before} onChange={(e) => setForm({ ...form, remind_days_before: Number(e.target.value) })} className="w-full" />
              </label>
              <div className="flex gap-2 sm:col-span-2">
                <button type="button" className={btnPrimary} disabled={saving || !form.title.trim() || !form.date}
                  onClick={() => run(async () => { await base44.pets.addEvent(petId, { ...form, date: new Date(form.date).toISOString() }); setShowForm(false); setForm({ kind: "vet", title: "", date: "", repeat: "none", remind_days_before: 3, note: "" }); }, "Termin dodany")}>
                  Dodaj termin
                </button>
                <button type="button" className={btnGhost} onClick={() => setShowForm(false)}>Anuluj</button>
              </div>
            </div>
          )}
        </div>
      )}
      {pet?.birth_date && (
        <div className="flex items-center gap-2 rounded-2xl border border-aura/40 bg-aura/5 p-3 text-[12px]">
          <CalendarDays className="h-4 w-4 text-aura" />
          Urodziny: {fmtDate(pet.birth_date)} — przypomnienie automatyczne (wiek: {petAge(pet.birth_date)})
        </div>
      )}
      {sorted.length === 0 && <p className="text-sm text-muted-foreground">Brak zaplanowanych terminów.</p>}
      <div className="space-y-2">
        {sorted.map((event) => {
          const overdue = !event.done && new Date(event.date) < new Date();
          return (
            <div key={event.id} className={cn("flex items-center justify-between gap-3 rounded-2xl border p-3", overdue ? "border-amber-500/50 bg-amber-500/5" : "border-border/70 bg-card/60")}>
              <div className="min-w-0">
                <p className={cn("text-sm font-medium", event.done && "line-through opacity-60")}>{event.title}</p>
                <p className="text-[11px] text-muted-foreground">
                  {(EVENT_KINDS.find((k) => k.id === event.kind)?.label ?? event.kind)} · {fmtDate(event.date)}
                  {event.repeat !== "none" ? " · powtarza się" : ""}
                  {overdue ? " · PRZETERMINOWANE" : ""}
                  {!event.done && event.remind_days_before > 0 ? " · przypomnienie " + event.remind_days_before + " dni przed" : ""}
                </p>
              </div>
              {isEditor && (
                <div className="flex shrink-0 items-center gap-2">
                  <button type="button" className={btnGhost} disabled={saving} onClick={() => run(() => base44.pets.toggleEvent(petId, event.id, !event.done))}>
                    {event.done ? "Cofnij" : "Gotowe"}
                  </button>
                  <button type="button" className="text-muted-foreground hover:text-red-500" disabled={saving} onClick={() => run(() => base44.pets.removeEvent(petId, event.id), "Termin usunięty")}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeightTab({ items, isEditor, saving, run, petId }) {
  const [form, setForm] = useState({ weight_kg: "", height_cm: "", note: "" });
  const weights = items.filter((m) => m.weight_kg != null);
  const w = 280, h = 80, pad = 6;
  const points = weights.length > 1
    ? weights.map((m, i) => {
        const vals = weights.map((x) => x.weight_kg);
        const min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1;
        const x = pad + (i / (weights.length - 1)) * (w - 2 * pad);
        const y = h - pad - ((m.weight_kg - min) / span) * (h - 2 * pad);
        return x.toFixed(1) + "," + y.toFixed(1);
      }).join(" ")
    : "";

  return (
    <div className="space-y-4">
      {isEditor && (
        <div className="grid gap-2 rounded-[var(--radius)] border border-border/70 bg-card/40 p-4 sm:grid-cols-3">
          <input className={inputCls} type="number" step="0.1" min="0" placeholder="Waga (kg)" value={form.weight_kg} onChange={(e) => setForm({ ...form, weight_kg: e.target.value })} />
          <input className={inputCls} type="number" step="0.1" min="0" placeholder="Wzrost (cm, opcjonalnie)" value={form.height_cm} onChange={(e) => setForm({ ...form, height_cm: e.target.value })} />
          <input className={inputCls} placeholder="Notatka" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          <button type="button" className={btnPrimary + " sm:col-span-3"} disabled={saving || (!form.weight_kg && !form.height_cm)}
            onClick={() => run(async () => {
              await base44.pets.addMeasurement(petId, {
                weight_kg: form.weight_kg ? Number(form.weight_kg) : null,
                height_cm: form.height_cm ? Number(form.height_cm) : null,
                note: form.note || null,
              });
              setForm({ weight_kg: "", height_cm: "", note: "" });
            }, "Pomiar dodany")}>
            Dodaj pomiar
          </button>
        </div>
      )}
      {weights.length > 1 && (
        <div className="rounded-[var(--radius)] border border-border/70 bg-card/40 p-4">
          <h2 className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Wykres wagi</h2>
          <svg viewBox={"0 0 " + w + " " + h} className="mt-2 h-20 w-full">
            <polyline points={points} fill="none" stroke="url(#wgrad)" strokeWidth="2.5" strokeLinecap="round" />
            <defs>
              <linearGradient id="wgrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#8b5cf6" />
                <stop offset="100%" stopColor="#e879a0" />
              </linearGradient>
            </defs>
          </svg>
          <p className="mt-1 text-[10px] text-muted-foreground">Wykres ma charakter informacyjny — nie ocenia stanu zdrowia.</p>
        </div>
      )}
      {items.length === 0 && <p className="text-sm text-muted-foreground">Brak pomiarów.</p>}
      <div className="space-y-2">
        {[...items].reverse().map((m) => (
          <div key={m.id} className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card/60 p-3">
            <div>
              <p className="text-sm font-medium">
                {m.weight_kg != null ? m.weight_kg + " kg" : ""}{m.weight_kg != null && m.height_cm != null ? " · " : ""}{m.height_cm != null ? m.height_cm + " cm" : ""}
              </p>
              <p className="text-[11px] text-muted-foreground">{fmtDate(m.measured_at)}{m.note ? " · " + m.note : ""}</p>
            </div>
            {isEditor && (
              <button type="button" className="text-muted-foreground hover:text-red-500" disabled={saving} onClick={() => run(() => base44.pets.removeMeasurement(petId, m.id), "Pomiar usunięty")}>
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function AchievementsTab({ items, isEditor, saving, run, petId }) {
  const [form, setForm] = useState({ title: "", category: "custom", date: "", description: "", organizer: "" });
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="space-y-4">
      {isEditor && (
        <div>
          {!showForm && <button type="button" className={btnGhost} onClick={() => setShowForm(true)}><Plus className="mr-1 inline h-3 w-3" />Dodaj osiągnięcie</button>}
          {showForm && (
            <div className="grid gap-2 rounded-[var(--radius)] border border-border/70 bg-card/40 p-4 sm:grid-cols-2">
              <input className={inputCls} placeholder="Tytuł (np. 1. miejsce, Champion)" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              <select className={inputCls} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {ACH_CATEGORIES.map((c) => <option key={c.id} value={c.id} className="bg-popover">{c.label}</option>)}
              </select>
              <label className="text-[10px] text-muted-foreground">Data
                <input type="date" className={inputCls} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </label>
              <input className={inputCls} placeholder="Organizator" value={form.organizer} onChange={(e) => setForm({ ...form, organizer: e.target.value })} />
              <textarea className={inputCls + " sm:col-span-2"} rows={2} placeholder="Opis" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              <p className="text-[10px] text-muted-foreground sm:col-span-2">
                Osiągnięcia własne. Oficjalne tytuły i medale potwierdza moderator — nigdy automatycznie.
              </p>
              <div className="flex gap-2 sm:col-span-2">
                <button type="button" className={btnPrimary} disabled={saving || !form.title.trim()}
                  onClick={() => run(async () => {
                    await base44.pets.addAchievement(petId, { ...form, date: form.date ? new Date(form.date).toISOString() : null });
                    setShowForm(false); setForm({ title: "", category: "custom", date: "", description: "", organizer: "" });
                  }, "Osiągnięcie dodane")}>
                  Dodaj
                </button>
                <button type="button" className={btnGhost} onClick={() => setShowForm(false)}>Anuluj</button>
              </div>
            </div>
          )}
        </div>
      )}
      {items.length === 0 && <p className="text-sm text-muted-foreground">Brak osiągnięć — dodaj pierwsze!</p>}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {items.map((a) => (
          <div key={a.id} className="relative rounded-2xl border border-border/70 bg-card/60 p-3">
            <p className="text-sm font-medium">{a.title}</p>
            <p className="text-[11px] text-muted-foreground">
              {(ACH_CATEGORIES.find((c) => c.id === a.category)?.label ?? a.category)}{a.date ? " · " + fmtDate(a.date) : ""}
            </p>
            {a.description && <p className="mt-1 text-[11px] text-foreground/75">{a.description}</p>}
            {a.official && (
              <span className={cn("mt-2 inline-block rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em]", a.confirmed ? "bg-emerald-500/15 text-emerald-600" : "bg-amber-500/15 text-amber-600")}>
                {a.confirmed ? "Potwierdzone ✓" : "Oczekuje na potwierdzenie"}
              </span>
            )}
            {isEditor && (
              <button type="button" className="absolute right-2 top-2 text-muted-foreground hover:text-red-500" disabled={saving} onClick={() => run(() => base44.pets.removeAchievement(petId, a.id), "Usunięto")}>
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
