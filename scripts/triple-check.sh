#!/usr/bin/env bash
# PURRE PETS — Triple-Check (Moduł 6). Użycie: bash scripts/triple-check.sh [JWT_TOKEN]
set -uo pipefail

PASS=0; FAIL=0
ok()   { echo "  ✅ $1"; PASS=$((PASS+1)); }
bad()  { echo "  ❌ $1"; FAIL=$((FAIL+1)); }

echo "── TEST 1: Infrastruktura ─────────────────────────────"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -I https://purrepets.pl || true)
if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "301" ] || [ "$HTTP_CODE" = "302" ]; then ok "https://purrepets.pl → $HTTP_CODE"; else bad "https://purrepets.pl → $HTTP_CODE (oczekiwano 200/301/302, nie 502)"; fi

HEALTH=$(curl -s http://127.0.0.1:4000/api/health || true)
if echo "$HEALTH" | grep -q '"ok":true'; then ok "backend /api/health OK"; else bad "backend /api/health: $HEALTH"; fi

FRONT_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/ || true)
if [ "$FRONT_CODE" = "200" ]; then ok "frontend 127.0.0.1:3000 → 200"; else bad "frontend 127.0.0.1:3000 → $FRONT_CODE"; fi

echo "── TEST 2: Multimedia i API ───────────────────────────"
TOKEN="${1:-${PURRE_TEST_TOKEN:-}}"
IMG="/tmp/purre-test.png"
printf '\x89PNG\r\n\x1a\n' > "$IMG"; head -c 512 /dev/urandom >> "$IMG"

if [ -n "$TOKEN" ]; then
  UPLOAD=$(curl -s -X POST https://purrepets.pl/api/uploads -H "Authorization: Bearer $TOKEN" -F "file=@$IMG;type=image/png" || true)
  FILE_URL=$(echo "$UPLOAD" | grep -o 'https://[^"]*' | head -1 || true)
  if [ -n "$FILE_URL" ]; then
    FETCH_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$FILE_URL" || true)
    if [ "$FETCH_CODE" = "200" ]; then ok "upload zdjęcia + odczyt OK ($FILE_URL)"; else bad "odczyt pliku → $FETCH_CODE"; fi
    RANGE_CODE=$(curl -s -o /dev/null -w "%{http_code}" -r 0-99 "$FILE_URL" || true)
    if [ "$RANGE_CODE" = "206" ]; then ok "Range request → 206 Partial Content"; else bad "Range request → $RANGE_CODE (oczekiwano 206)"; fi
  else
    bad "upload zdjęcia nie powiódł się: $UPLOAD"
  fi
else
  echo "  ⚠️  Brak tokenu — pomiń test uploadu: bash scripts/triple-check.sh <JWT_TOKEN>"
fi

echo "── TEST 3: Logi produkcyjne ───────────────────────────"
ERRORS=$(pm2 logs purrepets-backend --lines 100 --nostream 2>/dev/null | grep -E "ReferenceError|MODULE_NOT_FOUND|42501| 500 " | grep -v "0 error" || true)
if [ -z "$ERRORS" ]; then ok "brak błędów 500/42501/ReferenceError/MODULE_NOT_FOUND w ostatnich 100 liniach"; else bad "znalezione błędy:"; echo "$ERRORS" | head -10; fi

echo "───────────────────────────────────────────────────────"
echo "WYNIK: $PASS OK, $FAIL FAIL"
[ "$FAIL" = "0" ] && echo "✅ Triple-Check zaliczony — system czysty jak łza." || echo "❌ Popraw błędy powyżej."
exit $FAIL
