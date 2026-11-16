import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
const PRIVATE_DIR = path.join(
  os.homedir(),
  ".purrepets-private",
  "verification-documents"
);

const MIME_EXT = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

async function ensurePrivateDir() {
  await fs.mkdir(PRIVATE_DIR, { recursive: true, mode: 0o700 });

  const stat = await fs.lstat(PRIVATE_DIR);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error("Niebezpieczna lokalizacja prywatnych dokumentów");
  }

  await fs.chmod(PRIVATE_DIR, 0o700);

  const verified = await fs.lstat(PRIVATE_DIR);
  if (!verified.isDirectory() || verified.isSymbolicLink()) {
    throw new Error("Nieprawidłowy katalog prywatnych dokumentów");
  }
}

function validSignature(buffer, mime) {
  if (mime === "application/pdf")
    return buffer.subarray(0, 5).toString() === "%PDF-";
  if (mime === "image/jpeg")
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mime === "image/png")
    return buffer.subarray(0, 8).equals(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
    );
  if (mime === "image/webp")
    return buffer.subarray(0, 4).toString() === "RIFF" &&
      buffer.subarray(8, 12).toString() === "WEBP";
  return false;
}

export async function savePrivateVerificationDocument(file, userId) {
  if (!Buffer.isBuffer(file?.buffer) || !userId) {
    throw new Error("Brak pliku lub użytkownika");
  }

  const actualSize = file.buffer.length;
  if (!actualSize || actualSize > 15 * 1024 * 1024) {
    throw new Error("Dokument może mieć maksymalnie 15 MB");
  }

  const ext = MIME_EXT[file.mimetype];
  if (!ext || !validSignature(file.buffer, file.mimetype)) {
    throw new Error("Nieprawidłowy format lub zawartość dokumentu");
  }

  await ensurePrivateDir();

  const id = crypto.randomUUID();
  const filePath = path.join(PRIVATE_DIR, id + ext);
  const metaPath = path.join(PRIVATE_DIR, id + ".json");

  const safeFilename = String(file.originalname || "dokument")
    /* eslint-disable-next-line no-control-regex -- Usuwanie znaków sterujących z nazwy pliku. */
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/[\\/]/g, "_")
    .trim()
    .slice(0, 200) || "dokument";

  const metadata = {
    id,
    userId: String(userId),
    filename: safeFilename,
    mimeType: file.mimetype,
    size: actualSize,
    extension: ext,
    createdAt: new Date().toISOString(),
  };

  let fileCreated = false;
  let metaCreated = false;

  try {
    await fs.writeFile(filePath, file.buffer, { mode: 0o600, flag: "wx" });
    fileCreated = true;

    await fs.writeFile(metaPath, JSON.stringify(metadata), {
      mode: 0o600,
      flag: "wx",
    });
    metaCreated = true;

    return {
      document_url: `private-doc:${id}`,
      filename: metadata.filename,
      size: metadata.size,
      type: metadata.mimeType,
    };
  } catch (error) {
    if (metaCreated) await fs.rm(metaPath, { force: true }).catch(() => {});
    if (fileCreated) await fs.rm(filePath, { force: true }).catch(() => {});
    throw error;
  }
}

export async function getPrivateVerificationDocument(token, userId) {
  const match = /^private-doc:([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i
    .exec(String(token || ""));

  if (!match || !userId) {
    throw new Error("Nieprawidłowy identyfikator dokumentu");
  }

  await ensurePrivateDir();

  const id = match[1];
  const metaPath = path.join(PRIVATE_DIR, id + ".json");

  const metaStat = await fs.lstat(metaPath);
  if (!metaStat.isFile() || metaStat.isSymbolicLink() || metaStat.size > 4096) {
    throw new Error("Nieprawidłowy plik metadanych");
  }

  let metadata;
  try {
    metadata = JSON.parse(await fs.readFile(metaPath, "utf8"));
  } catch {
    throw new Error("Nieprawidłowe metadane dokumentu");
  }

  if (
    !metadata ||
    metadata.id !== id ||
    typeof metadata.userId !== "string" ||
    !metadata.userId ||
    !Number.isSafeInteger(metadata.size) ||
    metadata.size < 1 ||
    metadata.size > 15 * 1024 * 1024 ||
    typeof metadata.filename !== "string" ||
    typeof metadata.createdAt !== "string" ||
    MIME_EXT[metadata.mimeType] !== metadata.extension
  ) {
    throw new Error("Nieprawidłowe metadane dokumentu");
  }

  if (String(metadata.userId) !== String(userId)) {
    throw new Error("Brak dostępu do dokumentu");
  }

  const filePath = path.join(PRIVATE_DIR, id + metadata.extension);
  const fileStat = await fs.lstat(filePath);

  if (
    !fileStat.isFile() ||
    fileStat.isSymbolicLink() ||
    fileStat.size !== metadata.size ||
    fileStat.size < 1 ||
    fileStat.size > 15 * 1024 * 1024
  ) {
    throw new Error("Nieprawidłowy plik dokumentu");
  }

  // Ponowna kontrola sygnatury rzeczywistej zawartości przy odczycie.
  const content = await fs.readFile(filePath);
  if (
    content.length !== metadata.size ||
    !validSignature(content, metadata.mimeType)
  ) {
    throw new Error("Sygnatura lub zawartość dokumentu jest nieprawidłowa");
  }

  return { filePath, metadata };
}

export async function extractPrivateVerificationDocument(token, userId) {
  const { filePath, metadata } =
    await getPrivateVerificationDocument(token, userId);

  let tempDir = null;

  try {
    let images = [];
    let hasMorePages = false;

    if (metadata.mimeType === "application/pdf") {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "purre-ocr-"));
      const output = path.join(tempDir, "page-%03d.png");

      await exec("gs", [
        "-q",
        "-dSAFER",
        "-dBATCH",
        "-dNOPAUSE",
        "-dPDFSTOPONERROR",
        "-sDEVICE=pnggray",
        "-r180",
        "-dFirstPage=1",
        "-dLastPage=9",
        "-dNumRenderingThreads=1",
        `-sOutputFile=${output}`,
        filePath,
      ], {
        timeout: 120000,
        maxBuffer: 4 * 1024 * 1024,
      });

      const allNames = (await fs.readdir(tempDir))
        .filter((name) => /^page-\d{3}\.png$/.test(name))
        .sort();

      // Dziewiąta strona wykrywa przekroczenie limitu OCR.
      // Do rozpoznawania przekazujemy maksymalnie pierwsze 8 stron.
      hasMorePages = allNames.length > 8;
      const names = allNames.slice(0, 8);

      images = names.map((name) => path.join(tempDir, name));
    } else {
      images = [filePath];
    }

    if (!images.length) {
      throw new Error("Nie udało się odczytać stron PDF");
    }

    const parts = [];
    const failedPages = [];

    for (let index = 0; index < images.length; index++) {
      try {
        const result = await exec("tesseract", [
          images[index],
          "stdout",
          "-l",
          "pol+eng",
          "--psm",
          "6",
        ], {
          timeout: 90000,
          maxBuffer: 3 * 1024 * 1024,
        });

        const pageText = String(result.stdout || "").trim();
        if (pageText) parts.push(pageText);
        else failedPages.push(index + 1);
      } catch {
        failedPages.push(index + 1);
      }
    }

    const text = parts.join("\n\n").slice(0, 16000);

    return {
      text,
      filename: metadata.filename,
      pages_read: images.length,
      pages_truncated: hasMorePages,
      pages_total_detected: hasMorePages ? 9 : images.length,
      pages_failed: failedPages,
      languages: "pol+eng",
      ok: text.length >= 20,
      complete:
        failedPages.length === 0 &&
        images.length > 0 &&
        !hasMorePages,
    };
  } finally {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }
}
