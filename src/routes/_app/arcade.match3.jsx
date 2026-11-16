import { useCallback, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import GameShell from "@/components/arcade/GameShell";
import { useGameSubmit } from "@/components/arcade/useGameSubmit";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/arcade/match3")({
  head: () => ({ meta: [{ title: "PURRE PETS — PURRE Match-3" }] }),
  component: Match3Page,
});

const SIZE = 8;
const COLORS = ["#2BE39B", "#8B5CF6", "#F59E0B", "#38BDF8", "#F472B6"];

function randomBoard() {
  return Array.from({ length: SIZE }, () =>
    Array.from({ length: SIZE }, () => Math.floor(Math.random() * COLORS.length))
  );
}

function findMatches(board) {
  const marks = Array.from({ length: SIZE }, () => Array(SIZE).fill(false));
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE - 2; x++) {
      const v = board[y][x];
      if (v === board[y][x + 1] && v === board[y][x + 2]) {
        marks[y][x] = marks[y][x + 1] = marks[y][x + 2] = true;
      }
    }
  }
  for (let x = 0; x < SIZE; x++) {
    for (let y = 0; y < SIZE - 2; y++) {
      const v = board[y][x];
      if (v === board[y + 1][x] && v === board[y + 2][x]) {
        marks[y][x] = marks[y + 1][x] = marks[y + 2][x] = true;
      }
    }
  }
  return marks;
}

function collapse(board, marks) {
  const next = board.map((row) => [...row]);
  let cleared = 0;
  for (let x = 0; x < SIZE; x++) {
    const col = [];
    for (let y = SIZE - 1; y >= 0; y--) {
      if (!marks[y][x]) col.push(next[y][x]);
      else cleared += 1;
    }
    while (col.length < SIZE) col.push(Math.floor(Math.random() * COLORS.length));
    for (let y = SIZE - 1; y >= 0; y--) next[y][x] = col[SIZE - 1 - y];
  }
  return { board: next, cleared };
}

function Match3Page() {
  const [board, setBoard] = useState(randomBoard);
  const [score, setScore] = useState(0);
  const [moves, setMoves] = useState(20);
  const [sel, setSel] = useState(null);
  const started = useRef(Date.now());
  const submitted = useRef(false);
  const { finish, reset, submitting, result, error } = useGameSubmit("match3");

  const endIfNeeded = useCallback(
    (nextMoves, nextScore) => {
      if (nextMoves <= 0 && !submitted.current) {
        submitted.current = true;
        finish(nextScore, Date.now() - started.current);
      }
    },
    [finish]
  );

  const trySwap = (a, b) => {
    if (moves <= 0) return;
    const next = board.map((row) => [...row]);
    const tmp = next[a.y][a.x];
    next[a.y][a.x] = next[b.y][b.x];
    next[b.y][b.x] = tmp;
    let marks = findMatches(next);
    if (!marks.some((row) => row.some(Boolean))) {
      setSel(null);
      return;
    }
    let total = 0;
    let working = next;
    for (let i = 0; i < 6; i++) {
      marks = findMatches(working);
      if (!marks.some((row) => row.some(Boolean))) break;
      const { board: collapsed, cleared } = collapse(working, marks);
      working = collapsed;
      total += cleared * 10;
    }
    const nextMoves = moves - 1;
    const nextScore = score + total;
    setBoard(working);
    setScore(nextScore);
    setMoves(nextMoves);
    setSel(null);
    endIfNeeded(nextMoves, nextScore);
  };

  const onCell = (y, x) => {
    if (moves <= 0) return;
    if (!sel) {
      setSel({ y, x });
      return;
    }
    const dist = Math.abs(sel.y - y) + Math.abs(sel.x - x);
    if (dist === 1) trySwap(sel, { y, x });
    else setSel({ y, x });
  };

  const restart = () => {
    setBoard(randomBoard());
    setScore(0);
    setMoves(20);
    setSel(null);
    started.current = Date.now();
    submitted.current = false;
    reset();
  };

  return (
    <GameShell
      title="PURRE Match-3"
      score={score}
      meta={`${moves} ruchów`}
      onRestart={restart}
      result={result}
      submitting={submitting}
      error={error}
    >
      <div className="mx-auto grid w-fit grid-cols-8 gap-1 rounded-xl border border-border/70 bg-card/40 p-2">
        {board.map((row, y) =>
          row.map((cell, x) => (
            <button
              key={`${y}-${x}`}
              type="button"
              onClick={() => onCell(y, x)}
              className={cn(
                "h-8 w-8 rounded-md sm:h-9 sm:w-9",
                sel?.x === x && sel?.y === y && "ring-2 ring-white"
              )}
              style={{ background: COLORS[cell] }}
            />
          ))
        )}
      </div>
    </GameShell>
  );
}
