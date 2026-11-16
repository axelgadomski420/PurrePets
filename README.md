# PURRE PETS

Samodzielna, produkcyjna aplikacja społecznościowa dla miłośników psów i kotów:
ogłoszenia hodowlane i adopcje, profile zwierząt z książeczką zdrowia, Reels i Stories,
messenger z szyfrowaniem E2E i połączeniami głosowymi/wideo (WebRTC), PURRE Studio
(edytor zdjęć i wideo), gry arcade, grupy, wydarzenia, system monet (Stripe),
subskrypcja PRO oraz panel administratora/moderatora.

## Architektura

- **Frontend + SSR:** React 19 + TanStack Start (Router) na Nitro (Node.js 22, preset node-server)
- **Backend:** Express + PostgreSQL + Prisma + Socket.IO (realtime: czat, powiadomienia, sygnalizacja WebRTC)
- **AI:** lokalny Ollama (`qwen2.5:3b`) — asystent, analiza dokumentów hodowców; OCR Tesseract (pol+eng) po stronie klienta
- **Płatności:** Stripe Checkout (PLN) — pakiety monet 1000 = 9,99 zł / 5000 = 39,99 zł, subskrypcja PRO, idempotentne webhooki
- **Reklamy:** wyłącznie Google AdSense (co 5–7 postów, ukryte dla PREMIUM)

## Struktura

```
src/                 frontend (TanStack Start) + serwer SSR
backend/             Express + Prisma + Socket.IO
backend/prisma/      schemat bazy + migracje (addytywne)
scripts/             deploy.sh (rollback), smoke-test, serwer statyczny
docs/                dokumentacja migracji Node.js/Nitro
```

## Szybki start (dev)

```bash
# frontend
npm ci
npm run dev

# backend (osobny terminal)
cd backend
cp .env.example .env   # ustaw DATABASE_URL, JWT_SECRET
npm ci
npx prisma generate && npx prisma migrate dev
npm run dev
```

## Produkcja

Patrz `docs/NODE-MIGRATION.md` (sekcja wdrożenia i rotacji sekretów) oraz
`scripts/deploy.sh` (deploy z preflightem i globalnym rollbackiem).
PM2: `ecosystem.config.cjs` (frontend :3000, backend :4000, Nginx jako reverse proxy).

## Bezpieczeństwo

- JWT (Bearer), role: user / moderator / admin — autoryzacja na backendzie, nie tylko w UI
- Messenger E2E: ECDH P-256 + AES-GCM (serwer nie widzi treści)
- Prywatne dokumenty weryfikacji hodowców poza publicznym katalogiem uploadów
- Webhook Stripe: weryfikacja podpisu + idempotencja (rejestr event_id)
- Goście (bez logowania): wyłącznie przeglądanie ogłoszeń i Reels

## Sekrety

Nigdy nie commituj `.env`. Wzorce: `.env.example` (root, frontend) i `backend/.env.example`.
