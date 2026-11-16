import { createFileRoute, Link } from "@tanstack/react-router";
import TopBar from "@/components/layout/TopBar";

export const Route = createFileRoute("/_app/privacy")({
  head: () => ({ meta: [{ title: "PURRE PETS — Polityka prywatności (RODO)" }] }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <div>
      <TopBar title="Prywatność" />
      <div className="mx-auto max-w-2xl px-4 py-8 lg:px-8">
        <h1 className="font-display text-3xl">
          <span className="aura-text">Polityka prywatności (RODO)</span>
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">Ostatnia aktualizacja: 14 listopada 2026</p>

        <div className="mt-6 space-y-5 text-sm leading-relaxed text-muted-foreground">
          <p>
            Administratorem danych osobowych jest operator platformy PURRE PETS (purrepets.pl).
            Kontakt w sprawach danych: <span className="font-medium text-foreground">effdoa@gmail.com</span>.
          </p>

          <div>
            <h2 className="text-base font-semibold text-foreground">1. Jakie dane zbieramy</h2>
            <ul className="mt-1.5 list-disc space-y-1 pl-5">
              <li>dane konta: e-mail, hasło (wyłącznie jako hash bcrypt), nazwa wyświetlana</li>
              <li>profil: miasto, bio, zdjęcia, dane hodowli, linki social (opcjonalnie)</li>
              <li>treści użytkownika: ogłoszenia, posty, relacje, wiadomości, nagrania wideo</li>
              <li>dane techniczne: logi serwera, adres IP, pliki cookies</li>
              <li>dane płatności: identyfikatory sesji Stripe — nie przechowujemy numerów kart</li>
            </ul>
          </div>

          <div>
            <h2 className="text-base font-semibold text-foreground">2. Podstawa prawna</h2>
            <p className="mt-1.5">
              Art. 6 ust. 1 lit. a, b i f RODO — Twoja zgoda (cookies, analityka), wykonanie umowy
              (konto, płatności PRO w PLN) oraz prawnie uzasadniony interes (bezpieczeństwo, moderacja, ochrona przed nadużyciami).
            </p>
          </div>

          <div>
            <h2 className="text-base font-semibold text-foreground">3. Szyfrowanie wiadomości (E2E)</h2>
            <p className="mt-1.5">
              Wiadomości w Messengerze są end-to-end szyfrowane (ECDH P-256 + AES-GCM). Klucz prywatny
              pozostaje na Twoim urządzeniu — serwer przechowuje wyłącznie ciphertext i nie może odczytać treści rozmów.
            </p>
          </div>

          <div>
            <h2 className="text-base font-semibold text-foreground">4. Pliki cookies</h2>
            <p className="mt-1.5">
              Niezbędne: sesja logowania (token), bezpieczeństwo. Opcjonalne (za zgodą w banerze): analityka.
              Zgodę możesz wycofać w każdej chwili, czyszcząc dane przeglądarki lub zmieniając wybór w banerze.
            </p>
          </div>

          <div>
            <h2 className="text-base font-semibold text-foreground">5. Okres przechowywania</h2>
            <p className="mt-1.5">
              Dane konta — do usunięcia konta. Logi techniczne — do 90 dni. Dokumenty weryfikacji hodowcy — 30 dni
              od rozpatrzenia wniosku. Treści usunięte przez Ciebie znikają z serwisu od razu.
            </p>
          </div>

          <div>
            <h2 className="text-base font-semibold text-foreground">6. Twoje prawa</h2>
            <p className="mt-1.5">
              Dostęp, sprostowanie, usunięcie, ograniczenie przetwarzania, przenoszenie danych, sprzeciw
              oraz skarga do Prezesa UODO. Eksport danych i usunięcie konta: ustawienia konta w aplikacji
              lub e-mail na adres administratora.
            </p>
          </div>

          <div>
            <h2 className="text-base font-semibold text-foreground">7. Płatności</h2>
            <p className="mt-1.5">
              Subskrypcje PRO (29,99 PLN/mies. lub 249,99 PLN/rok) obsługuje Stripe, Inc. Przekazujemy
              wyłącznie dane niezbędne do realizacji płatności. Numerów kart nie widzimy ani nie przechowujemy.
            </p>
          </div>

          <div>
            <h2 className="text-base font-semibold text-foreground">8. Odbiorcy danych</h2>
            <p className="mt-1.5">
              Dostawcy hostingu i płatności (Stripe), wyłącznie w zakresie niezbędnym. Nie sprzedajemy
              danych osobowych podmiotom trzecim.
            </p>
          </div>
        </div>

        <Link to="/terms" className="mt-8 inline-block text-[11px] uppercase tracking-widest text-aura">
          Regulamin →
        </Link>
      </div>
    </div>
  );
}
