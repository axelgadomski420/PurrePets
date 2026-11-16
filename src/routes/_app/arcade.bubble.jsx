import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import GameShell from "@/components/arcade/GameShell";
import { useGameSubmit } from "@/components/arcade/useGameSubmit";

export const Route = createFileRoute("/_app/arcade/bubble")({
  head: () => ({ meta: [{ title: "PURRE PETS — PURRE Bubble" }] }),
  component: BubblePage,
});

const COLORS = ["#2BE39B", "#8B5CF6", "#F59E0B", "#38BDF8", "#F472B6"];

function BubblePage() {
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(30);
  const [bubbles, setBubbles] = useState([]);
  const started = useRef(Date.now());
  const submitted = useRef(false);
  const { finish, reset, submitting, result, error } = useGameSubmit("bubble");
  const done = timeLeft <= 0;

  useEffect(() => {
    if (done) return undefined;
    const spawn = setInterval(() => {
      setBubbles((list) => [
        ...list.slice(-18),
        {
          id: Math.random().toString(36).slice(2),
          x: 8 + Math.random() * 84,
          y: 10 + Math.random() * 70,
          color: COLORS[Math.floor(Math.random() * COLORS.length)],
          size: 36 + Math.random() * 28,
        },
      ]);
    }, 480);
    return () => clearInterval(spawn);
  }, [done]);

  useEffect(() => {
    if (done) return undefined;
    const t = setInterval(() => setTimeLeft((v) => v - 1), 1000);
    return () => clearInterval(t);
  }, [done]);

  useEffect(() => {
    if (!done || submitted.current) return;
    submitted.current = true;
    finish(score, Date.now() - started.current);
  }, [done, score, finish]);

  const pop = (id) => {
    if (done) return;
    setBubbles((list) => list.filter((b) => b.id !== id));
    setScore((s) => s + 15);
  };

  const restart = () => {
    setScore(0);
    setTimeLeft(30);
    setBubbles([]);
    started.current = Date.now();
    submitted.current = false;
    reset();
  };

  return (
    <GameShell
      title="PURRE Bubble"
      score={score}
      meta={`${timeLeft}s`}
      onRestart={restart}
      result={result}
      submitting={submitting}
      error={error}
    >
      <div className="relative mx-auto h-[420px] w-full max-w-md overflow-hidden rounded-xl border border-border/70 bg-gradient-to-b from-violet/10 to-card/40">
        {bubbles.map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => pop(b.id)}
            className="absolute rounded-full opacity-90 shadow-lg transition active:scale-90"
            style={{
              left: `${b.x}%`,
              top: `${b.y}%`,
              width: b.size,
              height: b.size,
              background: b.color,
              transform: "translate(-50%, -50%)",
            }}
          />
        ))}
        {!bubbles.length && !done && (
          <p className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">
            Klikaj bańki!
          </p>
        )}
      </div>
    </GameShell>
  );
}
