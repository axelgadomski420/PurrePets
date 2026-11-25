import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
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


const EXPURR_REPORT_MARKER =
  "\n\n[ANALIZA EXPURR — wynik automatyczny, decyzja należy do moderatora]\n";

function getExpurrReportAnalysis(details) {
  const value = String(details || "");
  const index = value.lastIndexOf(EXPURR_REPORT_MARKER);
  if (index < 0) return null;

  try {
    return JSON.parse(value.slice(index + EXPURR_REPORT_MARKER.length).trim());
  } catch {
    return {
      status: "invalid_result",
      error: "Nie udało się odczytać zapisanego wyniku analizy.",
    };
  }
}

function getOriginalReportDetails(details) {
  return String(details || "").split(EXPURR_REPORT_MARKER)[0].trim();
}

function AdminPage() {
  const { user, isAuthenticated, isLoadingAuth } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const isFullAdmin = data?.is_main_admin === true;
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [tab, setTab] = useState("overview");
  const [documentPreview, setDocumentPreview] = useState(null);
  const [mediaItems, setMediaItems] = useState([]);
  const [mediaPreviews, setMediaPreviews] = useState({});
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaBusy, setMediaBusy] = useState("");
  const [reportItems, setReportItems] = useState([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportBusy, setReportBusy] = useState("");
  const [users, setUsers] = useState([]);
  const [usersQuery, setUsersQuery] = useState("");
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersBusy, setUsersBusy] = useState("");
  const [auditItems, setAuditItems] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [moderatorStats, setModeratorStats] = useState([]);
  const [moderatorStatsLoading, setModeratorStatsLoading] = useState(false);
  const [eventItems, setEventItems] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsBusy, setEventsBusy] = useState("");


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


  const loadReports = async () => {
    setReportsLoading(true);
    try {
      const payload = await base44.admin.reports();
      setReportItems(Array.isArray(payload?.items) ? payload.items : []);
    } catch (err) {
      toast.error(err?.message ?? "Nie udało się pobrać zgłoszeń");
    } finally {
      setReportsLoading(false);
    }
  };

  const loadUsers = async (query = usersQuery) => {
    if (!isFullAdmin) return;
    setUsersLoading(true);
    try {
      const payload = await base44.admin.users(query.trim());
      setUsers(Array.isArray(payload?.items) ? payload.items : []);
    } catch (err) {
      toast.error(err?.message ?? "Nie udało się pobrać użytkowników");
    } finally {
      setUsersLoading(false);
    }
  };

  const loadAudit = async () => {
    if (!isFullAdmin) return;
    setAuditLoading(true);
    try {
      const payload = await base44.admin.audit(100);
      setAuditItems(Array.isArray(payload?.items) ? payload.items : []);
    } catch (err) {
      toast.error(err?.message ?? "Nie udalo sie pobrac dziennika audytowego");
    } finally {
      setAuditLoading(false);
    }
  };

  const loadModeratorStats = async () => {
    if (!isFullAdmin) return;
    setModeratorStatsLoading(true);
    try {
      const payload = await base44.admin.moderatorStats();
      setModeratorStats(Array.isArray(payload?.items) ? payload.items : []);
    } catch (err) {
      toast.error(err?.message ?? "Nie udalo sie pobrac statystyk moderatorow");
    } finally {
      setModeratorStatsLoading(false);
    }
  };

  const loadEvents = async () => {
    if (!isFullAdmin) return;

    setEventsLoading(true);
    try {
      const payload = await base44.admin.events();
      setEventItems(Array.isArray(payload?.items) ? payload.items : []);
    } catch (err) {
      toast.error(err?.message ?? "Nie udało się pobrać wydarzeń");
    } finally {
      setEventsLoading(false);
    }
  };

  const deleteManagedEvent = async (item) => {
    if (!isFullAdmin || !item?.id) return;

    const confirmed = window.confirm(
      `Czy na pewno usunąć wydarzenie „${item.title}”? Operacja usunie wydarzenie i listę RSVP. Historyczne zapisy biletów i rozliczenia Coins pozostaną zachowane.`
    );

    if (!confirmed) return;

    setEventsBusy(item.id);
    try {
      await base44.admin.deleteEvent(item.id);
      toast.success("Wydarzenie zostało usunięte");
      await loadEvents();
      await load();
    } catch (err) {
      toast.error(err?.message ?? "Nie udało się usunąć wydarzenia");
    } finally {
      setEventsBusy("");
    }
  };

  const updateManagedUser = async (item, changes) => {
    if (!isFullAdmin || !item?.id || item.id === user?.id || item.role === "admin") return;
    setUsersBusy(item.id);
    try {
      await base44.admin.updateUser(item.id, changes);
      toast.success("Zapisano zmiany konta");
      await loadUsers();
      load();
    } catch (err) {
      toast.error(err?.message ?? "Nie udało się zmienić konta");
    } finally {
      setUsersBusy("");
    }
  };

  const deleteManagedUser = async (item) => {
    if (!isFullAdmin || !item?.id || item.id === user?.id || item.role === "admin") return;

    const typedEmail = window.prompt(
      "Trwałe usunięcie konta. Wpisz dokładny adres e-mail użytkownika:",
      ""
    );

    if (typedEmail === null) return;

    if (typedEmail.trim().toLowerCase() !== String(item.email || "").trim().toLowerCase()) {
      toast.error("Adres e-mail nie jest zgodny. Konto nie zostało usunięte.");
      return;
    }

    if (!window.confirm(
      `UWAGA: Konto ${item.email} i jego treści zostaną trwale usunięte. Tej operacji nie można cofnąć. Kontynuować?`
    )) return;

    setUsersBusy(item.id);

    try {
      await base44.admin.deleteUser(item.id, typedEmail.trim());
      toast.success("Konto i powiązane dane zostały usunięte");
      await loadUsers();
      await load();
    } catch (err) {
      toast.error(err?.message ?? "Nie udało się usunąć konta");
    } finally {
      setUsersBusy("");
    }
  };

  const decideReport = async (id, action) => {
    setReportBusy(id + action);
    try {
      await base44.admin.resolveReport(id, {
        action,
        resolution: action === "hide"
          ? "Treść ukryta po analizie zgłoszenia przez moderatora."
          : "Zgłoszenie odrzucone przez moderatora.",
      });

      toast.success(
        action === "hide" ? "Treść została ukryta" : "Zgłoszenie odrzucone"
      );
      await loadReports();
      load();
    } catch (err) {
      toast.error(err?.message ?? "Nie udało się zapisać decyzji");
    } finally {
      setReportBusy("");
    }
  };

  useEffect(() => {
    if (canModerate(user)) load();
  }, [user?.role]);


  const loadMediaQueue = async () => {
    setMediaLoading(true);
    try {
      const payload = await base44.admin.mediaModeration();
      setMediaItems(Array.isArray(payload?.items) ? payload.items : []);
    } catch (err) {
      toast.error(err?.message ?? "Nie udało się pobrać kolejki mediów");
    } finally {
      setMediaLoading(false);
    }
  };

  useEffect(() => {
    if (tab === "media") loadMediaQueue();
    if (tab === "reports") loadReports();
    if (tab === "users" && isFullAdmin) loadUsers("");
    if (tab === "audit" && isFullAdmin) loadAudit();
    if (tab === "moderators" && isFullAdmin) loadModeratorStats();
    if (tab === "events" && isFullAdmin) loadEvents();
  }, [tab, isFullAdmin]);

  const openMediaPreview = async (id) => {
    if (mediaPreviews[id]) return;
    try {
      const blob = await base44.admin.getMediaPreview(id);
      const url = URL.createObjectURL(blob);
      setMediaPreviews((current) => ({ ...current, [id]: url }));
    } catch (err) {
      toast.error(err?.message ?? "Nie udało się otworzyć podglądu");
    }
  };

  const decideMedia = async (id, action) => {
    setMediaBusy(id + action);
    try {
      await base44.admin.reviewMedia(id, {
        action,
        reason: action === "reject" ? "Odrzucono przez moderatora." : undefined,
      });

      if (mediaPreviews[id]) URL.revokeObjectURL(mediaPreviews[id]);

      setMediaPreviews((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });

      toast.success(
        action === "approve"
          ? "Materiał zatwierdzony i opublikowany"
          : "Materiał odrzucony"
      );

      await loadMediaQueue();
    } catch (err) {
      toast.error(err?.message ?? "Nie udało się zapisać decyzji");
    } finally {
      setMediaBusy("");
    }
  };

  const decide = async (id, status) => {
    setBusy(id + status);
    try {
      await base44.admin.reviewVerification(id, { status });
      toast.success(
        status === "approved"
          ? "Hodowca zweryfikowany"
          : status === "rejected"
            ? "Wniosek odrzucony"
            : "Wniosek przywrócony do oczekujących"
      );
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

  return (
    <div>
      <TopBar title={isFullAdmin ? "Admin" : "Moderator"} />
      <div className="px-4 pb-12 pt-6 lg:px-8">
        <h1 className="font-display text-4xl">
          <span className="aura-text">{isFullAdmin ? "Panel administratora" : "Panel moderatora"}</span>
        </h1>

        <div className="mt-4 flex flex-wrap gap-2">
          {["overview", "verifications", "listings", "posts", "media", "reports", ...(isFullAdmin ? ["users", "audit", "moderators", "events"] : [])].map((key) => (
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
              {key === "media" && "Moderacja mediów"}
              {key === "reports" && "Zgłoszenia Expurr"}
              {key === "users" && "Użytkownicy"}
              {key === "audit" && "Dziennik audytowy"}
              {key === "moderators" && "Statystyki moderatorów"}
              {key === "events" && "Wydarzenia"}
            </button>
          ))}
        </div>

        {(tab === "overview" || tab === "verifications") && (
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Stat label="Konta" value={data?.stats?.users ?? "—"} />
            <Stat label="Wydarzenia" value={data?.stats?.events ?? "—"} />
            <Stat label="Reels" value={data?.stats?.reels ?? "—"} />
            <Stat label="Komentarze" value={data?.stats?.comments ?? "—"} />
            <Stat label="Aktywne Stories" value={data?.stats?.active_stories ?? "—"} />
            <Stat label="Oczekujące" value={data?.stats?.pending ?? "—"} />
            {isFullAdmin && <Stat label="Premium" value={data?.stats?.premium ?? "—"} />}
            {isFullAdmin && <Stat label="Zablokowane" value={data?.stats?.banned ?? "—"} />}
            {isFullAdmin && <Stat label="Transakcje" value={data?.stats?.transactions ?? "—"} />}
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

            <div className="mt-8 border-t border-border/60 pt-5">
              <h3 className="text-sm font-semibold">
                Odrzucone wnioski — możliwość ponownej weryfikacji
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Dokumenty pozostają prywatne. Możesz je ponownie sprawdzić,
                uruchomić analizę albo przywrócić wniosek do kolejki.
              </p>

              <div className="mt-3 space-y-3">
                {(data?.rejectedVerifications ?? []).length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Brak odrzuconych wniosków.
                  </p>
                )}

                {(data?.rejectedVerifications ?? []).map((item) => (
                  <article
                    key={item.id}
                    className="min-w-0 rounded-[var(--radius)] border border-destructive/30 bg-card/60 p-4"
                  >
                    <p className="break-words font-display text-xl">
                      {item.kennel_name}
                    </p>

                    <p className="mt-1 text-xs text-muted-foreground">
                      {item.city || "—"} · {item.species || "gatunek niepodany"}
                      {" · "}rej. {item.registry_no || "brak"}
                    </p>

                    {item.reviewer_note && (
                      <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">
                        Powód odrzucenia: {item.reviewer_note}
                      </p>
                    )}

                    {item.note && (
                      <p className="mt-2 text-sm">{item.note}</p>
                    )}

                    {item.document_url ? (
                      <button
                        type="button"
                        disabled={busy === item.id + "document"}
                        onClick={() => openVerificationDocument(item)}
                        className="mt-3 inline-block text-xs text-aura underline disabled:opacity-50"
                      >
                        {busy === item.id + "document"
                          ? "Otwieranie dokumentu…"
                          : "Otwórz oryginalny dokument"}
                      </button>
                    ) : (
                      <p className="mt-2 text-xs text-destructive">
                        Brak dokumentu w tym wniosku.
                      </p>
                    )}

                    {documentPreview?.id === item.id && (
                      <div className="mt-3 rounded-xl border border-border/70 bg-background p-3">
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <p className="text-xs font-semibold">
                            Podgląd dokumentu
                          </p>
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
                          Poprzednia analiza AI
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
                      </div>
                    )}

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busy.startsWith(item.id)}
                        onClick={() => analyzeVerification(item.id)}
                        className="rounded-xl border border-border/70 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] disabled:opacity-50"
                      >
                        {busy === item.id + "analyze"
                          ? "Analizowanie…"
                          : "Ponów OCR + AI"}
                      </button>

                      <button
                        type="button"
                        disabled={busy.startsWith(item.id)}
                        onClick={() => {
                          if (window.confirm("Przywrócić ten wniosek do oczekujących?")) {
                            decide(item.id, "pending");
                          }
                        }}
                        className="rounded-xl border border-border/70 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] disabled:opacity-50"
                      >
                        Przywróć do oczekujących
                      </button>

                      <button
                        type="button"
                        disabled={busy.startsWith(item.id)}
                        onClick={() => {
                          if (window.confirm("Czy dokument został ponownie sprawdzony i chcesz zaakceptować tego hodowcę?")) {
                            decide(item.id, "approved");
                          }
                        }}
                        className="btn-aura rounded-xl px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] disabled:opacity-50"
                      >
                        Zatwierdź ponownie
                      </button>
                    </div>
                  </article>
                ))}
              </div>
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


        {tab === "reports" && (
          <section className="mt-8 min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">Zgłoszenia naruszeń — Expurr AI</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Analiza wykonywana po zgłoszeniu. Ostateczną decyzję podejmuje moderator.
                </p>
              </div>
              <button
                type="button"
                onClick={loadReports}
                disabled={reportsLoading}
                className="rounded-xl border border-border/70 px-3 py-2 text-xs disabled:opacity-50"
              >
                {reportsLoading ? "Pobieranie..." : "Odśwież zgłoszenia"}
              </button>
            </div>

            {reportsLoading && (
              <p className="mt-4 text-sm text-muted-foreground">Pobieranie zgłoszeń...</p>
            )}

            {!reportsLoading && reportItems.length === 0 && (
              <p className="mt-4 text-sm text-muted-foreground">
                Brak otwartych zgłoszeń.
              </p>
            )}

            <div className="mt-4 space-y-4">
              {reportItems.map((report) => {
                const analysis = getExpurrReportAnalysis(report.details);
                const originalDetails = getOriginalReportDetails(report.details);
                const textResult = analysis?.text;
                const imageResult = analysis?.image;
                const canHide = ["post", "comment", "listing"].includes(report.target_type);

                return (
                  <article
                    key={report.id}
                    className="min-w-0 overflow-hidden rounded-2xl border border-border/70 bg-card/60 p-4"
                  >
                    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                      <h3 className="break-words text-sm font-semibold">
                        {report.target_type} · {report.reason}
                      </h3>
                      <span className="rounded-lg border border-border px-2 py-1 text-[10px]">
                        {report.status}
                      </span>
                    </div>

                    <p className="mt-2 break-all text-[11px] text-muted-foreground">
                      ID treści: {report.target_id}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Zgłaszający: {report.reporter_name || "Anonim"}
                      {" · "}
                      {report.created_date
                        ? new Date(report.created_date).toLocaleString("pl-PL")
                        : "—"}
                    </p>

                    {originalDetails && (
                      <div className="mt-3 rounded-xl bg-background/60 p-3">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Dodatkowe informacje
                        </p>
                        <p className="mt-1 whitespace-pre-wrap break-words text-xs">
                          {originalDetails}
                        </p>
                      </div>
                    )}

                    <div className="mt-3 rounded-xl border border-border/70 p-3">
                      <p className="text-xs font-semibold">Analiza Expurr</p>

                      {!analysis && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Analiza oczekuje na wynik lub nie została jeszcze zapisana.
                        </p>
                      )}

                      {analysis && (
                        <>
                          <p className="mt-2 text-xs">
                            Status: <strong>{analysis.status || "brak danych"}</strong>
                          </p>

                          {textResult && (
                            <div className="mt-3">
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                Analiza tekstu
                              </p>
                              <p className="mt-1 text-xs">
                                Ryzyko: <strong>
                                  {typeof textResult.risk === "number"
                                    ? Math.round(textResult.risk * 100) + "%"
                                    : "brak danych"}
                                </strong>
                                {" · "}
                                Ocena: {textResult.status || "brak"}
                              </p>
                              {Array.isArray(textResult.flags) && textResult.flags.length > 0 && (
                                <p className="mt-1 break-words text-xs text-muted-foreground">
                                  Kategorie: {textResult.flags.join(", ")}
                                </p>
                              )}
                              {textResult.error && (
                                <p className="mt-1 break-words text-xs text-destructive">
                                  {textResult.error}
                                </p>
                              )}
                            </div>
                          )}

                          {imageResult && (
                            <div className="mt-3">
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                Analiza obrazu Qwen3-VL
                              </p>
                              <p className="mt-1 break-words text-xs">
                                Decyzja: <strong>{imageResult.decision || "brak"}</strong>
                                {" · "}
                                Pewność: {typeof imageResult.confidence === "number"
                                  ? Math.round(imageResult.confidence * 100) + "%"
                                  : "brak danych"}
                              </p>
                              {imageResult.summary && (
                                <p className="mt-1 break-words text-xs text-muted-foreground">
                                  {imageResult.summary}
                                </p>
                              )}
                              {Array.isArray(imageResult.categories) &&
                                imageResult.categories.length > 0 && (
                                  <p className="mt-1 break-words text-xs text-muted-foreground">
                                    Kategorie: {imageResult.categories.join(", ")}
                                  </p>
                                )}
                              {imageResult.error && (
                                <p className="mt-1 break-words text-xs text-destructive">
                                  {imageResult.error}
                                </p>
                              )}
                            </div>
                          )}

                          {analysis.media_note && (
                            <p className="mt-2 break-words text-xs text-muted-foreground">
                              {analysis.media_note}
                            </p>
                          )}

                          {analysis.error && (
                            <p className="mt-2 break-words text-xs text-destructive">
                              {analysis.error}
                            </p>
                          )}

                          <p className="mt-3 text-[10px] text-muted-foreground">
                            Wynik AI jest wskazówką. Nie stanowi automatycznej decyzji o naruszeniu.
                          </p>
                        </>
                      )}
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {canHide && (
                        <button
                          type="button"
                          disabled={reportBusy !== ""}
                          onClick={() => decideReport(report.id, "hide")}
                          className="btn-aura rounded-xl px-3 py-2 text-[10px] font-semibold disabled:opacity-40"
                        >
                          {reportBusy === report.id + "hide" ? "Zapisywanie..." : "Ukryj zgłoszoną treść"}
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={reportBusy !== ""}
                        onClick={() => decideReport(report.id, "dismiss")}
                        className="rounded-xl border border-border/70 px-3 py-2 text-[10px] font-semibold disabled:opacity-40"
                      >
                        {reportBusy === report.id + "dismiss" ? "Zapisywanie..." : "Odrzuć zgłoszenie"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {tab === "users" && isFullAdmin && (
          <section className="mt-8 min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold">Zarządzanie użytkownikami</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Maksymalnie 60 kont. Zmiany ról i blokad są zapisywane na serwerze.
                </p>
              </div>
              <button
                type="button"
                onClick={() => loadUsers()}
                disabled={usersLoading}
                className="rounded-xl border border-border/70 px-3 py-2 text-xs"
              >
                Odśwież
              </button>
            </div>

            <form
              className="mt-4 flex min-w-0 flex-col gap-2 sm:flex-row"
              onSubmit={(event) => {
                event.preventDefault();
                loadUsers(usersQuery);
              }}
            >
              <input
                value={usersQuery}
                onChange={(event) => setUsersQuery(event.target.value)}
                placeholder="Szukaj po e-mailu lub nazwisku"
                className="min-w-0 flex-1 rounded-xl border border-border/70 bg-background px-3 py-3 text-sm"
              />
              <button
                type="submit"
                disabled={usersLoading}
                className="rounded-xl btn-aura px-4 py-3 text-xs font-semibold"
              >
                Szukaj
              </button>
            </form>

            <p className="mt-3 text-xs text-muted-foreground">
              {usersLoading ? "Ładowanie kont..." : `Wyniki: ${users.length}`}
            </p>

            <div className="mt-3 grid min-w-0 gap-3">
              {users.map((item) => (
                <article
                  key={item.id}
                  className="min-w-0 rounded-2xl border border-border/70 bg-card/60 p-3 sm:p-4"
                >
                  <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="break-words font-semibold">
                        {item.full_name || "Użytkownik"}
                      </p>
                      <p className="break-all text-xs text-muted-foreground">
                        {item.email}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1 text-[10px]">
                      <span className="rounded-lg border border-border px-2 py-1">
                        {item.role === "admin" ? "Administrator" : item.role === "moderator" ? "Moderator" : "Użytkownik"}
                      </span>
                      <span className={`rounded-lg px-2 py-1 ${item.banned ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"}`}>
                        {item.banned ? "Zablokowany" : "Aktywny"}
                      </span>
                      {item.premium && (
                        <span className="rounded-lg bg-muted px-2 py-1">Premium</span>
                      )}
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>Coins: {item.coins ?? 0}</span>
                    <span>Profil: {item.profile_verified ? "Zweryfikowany" : "Niezweryfikowany"}</span>
                    <span>E-mail: {item.email_verified ? "Potwierdzony" : "Niepotwierdzony"}</span>
                  </div>

                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={() => navigate({
                        to: "/profile/$id",
                        params: { id: item.id },
                      })}
                      className="rounded-xl border border-border/70 px-3 py-2 text-xs font-semibold"
                    >
                      Otwórz profil
                    </button>
                  </div>

                  {item.role !== "admin" && item.id !== user?.id && (
                    <div className="mt-3 flex flex-wrap gap-2 border-t border-border/60 pt-3">
                      <button
                        type="button"
                        disabled={usersBusy === item.id}
                        onClick={() => updateManagedUser(item, {
                          role: item.role === "moderator" ? "user" : "moderator"
                        })}
                        className="rounded-xl border border-border/70 px-3 py-2 text-xs"
                      >
                        {item.role === "moderator" ? "Odbierz moderatora" : "Nadaj moderatora"}
                      </button>
                        <button
                          type="button"
                          disabled={usersBusy === item.id}
                          onClick={() => updateManagedUser(item, { banned: !item.banned })}
                          className="rounded-xl border border-border/70 px-3 py-2 text-xs"
                        >
                          {item.banned ? "Odblokuj konto" : "Zablokuj konto"}
                        </button>
                        <button
                          type="button"
                          disabled={usersBusy === item.id}
                          onClick={() => deleteManagedUser(item)}
                          className="rounded-xl border border-destructive/50 px-3 py-2 text-xs text-destructive disabled:opacity-50"
                        >
                          {usersBusy === item.id ? "Przetwarzanie..." : "Usuń konto"}
                        </button>
                    </div>
                  )}
                </article>
              ))}

              {!usersLoading && users.length === 0 && (
                <p className="rounded-xl border border-border/60 p-4 text-sm text-muted-foreground">
                  Brak użytkowników do wyświetlenia.
                </p>
              )}
            </div>
          </section>
        )}

        {tab === "audit" && isFullAdmin && (
          <section className="mt-8 min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">Dziennik audytowy</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Ostatnie 100 zarejestrowanych działań administratorów i moderatorów.
                </p>
              </div>
              <button
                type="button"
                onClick={loadAudit}
                disabled={auditLoading}
                className="rounded-xl border border-border/70 px-3 py-2 text-xs"
              >
                Odśwież
              </button>
            </div>

            <p className="mt-3 text-xs text-muted-foreground">
              {auditLoading ? "Pobieranie historii..." : `Wpisy: ${auditItems.length}`}
            </p>

            <div className="mt-3 grid min-w-0 gap-3">
              {auditItems.map((item) => (
                <article
                  key={item.id}
                  className="min-w-0 rounded-2xl border border-border/70 bg-card/60 p-3 sm:p-4"
                >
                  <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                    <p className="break-words text-sm font-semibold">{item.action}</p>
                    <span className="rounded-lg border border-border px-2 py-1 text-[10px]">
                      {item.actor_role}
                    </span>
                  </div>
                  <p className="mt-2 break-all text-xs text-muted-foreground">
                    Administrator/moderator ID: {item.actor_id}
                  </p>
                  <p className="mt-1 break-all text-xs text-muted-foreground">
                    Cel: {item.target_type} / {item.target_id}
                  </p>
                  {item.summary && (
                    <p className="mt-2 break-words text-xs">{item.summary}</p>
                  )}
                  <p className="mt-2 text-[10px] text-muted-foreground">
                    {item.created_date
                      ? new Date(item.created_date).toLocaleString("pl-PL")
                      : "Brak daty"}
                  </p>
                </article>
              ))}
              {!auditLoading && auditItems.length === 0 && (
                <p className="rounded-xl border border-border/60 p-4 text-sm text-muted-foreground">
                  Brak zapisanych działań. Sprawdź, czy migracja audytu została wdrożona.
                </p>
              )}
            </div>
          </section>
        )}

        {tab === "moderators" && isFullAdmin && (
          <section className="mt-8 min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">Statystyki moderatorów</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Liczba zarejestrowanych działań według kont i rodzaju czynności.
                </p>
              </div>
              <button
                type="button"
                onClick={loadModeratorStats}
                disabled={moderatorStatsLoading}
                className="rounded-xl border border-border/70 px-3 py-2 text-xs"
              >
                Odśwież
              </button>
            </div>

            <p className="mt-3 text-xs text-muted-foreground">
              {moderatorStatsLoading
                ? "Pobieranie statystyk..."
                : `Liczba kont z działaniami: ${moderatorStats.length}`}
            </p>

            <div className="mt-3 grid min-w-0 gap-3">
              {moderatorStats.map((item) => (
                <article
                  key={item.actor_id}
                  className="min-w-0 rounded-2xl border border-border/70 bg-card/60 p-3 sm:p-4"
                >
                  <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                    <p className="break-all text-xs font-semibold">
                      ID: {item.actor_id}
                    </p>
                    <span className="rounded-lg border border-border px-2 py-1 text-[10px]">
                      {item.actor_role}
                    </span>
                  </div>
                  <p className="mt-2 font-display text-2xl">{item.total ?? 0}</p>
                  <p className="text-[10px] text-muted-foreground">Łączna liczba działań</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {Object.entries(item.actions || {}).map(([action, count]) => (
                      <span
                        key={action}
                        className="max-w-full break-all rounded-lg bg-muted px-2 py-1 text-[10px]"
                      >
                        {action}: {count}
                      </span>
                    ))}
                  </div>
                </article>
              ))}
              {!moderatorStatsLoading && moderatorStats.length === 0 && (
                <p className="rounded-xl border border-border/60 p-4 text-sm text-muted-foreground">
                  Brak danych o działaniach moderatorów.
                </p>
              )}
            </div>
          </section>
        )}

        {tab === "events" && isFullAdmin && (
          <section className="mt-8 min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">Zarządzanie wydarzeniami</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Usuwanie wydarzeń jest dostępne wyłącznie administratorowi głównemu.
                </p>
              </div>
              <button
                type="button"
                onClick={loadEvents}
                disabled={eventsLoading}
                className="rounded-xl border border-border/70 px-3 py-2 text-xs disabled:opacity-50"
              >
                {eventsLoading ? "Odświeżanie..." : "Odśwież"}
              </button>
            </div>

            {eventsLoading && (
              <p className="mt-4 text-sm text-muted-foreground">Pobieranie wydarzeń...</p>
            )}

            {!eventsLoading && eventItems.length === 0 && (
              <p className="mt-4 rounded-xl border border-border/60 p-4 text-sm text-muted-foreground">
                Brak wydarzeń.
              </p>
            )}

            <div className="mt-4 grid min-w-0 gap-3">
              {eventItems.map((item) => (
                <article
                  key={item.id}
                  className="min-w-0 rounded-2xl border border-border/70 bg-card/60 p-4"
                >
                  <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="break-words text-sm font-semibold">{item.title}</h3>
                      <p className="mt-1 break-words text-xs text-muted-foreground">
                        {item.city || "—"} · {item.location || "Miejsce niepodane"}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {item.start_date
                          ? new Date(item.start_date).toLocaleString("pl-PL")
                          : "Brak daty"}
                        {" · "}
                        {item.attendance_count ?? 0} uczestników
                      </p>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        Status: {item.status || "—"} · Organizator: {item.organizer_name || "—"}
                      </p>
                    </div>

                    <button
                      type="button"
                      disabled={eventsBusy === item.id}
                      onClick={() => deleteManagedEvent(item)}
                      className="shrink-0 rounded-xl border border-destructive/50 px-3 py-2 text-xs font-semibold text-destructive disabled:opacity-50"
                    >
                      {eventsBusy === item.id ? "Usuwanie..." : "Usuń wydarzenie"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {tab === "media" && (
          <section className="mt-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">
                  Expurr — moderacja multimediów
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Materiały pozostają w prywatnej kwarantannie do decyzji moderatora.
                </p>
              </div>
              <button
                type="button"
                onClick={loadMediaQueue}
                disabled={mediaLoading}
                className="rounded-xl border border-border/70 px-3 py-2 text-xs"
              >
                {mediaLoading ? "Odświeżanie..." : "Odśwież kolejkę"}
              </button>
            </div>

            {mediaLoading && (
              <p className="mt-4 text-sm text-muted-foreground">
                Pobieranie kolejki...
              </p>
            )}

            {!mediaLoading && mediaItems.length === 0 && (
              <p className="mt-4 text-sm text-muted-foreground">
                Brak materiałów oczekujących na decyzję.
              </p>
            )}

            <div className="mt-4 grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {mediaItems.map((item) => (
                <article
                  key={item.id}
                  className="min-w-0 overflow-hidden rounded-2xl border border-border/70 bg-card/60 p-3"
                >
                  <div className="flex min-w-0 items-center justify-between gap-2">
                    <p className="min-w-0 break-words text-sm font-semibold">
                      {item.original_name || "Przesłany obraz"}
                    </p>
                    <span className="shrink-0 rounded-lg border border-border px-2 py-1 text-[10px]">
                      {item.status}
                    </span>
                  </div>

                  <p className="mt-1 break-all text-[10px] text-muted-foreground">
                    {item.mime_type || "Nieznany format"} ·
                    {Math.round((item.size || 0) / 1024)} KB
                  </p>

                  {mediaPreviews[item.id] ? (
                    <img
                      src={mediaPreviews[item.id]}
                      alt="Prywatny podgląd materiału"
                      className="mt-3 max-h-72 w-full rounded-xl bg-black/10 object-contain"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => openMediaPreview(item.id)}
                      className="mt-3 w-full rounded-xl border border-border/70 px-3 py-3 text-xs"
                    >
                      Otwórz prywatny podgląd
                    </button>
                  )}

                  {item.analysis && (
                    <div className="mt-3 rounded-xl bg-background/60 p-3">
                      <p className="text-xs font-semibold">Analiza Qwen3-VL</p>
                      <p className="mt-1 break-words text-xs text-muted-foreground">
                        {item.analysis.summary || "Brak opisu analizy."}
                      </p>
                      <p className="mt-2 text-[10px] text-muted-foreground">
                        Decyzja: {item.analysis.decision || item.decision || "brak"}
                        {" · "}
                        Pewność: {typeof item.analysis.confidence === "number"
                          ? Math.round(item.analysis.confidence * 100) + "%"
                          : "brak danych"}
                      </p>
                      {Array.isArray(item.analysis.categories) &&
                        item.analysis.categories.length > 0 && (
                          <p className="mt-1 break-words text-[10px] text-muted-foreground">
                            Kategorie: {item.analysis.categories.join(", ")}
                          </p>
                        )}
                    </div>
                  )}

                  <p className="mt-2 text-[10px] text-muted-foreground">
                    Dodano: {item.created_at
                      ? new Date(item.created_at).toLocaleString("pl-PL")
                      : "—"}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={mediaBusy !== "" || item.status !== "review"}
                      onClick={() => decideMedia(item.id, "approve")}
                      className="btn-aura rounded-xl px-3 py-2 text-[10px] font-semibold disabled:opacity-40"
                    >
                      {mediaBusy === item.id + "approve"
                        ? "Zapisywanie..."
                        : "Zatwierdź i publikuj"}
                    </button>
                    <button
                      type="button"
                      disabled={mediaBusy !== ""}
                      onClick={() => decideMedia(item.id, "reject")}
                      className="rounded-xl border border-border/70 px-3 py-2 text-[10px] font-semibold disabled:opacity-40"
                    >
                      {mediaBusy === item.id + "reject"
                        ? "Odrzucanie..."
                        : "Odrzuć"}
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
