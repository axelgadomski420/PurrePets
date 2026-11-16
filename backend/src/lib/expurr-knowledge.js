import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const knowledgeDir = path.resolve(here, "../knowledge/expurr");

const STOP_WORDS = new Set([
  "oraz", "albo", "czy", "jak", "jaki", "jaka", "jakie",
  "jest", "sa", "sie", "dla", "przez", "przy", "pod",
  "nad", "bez", "mam", "ma", "mój", "moja", "moje",
  "jego", "jej", "ich", "ten", "ta", "to", "te",
  "tym", "tej", "tych", "the", "and", "for", "with",
  "from", "that", "this", "what", "when", "where",
]);

function normalize(value) {
  return String(value || "")
    .toLocaleLowerCase("pl")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Grupy synonimów pomagają odnaleźć wiedzę także wtedy,
// gdy opiekun używa potocznego określenia zamiast terminu źródłowego.
const SYNONYM_GROUPS = [
  ["karma", "karmienie", "zywienie", "dieta", "pokarm", "posilek", "jedzenie", "food", "nutrition"],
  ["nadwaga", "otylosc", "waga", "odchudzanie", "kalorie", "kondycja"],
  ["alergia", "nietolerancja", "swedzenie", "drapanie", "eliminacyjna"],
  ["brzuch", "jelita", "trawienie", "biegunka", "wymioty", "stolec", "kupka"],
  ["behawior", "zachowanie", "psychika", "emocje", "problem", "problemy"],
  ["lek", "strach", "panika", "niepokoj", "stres", "fobia"],
  ["agresja", "warczenie", "gryzienie", "atakowanie", "reaktywnosc"],
  ["szczekanie", "wycie", "miauczenie", "halas", "wokalizacja"],
  ["kuweta", "sikanie", "mocz", "znaczenie", "zalatwianie"],
  ["drapanie", "drapak", "niszczenie", "gryzienie", "zabawa"],
  ["szczeniak", "szczenieta", "mlody", "miot", "rozwoj"],
  ["kocie", "kociak", "kocieta", "mlody", "miot", "rozwoj"],
  ["szczepienie", "szczepienia", "profilaktyka", "odpornosc"],
  ["pasozyt", "pasozyty", "pchly", "kleszcze", "odrobaczanie"],
  ["bol", "bolesnosc", "kulawizna", "dyskomfort", "uraz"],
  ["weterynarz", "weterynaryjny", "lekarz", "lecznica", "klinika", "badanie"],
];

const SYNONYM_LOOKUP = new Map();
for (const group of SYNONYM_GROUPS) {
  for (const term of group) {
    SYNONYM_LOOKUP.set(term, group);
  }
}

function words(value) {
  const base = normalize(value)
    .split(/\s+/)
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(word));

  const expanded = new Set(base);

  for (const word of base) {
    const group = SYNONYM_LOOKUP.get(word) || [];
    for (const synonym of group) {
      if (synonym.length >= 3 && !STOP_WORDS.has(synonym)) {
        expanded.add(synonym);
      }
    }
  }

  return [...expanded];
}

function extractTitle(content, filename) {
  const heading = content.match(/^#\s+(.+)$/m);
  return heading?.[1]?.trim() || filename.replace(/\.md$/i, "");
}

function scoreDocument(queryWords, query, filename, content) {
  const normalizedContent = normalize(content);
  const normalizedFilename = normalize(filename);
  const headings = new Set(
    content
      .split("\n")
      .filter((line) => /^#{1,4}\s+/.test(line))
      .flatMap((line) => normalize(line).split(/\s+/))
  );
  const filenameWords = new Set(normalize(filename).split(/\s+/));

  let score = 0;

  for (const word of queryWords) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const matches = normalizedContent.match(
      new RegExp(`(?:^|\\s)${escaped}(?=\\s|$)`, "g")
    );
    const frequency = matches?.length || 0;

    if (frequency) score += Math.min(frequency, 5);
    if (headings.has(word)) score += 4;
    if (filenameWords.has(word)) score += 5;
  }

  if (query.length >= 12 && normalizedContent.includes(query)) {
    score += 10;
  }

  return score;
}

function relevantParagraphs(content, queryWords) {
  const paragraphs = content
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);

  return paragraphs
    .map((paragraph, index) => {
      const normalized = normalize(paragraph);
      const paragraphWords = new Set(normalized.split(/\s+/));
      let score = 0;

      for (const word of queryWords) {
        if (paragraphWords.has(word)) score += 1;
      }

      if (/^#{1,4}\s/.test(paragraph)) score += 0.5;

      return { paragraph, index, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 5)
    .sort((a, b) => a.index - b.index)
    .map((item) => item.paragraph);
}

export function retrieveExpurrKnowledge(question, limit = 5) {
  let files = [];

  try {
    files = fs.readdirSync(knowledgeDir)
      .filter((name) => name.toLowerCase().endsWith(".md"))
      .slice(0, 200);
  } catch {
    return "";
  }

  const query = normalize(question);
  const queryWords = [...new Set(words(question))];

  if (!queryWords.length) return "";

  const results = [];

  for (const name of files) {
    try {
      const fullPath = path.join(knowledgeDir, name);
      const stat = fs.statSync(fullPath);

      if (!stat.isFile() || stat.size > 500_000) continue;

      const content = fs.readFileSync(fullPath, "utf8");
      if (!content.trim()) continue;

      const score = scoreDocument(
        queryWords,
        query,
        name,
        content
      );

      if (score > 0) {
        results.push({
          name,
          title: extractTitle(content, name),
          content,
          score,
        });
      }
    } catch {
      // Błąd pojedynczego dokumentu nie przerywa wyszukiwania.
    }
  }

  results.sort((a, b) => b.score - a.score);

  const safeLimit = Math.max(1, Math.min(8, Number(limit) || 5));

  return results.slice(0, safeLimit).map((item) => {
    const excerpts = relevantParagraphs(item.content, queryWords);
    const excerpt = excerpts.length
      ? excerpts.join("\n\n")
      : item.content.slice(0, 1800);

    return [
      `ŹRÓDŁO: ${item.name}`,
      `TYTUŁ: ${item.title}`,
      `TRAFNOŚĆ: ${item.score}`,
      excerpt.slice(0, 3000),
    ].join("\n");
  }).join("\n\n---\n\n").slice(0, 14000);
}
