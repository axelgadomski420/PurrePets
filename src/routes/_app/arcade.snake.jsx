import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import GameShell from "@/components/arcade/GameShell";
import { useGameSubmit } from "@/components/arcade/useGameSubmit";

export const Route = createFileRoute("/_app/arcade/snake")({
  head: () => ({ meta: [{ title: "PURRE PETS — PURRE Snake" }] }),
  component: SnakePage,
});

const SIZE = 16;

function SnakePage() {
  const [tick, setTick] = useState(0);
  const snakeRef = useRef([{ x: 8, y: 8 }]);
  const dirRef = useRef({ x: 1, y: 0 });
  const nextDir = useRef({ x: 1, y: 0 });
  const foodRef = useRef({ x: 12, y: 8 });
  const aliveRef = useRef(true);
  const started = useRef(Date.now());
  const submitted = useRef(false);
  const { finish, reset, submitting, result, error } = useGameSubmit("snake");
  const [, render] = useState(0);

  const placeFood = (snake) => {
    let spot = { x: 1, y: 1 };
    for (let i = 0; i < 40; i += 1) {
      spot = { x: Math.floor(Math.random() * SIZE), y: Math.floor(Math.random() * SIZE) };
      if (!snake.some((part) => part.x === spot.x && part.y === spot.y)) break;
    }
    foodRef.current = spot;
  };

  const restart = useCallback(() => {
    snakeRef.current = [{ x: 8, y: 8 }];
    dirRef.current = { x: 1, y: 0 };
    nextDir.current = { x: 1, y: 0 };
    foodRef.current = { x: 12, y: 8 };
    aliveRef.current = true;
    started.current = Date.now();
    submitted.current = false;
    reset();
    render((value) => value + 1);
  }, [reset]);

  const turn = useCallback((x, y) => {
    if (dirRef.current.x === -x && dirRef.current.y === -y) return;
    nextDir.current = { x, y };
  }, []);

  useEffect(() => {
    const onKey = (event) => {
      const map = {
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        w: [0, -1],
        s: [0, 1],
        a: [-1, 0],
        d: [1, 0],
      };
      const next = map[event.key];
      if (!next) return;
      event.preventDefault();
      turn(next[0], next[1]);
    };
    window.addEventListener("keydown", onKey, { passive: false });
    return () => window.removeEventListener("keydown", onKey);
  }, [turn]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (!aliveRef.current) return;
      dirRef.current = nextDir.current;
      const snake = snakeRef.current;
      const head = {
        x: (snake[0].x + dirRef.current.x + SIZE) % SIZE,
        y: (snake[0].y + dirRef.current.y + SIZE) % SIZE,
      };
      const hit = snake.some((part) => part.x === head.x && part.y === head.y);
      if (hit) {
        aliveRef.current = false;
        if (!submitted.current) {
          submitted.current = true;
          finish(Math.max(10, (snake.length - 1) * 20), Date.now() - started.current);
        }
        render((value) => value + 1);
        return;
      }
      const grown = [head, ...snake];
      if (head.x === foodRef.current.x && head.y === foodRef.current.y) {
        snakeRef.current = grown;
        placeFood(grown);
      } else {
        grown.pop();
        snakeRef.current = grown;
      }
      setTick((value) => value + 1);
    }, 140);
    return () => clearInterval(timer);
  }, [finish]);

  const snake = snakeRef.current;
  const food = foodRef.current;
  const cells = [];
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const isHead = snake[0].x === x && snake[0].y === y;
      const isBody = snake.some((part) => part.x === x && part.y === y);
      const isFood = food.x === x && food.y === y;
      cells.push(
        <div
          key={`${x}-${y}-${tick}`}
          className={
            isHead ? "aspect-square bg-aura" : isBody ? "aspect-square bg-violet" : isFood ? "aspect-square bg-chart-4" : "aspect-square bg-secondary/30"
          }
        />
      );
    }
  }

  return (
    <GameShell
      title="PURRE Snake"
      score={(snake.length - 1) * 20}
      meta="strzałki albo WASD · plansza zawija się"
      onRestart={restart}
      result={result}
      submitting={submitting}
      error={error}
    >
      <div className="mx-auto grid max-w-sm grid-cols-16 gap-0.5 rounded-[var(--radius)] border border-border/70 bg-card/40 p-2" style={{ gridTemplateColumns: "repeat(16, minmax(0, 1fr))" }}>
        {cells}
      </div>
      <div className="mx-auto mt-4 grid w-40 grid-cols-3 gap-2">
        <span />
        <Pad label="↑" onClick={() => turn(0, -1)} />
        <span />
        <Pad label="←" onClick={() => turn(-1, 0)} />
        <span />
        <Pad label="→" onClick={() => turn(1, 0)} />
        <span />
        <Pad label="↓" onClick={() => turn(0, 1)} />
      </div>
    </GameShell>
  );
}

function Pad({ label, onClick }) {
  return (
    <button type="button" onClick={onClick} className="rounded-xl border border-border/70 py-3 text-sm">
      {label}
    </button>
  );
}
