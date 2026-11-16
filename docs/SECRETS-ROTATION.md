# Rotacja sekretów — checklist (po wycieku w historii git)

> Historia repozytorium (poprzednie repozytoria i gałęzie) zawiała sekrety. Usunięcie plików
> NIE usuwa ich z historii — **rotacja jest obowiązkowa**. Ten dokument nie zawiera wartości.

## Ujawnione rodzaje danych

1. **PostgreSQL** — \`DATABASE_URL\` (host, użytkownik, hasło) w \`.env\` i \`ecosystem.config.cjs\`.
2. **JWT_SECRET** — w \`ecosystem.config.cjs\` (pozwala podpisywać tokeny dowolnego użytkownika).
3. **Stripe** — \`STRIPE_SECRET_KEY\` (\`sk_test_…\`) i \`STRIPE_WEBHOOK_SECRET\` w \`.env\`.
4. **Adres e-mail administratora** — w skryptach i konfiguracji (dane osobowe; nie jest sekretem, ale warto ograniczyć ekspozycję).
5. **SMTP** — jeśli \`.env\` z danymi SMTP trafił do historii: host/użytkownik/hasło poczty.

## Kroki rotacji (na serwerze)

```bash
# 1) PostgreSQL — nowe hasło:
sudo -u postgres psql -c "ALTER USER purre WITH PASSWORD '<NOWE_HASLO>';"
#    → zaktualizuj DATABASE_URL w backend/.env

# 2) JWT — nowy sekret (uwaga: wyloguje wszystkich):
openssl rand -hex 48   # → JWT_SECRET w backend/.env

# 3) Stripe (dashboard → Developers → API keys → Roll secret key; Webhooks → nowy signing secret):
#    → STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET w backend/.env
#    Uwaga: klucz w historii był TESTOWY (sk_test_) — rotacja testowego obowiązkowa,
#    produkcyjnego (sk_live_) nigdy nie umieszczano w repo (zweryfikować!).

# 4) SMTP — jeśli dane były w historii: nowe hasło konta pocztowego → SMTP_PASS w backend/.env

# 5) Restart backendu z nowym env (bez restartu frontendu):
pm2 restart purrepets-backend --update-env
```

## Weryfikacja po rotacji

- \`curl -s http://127.0.0.1:4000/api/health\` → \`"ok":true\`
- Logowanie w aplikacji działa, webhook Stripe przechodzi (Stripe → Webhooks → ostatnie delivery 200).
- Stare sekrety unieważnione (Stara baza: stare hasło odrzucone; Stripe: stary klucz unieważniony).

## Opcjonalne czyszczenie historii

Jeśli repo jest publiczne i zależy Ci na usunięciu sekretów z historii:
\`git filter-repo --replace-text\` (przepisz sekrety na \`***REMOVED***\`) + force-push, LUB najprościej:
zachowaj kod jako nową historię (squash do jednego commita). Po każdym wariancie — rotacja i tak obowiązkowa.
