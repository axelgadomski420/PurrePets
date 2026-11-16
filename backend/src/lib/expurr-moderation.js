import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const MODEL = process.env.EXPURR_VISION_MODEL || "qwen3-vl:2b-instruct";
const OLLAMA_URL = (process.env.OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/+$/, "");
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const MIME_EXTENSIONS = Object.freeze({
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/avif": ".avif",
});

const MODERATION_PROMPT = `
Jesteś systemem bezpieczeństwa platformy społecznościowej PURRE PETS.
Analizujesz obraz wyłącznie pod kątem zgodności z zasadami publikacji.

Wykryj:
- krzywdzenie, zaniedbywanie lub znęcanie się nad zwierzętami;
- widoczne obrażenia, krew, brutalność i drastyczne sceny;
- niebezpieczne zachowania wobec zwierząt, które mogą prowadzić do urazu;
- przemoc wobec ludzi;
- nagość lub treści seksualne;
- nielegalne działania widoczne na obrazie;
- spam, oszustwa i treści niezwiązane z platformą.

Ważne:
- Nie uznawaj samej obecności rannego zwierzęcia za dowód znęcania.
- Zdjęcia weterynaryjne, edukacyjne, adopcyjne i dokumentujące leczenie
  wymagają kontekstu; w razie wątpliwości kieruj do ręcznej kontroli.
- Nie zgaduj intencji autora.
- Nie identyfikuj osób.
- Jeśli obraz jest nieczytelny, niejednoznaczny lub nie można ocenić
  bezpieczeństwa, wybierz review.
- Nie wydawaj decyzji o karze dla konta.

Zwróć WYŁĄCZNIE poprawny JSON, bez Markdown:
{
  "decision": "allow" | "review" | "block",
  "risk": "low" | "medium" | "high" | "critical",
  "confidence": 0.0,
  "categories": [],
  "summary": "krótkie uzasadnienie po polsku",
  "animal_welfare_concern": false,
  "requires_human_review": false
}

Reguły:
- allow tylko wtedy, gdy obraz jest czytelny i nie widać naruszeń.
- review przy niepewności, potencjalnym zagrożeniu lub potrzebie kontekstu.
- block wyłącznie przy jednoznacznych, poważnych naruszeniach.
- Nie używaj block jako zamiennika review.
`;

function safeJsonParse(value) {
  if (typeof value !== "string") return null;

  const cleaned = value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");

  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start < 0 || end <= start) return null;

    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

function normalizeResult(raw) {
  const allowedDecisions = new Set(["allow", "review", "block"]);
  const allowedRisks = new Set(["low", "medium", "high", "critical"]);

  if (!raw || !allowedDecisions.has(raw.decision)) return null;

  const confidence = Number(raw.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    return null;
  }

  const risk = allowedRisks.has(raw.risk) ? raw.risk : "medium";
  const categories = Array.isArray(raw.categories)
    ? raw.categories
        .filter((item) => typeof item === "string")
        .slice(0, 20)
        .map((item) => item.slice(0, 80))
    : [];

  const summary = typeof raw.summary === "string"
    ? raw.summary.slice(0, 1200)
    : "Brak wiarygodnego uzasadnienia modelu.";

  const animalWelfareConcern = raw.animal_welfare_concern === true;
  const requiresHumanReview = raw.requires_human_review === true;

  // Model nie może samodzielnie przepchnąć niepewnego materiału.
  let decision = raw.decision;

  if (
    decision === "allow" &&
    (confidence < 0.90 ||
      risk !== "low" ||
      animalWelfareConcern ||
      requiresHumanReview)
  ) {
    decision = "review";
  }

  if (decision === "block" && confidence < 0.90) {
    decision = "review";
  }

  return {
    decision,
    risk,
    confidence,
    categories,
    summary,
    animal_welfare_concern: animalWelfareConcern,
    requires_human_review: requiresHumanReview,
    model: MODEL,
    analyzed_at: new Date().toISOString(),
  };
}

export async function moderateImageBuffer(buffer, mimeType) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error("Brak danych obrazu do moderacji.");
  }

  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new Error("Obraz przekracza limit 10 MB.");
  }

  if (!MIME_EXTENSIONS[mimeType]) {
    throw new Error("Nieobsługiwany format obrazu.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);

  try {
    const response = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: MODEL,
        stream: false,
        format: "json",
        messages: [
          {
            role: "system",
            content: MODERATION_PROMPT,
          },
          {
            role: "user",
            content: "Przeanalizuj załączony obraz zgodnie z zasadami moderacji.",
            images: [buffer.toString("base64")],
          },
        ],
        options: {
          temperature: 0,
          num_ctx: 8192,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama zwróciła HTTP ${response.status}.`);
    }

    const payload = await response.json();
    const raw = safeJsonParse(payload?.message?.content);
    const result = normalizeResult(raw);

    if (!result) {
      throw new Error("Model zwrócił nieprawidłowy wynik moderacji.");
    }

    return result;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("Przekroczono czas analizy obrazu przez Qwen3-VL.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function ensureDirectory(directory) {
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
}

async function writeJsonAtomic(filePath, value) {
  const temporary = `${filePath}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(value, null, 2), {
    encoding: "utf8",
    mode: 0o600,
    flag: "wx",
  });
  await fs.rename(temporary, filePath);
}

function manifestPath(queueDirectory, id) {
  if (!/^[a-f0-9-]{36}$/i.test(id)) {
    throw new Error("Nieprawidłowy identyfikator moderacji.");
  }
  return path.join(queueDirectory, `${id}.json`);
}

/**
 * Zapisuje obraz poza publicznym katalogiem uploadów.
 * Ta funkcja nigdy nie publikuje pliku.
 */
export async function quarantineImage({
  buffer,
  mimeType,
  ownerId,
  quarantineDirectory,
  originalName = "upload",
}) {
  if (!ownerId || typeof ownerId !== "string") {
    throw new Error("Brak identyfikatora właściciela pliku.");
  }

  if (!MIME_EXTENSIONS[mimeType]) {
    throw new Error("Nieobsługiwany typ obrazu.");
  }

  if (!Buffer.isBuffer(buffer) || buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) {
    throw new Error("Nieprawidłowy rozmiar obrazu.");
  }

  const id = crypto.randomUUID();
  const extension = MIME_EXTENSIONS[mimeType];
  const directory = path.resolve(quarantineDirectory);
  const filePath = path.join(directory, `${id}${extension}`);

  await ensureDirectory(directory);

  // Plik jest zapisywany wyłącznie w prywatnej kwarantannie.
  await fs.writeFile(filePath, buffer, {
    flag: "wx",
    mode: 0o600,
  });

  const record = {
    id,
    owner_id: ownerId,
    file_name: `${id}${extension}`,
    original_name: path.basename(String(originalName)).slice(0, 180),
    mime_type: mimeType,
    size: buffer.length,
    status: "pending",
    decision: "review",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  try {
    await writeJsonAtomic(manifestPath(directory, id), record);
  } catch (error) {
    await fs.unlink(filePath).catch(() => {});
    throw error;
  }

  return record;
}

/**
 * Analizuje obraz już umieszczony w kwarantannie.
 * Awaria modelu pozostawia plik w kwarantannie.
 */
/**
 * Odczytuje manifest konkretnego materiału z prywatnej kwarantanny.
 * Identyfikator jest walidowany przez manifestPath.
 */
export async function getQuarantinedImageRecord({
  id,
  quarantineDirectory,
}) {
  const directory = path.resolve(quarantineDirectory);
  const metadataPath = manifestPath(directory, id);
  return JSON.parse(await fs.readFile(metadataPath, "utf8"));
}

export async function analyzeQuarantinedImage({
  id,
  quarantineDirectory,
}) {
  const directory = path.resolve(quarantineDirectory);
  const metadataPath = manifestPath(directory, id);
  const record = JSON.parse(await fs.readFile(metadataPath, "utf8"));

  if (record.status !== "pending") {
    throw new Error("Ten materiał nie oczekuje już na analizę.");
  }

  const filePath = path.join(directory, record.file_name);
  const buffer = await fs.readFile(filePath);

  let result;
  try {
    result = await moderateImageBuffer(buffer, record.mime_type);
  } catch (error) {
    record.status = "review";
    record.decision = "review";
    record.analysis_error = String(error?.message || error).slice(0, 500);
    record.updated_at = new Date().toISOString();
    await writeJsonAtomic(metadataPath, record);
    return record;
  }

  record.status = result.decision === "allow" ? "approved_for_publication" : result.decision;
  record.decision = result.decision;
  record.analysis = result;
  record.updated_at = new Date().toISOString();

  await writeJsonAtomic(metadataPath, record);
  return record;
}

/**
 * Publikacja wymaga wcześniejszego allow albo jawnej decyzji moderatora.
 * Plik przenoszony jest atomowo na tym samym systemie plików.
 */
export async function publishQuarantinedImage({
  id,
  quarantineDirectory,
  publicDirectory,
  moderatorApproved = false,
}) {
  const quarantine = path.resolve(quarantineDirectory);
  const publicRoot = path.resolve(publicDirectory);
  const metadataPath = manifestPath(quarantine, id);
  const record = JSON.parse(await fs.readFile(metadataPath, "utf8"));

  const authorized =
    record.status === "approved_for_publication" ||
    (moderatorApproved === true && record.status === "review");

  if (!authorized) {
    throw new Error("Materiał nie ma zgody na publikację.");
  }

  await ensureDirectory(publicRoot);

  const source = path.join(quarantine, record.file_name);
  const destinationName = `${crypto.randomUUID()}${path.extname(record.file_name)}`;
  const destination = path.join(publicRoot, destinationName);

  await fs.rename(source, destination);

  record.status = "published";
  record.public_file_name = destinationName;
  record.published_at = new Date().toISOString();
  record.updated_at = new Date().toISOString();

  try {
    await writeJsonAtomic(metadataPath, record);
  } catch (error) {
    // Jeśli zapis manifestu się nie powiedzie, cofamy publikację.
    await fs.rename(destination, source).catch(() => {});
    throw error;
  }

  return {
    id,
    file_name: destinationName,
    mime_type: record.mime_type,
    size: record.size,
    status: "published",
  };
}

export async function rejectQuarantinedImage({
  id,
  quarantineDirectory,
  moderatorId,
  reason = "Odrzucono podczas moderacji.",
}) {
  const directory = path.resolve(quarantineDirectory);
  const metadataPath = manifestPath(directory, id);
  const record = JSON.parse(await fs.readFile(metadataPath, "utf8"));

  if (record.status === "published") {
    throw new Error("Nie można odrzucić już opublikowanego pliku tą operacją.");
  }

  await fs.unlink(path.join(directory, record.file_name)).catch((error) => {
    if (error.code !== "ENOENT") throw error;
  });

  record.status = "rejected";
  record.decision = "block";
  record.moderator_id = moderatorId || null;
  record.moderator_reason = String(reason).slice(0, 1000);
  record.updated_at = new Date().toISOString();

  await writeJsonAtomic(metadataPath, record);
  return record;
}

export async function listModerationQueue(quarantineDirectory, { limit = 100 } = {}) {
  const directory = path.resolve(quarantineDirectory);
  await ensureDirectory(directory);

  const names = await fs.readdir(directory);
  const records = [];

  for (const name of names) {
    if (!/^[a-f0-9-]{36}\.json$/i.test(name)) continue;

    try {
      const record = JSON.parse(await fs.readFile(path.join(directory, name), "utf8"));
      if (["pending", "review", "block"].includes(record.status)) {
        records.push(record);
      }
    } catch {
      // Uszkodzony manifest nie może zatrzymać całej kolejki.
    }
  }

  return records
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .slice(0, Math.max(1, Math.min(Number(limit) || 100, 250)));
}
