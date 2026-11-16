import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const knowledgeDir = path.resolve(here, "../knowledge/expurr");

function words(value) {
  return String(value || "")
    .toLocaleLowerCase("pl")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .match(/[a-z0-9ąćęłńóśźż]{3,}/gi) || [];
}

export function retrieveExpurrKnowledge(question, limit = 4) {
  let files = [];

  try {
    files = fs.readdirSync(knowledgeDir)
      .filter((name) => name.endsWith(".md"))
      .slice(0, 200);
  } catch {
    return "";
  }

  const queryWords = [...new Set(words(question))];
  if (!queryWords.length) return "";

  const results = [];

  for (const name of files) {
    try {
      const content = fs.readFileSync(path.join(knowledgeDir, name), "utf8");
      if (!content.trim()) continue;

      const searchable = content.toLocaleLowerCase("pl");
      let score = 0;

      for (const word of queryWords) {
        if (searchable.includes(word)) score += 1;
      }

      if (score > 0) {
        results.push({ name, content, score });
      }
    } catch {
      // Uszkodzony pojedynczy plik nie może przerwać rozmowy.
    }
  }

  results.sort((a, b) => b.score - a.score);

  return results.slice(0, limit).map((item) =>
    item.content.slice(0, 4500)
  ).join("\n\n---\n\n").slice(0, 12000);
}
