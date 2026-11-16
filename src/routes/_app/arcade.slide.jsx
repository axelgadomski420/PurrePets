import { useCallback, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import GameShell from "@/components/arcade/GameShell";
import { useGameSubmit } from "@/components/arcade/useGameSubmit";

export const Route = createFileRoute("/_app/arcade/slide")({
  head: () => ({ meta: [{ title: "PURRE PETS — PURRE Slide" }] }),
  component: SlidePage,
});

const GOAL = [1, 2, 3, 4, 5, 6, 7, 8, 0];

function neighbors(index) {
  const row = Math.floor(index / 3);
  const col = index % 3;
  const next = [];
  if (row > 0) next.push(index - 3);
  if (row < 2) next.push(index + 3);
  if (col > 0) next.push(index - 1);
  if (col < 2) next.push(index + 1);
  return next;
}

function shuffle() {
  const tiles = [...GOAL];
  for (let step = 0; step < 60; step += 1) {
    const zero = tiles.indexOf(0);
    const options = neighbors(zero);
    const swap = options[Math.floor(Math.random() * options.length)];
    [tiles[zero], tiles[swap]] = [tiles[swap], tiles[zero]];
  }
  if (tiles.every((value, index) => value === GOAL[index])) return shuffle();
  return tiles;
}

function SlidePage() {
  const [tiles, setTiles] = useState(shuffle);
  const [moves, setMoves] = useState(0);
  const started = useRef(Date.now());
  const submitted = useRef(false);
  const { finish, reset, submitting, result, error } = useGameSubmit("slide");

  const restart = useCallback(() => {
    setTiles(shuffle());
    setMoves(0);
    started.current = Date.now();
    submitted.current = false;
    reset();
  }, [reset]);

  const slide = (index) => {
    if (result || submitting) return;
    const zero = tiles.indexOf(0);
    if (!neighbors(zero).includes(index)) return;
    const next = [...tiles];
    [next[zero], next[index]] = [next[index], next[zero]];
    const nextMoves = moves + 1;
    setTiles(next);
    setMoves(nextMoves);
    const won = next.every((value, cell) => value === GOAL[cell]);
    if (won && !submitted.current) {
      submitted.current = true;
      const seconds = Math.max(1, Math.round((Date.now() - started.current) / 1000));
      finish(Math.max(80, 1400 - nextMoves * 18 - seconds * 4), Date.now() - started.current);
    }
  };

  return (
    <GameShell
      title="PURRE Slide"
      score={moves}
      meta="ułóż 1–8"
      onRestart={restart}
      result={result}
      submitting={submitting}
      error={error}
    >
      <div className="mx-auto grid max-w-xs grid-cols-3 gap-2">
        {tiles.map((value, index) => (
          <button
            key={index}
            type="button"
            onClick={() => slide(index)}
            className={`grid aspect-square place-items-center rounded-2xl font-display text-2xl ${
              value === 0 ? "bg-transparent" : "border border-border/70 bg-gradient-to-br from-violet/30 to-aura/20"
            }`}
          >
            {value === 0 ? "" : value}
          </button>
        ))}
      </div>
    </GameShell>
  );
}
