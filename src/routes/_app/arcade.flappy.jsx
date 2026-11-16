import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import GameShell from "@/components/arcade/GameShell";
import { useGameSubmit } from "@/components/arcade/useGameSubmit";

export const Route = createFileRoute("/_app/arcade/flappy")({
  head: () => ({ meta: [{ title: "PURRE PETS — PURRE Jump" }] }),
  component: FlappyPage,
});

function FlappyPage() {
  const canvasRef = useRef(null);
  const [score, setScore] = useState(0);
  const [alive, setAlive] = useState(true);
  const state = useRef({
    y: 180,
    vy: 0,
    pipes: [{ x: 320, gap: 140 }],
    frame: 0,
  });
  const started = useRef(Date.now());
  const submitted = useRef(false);
  const { finish, reset, submitting, result, error } = useGameSubmit("flappy");

  useEffect(() => {
    if (!alive) return undefined;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");
    const W = canvas.width;
    const H = canvas.height;
    const id = setInterval(() => {
      const s = state.current;
      s.frame += 1;
      s.vy += 0.45;
      s.y += s.vy;
      if (s.frame % 90 === 0) {
        s.pipes.push({ x: W + 20, gap: 80 + Math.random() * 120 });
      }
      s.pipes.forEach((p) => {
        p.x -= 2.4;
      });
      s.pipes = s.pipes.filter((p) => p.x > -40);
      let hit = s.y < 0 || s.y > H - 16;
      for (const p of s.pipes) {
        if (p.x < 56 && p.x > 8) {
          if (s.y < p.gap || s.y > p.gap + 90) hit = true;
        }
        if (!p.passed && p.x < 20) {
          p.passed = true;
          setScore((v) => v + 1);
        }
      }
      if (hit) {
        setAlive(false);
        return;
      }
      ctx.fillStyle = "#050507";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#2BE39B";
      ctx.beginPath();
      ctx.arc(40, s.y, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#8B5CF6";
      for (const p of s.pipes) {
        ctx.fillRect(p.x, 0, 36, p.gap);
        ctx.fillRect(p.x, p.gap + 90, 36, H - p.gap - 90);
      }
    }, 1000 / 40);
    return () => clearInterval(id);
  }, [alive]);

  useEffect(() => {
    if (alive || submitted.current) return;
    submitted.current = true;
    finish(score, Date.now() - started.current);
  }, [alive, score, finish]);

  const flap = () => {
    if (!alive) return;
    state.current.vy = -7.2;
  };

  const restart = () => {
    state.current = { y: 180, vy: 0, pipes: [{ x: 320, gap: 140 }], frame: 0 };
    setScore(0);
    setAlive(true);
    started.current = Date.now();
    submitted.current = false;
    reset();
  };

  return (
    <GameShell
      title="PURRE Jump"
      score={score}
      meta="Klik / spacja = skok"
      onRestart={restart}
      result={result}
      submitting={submitting}
      error={error}
    >
      <canvas
        ref={canvasRef}
        width={360}
        height={420}
        className="mx-auto w-full max-w-sm rounded-xl border border-border/70 touch-none"
        onPointerDown={flap}
      />
      <p className="mt-2 text-center text-[11px] text-muted-foreground">Przelot między fioletowymi słupkami</p>
    </GameShell>
  );
}
