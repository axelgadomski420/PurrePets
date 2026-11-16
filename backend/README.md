# PURRE PETS — Backend (zamiennik Base44) — instrukcja wdrożenia na Oracle Cloud

Samodzielny backend zastępujący platformę Base44 dla aplikacji PURRE PETS.
Stack: **Node.js 22 LTS · Express · PostgreSQL · Prisma · JWT · bcrypt · Multer · Socket.IO · Zod · PM2**.

- Backend nasłuchuje wyłącznie lokalnie na `http://127.0.0.1:4000` (port 4000 NIE jest otwarty w Oracle Security List).
- Publiczny dostęp wyłącznie przez Nginx: `https://purrepets.pl/api`.
- Frontend (TanStack Start SSR na Nitro) działa na `127.0.0.1:3000`, Nginx serwuje go pod `/`.

## 1. Zależności systemowe (Ubuntu 24.04)

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git build-essential nginx postgresql postgresql-contrib

# Node.js 22 LTS
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # v22.x

# PM2
sudo npm install -g pm2
```

## 2. Baza danych PostgreSQL

```bash
sudo -u postgres psql <<'SQL'
CREATE USER purre WITH PASSWORD 'purre_secret';
CREATE DATABASE purrepets OWNER purre;
GRANT ALL PRIVILEGES ON DATABASE purrepets TO purre;
SQL
```

> Ustaw własne, silne hasło i wpisz je w `.env` (`DATABASE_URL`).

## 3. Instalacja backendu

```bash
git clone <twoje-repo> /home/ubuntu/PurrePets
cd /home/ubuntu/PurrePets/backend

cp .env.example .env
nano .env   # ustaw JWT_SECRET (openssl rand -hex 48), DATABASE_URL, CORS_ORIGINS

npm install
npx prisma generate
```

## 4. Migracje Prisma

```bash
# produkcyjnie:
npx prisma migrate deploy

# (przy rozwoju: npx prisma migrate dev --name init)
```

## 5. Test lokalny

```bash
npm start
# w drugim terminalu:
curl http://127.0.0.1:4000/api/health
# → {"ok":true,"now":"..."}
```

## 6. PM2 (produkcja, autostart po restarcie serwera)

```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup   # wykonaj wyświetloną komendę sudo
pm2 logs purrepets-backend
pm2 restart purrepets-backend   # po zmianach
```

## 7. Nginx

```bash
sudo cp nginx/purrepets.conf /etc/nginx/sites-available/purrepets
sudo ln -sf /etc/nginx/sites-available/purrepets /etc/nginx/sites-enabled/purrepets
sudo rm -f /etc/nginx/sites-enabled/default
sudo mkdir -p /var/www/purrepets/uploads
sudo chown www-data:www-data /var/www/purrepets/uploads
sudo nginx -t && sudo systemctl reload nginx
```

HTTPS dla `purrepets.pl`:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d purrepets.pl -d www.purrepets.pl
```

## 8. Firewall / Oracle Security List

W konsoli Oracle Cloud otwórz ingress tylko dla TCP 80 i 443. Na serwerze:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

**Nie otwieraj portu 4000** — backend ma być osiągalny tylko przez Nginx (`127.0.0.1:4000`).

## Opis działania

### Autoryzacja

- `POST /api/auth/register` — tworzy konto (hasło: bcrypt, koszt 12) i wysyła 6-cyfrowy kod OTP.
  Bez skonfigurowanego SMTP kod trafia do logów serwera (`pm2 logs`) i — poza produkcją —
  do odpowiedzi API (`dev_otp`). Po dodaniu SMTP w `.env` kody lecą mailem (nodemailer).
- `POST /api/auth/verify-otp` — weryfikuje kod, zwraca `{ access_token, user }`.
- `POST /api/auth/login` — zwraca `{ access_token, user }` (JWT HS256, domyślnie 7 dni).
- `GET /api/auth/me` — dane zalogowanego (`Authorization: Bearer <token>`).
- `POST /api/auth/logout` — JWT jest bezstanowy; klient usuwa token po swojej stronie.
- `GET /api/auth/login-info` — shim kompatybilności dla `loadSignInOptions()` we frontendzie.

### Encje (REST, prefiks `/api/entities`)

Encje: `Profile, Listing, Pet, Post, Comment, Like, Follow, Conversation, Message, Wallet, Redemption, GameScore`.

| Operacja | Endpoint | Odpowiedź |
| --- | --- | --- |
| list | `GET /api/entities/:entity/list?sort=&limit=&offset=` | `{ items: [...] }` |
| filter | `POST /api/entities/:entity/query` `{ where, sort, limit, offset }` | `{ items: [...] }` |
| count | `POST /api/entities/:entity/count` `{ where }` | liczba |
| get | `GET /api/entities/:entity/:id` | obiekt |
| create | `POST /api/entities/:entity` | obiekt (201) |
| update | `PATCH /api/entities/:entity/:id` | obiekt |
| delete | `DELETE /api/entities/:entity/:id` | `{ success: true }` |

- Filtry obsługują operatory: `=`, `$in`, `$nin`, `$regex`, `$ne`, `$gt/$gte/$lt/$lte`, `$or`.
  Dla pól tablicowych (`members`, `tags`, `image_urls`, …) równość oznacza „tablica zawiera wartość”.
- Sortowanie: `-created_date`, `price`, `-price`, `-followers`, `-score`, `-last_message_at`.
- Zasady dostępu:
  - odczyt publiczny: `Profile, Pet, Comment, Like, Follow, GameScore`;
  - `Post` — publicznie tylko `published` (+ własne wpisy i admin);
  - `Listing` — publicznie `active`/`sold` (+ własne i admin);
  - `Conversation`, `Message` — tylko członkowie rozmowy;
  - `Wallet`, `Redemption` — tylko właściciel;
  - zapis: właściciel (`created_by_id`) lub admin; `Wallet`, `Redemption`, `GameScore` tworzone
    wyłącznie przez dedykowane endpointy;
  - pola `Profile.followers` i `Profile.verified` aktualizuje tylko admin.
- Skutki uboczne: `Like` ±1 do `Post.likes`, `Comment` +1 do `Post.comment_count`,
  `Follow` ±1 do `Profile.followers`.

### Endpointy dedykowane

| Endpoint | Zastępuje |
| --- | --- |
| `POST /api/games/submit` | `submitScore` (limity wyników, bonus dzienny, monety/XP, push portfela) |
| `POST /api/rewards/redeem` | `redeemReward` (wykup nagród za coiny) |
| `POST /api/listings/with-cost` | `createListing` (tylko hodowca, pierwsze darmowe, potem 20 coinów) |
| `POST /api/listings/:id/moderate` | `moderateListing` (moderacja ryzyka — reguły lub opcjonalny LLM) |
| `POST /api/assistant/ask` | `askAssistant` (asystent — reguły lub opcjonalny LLM) |

### Upload plików

`POST /api/uploads` (multipart, pole `file`) → `{ file_url }`.
Pliki trafiają do `UPLOAD_DIR` i są serwowane pod `/uploads/...` (Nginx + fallback API z Range/206).

### Realtime (Socket.IO)

- Handshake: `io(API_URL, { auth: { token: "<JWT>" } })`.
- Klient wysyła `subscribe { room }` albo `subscribe { entity: "Message" | "Wallet" }`;
  dozwolone pokoje: `user:<swój id>` (portfel) oraz `conversation:<id>` (tylko członkowie).
- Serwer emituje `entity:event` o strukturze `{ type: "create" | "update" | "delete", data }`.

### Błędy

Spójny format: `{ "error": { "message": "...", "code": "...", "details": ... } }`
z odpowiednim statusem HTTP (400/401/403/404/409/429/500).

## Uwagi

- **MFA**: frontend ma ścieżki MFA (TOTP/SMS), ale ten backend ich nie włącza — logowanie
  zawsze zwraca `access_token`, więc ścieżka MFA w UI pozostaje nieaktywna (kompatybilne zachowanie).
- **Logowanie Google**: wymaga konfiguracji OAuth po stronie serwera; shim `login-info`
  zgłasza brak providerów, a klient kieruje użytkowników na `/login`.
- **Skalowanie Socket.IO**: przy więcej niż jednym procesie potrzebny adapter Redis
  (obecnie `instances: 1` w ecosystem.config.cjs).
