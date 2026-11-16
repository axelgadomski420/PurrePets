import { useRef, useState } from "react";
import { FileCheck2, Loader2, Send, Sparkles, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const RISK_COLORS = { low: "text-aura", medium: "text-yellow-400", high: "text-destructive" };
const RISK_LABELS = { low: "Niskie ryzyko", medium: "Średnie ryzyko", high: "Wysokie ryzyko" };

/**
 * AssistantPanel — PURRE Assistant (Ollama /api/ai/chat) + AI sprawdzanie
 * dokumentów hodowlanych (/api/ai/check-document): wklej treść lub wczytaj .txt.
 */
export default function AssistantPanel() {
  const { t } = useI18n();
  const { isAuthenticated, navigateToLogin } = useAuth();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("chat");
  const [question, setQuestion] = useState("");
  const [thread, setThread] = useState([]);
  const [busy, setBusy] = useState(false);

  // dokumenty
  const [docText, setDocText] = useState("");
  const [docKind, setDocKind] = useState("contract");
  const [docResult, setDocResult] = useState(null);
  const fileRef = useRef(null);

  const guard = () => {
    if (!isAuthenticated) {
      navigateToLogin();
      return false;
    }
    return true;
  };

  const send = async () => {
    const text = question.trim();
    if (!text || busy || !guard()) return;
    setThread((prev) => [...prev, { role: "user", text }]);
    setQuestion("");
    setBusy(true);
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("purre_access_token") ?? ""}` },
        body: JSON.stringify({ message: text, history: thread.slice(-6) }),
      });
      const data = await res.json().catch(() => ({}));
      setThread((prev) => [...prev, { role: "assistant", text: data?.answer ?? data?.error ?? "Asystent jest chwilowo niedostępny." }]);
    } catch {
      setThread((prev) => [...prev, { role: "assistant", text: "Brak połączenia z asystentem." }]);
    } finally {
      setBusy(false);
    }
  };

  const readDocFile = async (file) => {
    if (!file) return;
    if (file.size > 512 * 1024) {
      setDocResult({ summary: "Plik za duży — wklej treść dokumentu ręcznie (max 0,5 MB .txt)." });
      return;
    }
    const text = await file.text();
    setDocText(text.slice(0, 12000));
  };

  const checkDocument = async () => {
    if (busy || !guard()) return;
    if (docText.trim().length < 20) {
      setDocResult({ summary: "Wklej treść dokumentu (min. 20 znaków) i spróbuj ponownie." });
      return;
    }
    setBusy(true);
    setDocResult(null);
    try {
      const res = await fetch("/api/ai/check-document", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("purre_access_token") ?? ""}` },
        body: JSON.stringify({ text: docText, kind: docKind }),
      });
      const data = await res.json().catch(() => ({}));
      setDocResult(data);
    } catch {
      setDocResult({ summary: "Nie udało się przeanalizować dokumentu." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-24 right-4 z-40 flex items-center gap-2 rounded-full bg-gradient-to-br from-violet to-aura px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-background shadow-[0_18px_40px_-18px_hsl(var(--violet))] lg:bottom-6 lg:right-6"
      >
        <Sparkles className="h-4 w-4" /> Assistant
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-end bg-black/50 p-0 backdrop-blur-sm sm:p-6">
          <div className="flex h-[80vh] w-full max-w-md flex-col rounded-t-[var(--radius)] border border-border/70 bg-card/95 sm:rounded-[var(--radius)]">
            <header className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
              <Sparkles className="h-4 w-4 text-aura" />
              <p className="text-sm font-semibold">{t("assistant.title")}</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="ml-auto grid h-8 w-8 place-items-center rounded-lg border border-border/70"
                aria-label={t("common.cancel")}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </header>

            <div className="flex gap-2 px-4 pt-3">
              {[
                { id: "chat", label: "Czat", icon: Sparkles },
                { id: "doc", label: "Sprawdź dokument", icon: FileCheck2 },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMode(m.id)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em]",
                    mode === m.id ? "bg-foreground text-background" : "border border-border/70 text-muted-foreground"
                  )}
                >
                  <m.icon className="h-3 w-3" /> {m.label}
                </button>
              ))}
            </div>

            {mode === "chat" ? (
              <>
                <div className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
                  {thread.length === 0 && (
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      Zapytaj o rasę, opiekę, dokumenty hodowlane albo bezpieczeństwo ogłoszenia.
                    </p>
                  )}
                  {thread.map((message, index) => (
                    <div
                      key={index}
                      className={`max-w-[85%] rounded-2xl px-3 py-2 text-[12px] leading-relaxed ${
                        message.role === "user"
                          ? "ml-auto bg-violet/25 text-foreground"
                          : "border border-border/60 bg-background/40"
                      }`}
                    >
                      {message.text}
                    </div>
                  ))}
                  {busy && (
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("common.loading")}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 border-t border-border/60 p-3">
                  <input
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") send();
                    }}
                    placeholder={t("assistant.placeholder")}
                    className="h-10 flex-1 rounded-xl border border-border/70 bg-background/40 px-3 text-[12px] outline-none focus:border-violet/60"
                  />
                  <button
                    type="button"
                    onClick={send}
                    disabled={busy || !question.trim()}
                    className="btn-aura grid h-10 w-10 place-items-center rounded-xl disabled:opacity-50"
                    aria-label={t("assistant.send")}
                  >
                    <Send className="h-3.5 w-3.5" />
                  </button>
                </div>
              </>
            ) : (
              <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Wklej treść umowy, rodowodu lub zaświadczenia — AI (Ollama, lokalnie) oceni ryzyko,
                  wskaże braki i podejrzane zapisy.
                </p>
                <div className="flex gap-2">
                  {[
                    { id: "contract", label: "Umowa" },
                    { id: "pedigree", label: "Rodowód" },
                    { id: "certificate", label: "Zaświadczenie" },
                    { id: "other", label: "Inny" },
                  ].map((k) => (
                    <button
                      key={k.id}
                      type="button"
                      onClick={() => setDocKind(k.id)}
                      className={cn(
                        "rounded-full px-2.5 py-1 text-[9px] uppercase tracking-wider",
                        docKind === k.id ? "bg-aura/20 text-aura ring-1 ring-aura/40" : "border border-border/70 text-muted-foreground"
                      )}
                    >
                      {k.label}
                    </button>
                  ))}
                </div>
                <textarea
                  value={docText}
                  onChange={(e) => setDocText(e.target.value)}
                  rows={6}
                  maxLength={12000}
                  placeholder="Wklej treść dokumentu…"
                  className="w-full rounded-xl border border-border/70 bg-background/40 px-3 py-2 text-[12px] outline-none focus:border-violet/60"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="rounded-xl border border-border/70 px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground"
                  >
                    Wczytaj .txt
                  </button>
                  <input ref={fileRef} type="file" accept=".txt,.md,text/plain" className="hidden" onChange={(e) => { readDocFile(e.target.files?.[0]); e.target.value = ""; }} />
                  <button
                    type="button"
                    onClick={checkDocument}
                    disabled={busy}
                    className="btn-aura flex-1 rounded-xl py-2 text-[10px] font-semibold uppercase tracking-[0.18em] disabled:opacity-50"
                  >
                    {busy ? "Analizuję…" : "Sprawdź dokument"}
                  </button>
                </div>

                {docResult && (
                  <div className="space-y-2 rounded-2xl border border-border/70 bg-background/40 p-3">
                    {docResult.risk_level && (
                      <p className={`text-[11px] font-bold uppercase tracking-wider ${RISK_COLORS[docResult.risk_level] ?? ""}`}>
                        {RISK_LABELS[docResult.risk_level] ?? docResult.risk_level}
                        {typeof docResult.risk_score === "number" ? ` · ${docResult.risk_score}/100` : ""}
                      </p>
                    )}
                    <p className="text-[12px] leading-relaxed">{docResult.summary}</p>
                    {docResult.findings?.length > 0 && (
                      <ul className="list-disc space-y-1 pl-4 text-[11px] text-muted-foreground">
                        {docResult.findings.map((finding, i) => (
                          <li key={i}>{finding}</li>
                        ))}
                      </ul>
                    )}
                    {docResult.checklist?.length > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-aura">Co uzupełnić</p>
                        <ul className="mt-1 list-disc space-y-1 pl-4 text-[11px] text-muted-foreground">
                          {docResult.checklist.map((item, i) => (
                            <li key={i}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
