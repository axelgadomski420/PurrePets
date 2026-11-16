import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import TopBar from "@/components/layout/TopBar";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";

export const Route = createFileRoute("/_app/admin/")({
  ssr: false,
  head: () => ({ meta: [{ title: "PURRE PETS — Admin" }] }),
  component: AdminPage,
});

function canModerate(user) {
  return user?.role === "admin" || user?.role === "moderator";
}

function AdminPage() {
  const { user, isAuthenticated, isLoadingAuth } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [tab, setTab] = useState("overview");
  const [documentPreview, setDocumentPreview] = useState(null);

  useEffect(() => {
    return () => {
      if (documentPreview?.url) URL.revokeObjectURL(documentPreview.url);
    };
  }, [documentPreview?.url]);

  const load = () => {
    base44.admin
      .overview()
      .then((payload) => {
        setData(payload);
        setError("");
      })
      .catch((err) => setError(err?.message ?? "Brak dostępu"));
  };

  useEffect(() => {
    if (canModerate(user)) load();
  }, [user?.role]);

  const decide = async (id, status) => {
    setBusy(id + status);
    try {
      await base44.admin.reviewVerification(id, { status });
      toast.success(status === "approved" ? "Hodowca zweryfikowany" : "Wniosek odrzucony");
      load();
    } catch (err) {
      toast.error(err?.message ?? "Nie udało się zapisać decyzji");
    } finally {
      setBusy("");
    }
  };


  const openVerificationDocument = async (item) => {
    setBusy(item.id + "document");
    try {
      const blob = await base44.admin.getVerificationDocument(item.id);
      const url = URL.createObjectURL(blob);
      setDocumentPreview({
        id: item.id,
        url,
        type: blob.type || "application/octet-stream",
        name: item.kennel_name || "Dokument hodowcy",
      });
    } catch (err) {
      toast.error(err?.message ?? "Nie udało się otworzyć dokumentu");
    } finally {
      setBusy("");
    }
  };

  const analyzeVerification = async (id) => {
    setBusy(id + "analyze");
    try {
      const result = await base44.admin.analyzeVerification(id);
      if (result?.document_readable === false) {
        toast.error("Dokument nie został poprawnie odczytany. Wniosek wymaga kontroli ręcznej.");
      } else if (result?.llm_ok) {
        toast.success("Analiza dokumentu zakończona");
      } else {
        toast.error("Analiza AI nie została zakończona — sprawdź dostępność Ollama");
      }
      load();
    } catch (err) {
      toast.error(err?.message ?? "Nie udało się przeanalizować dokumentu");
    } finally {
      setBusy("");
    }
  };

  const moderate = async (id, status) => {
    setBusy(id + status);
    try {
      await base44.admin.reviewListing(id, { status });
      toast.success(status === "active" ? "Ogłoszenie opublikowane" : "Ogłoszenie zarchiwizowane");
      load();
    } catch (err) {
      toast.error(err?.message ?? "Nie udało się zmienić ogłoszenia");
    } finally {
      setBusy("");
    }
  };

  const moderatePost = async (id, status) => {
    setBusy(id + status);
    try {
      await base44.admin.reviewPost(id, { status });
      toast.success(status === "published" ? "Post opublikowany" : "Post ukryty");
      load();
    } catch (err) {
      toast.error(err?.message ?? "Nie udało się zmienić posta");
    } finally {
      setBusy("");
    }
  };

  if (isLoadingAuth) return <div className="p-8 text-sm text-muted-foreground">Ładowanie…</div>;
  if (!isAuthenticated || !canModerate(user)) {
    return (
      <div>
        <TopBar title="Admin" />
        <div className="p-8 text-center text-sm text-muted-foreground">Brak uprawnień administratora / moderatora.</div>
      </div>
    );
  }

  const isFullAdmin = user?.role === "admin";

  return (
    <div>
      <TopBar title={isFullAdmin ? "Admin" : "Moderator"} />
      <div className="px-4 pb-12 pt-6 lg:px-8">
        <h1 className="font-display text-4xl">
          <span className="aura-text">{isFullAdmin ? "Panel administratora" : "Panel moderatora"}</span>
        </h1>

        <div className="mt-4 flex flex-wrap gap-2">
          {["overview", "verifications", "listings", "posts"].map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`rounded-xl px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] ${
                tab === key ? "btn-aura" : "border border-border/70 text-muted-foreground"
              }`}
            >
              {key === "overview" && "Przegląd"}
              {key === "verifications" && "Weryfikacje"}
              {key === "listings" && "Ogłoszenia"}
              {key === "posts" && "Posty"}
            </button>
          ))}
        </div>

        {(tab === "overview" || tab === "verifications") && (
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Stat label="Konta" value={data?.users ?? "—"} />
            <Stat label="Wydarzenia" value={data?.events ?? "—"} />
            <Stat label="Do decyzji" value={(data?.verifications?.length ?? 0) + (data?.listings?.length ?? 0) + (data?.posts?.length ?? 0)} />
          </div>
        )}

        {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

        {(tab === "overview" || tab === "verifications") && (
          <section className="mt-8">
            <h2 className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Weryfikacja hodowców</h2>
            <div className="mt-3 space-y-3">
              {(data?.verifications ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">Brak oczekujących wniosków.</p>
              )}
              {(data?.verifications ?? []).map((item) => (
                <article key={item.id} className="rounded-[var(--radius)] border border-border/70 bg-card/60 p-4">
                  <p className="font-display text-xl">{item.kennel_name}</p>
                  <p className="mt-1 text-[12px] text-muted-foreground">
                    {item.city || "—"} · {item.species || "gatunek niepodany"} · rej. {item.registry_no || "brak"}
                  </p>
                  {item.note && <p className="mt-2 text-sm">{item.note}</p>}
                  {item.document_url && (
                    <button
                      type="button"
                      disabled={busy === item.id + "document"}
                      onClick={() => openVerificationDocument(item)}
                      className="mt-2 inline-block text-[11px] text-aura underline disabled:opacity-50"
                    >
                      {busy === item.id + "document" ? "Otwieranie dokumentu…" : "Otwórz dokument"}
                    </button>
                  )}

                  {documentPreview?.id === item.id && (
                    <div className="mt-3 rounded-xl border border-border/70 bg-background p-3">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <p className="text-xs font-semibold">Podgląd dokumentu</p>
                        <button
                          type="button"
                          onClick={() => setDocumentPreview(null)}
                          className="text-xs text-aura underline"
                        >
                          Zamknij
                        </button>
                      </div>
                      {documentPreview.type.startsWith("image/") ? (
                        <img
                          src={documentPreview.url}
                          alt="Dokument weryfikacyjny"
                          className="max-h-[65vh] w-full rounded-lg object-contain"
                        />
                      ) : documentPreview.type === "application/pdf" ? (
                        <iframe
                          src={documentPreview.url}
                          title="Dokument weryfikacyjny"
                          className="h-[65vh] w-full rounded-lg border border-border"
                        />
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Ten format dokumentu nie obsługuje podglądu w przeglądarce.
                        </p>
                      )}
                    </div>
                  )}

                  {item.ai_analyzed_at && (
                    <div className="mt-3 rounded-xl border border-border/70 p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Wynik analizy AI
                      </p>
                      <p className="mt-1 text-sm">
                        Rekomendacja: <strong>{item.ai_recommendation || "manual"}</strong>
                        {item.ai_score !== null && item.ai_score !== undefined
                          ? ` · Ocena: ${item.ai_score}/100`
                          : ""}
                      </p>
                      {item.ai_reasoning && (
                        <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">
                          {item.ai_reasoning}
                        </p>
                      )}
                      <p className="mt-2 text-[10px] text-muted-foreground">
                        Analiza nie zastępuje ostatecznej decyzji moderatora.
                      </p>
                    </div>
                  )}

                  <button
                    type="button"
                    disabled={busy.startsWith(item.id)}
                    onClick={() => analyzeVerification(item.id)}
                    className="mt-3 rounded-xl border border-border/70 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] disabled:opacity-50"
                  >
                    {busy === item.id + "analyze" ? "Analizowanie dokumentu…" : "Analizuj dokument (OCR + AI)"}
                  </button>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      disabled={busy.startsWith(item.id)}
                      onClick={() => decide(item.id, "approved")}
                      className="btn-aura rounded-xl px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em]"
                    >
                      Zatwierdź
                    </button>
                    <button
                      type="button"
                      disabled={busy.startsWith(item.id)}
                      onClick={() => decide(item.id, "rejected")}
                      className="rounded-xl border border-border/70 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em]"
                    >
                      Odrzuć
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {(tab === "overview" || tab === "listings") && (
          <section className="mt-8">
            <h2 className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Ogłoszenia w moderacji</h2>
            <div className="mt-3 space-y-3">
              {(data?.listings ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">Kolejka pusta.</p>
              )}
              {(data?.listings ?? []).map((listing) => (
                <article key={listing.id} className="rounded-[var(--radius)] border border-border/70 bg-card/60 p-4">
                  <p className="font-display text-xl">{listing.title}</p>
                  <p className="mt-1 text-[12px] text-muted-foreground">
                    {listing.city} · {listing.breed || listing.species || "—"} · ryzyko {listing.risk ?? 0}
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => moderate(listing.id, "active")}
                      className="btn-aura rounded-xl px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em]"
                    >
                      Publikuj
                    </button>
                    <button
                      type="button"
                      onClick={() => moderate(listing.id, "archived")}
                      className="rounded-xl border border-border/70 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em]"
                    >
                      Archiwizuj
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {(tab === "overview" || tab === "posts") && (
          <section className="mt-8">
            <h2 className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Posty do moderacji</h2>
            <div className="mt-3 space-y-3">
              {(data?.posts ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">Brak postów w kolejce.</p>
              )}
              {(data?.posts ?? []).map((post) => (
                <article key={post.id} className="rounded-[var(--radius)] border border-border/70 bg-card/60 p-4">
                  <p className="font-display text-lg">{post.author_name || "Anonim"}</p>
                  <p className="mt-1 line-clamp-3 text-sm">{post.caption}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">ryzyko {post.risk ?? 0} · status {post.status}</p>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => moderatePost(post.id, "published")}
                      className="btn-aura rounded-xl px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em]"
                    >
                      Publikuj
                    </button>
                    <button
                      type="button"
                      onClick={() => moderatePost(post.id, "hidden")}
                      className="rounded-xl border border-border/70 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em]"
                    >
                      Ukryj
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-[var(--radius)] border border-border/70 bg-card/60 p-4">
      <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-3xl">{value}</p>
    </div>
  );
}
