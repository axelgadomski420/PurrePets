export const PREMIUM_PLANS = [
  {
    id: "premium_month",
    label: "Miesięczny",
    pricePln: 29.99,
    interval: "month",
  },
  {
    id: "premium_year",
    label: "Roczny",
    pricePln: 249.99,
    interval: "year",
    badge: "2 miesiące gratis",
  },
];

export function isPremiumActive(wallet) {
  return Boolean(
    wallet &&
    Array.isArray(wallet.badges) &&
    wallet.badges.includes("premium")
  );
}

export const PREMIUM_PERKS = [
  "Brak reklam w feedzie, Explore, Reels i Arcade",
  "Więcej wyróżnień ogłoszeń (boost)",
  "Priorytet w PurreFeed i Discover",
  "Zaawansowane statystyki dla hodowcy",
  "Nielimitowane zapisane wyszukiwania",
  "Badge PREMIUM przy profilu",
];
