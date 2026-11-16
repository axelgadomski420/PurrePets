# PURRE PETS — bezpieczna procedura migracji bazy (produkcja)

> Zasada nadrzędna: **żadnych automatycznych migracji ani `db push` na produkcji.**
> Najpierw porównanie schematu, migracji i istniejącej bazy — dopiero potem świadome uruchomienie.

## 1. Stan migracji w repo (audyt 2026-11-16)

| Migracja | Co robi | Idempotentna (IF NOT EXISTS)? |
| --- | --- | --- |
| `20261113000000_init` | tworzy tabele bazowe (users, profiles, listings, pets, posts, comments, likes, follows, conversations, messages, wallets, redemptions, game_scores, otp_codes) | NIE (CREATE TABLE) — **tylko świeże bazy/CI** |
| `20261114000000_upgrade` | kolumny moderator/premium/messenger/groups + notifications, reel_audios, reports, message_reactions | TAK |
| `20261114120000_e2e_stories_premium` | is_premium, E2E (ciphertext/iv/e2e), e2e_keys, stories, story_reactions | TAK |
| `20261114120000_social_events` | events, event_tickets, groups, group_members, verification_requests, coin_purchases | NIE |
| `20261114160000_subscriptions` | stripe_customer_id + subscriptions | TAK |
| `20261115000000_pet_accounts` | moduł E: karta zwierzaka + 5 tabel pet_* | NIE |
| `20261115120000_profile_story_fields` | socials/galeria profilu, filtry relacji | TAK |
| `20261116000000_stripe_webhook_events` | rejestr idempotencji webhooka Stripe | NIE |

Zgodność schematu (`schema.prisma`, 34 modeli) z migracjami: **pełna** — każdy model ma `@@map`
i odpowiadającą mu tabelę/kolumny w łańcuchu migracji (init + 7 migracji).

## 2. Porównanie z istniejącą bazą (na serwerze, PRZED czegokolwiek)

```bash
# 0) BACKUP — obowiązkowo:
pg_dump -U purre -h 127.0.0.1 -Fc purrepets > ~/purrepets-backup-$(date +%F-%H%M).dump

# 1) Lista tabel i kolumn w bazie:
psql -U purre -d purrepets -c "\dt" 
psql -U purre -d purrepets -c "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name, ordinal_position;"
```

Sprawdź względem listy w sekcji 1:
- które tabele już istnieją i które migracje mają pokrycie → te oznaczysz jako `--applied`,
- których tabel/brakuje → te zostawi dla `migrate deploy`.

## 3. Procedura (produkcja)

```bash
cd /home/ubuntu/PurrePets/backend

# 1) Baza już ma tabele bazowe i zmiany poprzednich migracji (aplikacja działała):
#    oznacz wszystkie migracje, których skutki SĄ w bazie, jako zastosowane:
npx prisma migrate resolve --applied 20261113000000_init
npx prisma migrate resolve --applied 20261114000000_upgrade
npx prisma migrate resolve --applied 20261114120000_e2e_stories_premium
npx prisma migrate resolve --applied 20261114120000_social_events
npx prisma migrate resolve --applied 20261114160000_subscriptions
npx prisma migrate resolve --applied 20261115000000_pet_accounts
npx prisma migrate resolve --applied 20261115120000_profile_story_fields
npx prisma migrate resolve --applied 20261116000000_stripe_webhook_events
# (oznaczaj WYŁĄCZNIE te, których skutki potwierdziłeś zapytaniami z sekcji 2)

# 2) Nowe migracje (dodane później do repo) zastosuje:
npx prisma migrate deploy
```

`migrate resolve` niczego nie zmienia w bazie — tylko wpisuje historię do `_prisma_migrations`.
`migrate deploy` aplikuje wyłącznie niezastosowane migracje, w kolejności chronologicznej.

## 4. Czego NIE robić

- `prisma db push` na produkcji — zabroniony (omija historię migracji, może utracić dane).
- `prisma migrate reset` — kasuje dane.
- Automatyczne uruchamianie migracji w deploy.sh — celowo wyłączone (deploy robi tylko `prisma generate`).
- Uruchamianie `20261113000000_init` na produkcji — tabele już istnieją; migrate deploy i tak
  pominie migrację oznaczoną jako applied.

## 5. Rollback bazy

```bash
# Przywrócenie z backupu (uwaga: nadpisuje dane — tylko przy realnej awarii):
pg_restore -U purre -h 127.0.0.1 -d postgres -c purrepets-backup-<STAMP>.dump
```
Migracje addytywne (kolumny/tabele) nie usuwają danych — rollback kodu nie wymaga rollbacku bazy.
