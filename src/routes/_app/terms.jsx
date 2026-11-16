import { createFileRoute, Link } from "@tanstack/react-router";
import TopBar from "@/components/layout/TopBar";

export const Route = createFileRoute("/_app/terms")({
  head: () => ({ meta: [{ title: "PURRE PETS — Regulamin" }] }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <div>
      <TopBar title="Regulamin" />
      <div className="mx-auto max-w-2xl px-4 py-8 lg:px-8">
        <h1 className="font-display text-3xl">
          <span className="aura-text">Regulamin serwisu</span>
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">Ostatnia aktualizacja: 14 listopada 2026</p>

        <div className="mt-6 space-y-5 text-sm leading-relaxed text-muted-foreground">
          <p>
            Korzystając z platformy PURRE PETS (purrepets.pl) akceptujesz niniejszy regulamin.
            Serwis łączy hodowców psów i kotów rasowych z osobami szukającymi zwierzaka:
            marketplace, społeczność, Reels, wiadomości, wydarzenia i gry (PURRE Arcade).
          </p>

          <div>
            <h2 className="text-base font-semibold text-foreground">1. Konta</h2>
            <p className="mt-1.5">
              Konta dzielą się na użytkownika (enthusiast) i hodowcę (breeder). Hodowca może ubiegać się
              o weryfikację i odznakę „Zweryfikowany hodowca”. Musisz mieć ukończone 18 lat. Jedno konto na osobę;
              podszywanie się, spam i konta-wrzuty są zabronione.
            </p>
          </div>

          <div>
            <h2 className="text-base font-semibold text-foreground">2. Ogłoszenia i treści</h2>
            <p className="mt-1.5">
              Odpowiadasz za publikowane treści — muszą być zgodne z prawem i prawdziwe. Zakaz sprzedaży
              zwierząt chronionych, szczenięcych młynów i handlu żywymi zwierzętami poza zasadami platformy.
              Administrator i moderatorzy mogą ukrywać, archiwizować lub usuwać treści naruszające prawo
              lub regulamin, oraz blokować konta.
            </p>
          </div>

          <div>
            <h2 className="text-base font-semibold text-foreground">3. PURRE Coins</h2>
            <p className="mt-1.5">
              Wirtualna waluta do boostów, biletów i nagród. Coiny nie podlegają wypłacie ani zwrotowi
              na rachunek bankowy i nie są walutą elektroniczną w rozumieniu prawa.
            </p>
          </div>

          <div>
            <h2 className="text-base font-semibold text-foreground">4. Subskrypcja PRO (płatności w PLN)</h2>
            <p className="mt-1.5">
              PURRE PRO: 29,99 PLN/miesiąc lub 249,99 PLN/rok, płatność przez Stripe. PRO wyłącza reklamy,
              odblokowuje dodatkowe funkcje profilu i wyróżnienia. Subskrypcja odnawia się automatycznie;
              możesz ją anulować w każdej chwili — dostęp zachowujesz do końca opłaconego okresu.
              Reklamacje: effdoa@gmail.com, rozpatrujemy w 14 dni. Prawo odstąpienia od umowy zawartej na odległość — 14 dni.
            </p>
          </div>

          <div>
            <h2 className="text-base font-semibold text-foreground">5. Zakazy</h2>
            <ul className="mt-1.5 list-disc space-y-1 pl-5">
              <li>treści pornograficzne, nienawistne, wprowadzające w błąd, nielegalne</li>
              <li>oszustwa, kradzież tożsamości, phishing, Udostępnianie danych zwierząt bez zgody właściciela</li>
              <li>automatyzacja bez zgody (scraping, boty), próby włamań i przeciążania serwisu</li>
            </ul>
          </div>

          <div>
            <h2 className="text-base font-semibold text-foreground">6. Zgłaszanie naruszeń</h2>
            <p className="mt-1.5">
              Każdą treść i użytkownika możesz zgłosić przyciskiem „Zgłoś” — zgłoszenia trafiają
              do kolejki moderacji. Odpowiadamy na zgłoszenia w terminie do 7 dni.
            </p>
          </div>

          <div>
            <h2 className="text-base font-semibold text-foreground">7. Odpowiedzialność</h2>
            <p className="mt-1.5">
              Serwis jest platformą pośredniczącą — nie jesteśmy stroną transakcji między hodowcą a kupującym.
              Zalecamy pisemne umowy, weryfikację rodowodów i odbiór zwierzęcia osobiście.
            </p>
          </div>

          <div>
            <h2 className="text-base font-semibold text-foreground">8. Kontakt</h2>
            <p className="mt-1.5">
              Sprawy dotyczące konta, moderacji, płatności i RODO: <span className="font-medium text-foreground">effdoa@gmail.com</span>.
            </p>
          </div>
        </div>

        <Link to="/privacy" className="mt-8 inline-block text-[11px] uppercase tracking-widest text-aura">
          Polityka prywatności →
        </Link>
      </div>
    </div>
  );
}
