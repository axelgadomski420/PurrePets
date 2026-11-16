import { useEffect, useRef, useState } from "react";
import { Bot, MapPin, Navigation, PawPrint, Phone, Send, Sparkles, Stethoscope, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { cn } from "@/lib/utils";

const SUGGESTIONS = [
  "Jak często szczepić szczeniaka?",
  "Czym karmić sterylizowanego kota?",
  "Pomóż mi napisać opis ogłoszenia",
  "Checklista opieki nad miotem",
  "Jak przygotować psa do wizyty u weterynarza?",
  "Do czego służą PURRE Coins?",
];

/**
 * Asystent AI połączony z lokalną Ollamą przez POST /api/ai/chat.
 * Fallback: stary endpoint /api/assistant/ask (tryb reguł).
 */
export default function AssistantPanel() {
  const { isAuthenticated, user, navigateToLogin } = useAuth();
  const [open, setOpen] = useState(false);
  const [pets, setPets] = useState([]);
  const [petId, setPetId] = useState("");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      text: "Witaj! Jestem Expurr — Twój przewodnik po świecie psów i kotów. Pomagam zrozumieć potrzeby zwierząt, ich zachowanie, żywienie, pielęgnację i profilaktykę. Możesz wybrać swojego pupila, aby odpowiedzi uwzględniały jego dane.",
      source: "rules",
    },
  ]);
  const [health, setHealth] = useState(null);
  const [conversationId, setConversationId] = useState("");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [vetLoading, setVetLoading] = useState(false);
  const [vetResults, setVetResults] = useState([]);
  const [vetError, setVetError] = useState("");
  const [vetSearchUrl, setVetSearchUrl] = useState("");
  const [vetRadius, setVetRadius] = useState("15");
  const endRef = useRef(null);

  useEffect(() => {
    if (!open || !user) return;
    base44.entities.Pet.filter({ owner_id: user.id }, { limit: 20 })
      .then((page) => setPets(page.items ?? []))
      .catch(() => setPets([]));
  }, [open, user]);

  useEffect(() => {
    if (!open || !isAuthenticated || !user) return;

    let active = true;
    setHistoryLoading(true);

    const restoreHistory = async () => {
      try {
        const result = await base44.functions.aiConversations();
        let conversation = result?.items?.[0];

        if (!conversation?.id) {
          const created = await base44.functions.createAiConversation();
          conversation = created?.conversation;
        }

        if (!conversation?.id) throw new Error("Nie udało się otworzyć rozmowy.");

        const history = await base44.functions.aiConversationMessages(conversation.id);
        if (!active) return;

        setConversationId(conversation.id);
        if (Array.isArray(history?.items) && history.items.length) {
          setMessages(history.items.map((item) => ({
            role: item.role,
            text: item.text,
            source: item.role === "assistant" ? "ollama" : undefined,
          })));
        }
      } catch (error) {
        if (active) {
          setMessages((current) => current.length > 1 ? current : [
            current[0],
            { role: "assistant", text: error?.message || "Nie udało się odtworzyć historii.", source: "error" },
          ]);
        }
      } finally {
        if (active) setHistoryLoading(false);
      }
    };

    void restoreHistory();
    return () => { active = false; };
  }, [open, isAuthenticated, user]);

  useEffect(() => {
    if (!open) return;

    let active = true;
    setHealth(null);

    const loadHealth = async () => {
      try {
        const result = await base44.functions.aiHealth();
        if (active) setHealth(result);
      } catch {
        try {
          const result = await base44.functions.assistantHealth();
          if (active) setHealth(result);
        } catch {
          if (active) {
            setHealth({ ollama: false, model: null });
          }
        }
      }
    };

    void loadHealth();

    return () => {
      active = false;
    };
  }, [open]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  const startNewConversation = async () => {
    if (busy || historyLoading) return;
    try {
      setHistoryLoading(true);
      const result = await base44.functions.createAiConversation();
      const id = result?.conversation?.id;
      if (!id) throw new Error("Nie udało się utworzyć rozmowy.");
      setConversationId(id);
      setMessages([{
        role: "assistant",
        text: "Nowa rozmowa. Jestem Expurr — w czym mogę pomóc?",
        source: "rules",
      }]);
    } catch (error) {
      setMessages((current) => [...current, {
        role: "assistant",
        text: error?.message || "Nie udało się utworzyć nowej rozmowy.",
        source: "error",
      }]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const ask = async (question) => {
    const q = (question || input).trim();
    if (!q || busy) return;
    if (!isAuthenticated) {
      navigateToLogin();
      return;
    }
    setInput("");
    setMessages((m) => [...m, { role: "user", text: q }]);
    setBusy(true);
    try {
      let activeConversationId = conversationId;
      if (!activeConversationId) {
        const created = await base44.functions.createAiConversation();
        activeConversationId = created?.conversation?.id;
        if (!activeConversationId) throw new Error("Nie udało się utworzyć rozmowy.");
        setConversationId(activeConversationId);
      }

      // Główna ścieżka: lokalny LLM (Ollama) przez /api/ai/chat.
      const result = await base44.functions.aiChat({
        message: q,
        prompt: q,
        conversation_id: activeConversationId,
        ...(petId ? { pet_id: petId } : {}),
      });
      const answer = result?.response || result?.answer || "…";
      setMessages((m) => [...m, { role: "assistant", text: answer, source: "ollama" }]);
    } catch (err) {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: err?.message || "Expurr jest chwilowo niedostępny. Spróbuj ponownie za chwilę.",
          source: "error",
        },
      ]);
    } finally {
      setBusy(false);
    }
  };


  const findNearbyVets = async () => {
    if (!isAuthenticated) {
      navigateToLogin();
      return;
    }

    if (!navigator.geolocation) {
      setVetError("Ta przeglądarka nie udostępnia GPS.");
      return;
    }

    setVetLoading(true);
    setVetError("");
    setVetResults([]);
    setVetSearchUrl("");

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const result = await base44.functions.nearbyVets({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            radiusKm: Number(vetRadius),
          });

          setVetResults(result?.items ?? []);
          setVetSearchUrl(result?.search_url ?? "");

          if (!result?.items?.length) {
            setVetError(
              "Nie znaleziono oznaczonych lecznic w OpenStreetMap w tym promieniu. Możesz sprawdzić Mapy Google."
            );
          }
        } catch (error) {
          setVetError(
            error?.message ||
            "Nie udało się wyszukać lecznic. Spróbuj ponownie."
          );

          if (error?.data?.search_url) {
            setVetSearchUrl(error.data.search_url);
          }
        } finally {
          setVetLoading(false);
        }
      },
      (error) => {
        const messages = {
          1: "Nie udzielono zgody na lokalizację. Zezwól na GPS, aby znaleźć lecznice.",
          2: "Nie udało się ustalić lokalizacji urządzenia.",
          3: "Odczyt GPS trwał zbyt długo. Spróbuj ponownie.",
        };

        setVetError(
          messages[error?.code] ||
          "Nie udało się odczytać lokalizacji."
        );
        setVetLoading(false);
      },
      {
        enableHighAccuracy: false,
        timeout: 12000,
        maximumAge: 60000,
      }
    );
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-24 right-4 z-40 grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br from-violet to-aura text-black shadow-lg shadow-aura/20 lg:bottom-8"
        aria-label="Expurr — ekspert psów i kotów"
      >
        {open ? <X className="h-5 w-5" /> : <Bot className="h-5 w-5" />}
      </button>

      {open && (
        <div className="fixed bottom-40 right-4 z-40 flex h-[min(520px,70dvh)] w-[min(380px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-border/70 bg-card/95 shadow-2xl backdrop-blur-xl lg:bottom-24">
          <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
            <Sparkles className="h-4 w-4 text-aura" />
            <div className="min-w-0 flex-1">
              <p className="font-display text-sm">Expurr — ekspert psów i kotów</p>
              <p className="text-[10px] text-muted-foreground">
                {historyLoading
                    ? "Odtwarzam historię…"
                    : health === null
                      ? "Sprawdzam połączenie…"
                      : health.ollama
                        ? `Ollama · ${health.model ?? "lokalny model"}`
                        : "Model chwilowo niedostępny"}
              </p>
            </div>
            <button
              type="button"
              onClick={startNewConversation}
              disabled={busy || historyLoading}
              className="shrink-0 rounded-lg border border-border/60 px-2 py-1 text-[10px] text-muted-foreground disabled:opacity-50"
            >
              Nowa
            </button>
          </div>

          <section className="min-w-0 space-y-2 border-b border-border/40 p-2">
            <div className="flex min-w-0 gap-2">
              <button
                type="button"
                onClick={findNearbyVets}
                disabled={vetLoading}
                className="inline-flex min-h-10 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl border border-aura/40 bg-aura/10 px-2 text-xs font-semibold text-foreground disabled:opacity-50"
              >
                <Stethoscope className="h-4 w-4 shrink-0 text-aura" />
                <span className="truncate">
                  {vetLoading ? "Szukam lecznic…" : "Weterynarze w pobliżu"}
                </span>
              </button>

              <select
                aria-label="Promień wyszukiwania lecznic"
                value={vetRadius}
                onChange={(event) => setVetRadius(event.target.value)}
                className="min-h-10 w-[82px] shrink-0 rounded-xl border border-border/60 bg-background px-2 text-xs"
              >
                <option value="5">5 km</option>
                <option value="10">10 km</option>
                <option value="15">15 km</option>
                <option value="20">20 km</option>
                <option value="30">30 km</option>
              </select>
            </div>

            {vetError && (
              <p className="break-words text-[11px] text-muted-foreground">
                {vetError}
              </p>
            )}

            {vetResults.length > 0 && (
              <div className="max-h-40 space-y-2 overflow-y-auto">
                {vetResults.map((vet) => (
                  <article
                    key={vet.id}
                    className="min-w-0 rounded-xl border border-border/60 bg-secondary/30 p-2.5"
                  >
                    <div className="flex min-w-0 items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-xs font-semibold text-foreground">
                          {vet.name}
                        </p>
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          <MapPin className="mr-1 inline h-3 w-3" />
                          {vet.distance_km} km
                          {vet.address ? " · " + vet.address : ""}
                        </p>
                      </div>
                      {vet.emergency && (
                        <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-1 text-[9px] font-semibold text-amber-700">
                          24 h
                        </span>
                      )}
                    </div>

                    {vet.opening_hours && (
                      <p className="mt-1 break-words text-[10px] text-muted-foreground">
                        Godziny: {vet.opening_hours}
                      </p>
                    )}

                    <div className="mt-2 flex flex-wrap gap-2">
                      {vet.phone && (
                        <a
                          href={"tel:" + vet.phone}
                          className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-border/60 px-2.5 text-[10px] font-medium"
                        >
                          <Phone className="h-3 w-3" />
                          Zadzwoń
                        </a>
                      )}

                      <a
                        href={vet.maps_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-aura/15 px-2.5 text-[10px] font-semibold text-foreground"
                      >
                        <Navigation className="h-3 w-3" />
                        Nawiguj
                      </a>

                      {vet.website && (
                        <a
                          href={vet.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex min-h-9 items-center rounded-lg border border-border/60 px-2.5 text-[10px]"
                        >
                          Strona
                        </a>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}

            {vetSearchUrl && (
              <a
                href={vetSearchUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-9 items-center gap-1 text-[10px] font-medium text-aura underline underline-offset-2"
              >
                <Navigation className="h-3 w-3" />
                Otwórz wszystkie wyniki w Mapach Google
              </a>
            )}

            <p className="text-[9px] leading-relaxed text-muted-foreground">
              Lokalizacja jest pobierana wyłącznie po kliknięciu. Wyniki pochodzą
              z OpenStreetMap i mogą być niekompletne — zadzwoń do lecznicy,
              aby potwierdzić dyżur i dostępność.
            </p>
          </section>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={cn(
                  "max-w-[90%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm",
                  msg.role === "user"
                    ? "ml-auto bg-aura/20 text-foreground"
                    : "bg-secondary/60 text-muted-foreground"
                )}
              >
                {msg.text}
              </div>
            ))}
            {busy && (
              <div className="max-w-[90%] rounded-2xl bg-secondary/60 px-3 py-2 text-sm text-muted-foreground">
                <span className="animate-pulse">Piszę…</span>
              </div>
            )}
            <div ref={endRef} />
          </div>

          {pets.length > 0 && (
            <div className="border-t border-border/40 px-3 py-2">
              <label className="flex items-center gap-2 text-[10px] text-muted-foreground">
                <PawPrint className="h-3.5 w-3.5 text-aura" />
                <span className="shrink-0">Kontekst zwierzaka:</span>
                <select
                  value={petId}
                  onChange={(e) => setPetId(e.target.value)}
                  className="h-7 min-w-0 flex-1 rounded-lg border border-border/60 bg-background/50 px-1.5 text-[11px] outline-none"
                >
                  <option value="" className="bg-popover">Brak (rozmowa ogólna)</option>
                  {pets.map((p) => (
                    <option key={p.id} value={p.id} className="bg-popover">
                      {p.name}{p.breed ? ` (${p.breed})` : ""}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          <div className="no-scrollbar flex gap-1 overflow-x-auto border-t border-border/40 px-2 py-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => ask(s)}
                className="shrink-0 rounded-full border border-border/60 px-2.5 py-1 text-[10px] text-muted-foreground"
              >
                {s}
              </button>
            ))}
          </div>

          <form
            className="flex gap-2 border-t border-border/60 p-2"
            onSubmit={(e) => {
              e.preventDefault();
              ask();
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Zadaj pytanie…"
              className="h-10 flex-1 rounded-xl border border-border/60 bg-background/50 px-3 text-sm outline-none"
            />
            <button
              type="submit"
              disabled={busy}
              className="grid h-10 w-10 place-items-center rounded-xl bg-aura text-black disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
