#!/usr/bin/env node
// PURRE PETS — smoke test (npm test). Zero zewnętrznych zależności, Node 22+.
// 1) Artefakty buildu: .output/server/index.mjs i .output/public.
// 2) Regresja migracji: zbudowany serwer nie może importować 'cloudflare:'.
// 3) Realne HTTP: SSR strony głównej, routing (/login), statyki (/robots.txt), backend /api/health.
// Brak odpowiedzi HTTP jest BŁĘDEM (nie uznajemy ciszy za sukces). Wyjątek: przed startem PM2
// uruchom z SMOKE_ALLOW_OFFLINE=1 — wtedy sprawdzane są tylko artefakty buildu.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const allowOffline = process.env.SMOKE_ALLOW_OFFLINE === "1";
let failures = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "✅" : "❌"} ${name}${extra ? " — " + extra : ""}`);
  if (!ok) failures++;
};

// 1) Artefakty
const serverEntry = path.join(root, ".output", "server", "index.mjs");
check("build: .output/server/index.mjs", existsSync(serverEntry));
check("build: .output/public", existsSync(path.join(root, ".output", "public")));

// 2) Regresja Cloudflare — żaden import w zbudowanym serwerze nie może wskazywać cloudflare:
if (existsSync(serverEntry)) {
  const built = readFileSync(serverEntry, "utf8");
  const cloudflareImport = /(from\s*["']|import\s*\(\s*["'])cloudflare:/i.test(built);
  check("runtime: brak importu 'cloudflare:' w .output/server/index.mjs", !cloudflareImport);
}

// 3) HTTP
const front = process.env.FRONT_URL ?? "http://127.0.0.1:3000";
const api = process.env.API_URL ?? "http://127.0.0.1:4000";
const offline = [];

async function probe(url, name, validate) {
  try {
    const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(5000) });
    let body = "";
    try { body = await res.text(); } catch { /* Odpowiedź może nie udostępnić treści. */ }
    check(name, validate(res, body), `HTTP ${res.status}`);
  } catch (error) {
    offline.push(name);
    const why = String(error?.cause?.code ?? error?.message ?? error).slice(0, 80);
    check(name, allowOffline, `brak odpowiedzi (${why})${allowOffline ? " — dozwolone (SMOKE_ALLOW_OFFLINE=1)" : ""}`);
  }
}

await probe(`${front}/`, "frontend GET / (SSR)", (res, body) => res.status === 200 && /<html/i.test(body));
await probe(`${front}/login`, "frontend GET /login (routing)", (res) => res.status === 200);
await probe(`${front}/robots.txt`, "frontend GET /robots.txt (statyki)", (res) => res.status === 200);
await probe(`${api}/api/health`, "backend GET /api/health", (res, body) => res.status === 200 && body.includes('"ok":true'));

if (offline.length > 0 && !allowOffline) {
  console.log("\nSerwery nie odpowiadają. Uruchom: pm2 startOrReload ecosystem.config.cjs --update-env — i powtórz npm test.");
}
process.exit(failures === 0 ? 0 : 1);
