import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import GameShell from "@/components/arcade/GameShell";
import { useGameSubmit } from "@/components/arcade/useGameSubmit";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/arcade/2048")({
  head: () => ({ meta: [{ title: "PURRE PETS — PURRE 2048" }] }),
  component: Game2048,
});

const SIZE = 4;

const emptyBoard = () => Array(SIZE * SIZE).fill(0);

function addTile(board) {
  const empties = board.reduce((acc, value, index) => (value === 0 ? [...acc, index] : acc), []);
  if (empties.length === 0) return board;
  const next = [...board];
  next[empties[Math.floor(Math.random() * empties.length)]] = Math.random() < 0.9 ? 2 : 4;
  return next;
}

function slide(line) {
  const filtered = line.filter((value) => value !== 0);
  const merged = [];
  let gained = 0;
  for (let i = 0; i < filtered.length; i += 1) {
    if (filtered[i] === filtered[i + 1]) {
      merged.push(filtered[i] * 2);
      gained += filtered[i] * 2;
      i += 1;
    } else {
      merged.push(filtered[i]);
    }
  }
  while (merged.length < SIZE) merged.push(0);
  return { line: merged, gained };
}

function getLine(board, index, vertical) {
  return vertical
    ? Array.from({ length: SIZE }, (_, i) => board[i * SIZE + index])
    : board.slice(index * SIZE, index * SIZE + SIZE);
}

function setLine(board, index, line, vertical) {
  const next = [...board];
  line.forEach((value, i) => {
    next[vertical ? i * SIZE + index : index * SIZE + i] = value;
  });
  return next;
}

function move(board, dir) {
  const vertical = dir === "up" || dir === "down";
  const reverse = dir === "right" || dir === "down";
  let gained = 0;
  let changed = false;
  let next = [...board];

  for (let index = 0; index < SIZE; index += 1) {
    const line = getLine(next, index, vertical);
    const ordered = reverse ? [...line].reverse() : line;
    const result = slide(ordered);
    const back = reverse ? [...result.line].reverse() : result.line;
    gained += result.gained;
    if (back.some((value, i) => value !== line[i])) changed = true;
    next = setLine(next, index, back, vertical);
  }
  return { board: next, gained, changed };
}

function canMove(board) {
  if (board.includes(0)) return true;
  for (let row = 0; row < SIZE; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
      const value = board[row * SIZE + col];
      if (col < SIZE - 1 && value === board[row * SIZE + col + 1]) return true;
      if (row < SIZE - 1 && value === board[(row + 1) * SIZE + col]) return true;
    }
  }
  return false;
}

const TILE_STYLES = {
  2: "bg-secondary text-foreground",
  4: "bg-secondary/90 text-foreground",
  8: "bg-violet/40 text-foreground",
  16: "bg-violet/55 text-foreground",
  32: "bg-violet/70 text-white",
  64: "bg-violet text-white",
  128: "bg-aura/50 text-background",
  256: "bg-aura/65 text-background",
  512: "bg-aura/80 text-background",
  1024: "bg-aura text-background",
};

function Game2048() {
  const { t } = useI18n();
  const [board, setBoard] = useState(() => addTile(addTile(emptyBoard())));
  const [score, setScore] = useState(0);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [over, setOver] = useState(false);
  const { finish, reset, submitting, result, error } = useGameSubmit("2048");
  const submittedRef = useRef(false);

  const restart = useCallback(() => {
    setBoard(addTile(addTile(emptyBoard())));
    setScore(0);
    setOver(false);
    setStartedAt(Date.now());
    submittedRef.current = false;
    reset();
  }, [reset]);

  const play = useCallback(
    (dir) => {
      if (over) return;
      setBoard((current) => {
        const next = move(current, dir);
        if (!next.changed) return current;
        const withTile = addTile(next.board);
        setScore((value) => value + next.gained);
        if (!canMove(withTile)) setOver(true);
        return withTile;
      });
    },
    [over]
  );

  useEffect(() => {
    if (!over || submittedRef.current) return;
    submittedRef.current = true;
    finish(score, Date.now() - startedAt);
  }, [over, score, startedAt, finish]);

  useEffect(() => {
    const onKey = (event) => {
      const map = {
        ArrowUp: "up",
        ArrowDown: "down",
        ArrowLeft: "left",
        ArrowRight: "right",
      };
      const dir = map[event.key];
      if (dir) {
        event.preventDefault();
        play(dir);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [play]);

  const touchStart = useRef(null);
  const onTouchStart = (event) => {
    touchStart.current = { x: event.touches[0].clientX, y: event.touches[0].clientY };
  };
  const onTouchEnd = (event) => {
    if (!touchStart.current) return;
    const dx = event.changedTouches[0].clientX - touchStart.current.x;
    const dy = event.changedTouches[0].clientY - touchStart.current.y;
    if (Math.abs(dx) > Math.abs(dy)) {
      if (Math.abs(dx) > 24) play(dx > 0 ? "right" : "left");
    } else if (Math.abs(dy) > 24) {
      play(dy > 0 ? "down" : "up");
    }
    touchStart.current = null;
  };

  return (
    <GameShell
      title={t("arcade.game2048")}
      score={score}
      meta="4×4 · strzałki lub swipe"
      onRestart={restart}
      result={result}
      submitting={submitting}
      error={error}
    >
      <div
        className="mx-auto max-w-md touch-none select-none rounded-[var(--radius)] border border-border/70 bg-card/60 p-2"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div className="grid grid-cols-4 gap-1.5">
          {board.map((value, index) => (
            <div
              key={index}
              className={cn(
                "grid aspect-square place-items-center rounded-xl text-lg font-bold transition-all duration-150",
                value === 0 ? "bg-secondary/30" : TILE_STYLES[value] ?? "bg-aura text-background"
              )}
            >
              {value || ""}
            </div>
          ))}
        </div>
      </div>
      <div className="mx-auto mt-4 grid max-w-md grid-cols-3 gap-2 sm:hidden">
        <span />
        <button type="button" onClick={() => play("up")} className="rounded-xl border border-border/70 py-3">↑</button>
        <span />
        <button type="button" onClick={() => play("left")} className="rounded-xl border border-border/70 py-3">←</button>
        <button type="button" onClick={() => play("down")} className="rounded-xl border border-border/70 py-3">↓</button>
        <button type="button" onClick={() => play("right")} className="rounded-xl border border-border/70 py-3">→</button>
      </div>
    </GameShell>
  );
}
