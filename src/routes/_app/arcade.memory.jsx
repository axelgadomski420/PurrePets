import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import GameShell from "@/components/arcade/GameShell";
import { useGameSubmit } from "@/components/arcade/useGameSubmit";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/arcade/memory")({
  head: () => ({ meta: [{ title: "PURRE PETS — PURRE Memory" }] }),
  component: GameMemory,
});

const SYMBOLS = ["🐕", "🐈", "🐇", "🦊", "🐼", "🐨"];

function buildDeck() {
  return [...SYMBOLS, ...SYMBOLS]
    .map((symbol) => ({ symbol, key: Math.random() }))
    .sort((a, b) => a.key - b.key)
    .map((card, index) => ({ ...card, id: index, flipped: false, matched: false }));
}

function GameMemory() {
  const { t } = useI18n();
  const [deck, setDeck] = useState(buildDeck);
  const [selected, setSelected] = useState([]);
  const [moves, setMoves] = useState(0);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [elapsed, setElapsed] = useState(0);
  const { finish, reset, submitting, result, error } = useGameSubmit("memory");
  const submittedRef = useRef(false);

  const matched = deck.filter((card) => card.matched).length;
  const won = matched === deck.length;

  useEffect(() => {
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [startedAt]);

  const restart = useCallback(() => {
    setDeck(buildDeck());
    setSelected([]);
    setMoves(0);
    setStartedAt(Date.now());
    setElapsed(0);
    submittedRef.current = false;
    reset();
  }, [reset]);

  useEffect(() => {
    if (!won || submittedRef.current) return;
    submittedRef.current = true;
    const seconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    finish(Math.max(60, 620 - moves * 14 - seconds * 3), Date.now() - startedAt);
  }, [won, moves, startedAt, finish]);

  const flip = (card) => {
    if (card.flipped || card.matched || selected.length === 2) return;
    const nextDeck = deck.map((item) => (item.id === card.id ? { ...item, flipped: true } : item));
    const nextSelected = [...selected, card.id];
    setDeck(nextDeck);
    setSelected(nextSelected);

    if (nextSelected.length === 2) {
      setMoves((value) => value + 1);
      const [first, second] = nextSelected.map((id) => nextDeck.find((item) => item.id === id));
      if (first.symbol === second.symbol) {
        setTimeout(() => {
          setDeck((current) =>
            current.map((item) =>
              item.symbol === first.symbol ? { ...item, matched: true, flipped: true } : item
            )
          );
          setSelected([]);
        }, 320);
      } else {
        setTimeout(() => {
          setDeck((current) =>
            current.map((item) =>
              nextSelected.includes(item.id) ? { ...item, flipped: false } : item
            )
          );
          setSelected([]);
        }, 700);
      }
    }
  };

  const score = Math.max(0, 620 - moves * 14 - elapsed * 3);

  return (
    <GameShell
      title={t("arcade.gameMemory")}
      score={score}
      meta={`${t("arcade.moves")}: ${moves} · ${t("arcade.time")}: ${elapsed}s`}
      onRestart={restart}
      result={result}
      submitting={submitting}
      error={error}
    >
      <div className="mx-auto grid max-w-md grid-cols-4 gap-2">
        {deck.map((card) => (
          <button
            key={card.id}
            type="button"
            onClick={() => flip(card)}
            className={cn(
              "grid aspect-square place-items-center rounded-xl border text-2xl transition-all duration-300",
              card.flipped || card.matched
                ? "border-violet/50 bg-violet/15"
                : "border-border/70 bg-secondary/40",
              card.matched && "border-aura/60 bg-aura/10 opacity-70"
            )}
          >
            <span className={cn("transition", card.flipped || card.matched ? "opacity-100" : "opacity-0")}>
              {card.symbol}
            </span>
          </button>
        ))}
      </div>
    </GameShell>
  );
}
