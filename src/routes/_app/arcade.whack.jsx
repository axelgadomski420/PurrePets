import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import GameShell from "@/components/arcade/GameShell";
import { useGameSubmit } from "@/components/arcade/useGameSubmit";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/arcade/whack")({
  head: () => ({ meta: [{ title: "PURRE PETS — PURRE Whack" }] }),
  component: WhackPage,
});

function WhackPage() {
  const [hole, setHole] = useState(0);
  const [left, setLeft] = useState(20);
  const [score, setScore] = useState(0);
  const [running, setRunning] = useState(false);
  const started = useRef(Date.now());
  const submitted = useRef(false);
  const scoreRef = useRef(0);
  const { finish, reset, submitting, result, error } = useGameSubmit("whack");

  const stop = useCallback(
    (finalScore) => {
      setRunning(false);
      if (submitted.current) return;
      submitted.current = true;
      finish(finalScore, Date.now() - started.current);
    },
    [finish]
  );

  useEffect(() => {
    if (running && left === 0) stop(scoreRef.current);
  }, [running, left, stop]);

  useEffect(() => {
    if (!running) return undefined;
    const mole = setInterval(() => setHole(Math.floor(Math.random() * 9)), 650);
    const clock = setInterval(() => {
      setLeft((value) => (value <= 1 ? 0 : value - 1));
    }, 1000);
    return () => {
      clearInterval(mole);
      clearInterval(clock);
    };
  }, [running]);

  const restart = useCallback(() => {
    scoreRef.current = 0;
    setScore(0);
    setLeft(20);
    setHole(Math.floor(Math.random() * 9));
    submitted.current = false;
    started.current = Date.now();
    reset();
    setRunning(true);
  }, [reset]);

  const hit = (index) => {
    if (!running) {
      restart();
      return;
    }
    if (index !== hole) return;
    scoreRef.current += 10;
    setScore(scoreRef.current);
    setHole((current) => {
      let next = current;
      while (next === current) next = Math.floor(Math.random() * 9);
      return next;
    });
  };

  return (
    <GameShell
      title="PURRE Whack"
      score={score}
      meta={running || left === 0 ? `${left}s` : "tap, żeby zacząć"}
      onRestart={restart}
      result={result}
      submitting={submitting}
      error={error}
    >
      <div className="mx-auto grid max-w-sm grid-cols-3 gap-3">
        {Array.from({ length: 9 }).map((_, index) => (
          <button
            key={index}
            type="button"
            onClick={() => hit(index)}
            className={cn(
              "grid aspect-square place-items-center rounded-[var(--radius)] border text-3xl",
              index === hole && running ? "border-aura bg-aura/20" : "border-border/70 bg-card/60"
            )}
          >
            {index === hole && running ? "🐾" : ""}
          </button>
        ))}
      </div>
    </GameShell>
  );
}
