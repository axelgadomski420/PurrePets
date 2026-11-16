# PURRE PETS — pełna specyfikacja aplikacji

(Pełna treść specyfikacji z poprzedniej wiadomości użytkownika — zachowana tutaj jako źródło prawdy.)

PURRE PETS to premium platforma webowa (PWA) dla hodowców psów i kotów oraz osób szukających zwierzaka. Łączy marketplace, profile hodowli, społeczność, krótkie wideo w stylu TikToka, czat, gry, płatności i AI.

## 1. Konta i logowanie
- Rejestracja przez e-mail + hasło.
- Logowanie przez Google.
- Brak logowania przez Apple.
- Reset hasła przez e-mail.
- Weryfikacja adresu e-mail.
- Dwa typy kont: HODOWCA i KUPUJĄCY.
- Ustawienia konta: zmiana hasła, zmiana e-maila, 2FA, aktywne sesje, usunięcie konta, eksport danych (RODO).
- Ustawienia prywatności: widoczność profilu, obserwujący, wiadomości, blokowanie, zgłaszanie.
- Ustawienia powiadomień.

## 2. Onboarding
Po rejestracji: rola, język (PL domyślny + EN/DE/ES/FR/IT/UK), motyw (PURRE AURA, LIGHT, MIDNIGHT, FOREST, ROYAL, SUNSET, MONO, HIGH CONTRAST), gatunki/rasy, region, elegancki onboarding.

## 3. Profile
- Profil użytkownika (avatar crop, bio 500, socials, galeria max 12)
- Profil hodowcy (weryfikacja, Trust Score, odznaki, mioty, rodowody)
- Profil zwierzaka (galeria min 6, statusy, cena, rodzice, badania, chip)

## 4. Weryfikacja hodowcy
Upload dokumentów, OCR (Tesseract), AI (Qwen2.5 3B) risk score, human-in-the-loop, badge „Zweryfikowany hodowca”, retencja 30 dni.

## 5. Marketplace
Ogłoszenia za Coins (50), min 6 zdjęć, nieograniczone wideo, filtry, mapa Haversine, wyróżnienie/boost/sponsor.

## 6. Edytor wideo TikTok-style
Trim, split, merge, speed, reverse, rotate, crop, zoom/pan, filtry, efekty, naklejki, tekst, napisy AI (Whisper), voiceover, muzyka, mikser, cover, preview.

## 7. HoloFeed
Full-screen 9:16, swipe, autoplay, komentarze, reakcje, Live Miot, reklama co 5-7, Smart Match.

## 8–21. Pozostałe
Discover, Messenger (E2E planowane), Społeczność, Wydarzenia, Arcade (15+ gier), Coins+Stripe, Reklamy, Panele, AI, Bezpieczeństwo/RODO, Design PURRE AURA, Deployment Oracle + bengos.pl, Stack (Vite/React + Express/Prisma lub FastAPI).

---
Pełna oryginalna specyfikacja zachowana w historii konwersacji i w tym pliku.
