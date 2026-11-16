// PURRE PETS — produkcyjny serwer statyczny SPA (zero zależności).
// Dlaczego nie „vite preview”? To serwer deweloperski. Dlaczego nie dist/server/index.js?
// Build jest targetowany pod Cloudflare Workers (importy „cloudflare:”) — nie działa na Node.
// Ten serwer: dist/client + SPA fallback + cache + gzip + ETag + nagłówki bezpieczeństwa.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(process.env.DIST_DIR || path.join(__dirname, "..", "dist", "client"));
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

const COMPRESSIBLE = new Set([".html", ".css", ".js", ".mjs", ".json", ".svg", ".txt", ".webmanifest", ".map"]);

function safeJoin(root, urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const target = path.resolve(root, "." + decoded);
  return target === root || target.startsWith(root + path.sep) ? target : null;
}

function sendError(res, code, message) {
  if (res.headersSent) return res.destroy();
  res.writeHead(code, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(message);
}

const server = http.createServer((req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return sendError(res, 405, "Method Not Allowed");
  }

  let filePath = safeJoin(DIST_DIR, req.url || "/");
  if (!filePath) return sendError(res, 403, "Forbidden");

  let stat = null;
  try {
    stat = fs.statSync(filePath);
  } catch {
    stat = null;
  }
  if (stat?.isDirectory()) {
    filePath = path.join(filePath, "index.html");
    try {
      stat = fs.statSync(filePath);
    } catch {
      stat = null;
    }
  }

  // SPA fallback: ścieżki bez rozszerzenia → index.html (client-side routing).
  if (!stat && !path.extname(filePath)) {
    filePath = path.join(DIST_DIR, "index.html");
    try {
      stat = fs.statSync(filePath);
    } catch {
      return sendError(res, 404, "Build not found — uruchom: npm run build");
    }
  }
  if (!stat) return sendError(res, 404, "Not Found");

  const ext = path.extname(filePath).toLowerCase();
  const isHashedAsset = /-[A-Za-z0-9_-]{8,}\.[a-z0-9]+$/.test(filePath) || filePath.includes(`${path.sep}assets${path.sep}`);
  const isHtml = ext === ".html";

  const etag = `W/"${stat.size}-${Math.floor(stat.mtimeMs)}"`;
  if (req.headers["if-none-match"] === etag) {
    res.writeHead(304, { ETag: etag });
    return res.end();
  }

  const headers = {
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Cache-Control": isHtml
      ? "no-cache, must-revalidate"
      : isHashedAsset
        ? "public, max-age=31536000, immutable"
        : "public, max-age=3600",
    ETag: etag,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "SAMEORIGIN",
    Vary: "Accept-Encoding",
  };

  if (COMPRESSIBLE.has(ext) && (req.headers["accept-encoding"] || "").includes("gzip")) {
    headers["Content-Encoding"] = "gzip";
    res.writeHead(200, headers);
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(filePath).pipe(zlib.createGzip()).pipe(res);
    return;
  }

  headers["Content-Length"] = stat.size;
  res.writeHead(200, headers);
  if (req.method === "HEAD") return res.end();
  fs.createReadStream(filePath).pipe(res);
});

server.on("error", (err) => {
  console.error("[purre-static] server error:", err.message);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`[purre-static] serving ${DIST_DIR} on http://${HOST}:${PORT}`);
});
