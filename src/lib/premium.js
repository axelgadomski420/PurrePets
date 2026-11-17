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
  if (!wallet) return false;
  if (Array.isArray(wallet.badges) && wallet.badges.includes("premium")) {
    if (wallet.boost_until) {
      return new Date(wallet.boost_until) > new Date();
    }
    return true;
  }
  return false;
}

export const PREMIUM_PERKS = [
  "Brak reklam w feedzie, Explore, Reels i Arcade",
  "Więcej wyróżnień ogłoszeń (boost)",
  "Priorytet w PurreFeed i Discover",
  "Zaawansowane statystyki dla hodowcy",
  "Nielimitowane zapisane wyszukiwania",
  "Badge PREMIUM przy profilu",
];
