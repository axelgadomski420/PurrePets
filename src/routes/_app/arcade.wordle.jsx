import { useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import GameShell from "@/components/arcade/GameShell";
import { useGameSubmit } from "@/components/arcade/useGameSubmit";

export const Route = createFileRoute("/_app/arcade/wordle")({
  head: () => ({ meta: [{ title: "PURRE PETS — PURRE Wordle" }] }),
  component: WordlePage,
});

const WORDS = [
  "HUSKY",
  "CORGI",
  "SHIBA",
  "PUDEL",
  "BOXER",
  "AKITA",
  "MAINE",
  "SIAMS",
  "RAGDO",
  "PERSA",
  "SPITZ",
  "COLLI",
];

function scoreGuess(guess, answer) {
  const res = Array(5).fill("absent");
  const pool = answer.split("");
  for (let i = 0; i < 5; i++) {
    if (guess[i] === answer[i]) {
      res[i] = "correct";
      pool[i] = null;
    }
  }
  for (let i = 0; i < 5; i++) {
    if (res[i] !== "correct") {
      const idx = pool.indexOf(guess[i]);
      if (idx >= 0) {
        res[i] = "present";
        pool[idx] = null;
      }
    }
  }
  return res;
}

function WordlePage() {
  const answer = useMemo(() => WORDS[Math.floor(Math.random() * WORDS.length)], []);
  const [rows, setRows] = useState([]);
  const [draft, setDraft] = useState("");
  const [done, setDone] = useState(false);
  const [won, setWon] = useState(false);
  const started = useRef(Date.now());
  const submitted = useRef(false);
  const { finish, reset, submitting, result, error } = useGameSubmit("wordle");

  const submitGuess = () => {
    if (done || draft.length !== 5) return;
    const guess = draft.toUpperCase();
    const marks = scoreGuess(guess, answer);
    const next = [...rows, { guess, marks }];
    setRows(next);
    setDraft("");
    if (guess === answer) {
      setWon(true);
      setDone(true);
      if (!submitted.current) {
        submitted.current = true;
        const points = Math.max(50, 600 - next.length * 80);
        finish(points, Date.now() - started.current);
      }
    } else if (next.length >= 6) {
      setDone(true);
      if (!submitted.current) {
        submitted.current = true;
        finish(20, Date.now() - started.current);
      }
    }
  };

  const restart = () => {
    window.location.reload();
  };

  const color = (m) =>
    m === "correct" ? "bg-aura text-black" : m === "present" ? "bg-violet text-white" : "bg-secondary text-muted-foreground";

  return (
    <GameShell
      title="PURRE Wordle"
      score={won ? Math.max(50, 600 - rows.length * 80) : done ? 20 : rows.length}
      meta="5 liter · max 6 prób"
      onRestart={restart}
      result={result}
      submitting={submitting}
      error={error}
    >
      <div className="mx-auto max-w-xs space-y-2">
        {Array.from({ length: 6 }).map((_, i) => {
          const row = rows[i];
          return (
            <div key={i} className="grid grid-cols-5 gap-1.5">
              {Array.from({ length: 5 }).map((__, j) => (
                <div
                  key={j}
                  className={`grid h-11 place-items-center rounded-lg border border-border/70 font-display text-lg uppercase ${
                    row ? color(row.marks[j]) : "bg-card/40"
                  }`}
                >
                  {row?.guess[j] || (i === rows.length ? draft[j] || "" : "")}
                </div>
              ))}
            </div>
          );
        })}
        {!done && (
          <div className="flex gap-2 pt-2">
            <input
              value={draft}
              maxLength={5}
              onChange={(e) => setDraft(e.target.value.replace(/[^a-zA-Z]/g, "").toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && submitGuess()}
              className="h-11 flex-1 rounded-xl border border-border/70 bg-card/60 px-3 text-center font-display tracking-[0.3em] uppercase outline-none"
              placeholder="_____"
            />
            <button type="button" onClick={submitGuess} className="btn-aura rounded-xl px-4 text-[10px] font-semibold uppercase tracking-widest">
              OK
            </button>
          </div>
        )}
        {done && !won && (
          <p className="text-center text-sm text-muted-foreground">
            Hasło: <span className="font-display text-aura">{answer}</span>
          </p>
        )}
      </div>
    </GameShell>
  );
}
