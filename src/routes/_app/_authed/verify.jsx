import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import TopBar from "@/components/layout/TopBar";
import { base44 } from "@/api/base44Client";
import { CITY_NAMES } from "@/lib/geo";

export const Route = createFileRoute("/_app/_authed/verify")({
  head: () => ({ meta: [{ title: "PURRE PETS — Weryfikacja hodowcy" }] }),
  component: VerifyPage,
});

function VerifyPage() {
  const [items, setItems] = useState([]);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    kennel_name: "",
    registry_no: "",
    city: "Warszawa",
    species: "dog",
    note: "",
    document_url: "",
  });

  const load = () => {
    base44.social
      .myVerification()
      .then((page) => setItems(page.items ?? []))
      .catch(() => setItems([]));
  };

  useEffect(() => {
    load();
  }, []);

  const upload = async (file) => {
    if (!file) return;
    const allowed = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) {
      toast.error("Dozwolone formaty: PDF, JPG, PNG i WEBP");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      toast.error("Dokument może mieć maksymalnie 15 MB");
      return;
    }
    setFileName(file.name);
    setForm((current) => ({ ...current, document_url: "" }));
    setBusy(true);
    try {
      const result = await base44.integrations.Core.UploadPrivateVerificationDocument({ file });
      if (!result?.document_url || !result.document_url.startsWith("private-doc:")) {
        throw new Error("Serwer nie zwrócił identyfikatora prywatnego dokumentu");
      }
      setForm((current) => ({ ...current, document_url: result.document_url }));
      toast.success("Dokument wgrany");
    } catch (error) {
      toast.error(error?.message ?? "Nie udało się wgrać dokumentu");
    } finally {
      setBusy(false);
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      await base44.social.submitVerification({
        kennel_name: form.kennel_name,
        registry_no: form.registry_no || undefined,
        city: form.city,
        species: form.species,
        note: form.note || undefined,
        document_url: form.document_url || undefined,
      });
      toast.success("Wniosek czeka na decyzję człowieka");
      setForm({ ...form, note: "", registry_no: "" });
      load();
    } catch (error) {
      toast.error(error?.message ?? "Nie udało się wysłać wniosku");
    } finally {
      setBusy(false);
    }
  };

  const latest = items[0];

  return (
    <div>
      <TopBar title="Weryfikacja" />
      <div className="px-4 pb-12 pt-6 lg:px-8">
        <p className="text-[10px] uppercase tracking-[0.4em] text-muted-foreground">trust</p>
        <h1 className="mt-2 font-display text-4xl">
          <span className="aura-text">Weryfikacja hodowcy</span>
        </h1>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          Wniosek trafia do kolejki administratora. Odznaka „Zweryfikowany hodowca” pojawia się dopiero po decyzji człowieka — OCR i scoring AI nie zamykają sprawy same.
        </p>

        {latest && (
          <p className="mt-4 rounded-xl border border-border/70 bg-card/60 px-3 py-2 text-sm">
            Ostatni wniosek: <b>{latest.kennel_name}</b> — {statusLabel(latest.status)}
            {latest.reviewer_note ? ` · ${latest.reviewer_note}` : ""}
          </p>
        )}

        <form onSubmit={submit} className="mt-6 grid max-w-xl gap-3">
          <Field label="Nazwa hodowli">
            <input
              required
              minLength={2}
              value={form.kennel_name}
              onChange={(event) => setForm({ ...form, kennel_name: event.target.value })}
              className="w-full rounded-xl border border-border/70 bg-card/60 px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Numer w związku / ZKwP / FIFE">
            <input
              value={form.registry_no}
              onChange={(event) => setForm({ ...form, registry_no: event.target.value })}
              className="w-full rounded-xl border border-border/70 bg-card/60 px-3 py-2 text-sm"
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Miasto">
              <select
                value={form.city}
                onChange={(event) => setForm({ ...form, city: event.target.value })}
                className="w-full rounded-xl border border-border/70 bg-card/60 px-3 py-2 text-sm"
              >
                {CITY_NAMES.map((city) => (
                  <option key={city}>{city}</option>
                ))}
              </select>
            </Field>
            <Field label="Gatunek">
              <select
                value={form.species}
                onChange={(event) => setForm({ ...form, species: event.target.value })}
                className="w-full rounded-xl border border-border/70 bg-card/60 px-3 py-2 text-sm"
              >
                <option value="dog">Psy</option>
                <option value="cat">Koty</option>
                <option value="both">Psy i koty</option>
              </select>
            </Field>
          </div>
          <Field label="Notatka dla moderatora">
            <textarea
              value={form.note}
              onChange={(event) => setForm({ ...form, note: event.target.value })}
              className="min-h-24 w-full rounded-xl border border-border/70 bg-card/60 px-3 py-2 text-sm"
            />
          </Field>
          <label className="rounded-xl border border-dashed border-border/70 px-3 py-3 text-[12px] text-muted-foreground">
            Dokument (PDF lub zdjęcie) {fileName ? `· ${fileName}` : ""}
            <input
              type="file"
              accept="image/*,.pdf"
              className="mt-2 block text-xs"
              onChange={(event) => upload(event.target.files?.[0])}
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="btn-aura rounded-xl py-3 text-[10px] font-semibold uppercase tracking-[0.18em]"
          >
            {busy ? "Wysyłanie…" : "Wyślij wniosek"}
          </button>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="text-[11px] text-muted-foreground">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}

function statusLabel(status) {
  if (status === "approved") return "zatwierdzony";
  if (status === "rejected") return "odrzucony";
  return "oczekuje";
}
