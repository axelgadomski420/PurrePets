import fs from "node:fs/promises";
import path from "node:path";

import {
  getQuarantinedImageRecord,
  analyzeQuarantinedImage,
  rejectQuarantinedImage,
} from "./expurr-moderation.js";

const queuedIds = new Set();
const pendingIds = [];
let draining = false;
let started = false;

async function drainQueue(quarantineDirectory) {
  if (draining) return;
  draining = true;

  try {
    while (pendingIds.length > 0) {
      const id = pendingIds.shift();

      try {
        const record = await getQuarantinedImageRecord({
          id,
          quarantineDirectory,
        });

        // Nie analizuj ponownie materiału, który zmienił już status.
        if (record.status !== "pending") continue;

        const analyzed = await analyzeQuarantinedImage({
          id,
          quarantineDirectory,
        });

        if (analyzed.decision === "block") {
          await rejectQuarantinedImage({
            id,
            quarantineDirectory,
            moderatorId: "expurr-auto",
            reason:
              analyzed.analysis?.summary ||
              "Jednoznaczne naruszenie zasad.",
          });
        }
      } catch (error) {
        // Błąd pojedynczego zadania nie zatrzymuje całej kolejki.
        console.error(
          `[Expurr moderation] Zadanie ${id} nie zostało zakończone:`,
          error?.message || error
        );
      } finally {
        queuedIds.delete(id);
      }
    }
  } finally {
    draining = false;

    // Zabezpieczenie przed zadaniem dodanym w chwili kończenia kolejki.
    if (pendingIds.length > 0) {
      void drainQueue(quarantineDirectory);
    }
  }
}

export function startExpurrModerationWorker({ quarantineDirectory }) {
  if (started) {
    throw new Error("Expurr moderation worker został już uruchomiony.");
  }

  if (!quarantineDirectory) {
    throw new Error("Brak katalogu kwarantanny dla workera.");
  }

  started = true;

  const directory = path.resolve(quarantineDirectory);

  function enqueue(id) {
    if (typeof id !== "string" || !/^[a-f0-9-]{36}$/i.test(id)) {
      throw new Error("Nieprawidłowy identyfikator zadania moderacji.");
    }

    if (queuedIds.has(id)) return;

    queuedIds.add(id);
    pendingIds.push(id);
    void drainQueue(directory);
  }

  // Odzyskiwanie zadań pozostawionych jako pending po restarcie.
  void (async () => {
    try {
      const names = await fs.readdir(directory);

      for (const name of names) {
        if (!/^[a-f0-9-]{36}\.json$/i.test(name)) continue;

        const id = name.slice(0, -5);

        try {
          const record = await getQuarantinedImageRecord({
            id,
            quarantineDirectory: directory,
          });

          if (record.status === "pending") {
            enqueue(id);
          }
        } catch (error) {
          console.error(
            `[Expurr moderation] Nie można odczytać manifestu ${name}:`,
            error?.message || error
          );
        }
      }
    } catch (error) {
      console.error(
        "[Expurr moderation] Nie udało się odzyskać kolejki:",
        error?.message || error
      );
    }
  })();

  return Object.freeze({ enqueue });
}
