#!/usr/bin/env bash
# PURRE PETS — bezpieczne wdrożenie produkcyjne (Oracle Ubuntu 24.04, ARM64, PM2 + Nginx).
# Frontend: TanStack Start SSR na Nitro → node .output/server/index.mjs (127.0.0.1:3000)
# Backend:  Express + Prisma + Socket.IO → backend/src/server.js (127.0.0.1:4000)
#
# Gwarancje:
#  - nie wykonuje git reset --hard ani git clean; przerywa przy JAKIEJKOLWIEK lokalnej zmianie
#    (także untracked — git status --short), nigdy ich nie nadpisuje,
#  - zależności WYŁĄCZNIE przez npm ci (npm install na produkcji zabroniony),
#  - BEZPIECZNIK GLOBALNY: od momentu utworzenia backupów EXIT-trap uruchamia rollback przy
#    KAŻDEJ awarii (build, Nginx, PM2, health check, smoke-test). Rollback jest odporny na
#    wielokrotne wywołanie i rekurencję, a oryginalny kod błędu jest zachowany (nie maskowany),
#  - NIE zatrzymuje ani nie usuwa obcych procesów PM2 (np. tikbengos) — preflight tylko WYPISUJE
#    nazwy/ID/skrypty/porty; automatycznie obsługiwany jest wyłącznie jednoznacznie
#    zidentyfikowany historyczny proces PURRE PETS (nazwa + skrypt/cwd w katalogu aplikacji),
#  - NIE wykonuje destrukcyjnych operacji na bazie (prisma generate tylko; migracje ręcznie),
#    nie dotyka Dockera, kontenerów, wolumenów ani danych,
#  - usuwa wyłącznie pliki utworzone przez ten skrypt (rotacja .output.bak-*; keep 3).
#
# Uruchomienie:  bash scripts/deploy.sh
# Opcjonalnie:   DEPLOY_BRANCH=main DEPLOY_NGINX=1 bash scripts/deploy.sh
set -euo pipefail

APP_DIR="/home/ubuntu/Base44"
BACKEND="$APP_DIR/backend"
BRANCH="${DEPLOY_BRANCH:-$(git rev-parse --abbrev-ref HEAD)}"
FRONT_URL="${FRONT_URL:-http://127.0.0.1:3000}"
API_HEALTH="${API_HEALTH:-http://127.0.0.1:4000/api/health}"
NGINX_DEST="/etc/nginx/sites-available/purrepets"
NGINX_ENABLED="/etc/nginx/sites-enabled/purrepets"

log() { echo "==> $*"; }
die() { echo "❌ $*" >&2; exit 1; }

# --- STAN ROLLBACKU ---------------------------------------------------------
SUCCESS=0            # ustawiane 1 wyłącznie przed finalnym exit 0
ROLLBACK_STARTED=0   # zabezpieczenie przed wielokrotnym wywołaniem / rekurencją
ARMED=0              # trap uzbrojony po utworzeniu backupów
ECO_BAK=""
NGINX_BAK=""
NGINX_INSTALLED=0
NGINX_LINK_EXISTED=0
NGINX_PREV_TARGET=""
LEGACY_APP=""

rollback() {
  local rc="${1:-1}"
  [ "$ROLLBACK_STARTED" = "1" ] && return 0
  ROLLBACK_STARTED=1
  set +e
  log "❌ ROLLBACK (pierwotny kod błędu: $rc) — przywracanie poprzedniego stanu"
  # 1) Tylko nasze procesy PM2 (nazwy jawne; nigdy pm2 delete all).
  pm2 delete purrepets-frontend >/dev/null 2>&1 || true
  pm2 delete purrepets-backend  >/dev/null 2>&1 || true
  # 2) Poprzednia wersja aplikacji.
  local latest_bak
  latest_bak="$(ls -1dt "$APP_DIR"/.output.bak-* 2>/dev/null | head -1 || true)"
  if [ -n "$latest_bak" ]; then
    rm -rf "$APP_DIR/.output"
    cp -a "$latest_bak" "$APP_DIR/.output" || true
    log "  przywrócono .output z $latest_bak"
  else
    log "  ⚠️ brak backupu .output do przywrócenia"
  fi
  # 3) Poprzednia konfiguracja PM2.
  if [ -n "$ECO_BAK" ] && [ -f "$ECO_BAK" ]; then
    cp -a "$ECO_BAK" "$APP_DIR/ecosystem.config.cjs" || true
    log "  przywrócono ecosystem.config.cjs z $ECO_BAK"
  fi
  # 4) Nginx: plik vhost + symlink + nginx -t PRZED reloadem.
  if [ "$NGINX_INSTALLED" = "1" ]; then
    if [ -n "$NGINX_BAK" ] && [ -f "$NGINX_BAK" ]; then
      sudo cp "$NGINX_BAK" "$NGINX_DEST" || true
      log "  przywrócono plik vhost z $NGINX_BAK"
    fi
    if [ "$NGINX_LINK_EXISTED" = "1" ] && [ -n "$NGINX_PREV_TARGET" ]; then
      sudo ln -sfn "$NGINX_PREV_TARGET" "$NGINX_ENABLED" || true
      log "  przywrócono symlink → $NGINX_PREV_TARGET"
    else
      sudo rm -f "$NGINX_ENABLED" || true
      log "  usunięto symlink (przed wdrożeniem nie istniał)"
    fi
    if sudo nginx -t; then
      sudo systemctl reload nginx || true
      log "  nginx -t OK — reload wykonany"
    else
      log "  ⚠️ nginx -t NIE przeszedł po przywróceniu — RELOAD POMINIĘTY; napraw ręcznie"
    fi
  fi
  # 5) Historyczny proces PURRE PETS wraca do pracy.
  if [ -n "$LEGACY_APP" ]; then
    pm2 restart "$LEGACY_APP" >/dev/null 2>&1 || true
    log "  wznowiono historyczny proces PM2: $LEGACY_APP"
  fi
  pm2 startOrReload "$APP_DIR/ecosystem.config.cjs" --update-env >/dev/null 2>&1 || true
  pm2 save >/dev/null 2>&1 || true
  log "Stan przywrócony. Diagnostyka:"
  pm2 logs purrepets-frontend --lines 30 --nostream || true
  pm2 logs purrepets-backend  --lines 30 --nostream || true
}

# Globalny bezpiecznik: uzbrojony PO utworzeniu backupów. Łapie każdy niezerowy exit
# (set -e, die, nieudany test) i uruchamia rollback, zachowując pierwotny kod błędu.
on_exit() {
  local rc=$?
  if [ "$SUCCESS" = "1" ] || [ "$ROLLBACK_STARTED" = "1" ]; then exit "$rc"; fi
  rollback "$rc"
  exit "$rc"
}

command -v node >/dev/null 2>&1 || die "Node.js nie jest zainstalowany"
command -v pm2  >/dev/null 2>&1 || die "PM2 nie jest zainstalowany (npm i -g pm2)"
log "Node $(node -v), npm $(npm -v)"

cd "$APP_DIR"

log "[1/12] Czystość repozytorium (również pliki untracked)"
dirty="$(git status --short || true)"
if [ -n "$dirty" ]; then
  echo "$dirty"
  die "Repozytorium ma lokalne zmiany (także untracked). Zapisz je (commit / git stash / przenieś) — skrypt nigdy ich nie nadpisze."
fi

log "[2/12] Synchronizacja repozytorium (gałąź: $BRANCH)"
git fetch origin
git rev-parse --verify "$BRANCH" >/dev/null 2>&1 || git checkout -b "$BRANCH" "origin/$BRANCH"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"
dirty="$(git status --short || true)"
[ -z "$dirty" ] || { echo "$dirty"; die "Po pull nadal są lokalne zmiany — przerwanie."; }
mkdir -p "$APP_DIR/logs"

log "[3/12] backend/.env — kontrola"
[ -f "$BACKEND/.env" ] || die "Brak $BACKEND/.env. Skopiuj backend/.env.example i ustaw wartości (sekrety po rotacji!)."

log "[4/12] Zależności — wyłącznie npm ci (npm install na produkcji zabroniony)"
if ! npm ci; then
  die "npm ci (frontend) nie powiódł się — package-lock.json poza syncem z package.json.
      Zregeneruj lockfile w CI (job \"lockfile\") lub lokalnie: npm install --package-lock-only,
      zacommituj package-lock.json i spróbuj ponownie. NIE używaj --force ani --legacy-peer-deps."
fi
if ! ( cd "$BACKEND" && npm ci ); then
  die "npm ci (backend) nie powiódł się — sprawdź backend/package-lock.json."
fi

log "[5/12] Prisma: generowanie klienta (BEZ migracji i bez db push)"
( cd "$BACKEND" && npx prisma generate )
log "    Migracje schematu uruchamiaj świadomie i ręcznie:"
log "      cd backend && npx prisma migrate deploy"

log "[6/12] Backup poprzedniego stanu (.output + ecosystem.config.cjs) — od tego momentu uzbrojony rollback"
STAMP="$(date +%Y%m%d-%H%M%S)"
if [ -d "$APP_DIR/.output" ]; then
  cp -a "$APP_DIR/.output" "$APP_DIR/.output.bak-$STAMP"
  log "    zapisano: .output.bak-$STAMP"
fi
if [ -f "$APP_DIR/ecosystem.config.cjs" ]; then
  ECO_BAK="$APP_DIR/ecosystem.config.bak-$STAMP"
  cp -a "$APP_DIR/ecosystem.config.cjs" "$ECO_BAK"
  log "    zapisano: $(basename "$ECO_BAK")"
fi
ARMED=1
trap on_exit EXIT

log "[7/12] Build produkcyjny (Vite + Nitro)"
npm run build
[ -f "$APP_DIR/.output/server/index.mjs" ] || die "Build nie wygenerował .output/server/index.mjs"
log "    .output/server/index.mjs OK"

log "[8/12] Smoke-test artefaktów (przed przełączeniem PM2)"
SMOKE_ALLOW_OFFLINE=1 node scripts/smoke-test.mjs || die "Smoke-test artefaktów nie przeszedł (PM2 nietknięty, ale rollback i tak przywróci stan)"

# --- Nginx (opcjonalnie: DEPLOY_NGINX=1) ------------------------------------
if [ "${DEPLOY_NGINX:-0}" = "1" ]; then
  log "[8b/12] Nginx: preflight (certyfikaty, duplikaty vhostów, UPLOAD_DIR)"
  problems=""
  for f in \
    /etc/letsencrypt/live/purrepets.pl/fullchain.pem \
    /etc/letsencrypt/live/purrepets.pl/privkey.pem \
    /etc/letsencrypt/options-ssl-nginx.conf \
    /etc/letsencrypt/ssl-dhparams.pem; do
    [ -f "$f" ] || problems="${problems}brak pliku: $f; "
  done
  dup_files="$(grep -rlE 'server_name[^;]*purrepets\.pl' /etc/nginx/sites-enabled/ /etc/nginx/conf.d/ 2>/dev/null || true)"
  dup_count="$(echo "$dup_files" | grep -c . || true)"
  if [ "$dup_count" -gt 1 ]; then
    echo "$dup_files"
    problems="${problems}server_name purrepets.pl w kilku aktywnych vhostach (powyżej) — usuń duplikaty ręcznie (z backupem); "
  fi
  # UPLOAD_DIR: bez domyślnych założeń — musi wynikać wprost z backend/.env.
  raw_up="$(grep -E '^UPLOAD_DIR=' "$BACKEND/.env" | head -1 | cut -d= -f2- || true)"
  up_dir="$(printf '%s' "$raw_up" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/^"//' -e 's/"$//')"
  up_dir="$(printf '%s' "$up_dir" | sed -e "s/^'//" -e "s/'$//")"
  if [ -z "$up_dir" ]; then
    die "UPLOAD_DIR nie jest ustawiony w backend/.env — nie da się jednoznacznie potwierdzić ścieżki uploadów. Ustaw go jawnie i powtórz (nic nie zmieniono)."
  fi
  [ -d "$up_dir" ] || problems="${problems}katalog uploadów $up_dir nie istnieje na serwerze; "
  grep -q "alias ${up_dir}/" "$BACKEND/nginx/purrepets.conf" \
    || problems="${problems}UPLOAD_DIR ($up_dir) niezgodny z aliasem w backend/nginx/purrepets.conf; "
  [ -z "$problems" ] || die "Preflight Nginx nie przeszedł: $problems"

  log "    instalacja (z backupem pliku i stanu symlinka) + nginx -t + reload"
  NGINX_PREV_TARGET="$(readlink "$NGINX_ENABLED" 2>/dev/null || true)"
  if [ -e "$NGINX_ENABLED" ] || [ -L "$NGINX_ENABLED" ]; then NGINX_LINK_EXISTED=1; fi
  NGINX_BAK="$APP_DIR/nginx.bak-$STAMP"
  sudo cp "$NGINX_DEST" "$NGINX_BAK" 2>/dev/null || NGINX_BAK=""
  sudo cp "$BACKEND/nginx/purrepets.conf" "$NGINX_DEST"
  sudo ln -sfn "$NGINX_DEST" "$NGINX_ENABLED"
  if ! sudo nginx -t; then
    die "nginx -t nie przeszedł — rollback przywróci poprzedni plik i symlink"
  fi
  sudo systemctl reload nginx
  NGINX_INSTALLED=1
fi

log "[9/12] PM2: preflight procesów (tylko wypisanie — nic nie usuwamy na ślepo)"
# Raport: nazwa, ID, skrypt, cwd, PORT wszystkich procesów PM2.
pm2 jlist 2>/dev/null | node -e '
let d="";process.stdin.on("data",(c)=>d+=c).on("end",()=>{
  const fs=require("fs");
  let apps=[];
  try{apps=JSON.parse(d);}catch(e){}
  const ours=new Set(["purrepets-frontend","purrepets-backend"]);
  const appDir=process.argv[1]||"";
  const lines=[];
  const legacy=[];
  for(const a of apps){
    const name=a.name||"";
    const env=(a.pm2_env&&a.pm2_env.env)||a.env||{};
    const row={
      name,
      id:(a.pm_id!==undefined?a.pm_id:(a.pm2_env&&a.pm2_env.pm_id)),
      port:(env.PORT!==undefined?env.PORT:"-"),
      cwd:(a.pm2_env&&(a.pm2_env.pm_cwd||a.pm2_env.cwd))||"",
      script:(a.pm2_env&&(a.pm2_env.pm_exec_path||a.pm2_env.script))||"",
    };
    lines.push("  ["+row.id+"] "+row.name+" | PORT="+row.port+" | cwd="+row.cwd+" | "+row.script);
    // Legacy PURRE PETS: nazwa zaczyna się od purrepet, to NIE nasz proces, a skrypt/cwd
    // jednoznacznie wskazują na katalog aplikacji — tylko taki proces obsługujemy automatycznie.
    if(!ours.has(name)&&/^purrepet/i.test(name)&&(row.cwd===appDir||row.script.indexOf(appDir)!==-1)){
      legacy.push(name);
    }
  }
  try{fs.writeFileSync(appDir+"/logs/pm2-preflight.txt",lines.join("\n")+"\n");}catch(e){}
  process.stderr.write(lines.join("\n")+"\n");
  process.stdout.write(legacy.join(","));
});' "$APP_DIR" || true
LEGACY_APP="$(pm2 jlist 2>/dev/null | node -e '
let d="";process.stdin.on("data",(c)=>d+=c).on("end",()=>{
  let apps=[];try{apps=JSON.parse(d);}catch(e){}
  const ours=new Set(["purrepets-frontend","purrepets-backend"]);
  const appDir=process.argv[1]||"";
  const legacy=[];
  for(const a of apps){
    const name=a.name||"";
    const cwd=(a.pm2_env&&(a.pm2_env.pm_cwd||a.pm2_env.cwd))||"";
    const script=(a.pm2_env&&(a.pm2_env.pm_exec_path||a.pm2_env.script))||"";
    if(!ours.has(name)&&/^purrepet/i.test(name)&&(cwd===appDir||script.indexOf(appDir)!==-1))legacy.push(name);
  }
  process.stdout.write(legacy.join(","));
});' "$APP_DIR")"
if [ -n "$LEGACY_APP" ]; then
  log "    jednoznacznie zidentyfikowany historyczny proces PURRE PETS: $LEGACY_APP — zatrzymuję"
  IFS=',' read -ra LEGACY_LIST <<< "$LEGACY_APP"
  for la in "${LEGACY_LIST[@]}"; do pm2 stop "$la" || true; done
  unset IFS
fi
# Kolizje portów z obcymi procesami — przerwanie zamiast walki o port.
port_busy() { ss -ltn 2>/dev/null | awk '{print $4}' | grep -qE ":$1$"; }
for p in 3000 4000; do
  if port_busy "$p" && [ -z "$LEGACY_APP" ]; then
    if ! pm2 jlist 2>/dev/null | grep -q '"name":"purrepets'; then
      ss -ltnp 2>/dev/null | grep -E ":$p\s" || true
      die "Port $p jest zajęty przez proces, którego nie zidentyfikowałem jako historyczny PURRE PETS (raport: logs/pm2-preflight.txt). Rozwiąż kolizję ręcznie — nic nie zatrzymuję automatycznie."
    fi
  fi
done
log "    startOrReload (tylko purrepets-frontend / purrepets-backend)"
pm2 startOrReload "$APP_DIR/ecosystem.config.cjs" --update-env
pm2 save

log "[10/12] Health checki (realne odpowiedzi HTTP)"
sleep 3
front_ok=0; api_ok=0
for _ in 1 2 3 4 5 6; do
  code="$(curl -s -o /dev/null -w "%{http_code}" "$FRONT_URL/" || true)"
  [ "$code" = "200" ] && { front_ok=1; break; }
  sleep 2
done
for _ in 1 2 3 4 5 6; do
  body="$(curl -s "$API_HEALTH" || true)"
  echo "$body" | grep -q '"ok":true' && { api_ok=1; break; }
  sleep 2
done
log "    frontend $FRONT_URL → ok=$front_ok, backend $API_HEALTH → ok=$api_ok"
[ "$front_ok" = "1" ] && [ "$api_ok" = "1" ] || die "Health check nie przeszedł — rollback"

log "[11/12] Pełny smoke-test HTTP (SSR /, routing /login, statyki /robots.txt, /api/health)"
node scripts/smoke-test.mjs || die "Smoke-test HTTP nie przeszedł — rollback"

log "[12/12] Sukces: usunięcie zatrzymanego procesu legacy + rotacja backupów"
if [ -n "$LEGACY_APP" ]; then
  IFS=',' read -ra LEGACY_LIST <<< "$LEGACY_APP"
  for la in "${LEGACY_LIST[@]}"; do pm2 delete "$la" || true; done
  unset IFS
  pm2 save
  log "    usunięto historyczny proces PURRE PETS: $LEGACY_APP (port zwolniony trwale)"
fi
ls -1dt "$APP_DIR"/.output.bak-* 2>/dev/null | tail -n +4 | xargs -r rm -rf
SUCCESS=1
log "✅ Wdrożenie zakończone. Logi: pm2 logs purrepets-frontend purrepets-backend --lines 100 --nostream"
exit 0
