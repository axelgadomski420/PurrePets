import { useCallback, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import GameShell from "@/components/arcade/GameShell";
import { useGameSubmit } from "@/components/arcade/useGameSubmit";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/arcade/quiz")({
  head: () => ({ meta: [{ title: "PURRE PETS — PURRE Quiz" }] }),
  component: GameQuiz,
});

const QUESTIONS = [
  {
    question: "Ile miesięcy powinien mieć szczeniak przed odbiorem od hodowli?",
    options: ["4 tygodnie", "8 tygodni (2 miesiące)", "4 miesiące", "6 miesięcy"],
    correct: 1,
  },
  {
    question: "Co oznacza wpis „ZKwP” w ogłoszeniu hodowli?",
    options: ["Numer mikrochipa", "Związek Kynologiczny w Polsce", "Typ umaszczenia", "Rodzaj karmy"],
    correct: 1,
  },
  {
    question: "Która rasa kotów jest znana z łagodnego charakteru i okrągłej głowy?",
    options: ["Bengalski", "British Shorthair", "Sfinks", "Syjamski"],
    correct: 1,
  },
  {
    question: "Czym jest rodowód w hodowli?",
    options: ["Dowodem szczepienia", "Dokumentem pochodzenia i linii genealogicznej", "Umową sprzedaży", "Certyfikatem karmy"],
    correct: 1,
  },
  {
    question: "Najlepszy pierwszy krok przed kupnem zwierzęcia z ogłoszenia to:",
    options: ["Wysłanie zaliczki", "Wizyta w hodowli i poznanie rodziców", "Zakup akcesoriów", "Podpisanie umowy na odległość"],
    correct: 1,
  },
  {
    question: "Ile razy dziennie warto karmić dorosłego psa średniej rasy?",
    options: ["Raz", "Dwa razy", "Cztery razy", "Dowolnie"],
    correct: 1,
  },
  {
    question: "Który dokument potwierdza badania genetyczne rodziców?",
    options: ["Karta szczepień", "Wynik badania laboratoryjnego z pieczęcią", "Paragon", "Post na forum"],
    correct: 1,
  },
  {
    question: "Po co hodowle stosują testy DNA?",
    options: ["Dla estetyki", "Aby ograniczać choroby dziedziczne", "Aby zmieniać kolor sierści", "Aby skrócić ciążę"],
    correct: 1,
  },
];

function GameQuiz() {
  const { t } = useI18n();
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const { finish, reset, submitting, result, error } = useGameSubmit("quiz");
  const submittedRef = useRef(false);
  const done = index >= QUESTIONS.length;
  const correctCount = answers.filter((answer, position) => answer === QUESTIONS[position].correct).length;

  const restart = useCallback(() => {
    setIndex(0);
    setAnswers([]);
    setStartedAt(Date.now());
    submittedRef.current = false;
    reset();
  }, [reset]);

  const choose = (optionIndex) => {
    const nextAnswers = [...answers, optionIndex];
    setAnswers(nextAnswers);
    const nextIndex = index + 1;
    setIndex(nextIndex);
    if (nextIndex >= QUESTIONS.length && !submittedRef.current) {
      submittedRef.current = true;
      const score = nextAnswers.filter((answer, position) => answer === QUESTIONS[position].correct).length * 100;
      finish(score, Date.now() - startedAt);
    }
  };

  return (
    <GameShell
      title={t("arcade.gameQuiz")}
      score={correctCount * 100}
      meta={`${Math.min(index + 1, QUESTIONS.length)} / ${QUESTIONS.length}`}
      onRestart={restart}
      result={result}
      submitting={submitting}
      error={error}
    >
      {done ? (
        <div className="mx-auto max-w-md rounded-[var(--radius)] border border-border/70 bg-card/60 p-6 text-center">
          <p className="font-display text-2xl">
            {correctCount} / {QUESTIONS.length}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {correctCount >= 6 ? "Świetna wiedza hodowlana." : "Warto powtórzyć podstawy hodowli."}
          </p>
        </div>
      ) : (
        <div className="mx-auto max-w-md">
          <div className="h-1 w-full overflow-hidden rounded-full bg-secondary/60">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet to-aura transition-all duration-500"
              style={{ width: `${((index + 1) / QUESTIONS.length) * 100}%` }}
            />
          </div>
          <p className="mt-4 text-[11px] uppercase tracking-[0.24em] text-muted-foreground">pytanie {index + 1}</p>
          <h2 className="mt-2 font-display text-xl leading-snug">{QUESTIONS[index].question}</h2>
          <div className="mt-4 space-y-2">
            {QUESTIONS[index].options.map((option, optionIndex) => (
              <button
                key={option}
                type="button"
                onClick={() => choose(optionIndex)}
                className={cn(
                  "w-full rounded-xl border border-border/70 bg-card/60 px-4 py-3 text-left text-sm transition hover:border-violet/60 hover:bg-violet/10"
                )}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      )}
    </GameShell>
  );
}
