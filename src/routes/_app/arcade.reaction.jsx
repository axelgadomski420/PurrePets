import { useCallback, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import GameShell from "@/components/arcade/GameShell";
import { useGameSubmit } from "@/components/arcade/useGameSubmit";

export const Route = createFileRoute("/_app/arcade/reaction")({
  head: () => ({ meta: [{ title: "PURRE PETS — PURRE Reflex" }] }),
  component: ReactionPage,
});

const ROUNDS = 5;

function ReactionPage() {
  const [phase, setPhase] = useState("idle");
  const [round, setRound] = useState(0);
  const [score, setScore] = useState(0);
  const [last, setLast] = useState(null);
  const startedAt = useRef(Date.now());
  const goAt = useRef(0);
  const timer = useRef(0);
  const submitted = useRef(false);
  const { finish, reset, submitting, result, error } = useGameSubmit("reaction");

  const clear = () => window.clearTimeout(timer.current);

  const arm = useCallback((nextRound, currentScore) => {
    setPhase("wait");
    setRound(nextRound);
    const delay = 700 + Math.random() * 1800;
    timer.current = window.setTimeout(() => {
      goAt.current = performance.now();
      setPhase("go");
    }, delay);
    if (nextRound === 0) startedAt.current = Date.now();
    if (nextRound >= ROUNDS) {
      clear();
      setPhase("done");
      if (!submitted.current) {
        submitted.current = true;
        finish(currentScore, Date.now() - startedAt.current);
      }
    }
  }, [finish]);

  const restart = useCallback(() => {
    clear();
    setScore(0);
    setLast(null);
    submitted.current = false;
    reset();
    arm(0, 0);
  }, [arm, reset]);

  const tap = () => {
    if (phase === "idle") {
      restart();
      return;
    }
    if (phase === "wait") {
      clear();
      setLast("za wcześnie");
      const next = round + 1;
      if (next >= ROUNDS) {
        setPhase("done");
        if (!submitted.current) {
          submitted.current = true;
          finish(score, Date.now() - startedAt.current);
        }
        return;
      }
      arm(next, score);
      return;
    }
    if (phase === "go") {
      const ms = Math.round(performance.now() - goAt.current);
      const gained = Math.max(0, 420 - ms);
      const nextScore = score + gained;
      setScore(nextScore);
      setLast(`${ms} ms`);
      const next = round + 1;
      if (next >= ROUNDS) {
        setPhase("done");
        if (!submitted.current) {
          submitted.current = true;
          finish(nextScore, Date.now() - startedAt.current);
        }
        return;
      }
      arm(next, nextScore);
    }
  };

  return (
    <GameShell
      title="PURRE Reflex"
      score={score}
      meta={`${Math.min(round + (phase === "done" ? 0 : 1), ROUNDS)}/${ROUNDS}`}
      onRestart={restart}
      result={result}
      submitting={submitting}
      error={error}
    >
      <button
        type="button"
        onClick={tap}
        className={`grid aspect-[4/3] w-full place-items-center rounded-[var(--radius)] border text-center transition ${
          phase === "go" ? "border-aura bg-aura text-background" : "border-border/70 bg-card/70"
        }`}
      >
        <span>
          <span className="block font-display text-3xl">
            {phase === "idle" && "Start"}
            {phase === "wait" && "Czekaj…"}
            {phase === "go" && "Teraz"}
            {phase === "done" && "Koniec"}
          </span>
          <span className="mt-2 block text-[12px] opacity-80">{last || "Kliknij, gdy plansza zmieni kolor"}</span>
        </span>
      </button>
    </GameShell>
  );
}
