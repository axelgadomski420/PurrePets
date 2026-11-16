import { useEffect, useRef, useState } from "react";
import { Bot, PawPrint, Send, Sparkles, X } from "lucide-react";
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
      text: "Cześć — jestem PURRE Assistant. Zapytaj o opiekę, żywienie, zachowanie, hodowlę, ogłoszenia lub obsługę aplikacji. Możesz wybrać swojego zwierzaka jako kontekst rozmowy.",
      source: "rules",
    },
  ]);
  const [health, setHealth] = useState(null);
  const endRef = useRef(null);

  useEffect(() => {
    if (!open || !user) return;
    base44.entities.Pet.filter({ owner_id: user.id }, { limit: 20 })
      .then((page) => setPets(page.items ?? []))
      .catch(() => setPets([]));
  }, [open, user]);

  useEffect(() => {
    if (!open) return;
    base44.functions
      .aiHealth()
      .then((h) => setHealth(h))
      .catch(() => {
        base44.functions
          .askAssistant({ question: "health" })
          .then(setHealth)
          .catch(() => null);
      });
  }, [open]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  const ask = async (question) => {
    const q = (question || input).trim();
    if (!q || busy) return;
    if (!isAuthenticated) {
      navigateToLogin();
      return;
    }
    setInput("");
    const history = messages.slice(-8).map((m) => ({ role: m.role, text: m.text }));
    setMessages((m) => [...m, { role: "user", text: q }]);
    setBusy(true);
    try {
      // Główna ścieżka: lokalny LLM (Ollama) przez /api/ai/chat.
      const result = await base44.functions.aiChat({
        message: q,
        prompt: q,
        history,
        ...(petId ? { pet_id: petId } : {}),
      });
      const answer = result?.response || result?.answer || "…";
      setMessages((m) => [...m, { role: "assistant", text: answer, source: "ollama" }]);
    } catch (err) {
      // Fallback: stary asystent regułowy.
      try {
        const result = await base44.functions.askAssistant({ question: q });
        setMessages((m) => [
          ...m,
          { role: "assistant", text: result?.answer || String(result), source: result?.source || "rules" },
        ]);
      } catch (fallbackErr) {
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            text: fallbackErr?.message || err?.message || "Nie udało się uzyskać odpowiedzi.",
            source: "error",
          },
        ]);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-24 right-4 z-40 grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br from-violet to-aura text-black shadow-lg shadow-aura/20 lg:bottom-8"
        aria-label="PURRE Assistant"
      >
        {open ? <X className="h-5 w-5" /> : <Bot className="h-5 w-5" />}
      </button>

      {open && (
        <div className="fixed bottom-40 right-4 z-40 flex h-[min(520px,70dvh)] w-[min(380px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-border/70 bg-card/95 shadow-2xl backdrop-blur-xl lg:bottom-24">
          <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
            <Sparkles className="h-4 w-4 text-aura" />
            <div className="min-w-0 flex-1">
              <p className="font-display text-sm">PURRE Assistant</p>
              <p className="text-[10px] text-muted-foreground">
                {health?.ollama ? `Ollama · ${health.model ?? "lokalny model"}` : "Łączę z modelem…"}
              </p>
            </div>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
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
