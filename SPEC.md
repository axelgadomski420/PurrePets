# PURRE PETS — specyfikacja aplikacji (stan wdrożony w kodzie)

PURRE PETS to samodzielna, samohostowana platforma (PWA) dla hodowców psów i kotów oraz osób
szukających zwierzaka: marketplace, profile hodowli, społeczność, krótkie wideo (Reels),
relacje (Stories), czat z E2E i rozmowami, gry, płatności Stripe i AI (Ollama).

> Ten dokument opisuje **faktycznie zaimplementowane** moduły (źródło: kod w tym repozytorium).
> Rzeczy zaplanowane, a niegotowe, są jawnie oznaczone „PLAN”.

## Stack

- **Frontend:** React 19 + TanStack Start (SSR) + Nitro v3 (Node 22), Tailwind + shadcn/ui, TanStack Query, Socket.IO client. Build: \`npm run build\` → \`.output/\`.
- **Backend:** Express + PostgreSQL + Prisma + Socket.IO + JWT (\`backend/\`, port 4000).
- **AI:** Ollama (model domyślny \`qwen2.5:3b\`) przez \`/api/ai/*\`; OCR dokumentów hodowcy (Tesseract pol+eng) po stronie analizy weryfikacji.
- **Płatności:** Stripe (Checkout + webhook, PLN; grosze).
- **Infra:** Oracle Ubuntu 24.04 ARM64, PM2 (\`purrepets-frontend\` 127.0.0.1:3000, \`purrepets-backend\` 127.0.0.1:4000), Nginx (purrepets.pl), uploady \`/var/www/purrepets/uploads\`.

## 1. Konta i uwierzytelnianie
- Rejestracja e-mail+hasło z weryfikacją OTP (\`otp_codes\`, hash kodu, wygaśnięcie), logowanie hasłem, reset hasła przez e-mail (SMTP).
- JWT (Bearer), token w localStorage (\`purre_access_token\` + kompatybilne klucze historyczne).
- MFA: przepływ MFA przy logowaniu (\`MfaFlow\`, \`MfaPage\`, \`MfaManage\` — metody, weryfikacja, zarządzanie).
- Role: user / moderator / admin (\`ADMIN_EMAILS\`; nadawanie wyłącznie przez \`seed-admin.js\` / panel admina).
- Ban użytkownika (\`users.banned\`).
- Uprawnienia niezalogowanych: tylko ogłoszenia i Reels (publiczne trasy); reszta pod \`_authed\`.

## 2. Onboarding
- Rola konta (hodowca/entuzjasta), język (PL + EN/DE/ES/FR/IT/UK), motyw (PURRE AURA, LIGHT, MIDNIGHT, FOREST, ROYAL, SUNSET, MONO, HIGH CONTRAST), gatunki/rasy, region.

## 3. Profile
- Profil użytkownika: avatar, cover, bio, socials (WWW/Instagram/TikTok), galeria (max 12), licznik postów, galeria publikacji.
- Profil hodowcy: weryfikacja, badge „Zweryfikowany hodowca”, odznaki.
- Profil zwierzaka (\`/pets/$id\`): wizytówka — zdjęcie główne, galeria, dane, rodowód, link do właściciela; prywatność E8 (mikroczip nigdy publicznie).

## 4. Konta zwierząt (moduł E)
- Karta (E1): edycja pełnych danych (data adopcji, płeć, chip, rodowód, pochodzenie, rodzice, rodzeństwo, temperament, potrzeby specjalne), status (active/deceased/rehomed/memorial), publiczny/prywatny.
- Zdrowie (E2): książeczka zdrowia (szczepienia, odrobaczanie, badania, leczenia…), załączniki; wpisy tylko właściciel/opiekun.
- Kalendarz (E3): wydarzenia z powtórzeniami i przypomnieniami (\`remind_days_before\`), lista nadchodzących.
- Waga (E5): pomiary + wykres. Osiągnięcia (E6): własne i oficjalne (\`official\` tylko po potwierdzeniu przez moderatora). Opiekunowie (E9): współwłaściciele/opiekunowie z zaproszeniami.

## 5. Weryfikacja hodowcy
- Wniosek z dokumentem (prywatny upload poza publicznym \`/uploads\`, odczyt tylko właściciel/admin przez \`/api/uploads/private\`).
- Analiza AI: risk score + rekomendacja (\`ai_recommendation/score/reasoning\`), decyzja człowieka (admin), retencja dokumentów 30 dni (PLAN: automatyczne czyszczenie).

## 6. Marketplace
- Ogłoszenia (sprzedaż/adopcja), min. 6 zdjęć, wideo, koszt w Coins, filtry (gatunek, rasa, miasto, cena), odległość Haversine, wyróżnianie (\`boosted_until\`), moderacja (statusy active/review/sold/archived + risk score), panel admina.

## 7. HoloFeed / Reels / Stories
- Reels: full-screen 9:16, swipe, autoplay, double-tap like, komentarze,_SHARE_, pasek postępu, buffering; biblioteka audio (\`reel_audios\` + iTunes 30 s preview).
- Stories: 24 h, wyświetlenia (\`viewers\`), reakcje, kompozytor premium (filtry Instagram-style, nakładka tekstowa, muzyka) — filtry z \`purre-studio\`.
- Reklamy wplecione w feed (AdSense, co 5–7 postów; PREMIUM ukrywa).

## 8. Studio (purre-studio)
- Zdjęcia: \`PhotoStudioEditor\` — filtry, kadrowanie, nakładki, eksport (\`exportStudioImage\`, \`STUDIO_FILTERS\`).
- Wideo: \`/video-editor\` — trim, przyspieszenie, filtry, audio z eksportu (AudioContext/WebM), okładka, publikacja jako Reel/Relacja.
- PLAN (niekompletne vs spec. oryginalna): split/merge klipów, reverse, napisy AI (Whisper), voiceover, naklejki, mikser dźwięku.

## 9. Messenger (Meta-style)
- Rozmowy 1:1, wyszukiwanie ludzi (serwerowe, debounce), historia z paginacją (\`before\`), search w treści (\`q\`), wskaźnik „pisze…” (Socket.IO), dostarczono/przeczytano, reakcje, usuwanie wiadomości, media (zdjęcia/wideo).
- E2E: ECDH P-256 + AES-GCM (WebCrypto), klucze publiczne w \`e2e_keys\`, pola ciphertext/iv/e2e.
- Rozmowy głosowe/wideo: WebRTC (STUN), sygnalizacja Socket.IO (call:invite/answer/ice/reject/end z weryfikacją członkostwa), \`CallOverlay\` (mute/kamera, czas, log rozmowy w czacie).

## 10. Społeczność
- Posty (zdjęcia/wiele zdjęć/wideo), komentarze, polubienia, obserwowanie, tagi, hashtagi.
- Grupy FB-style (typy: rasowe/regionalne/tematyczne, okładka, zasady, role członków, posty w grupach).
- Wydarzenia z biletami za Coins, lokalizacja (lat/lng), mapa.
- Globalna wyszukiwarka (ludzie, posty, ogłoszenia, zwierzaki, wydarzenia, hashtagi) + suggest/autocomplete.

## 11. Powiadomienia
- \`notifications\` (like/comment/follow/message/system/verification/group/moderation), realtime przez Socket.IO (\`NotificationBell\` w TopBar i BottomNav).

## 12. Gry (Arcade)
- 2048, Bubble, Flappy, Match-3, Memory, Quiz, Reaction, Slide, Snake, Whack, Wordle + szkielet \`GameShell\`/\`useGameSubmit\`; wyniki w \`game_scores\`, nagrody w Coins, reklamy w Arcade.

## 13. Monety i płatności
- Wallet (coins/xp/level/badges/boost), codzienne zadania, sklep nagród (redemptions).
- Stripe Coins: 1000 = 9,99 zł, 5000 = 39,99 zł; Checkout + webhook z idempotencją (\`stripe_webhook_events\`, retry 500) + fallback GET \`/api/stripe/confirm\`; księgowanie po powrocie z Checkout.
- Purre Pets PRO: subskrypcja PLN (miesięczna), \`subscriptions\`, \`is_premium\`, bez reklam, kompozytor Stories premium, badge PRO.

## 14. Panel admina i moderacja
- Przegląd (overview), moderacja ogłoszeń/postów/komentarzy, weryfikacja hodowców (z podglądem dokumentu), użytkownicy (role, ban), zgłoszenia (reports: open/resolved/dismissed). Dostęp: role admin/moderator z \`ADMIN_EMAILS\`.

## 15. AI
- Asystent (panel w AppShell): czat przez \`/api/ai/chat\` (Ollama \`qwen2.5:3b\`), wymaga logowania, rate limit 20/5 min, kontekst własnego zwierzaka za zgodą, prompty z zakazami dawek/rodowodów.
- Sprawdzanie dokumentów (\`/api/ai/check-document\`), analiza weryfikacji hodowcy, health endpoint \`/api/ai/health\`.

## 16. Bezpieczeństwo i RODO
- Baner zgody cookies (\`RodoBanner\`), polityka prywatności i regulamin (PRO PLN, E2E, retencja, prawa użytkownika), eksport danych i usunięcie konta (PLAN: endpointy RODO — patrz sekcja „Luki”).
- Uploady: limity per typ, Range/206, prywatne dokumenty poza publicznym katalogiem, Nginx rate limit.
- Sekrety wyłącznie w \`backend/.env\`; rotacja po wycieku w historii — patrz \`docs/SECRETS-ROTATION.md\`.

## 17. Mobile-first / PWA
- Manifest PWA + ikona, robots.txt, Open Graph; BottomNav na mobile, SideNav na desktopie; dolna nawigacja i full-screen media pod mobile-first.
- PLAN: pełny audyt mobile-first wszystkich tras (docelowo każdy moduł projektowany od widoku 360 px).

## 18. Znane luki / PLAN (uczciwie)
- Eksport danych RODO i usunięcie konta: brak dedykowanych endpointów.
- Retencja dokumentów weryfikacji (30 dni): brak automatycznego czyszczenia.
- Whisper (napisy AI), split/merge/reverse w edytorze wideo: PLAN.
- Zapisane wyszukiwania, paywall PRO/ULTIMATE, 2FA TOTP (z gałęzi \`feature/purre-pets\`): koncepcje.
- Duplikat \`AssistantPanel\` (common/ vs assistant/) do konsolidacji.
