import { Router } from "express";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import multer from "multer";
import { config } from "../config.js";
import { requireAuth, isAdmin } from "../lib/auth.js";
import { asyncHandler, badRequest } from "../lib/errors.js";
import { savePrivateVerificationDocument } from "../lib/private-verification-documents.js";

export const uploadsRouter = Router();

const CANDIDATE_DIRS = [
  config.uploadDir,
  "/var/www/purrepets/uploads",
  "/home/ubuntu/Base44/uploads",
  "/home/ubuntu/Base44/backend/uploads",
  path.resolve("uploads"),
].map((dir) => path.resolve(dir));

function writableDir() {
  for (const dir of CANDIDATE_DIRS) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.accessSync(dir, fs.constants.W_OK);
      return dir;
    } catch {
      // try the next location
    }
  }
  const fallback = path.resolve("uploads");
  fs.mkdirSync(fallback, { recursive: true });
  return fallback;
}

const uploadRoot = writableDir();

// Limity per typ (Moduł 2): zdjęcia 10 MB, wideo 100 MB (Reels), audio 20 MB.
const IMAGE_LIMIT = 10 * 1024 * 1024;
const VIDEO_LIMIT = Number(config.maxUploadBytes) || 100 * 1024 * 1024;
const AUDIO_LIMIT = 20 * 1024 * 1024;
const LIMITS = { image: IMAGE_LIMIT, video: VIDEO_LIMIT, audio: AUDIO_LIMIT };

const MIME_EXT = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/avif": ".avif",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/quicktime": ".mov",
  "audio/mpeg": ".mp3",
  "audio/wav": ".wav",
  "audio/ogg": ".ogg",
  "audio/webm": ".webm",
  "audio/mp4": ".m4a",
};

const ALLOWED = new Set(Object.keys(MIME_EXT));
const EXT_TYPE = Object.fromEntries(Object.entries(MIME_EXT).map(([mime, ext]) => [ext, mime]));

function categoryOf(mime) {
  if (typeof mime !== "string") return null;
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return null;
}

// Unikalne nazwy: timestamp + UUID v4 — zero kolizji.
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadRoot),
  filename: (_req, file, cb) => {
    // Rozszerzenie zawsze wynika z MIME, a nie z nazwy podanej przez klienta.
    const safeExt = MIME_EXT[file.mimetype] ?? "";
    cb(null, \`\${Date.now()}-\${crypto.randomUUID()}\${safeExt}\`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: VIDEO_LIMIT, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED.has(file.mimetype)) return cb(badRequest(\`Nieobsługiwany typ pliku: \${file.mimetype}\`));
    cb(null, true);
  },
});

// Sprawdza rzeczywistą sygnaturę pliku.
function hasValidUploadSignature(filePath, mime) {
  let fd;

  try {
    fd = fs.openSync(filePath, "r");
    const buffer = Buffer.alloc(32);
    const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, 0);
    const head = buffer.subarray(0, bytesRead);

    if (mime === "image/jpeg") {
      return head.length >= 3 &&
        head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
    }

    if (mime === "image/png") {
      return head.length >= 8 &&
        head.subarray(0, 8).equals(
          Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
        );
    }

    if (mime === "image/webp") {
      return head.length >= 12 &&
        head.subarray(0, 4).toString("ascii") === "RIFF" &&
        head.subarray(8, 12).toString("ascii") === "WEBP";
    }

    if (mime === "image/gif") {
      const magic = head.subarray(0, 6).toString("ascii");
      return magic === "GIF87a" || magic === "GIF89a";
    }

    if (mime === "image/avif") {
      return head.length >= 12 &&
        head.subarray(4, 8).toString("ascii") === "ftyp" &&
        ["avif", "avis"].includes(head.subarray(8, 12).toString("ascii"));
    }

    if (mime === "video/mp4" || mime === "audio/mp4") {
      if (
        head.length < 12 ||
        head.subarray(4, 8).toString("ascii") !== "ftyp"
      ) return false;

      const brands = [
        head.subarray(8, 12).toString("ascii"),
        head.subarray(16, 20).toString("ascii"),
        head.subarray(20, 24).toString("ascii"),
        head.subarray(24, 28).toString("ascii"),
        head.subarray(28, 32).toString("ascii"),
      ];

      const allowed = new Set([
        "isom", "iso2", "iso5", "iso6", "mp41", "mp42",
        "avc1", "M4V ", "M4A ", "M4B ", "F4V ",
        "dash", "MSNV", "3gp4", "3gp5", "3gp6",
      ]);

      return brands.some((brand) => allowed.has(brand));
    }

    if (mime === "video/quicktime") {
      return head.length >= 12 &&
        head.subarray(4, 8).toString("ascii") === "ftyp" &&
        head.subarray(8, 12).toString("ascii") === "qt  ";
    }

    if (mime === "video/webm" || mime === "audio/webm") {
      return head.length >= 4 &&
        head.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
    }

    if (mime === "audio/mpeg") {
      return head.subarray(0, 3).toString("ascii") === "ID3" ||
        (
          head.length >= 2 &&
          head[0] === 0xff &&
          (head[1] & 0xe0) === 0xe0
        );
    }

    if (mime === "audio/wav") {
      return head.length >= 12 &&
        head.subarray(0, 4).toString("ascii") === "RIFF" &&
        head.subarray(8, 12).toString("ascii") === "WAVE";
    }

    if (mime === "audio/ogg") {
      return head.length >= 4 &&
        head.subarray(0, 4).toString("ascii") === "OggS";
    }

    return false;
  } catch {
    return false;
  } finally {
    if (fd !== undefined) {
      try { fs.closeSync(fd); } catch { /* Operacja porządkowa jest best-effort. */ }
    }
  }
}

function findFile(name) {
  const safe = path.basename(name);
  if (!safe || safe !== name || safe.includes("..")) return null;
  for (const dir of CANDIDATE_DIRS) {
    const file = path.resolve(dir, safe);
    if (!file.startsWith(dir + path.sep) && file !== dir) continue;
    try {
      const stat = fs.lstatSync(file);
      if (stat.isFile() && !stat.isSymbolicLink()) return file;
    } catch {
      // Plik nie istnieje lub nie jest dostępny.
    }
  }
  return null;
}

/**
 * GET/HEAD /api/uploads/file/:name — obsługa HTTP Range (206 Partial Content),
 * dzięki której wideo w Reels i czacie się przewija i streamuje płynnie.
 */
uploadsRouter.get("/file/:name", (req, res) => {
  const file = findFile(req.params.name);
  if (!file) return res.status(404).json({ error: { message: "File not found", code: "NOT_FOUND" } });

  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    return res.status(404).json({ error: { message: "File not found", code: "NOT_FOUND" } });
  }

  const type = EXT_TYPE[path.extname(file).toLowerCase()] ?? "application/octet-stream";
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Cache-Control", "public, max-age=2592000");
  res.setHeader("Content-Type", type);
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.setHeader("ETag", \`"\${stat.size}-\${Math.floor(stat.mtimeMs)}"\`);

  if (req.method === "HEAD") {
    res.setHeader("Content-Length", stat.size);
    return res.end();
  }

  const rangeHeader = req.headers.range;
  if (rangeHeader) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(String(rangeHeader).trim());
    if (match) {
      let start = match[1] === "" ? NaN : parseInt(match[1], 10);
      let end = match[2] === "" ? NaN : parseInt(match[2], 10);
      if (Number.isNaN(start)) {
        start = Math.max(0, stat.size - (Number.isNaN(end) ? 0 : end));
        end = stat.size - 1;
      } else if (Number.isNaN(end) || end >= stat.size) {
        end = stat.size - 1;
      }
      if (start <= end && start < stat.size) {
        res.status(206);
        res.setHeader("Content-Range", \`bytes \${start}-\${end}/\${stat.size}\`);
        res.setHeader("Content-Length", end - start + 1);
        const stream = fs.createReadStream(file, { start, end });
        stream.on("error", () => res.destroy());
        return stream.pipe(res);
      }
      res.status(416);
      res.setHeader("Content-Range", \`bytes */\${stat.size}\`);
      return res.end();
    }
  }

  res.setHeader("Content-Length", stat.size);
  const stream = fs.createReadStream(file);
  stream.on("error", () => {
    if (!res.headersSent) res.status(500).end();
    else res.destroy();
  });
  stream.pipe(res);
});


// ---------------------------------------------------------------- Prywatne dokumenty (weryfikacja hodowcy)
// Katalog celowo POZA publicznym aliasem /uploads/ w Nginx (ten serwuje uploadRoot bez autoryzacji).
// Dostęp WYŁĄCZNIE przez GET /api/uploads/private/:userId/:name z tokenem — właściciel pliku lub admin.

const privateRoot = path.join(path.dirname(uploadRoot), "purrepets-private");

const privateStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const dir = path.join(privateRoot, String(req.user.id));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().slice(0, 10);
    const safeExt = /^\.[a-z0-9]+$/.test(ext) ? ext : (file.mimetype === "application/pdf" ? ".pdf" : (MIME_EXT[file.mimetype] ?? ""));
    cb(null, \`\${Date.now()}-\${crypto.randomUUID()}\${safeExt}\`);
  },
});

const privateUpload = multer({
  storage: privateStorage,
  limits: { fileSize: 20 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ok = file.mimetype === "application/pdf" || (typeof file.mimetype === "string" && file.mimetype.startsWith("image/"));
    if (!ok) return cb(badRequest(\`Nieobsługiwany typ dokumentu: \${file.mimetype}\`));
    cb(null, true);
  },
});

// POST /api/uploads/private (multipart, pole "file") — wymaga zalogowania.
uploadsRouter.post(
  "/private",
  requireAuth,
  privateUpload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest('No file uploaded (expected multipart field "file")');
    const fileUrl = \`/api/uploads/private/\${req.user.id}/\${req.file.filename}\`;
    res.status(201).json({ file_url: fileUrl, url: fileUrl, size: req.file.size, type: req.file.mimetype });
  })
);

// GET /api/uploads/private/:userId/:name — tylko właściciel lub admin; brak publicznego cache.
uploadsRouter.get("/private/:userId/:name", requireAuth, (req, res) => {
  if (req.user.id !== req.params.userId && !isAdmin(req)) {
    return res.status(403).json({ error: { message: "Brak dostępu do dokumentu", code: "FORBIDDEN" } });
  }
  const safe = path.basename(req.params.name);
  if (!safe || safe !== req.params.name || safe.includes("..")) {
    return res.status(404).json({ error: { message: "File not found", code: "NOT_FOUND" } });
  }
  const userDir = path.resolve(privateRoot, req.params.userId);
  const file = path.resolve(userDir, safe);
  if (!file.startsWith(userDir + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    return res.status(404).json({ error: { message: "File not found", code: "NOT_FOUND" } });
  }
  const type = EXT_TYPE[path.extname(file).toLowerCase()] ?? (safe.toLowerCase().endsWith(".pdf") ? "application/pdf" : "application/octet-stream");
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Content-Type", type);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Length", String(fs.statSync(file).size));
  const stream = fs.createReadStream(file);
  stream.on("error", () => {
    if (!res.headersSent) res.status(500).end();
    else res.destroy();
  });
  stream.pipe(res);
});

// POST /api/uploads (multipart, pole "file") → { file_url } — z limitem per kategoria.
uploadsRouter.post(
  "/",
  requireAuth,
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest('No file uploaded (expected multipart field "file")');

    // MIME deklarowany przez klienta nie jest dowodem formatu pliku.
    if (
      !req.file.size ||
      !hasValidUploadSignature(req.file.path, req.file.mimetype)
    ) {
      try { fs.unlinkSync(req.file.path); } catch { /* Operacja porządkowa jest best-effort. */ }
      throw badRequest("Zawartość pliku nie odpowiada deklarowanemu formatowi");
    }

    const category = categoryOf(req.file.mimetype);
    const limit = LIMITS[category];
    if (limit && req.file.size > limit) {
      try { fs.unlinkSync(req.file.path); } catch { /* Operacja porządkowa jest best-effort. */ }
      return res.status(413).json({
        error: {
          message: \`Plik za duży (max \${Math.floor(limit / (1024 * 1024))} MB dla \${category})\`,
          code: "FILE_TOO_LARGE",
        },
      });
    }
    const base = config.publicBaseUrl.replace(/\/$/, "");
    const url = \`\${base}/api/uploads/file/\${req.file.filename}\`;
    res.status(201).json({ file_url: url, url, size: req.file.size, type: req.file.mimetype });
  })
);


// Prywatny upload dokumentów do weryfikacji hodowcy.
// Pliki nie trafiają do publicznego katalogu multimediów.
const verificationDocumentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const allowed = new Set([
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
    ]);
    if (!allowed.has(file.mimetype))
      return cb(badRequest("Dozwolone formaty: PDF, JPG, PNG i WEBP"));
    cb(null, true);
  },
});

uploadsRouter.post(
  "/verification-document",
  requireAuth,
  verificationDocumentUpload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest("Nie przesłano dokumentu");
    const saved = await savePrivateVerificationDocument(req.file, req.user.id);
    res.status(201).json(saved);
  })
);
