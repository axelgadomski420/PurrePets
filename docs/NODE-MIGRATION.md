# PURRE PETS — migracja na Node.js 22 + Nitro (self-hosted, Oracle Cloud)

Data: 2026-11-15 · Gałąź: `feature/node-nitro-migration`

## 1. Przyczyna awarii

Projekt był zbudowany pod **Cloudflare Workers**: `@cloudflare/vite-plugin` w `vite.config.js`,
`wrangler.jsonc` (`main: src/server.js`) oraz import `cloudflare:workers` w
`src/lib/error-capture.server.js`. Build produkcyjny (`dist/server/index.js`) zawierał więc
specyficzne dla Workera importy `cloudflare:`, których Node.js nie rozumie:

    ERR_UNSUPPORTED_ESM_URL_SCHEME — Received protocol 'cloudflare:'

PM2 uruchamiał ten plik bezpośrednio przez Node — stąd crash. `dist/client/index.html` nie istniał,
bo build TanStack Start nigdy nie generuje SPA `index.html`; frontend był serwowany przez tymczasowy
serwer statyczny (`scripts/server-static.js`), czyli pozorną naprawę (statyczny SPA zamiast SSR).

## 2. Docelowa architektura

| Komponent | Technologia | Adres |
| --- | --- | --- |
| Frontend SSR | TanStack Start (React 19) + Nitro v3 (preset `node-server`) | 127.0.0.1:3000 |
| Backend API | Express + Prisma + PostgreSQL + Socket.IO + JWT | 127.0.0.1:4000 |
| Procesy | PM2: `purrepets-frontend`, `purrepets-backend` | autostart po restarcie VM |
| HTTPS / proxy | Nginx (Let's Encrypt) → proxy na 3000/4000 | purrepets.pl |

- Build: `npm run build` (Vite 8 + plugin `nitro/vite`) → **.output/** (`.output/server/index.mjs` + `.output/public/`).
- Start: `npm start` = `node .output/server/index.mjs`; port/host z `PORT`/`HOST`.
- Backend czyta konfigurację z `backend/.env` (dotenv) — sekrety nie leżą już w `ecosystem.config.cjs`.
- Nginx: `/api/` i `/socket.io/` → backend (prefiks `/api/` **zachowany** — `proxy_pass` bez ukośnika),
  reszta → frontend SSR.

## 3. Co zostało zmienione

- `vite.config.js` — usunięte `@cloudflare/vite-plugin` i `@base44/vite-plugin`; dodany `nitro()`;
  zachowane prebundling i `allowedHosts`.
- `src/lib/error-capture.server.js` — `import { env, waitUntil } from "cloudflare:workers"` zastąpione
  odpowiednikami Node.js (migawka `process.env` do redakcji sekretów, fire-and-forget `waitUntil`).
  Cała logika raportowania błędów zachowana 1:1.
- `src/routes/__root.jsx` — usunięty `<Base44Scripts />` (wirtualny moduł `base44:document` istniał
  tylko wtyczką platformy Base44; w self-hosted nie ma czego wstrzykiwać).
- `package.json` — `start`/`test`, usunięte `@cloudflare/vite-plugin`, `wrangler`, `@base44/vite-plugin`;
  dodany `nitro` (jak w oficjalnym przykładzie TanStack Start: `^3.0.260903-beta`).
- `ecosystem.config.cjs` — frontend = SSR Nitro; **usunięte sekrety z pliku** (były wprost!).
- `scripts/deploy.sh` — bezpieczne wdrożenie z backupem `.output`, health checkami i rollbackiem.
- `scripts/smoke-test.mjs` — `npm test`.
- `backend/.env.example` — placeholder wszystkich zmiennych.
- `backend/nginx/purrepets.conf` — jedna kanoniczna konfiguracja (duplikaty server_name do usunięcia na VM).
- Usunięte: `wrangler.jsonc`, `.env` (wyciek sekretów do publicznego repo!).
- Zachowane bez zmian: `src/server.js` (custom server entry — raportowanie błędów tras działa dalej),
  `src/start.js`, `src/lib/error-capture.js`, `src/lib/auth-middleware.js`, `src/api/base44Client.js`,
  całe `backend/`, `StoryComposer.jsx`, `backend/src/prisma.js`, `backend/src/routes/ai.routes.js`.

## 4. Rotacja sekretów (PILNE)

W publicznym repozytorium ujawniono (git historia!):

1. **PostgreSQL** — hasło w `.env` i `ecosystem.config.cjs` (`DATABASE_URL`).
2. **JWT** — `JWT_SECRET` w `ecosystem.config.cjs`.
3. **Stripe** — `STRIPE_SECRET_KEY` (sk_test_…) i `STRIPE_WEBHOOK_SECRET` w `.env`.

Kroki (na VM):

    # PostgreSQL — nowe hasło
    sudo -u postgres psql -c "ALTER USER purre WITH PASSWORD 'NOWE_HASLO';"
    # → zaktualizuj DATABASE_URL w backend/.env

    # JWT — nowy sekret (wyloguje wszystkich użytkowników)
    openssl rand -hex 48   # → JWT_SECRET w backend/.env

    # Stripe — rotacja w dashboardie Stripe (API keys → Roll secret key; nowy webhook secret)
    # → STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET w backend/.env

    pm2 restart purrepets-backend --update-env

Ponieważ sekrety są w historii gita, rotacja jest obowiązkowa nawet po usunięciu plików.

## 5. Zmienne środowiskowe (bez sekretów)

Frontend (build-time): `VITE_API_URL` — zostaw puste ("" = same-origin za Nginx).
Frontend (runtime): `PORT=3000`, `HOST=127.0.0.1`, `NODE_ENV=production`.
Backend (`backend/.env`): `DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `PORT`, `HOST`,
`NODE_ENV`, `FRONTEND_PORT`, `PUBLIC_BASE_URL`, `CORS_ORIGINS`, `UPLOAD_DIR`, `MAX_UPLOAD_BYTES`,
`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`,
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `OLLAMA_URL`, `OLLAMA_MODEL`, `ADMIN_EMAILS`.

## 6. Wdrożenie na Oracle (skrót)

    cd /home/ubuntu/PurrePets
    git fetch origin
    git checkout fix/production-node-deployment
    # zapisz lokalne zmiany, jeśli są (git status; commit/stash)
    cp backend/.env.example backend/.env && nano backend/.env   # wartości po rotacji
    # UWAGA: npm install na produkcji jest ZABRONIONY — package-lock.json regeneruje
    #        CI (job "lockfile", Node 22) i commituje go do gałęzi.
    bash scripts/deploy.sh   # wyłącznie npm ci; przerywa, gdy lockfile poza syncem
    npm test
    bash scripts/triple-check.sh

Nginx (jednorazowo, po backupie istniejących plików):

    sudo cp /etc/nginx/sites-enabled/purrepets.pl /etc/nginx/sites-enabled/purrepets.pl.bak-$(date +%F) 2>/dev/null || true
    sudo cp /etc/nginx/sites-available/purrepets /etc/nginx/sites-available/purrepets.bak-$(date +%F) 2>/dev/null || true
    # usuń duplikaty vhostów z server_name purrepets.pl i zostaw jeden:
    sudo cp backend/nginx/purrepets.conf /etc/nginx/sites-available/purrepets
    sudo ln -sf /etc/nginx/sites-available/purrepets /etc/nginx/sites-enabled/purrepets
    sudo nginx -t && sudo systemctl reload nginx

## 7. Rollback

    cd /home/ubuntu/PurrePets
    git checkout main
    ls -1dt .output.bak-* | head -1        # ostatni działający build
    rm -rf .output && cp -a .output.bak-<STAMP> .output
    pm2 startOrReload ecosystem.config.cjs --update-env
    # ewentualnie przywróć poprzednią konfigurację nginx z .bak i: sudo nginx -t && sudo systemctl reload nginx

`scripts/deploy.sh` robi to samo automatycznie, gdy health checki po wdrożeniu nie przejdą.

## 8. Znane ograniczenia / decyzje architektoniczne

- `context.getBase44()` (`src/lib/auth-middleware.js`, `@base44/sdk`) jest reliktem platformy Base44 —
  żaden route go już nie używa (dane idą przez `src/api/base44Client.js` → własny backend). Zależność
  `@base44/sdk` została, żeby nie przepisywać middlewarów; nie wykonuje żadnych wywołań sieciowych.
- `src/lib/ai.server.js` (AI gateway Base44) jest nieużywany — AI działa przez `/api/ai/*` (Ollama).
- `useServerFn(...)` w `rewards.jsx`, `create.jsx`, `useGameSubmit.js` opakowuje zwykłe funkcje
  klienckie z `src/lib/server-fns.js` (TanStack zwraca je bez zmian) — działa, ale docelowo warto
  usunąć `useServerFn` i wołać funkcje wprost.
- `scripts/server-static.js` / `server-static.cjs` stają się zbędne — nie są już używane przez PM2;
  zostawione jako backup.

## 9. Poprawki wdrożeniowe (gałąź fix/production-node-deployment)

Weryfikacja techniczna migracji (npm registry / jsDelivr / dokumentacja TanStack, 2026-11-15)
potwierdziła architekturę i naprawiła następujące problemy:

1. **Konflikt peer dependencies @tanstack/ai** — lockfile rozjechał się: `@tanstack/ai-openai@0.22.8`
   wymaga `@tanstack/ai ^0.55.0`, a w projekcie jest `@tanstack/ai 0.54.0` (oraz
   `@tanstack/ai-react@0.24.1`, peer `^0.54.0`). Naprawa: `@tanstack/ai-openai` przypięty dokładnie
   do **0.22.6** (peer `^0.54.0` — spójny zestaw; `openai-base@0.10.16` w lockfile spełnia
   wymagane `^0.10.11`). Bez `--force`, bez `--legacy-peer-deps`.
2. **Kolejność pluginów Vite** — uporządkowana jak w oficjalnym przykładzie TanStack Start
   (examples/react/start-basic): `tanstackStart() → react() → nitro()`.
3. **package-lock.json** — wymagał regeneracji (zawierał poddrzewo Cloudflare, brak wpisów nitro;
   `npm ci` zwracał błąd synchronizacji). **Runda 2:** regenerację robi CI (job `lockfile`:
   `npm install --package-lock-only` + weryfikacja `npm ci` + automatyczny commit), a `deploy.sh`
   używa wyłącznie `npm ci` — `npm install` na produkcji jest zabroniony (szczegóły: sekcja 10).
4. **smoke-test.mjs** — zaostrzony: brak odpowiedzi HTTP jest błędem (wyjątek: `SMOKE_ALLOW_OFFLINE=1`
   przed startem PM2). Sprawdza: artefakty buildu, brak importu `cloudflare:` w zbudowanym serwerze,
   SSR strony głównej, routing (`/login`), statyki (`/robots.txt`) i `/api/health`.
5. **Inicjalizacja administratora** — bezpieczna, bez otwartego endpointu HTTP:
       cd backend && node scripts/seed-admin.js
   (`seed-admin.js` nadaje rolę admin tylko e-mailom z `ADMIN_EMAILS` i tworzy profil/portfel;
   `make-admin.mjs` został utwardzony — odmawia działania dla adresu spoza `ADMIN_EMAILS`).
   Role zmienia też panel admina (`PATCH /api/admin/users/:id`), dostępny wyłącznie dla
   kont z `ADMIN_EMAILS`.
6. **deploy.sh** — domyślnie wdraża aktualnie wybraną gałąź (`DEPLOY_BRANCH` ma priorytet);
   przed przełączeniem PM2 uruchamia smoke-test artefaktów; po health checkach pełny smoke-test HTTP.

Potwierdzone zgodności wersji:
- `nitro@3.0.260903-beta` eksportuje `./vite` (plugin Vite) — używany w `vite.config.js`.
- `@tanstack/react-start@1.168.60`: `server.entry` istnieje w schemacie konfiguracji
  (start-plugin-core 1.171.49); `@tanstack/react-start/server` eksportuje `createStartHandler`
  (przez start-server-core 1.169.39) i `defaultStreamHandler` — custom entry `src/server.js`
  (format `{ fetch }`) jest zgodny z dokumentacją (guide/server-entry-point).
- Custom server entry jest opcjonalny: gdyby build zgłosił problem z `server.entry`, można usunąć
  tę opcję — wbudowany entry + middlewary (`src/start.js`) i tak łapią błędy.

## 10. Runda 2 poprawek (fix/production-node-deployment)

1. **package-lock.json** — regeneracja odbywa się w CI (job `lockfile`, Node 22):
   `npm install --package-lock-only` (bez `--force`/`--legacy-peer-deps`), następnie weryfikacja
   `npm ci` (frontend i backend) i automatyczny commit zaktualizowanego lockfile do gałęzi.
   **Na serwerze produkcyjnym `npm install` jest zabroniony** — `deploy.sh` używa wyłącznie
   `npm ci` i przerywa wdrożenie z jasnym komunikatem, gdy lockfile jest poza syncem.
2. **deploy.sh** — zmiany:
   - kontrola czystości repo wykrywa też pliki untracked (`git status --short`); skrypt nigdy
     nie nadpisuje lokalnych zmian,
   - pełny smoke-test HTTP po health checkach jest WARUNKIEM sukcesu — porażka jakiegokolwiek
     testu (SSR `/`, routing `/login`, statyki `/robots.txt`, `/api/health`) uruchamia rollback,
   - rozszerzony rollback: przywraca `.output` (z `.output.bak-*`), `ecosystem.config.cjs`
     (z `.config.bak-*`), konfigurację Nginx (z `.bak`) i wznawia historyczny proces PM2;
     nie usuwa bazy, uploadów, Dockera, wolumenów ani danych,
   - migracja historycznego procesu PM2 (`purrepet`): deploy wykrywa procesy kolidujące
     z portami 3000/4000, **zatrzymuje** je (nie usuwa) przed startem nowych, a po pełnym
     sukcesie smoke-testów usuwa je selektywnie (`pm2 delete <nazwa>` — nigdy `pm2 delete all`).
     Dzięki temu na porcie 3000 nigdy nie rywalizują dwa procesy frontendu,
   - preflight Nginx (`DEPLOY_NGINX=1`): sprawdza istnienie plików certyfikatów
     (`/etc/letsencrypt/live/purrepets.pl/`), duplikaty `server_name purrepets.pl` w aktywnych
     vhostach oraz zgodność `UPLOAD_DIR` (backend/.env) z `alias` w `purrepets.conf`;
     przy problemach przerywa z listą do ręcznej naprawy (nigdy nie usuwa plików operatora).
3. **Skrypty admina** — usunięto domyślny adres e-mail (`effdoa@gmail.com`). Bez jawnie
   ustawionego `ADMIN_EMAILS` (backend/.env) skrypty `seed-admin.js` i `make-admin.mjs`
   PRZERYWAJĄ działanie. Nadanie roli admin wymaga jawnej decyzji operatora.
4. **Nginx — weryfikacja** (backend/nginx/purrepets.conf): prefiks `/api/` zachowany
   (`proxy_pass` bez ukośnika), `/socket.io/` z nagłówkami Upgrade/Connection,
   `/uploads/` jako alias dysku z fallbackiem do API (Range/206), cache statyków `/assets/`.
   Założenia o ścieżkach (certyfikaty, uploady) NIE są przyjmowane bez sprawdzenia —
   weryfikuje je preflight w deploy.sh.
5. **CI** (`.github/workflows/ci.yml`, Node 22): npm ci → `prisma migrate deploy` (wyłącznie
   efemeryczna baza Postgres 16 w CI) → lint → build → smoke-test artefaktów → start frontendu
   i backendu → pełny smoke-test HTTP → start przez PM2 + weryfikacja HTTP. Produkcja nietknięta.
6. **Backend/Prisma** — bez zmian schematu, bez automatycznych migracji; deploy robi tylko
   `prisma generate`. Migracje: ręcznie (`npx prisma migrate deploy`), po przeglądzie.
