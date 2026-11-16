// Game/reward constants copied 1:1 from the frontend (src/lib/games.js, src/lib/rewards.js)
// so the backend enforces exactly what the client displays.

export const GAME_CAPS = {
  "2048": 100000,
  memory: 1200,
  quiz: 800,
  puzzle: 3000,
  snake: 5000,
  reaction: 2000,
  whack: 4000,
  slide: 2500,
  tetris: 50000,
  flappy: 8000,
  match3: 15000,
  wordle: 600,
  bubble: 12000,
};
export const GAME_DIVISOR = {
  "2048": 10,
  memory: 5,
  quiz: 8,
  puzzle: 6,
  snake: 8,
  reaction: 6,
  whack: 8,
  slide: 6,
  tetris: 12,
  flappy: 10,
  match3: 15,
  wordle: 4,
  bubble: 12,
};
export const DAILY_TARGETS = {
  "2048": 800,
  memory: 400,
  quiz: 500,
  puzzle: 600,
  snake: 200,
  reaction: 900,
  whack: 200,
  slide: 500,
  tetris: 1200,
  flappy: 15,
  match3: 800,
  wordle: 1,
  bubble: 600,
};
export const DAILY_BONUS = 20;

export function dailyGame(dateStr) {
  const seed = dateStr.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const ids = ["2048", "memory", "quiz", "snake", "reaction", "whack", "slide", "tetris", "flappy", "match3", "wordle", "bubble"];
  return ids[seed % ids.length];
}

export function todayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

export function dailyTarget(gameId) {
  return DAILY_TARGETS[gameId] ?? 500;
}

export function coinReward(game, score) {
  const cap = GAME_CAPS[game];
  if (!cap || !Number.isFinite(score) || score <= 0) return 0;

  // 8-12 Coins za dodatni, zaakceptowany wynik.
  const performance = Math.min(1, score / cap);
  return 8 + Math.round(performance * 4);
}

export function levelFor(xp = 0) {
  return Math.max(1, Math.floor(Math.sqrt(Math.max(0, xp) / 120)) + 1);
}

export const REWARDS = [
  { key: "boost_listing", cost: 400, needsTarget: true },
  { key: "boost_profile", cost: 600 },
  { key: "extra_media", cost: 250 },
  { key: "frame", cost: 300 },
  { key: "badge", cost: 900 },
  { key: "theme", cost: 500 },
  { key: "event", cost: 1200 },
  { key: "partner", cost: 800 },
  { key: "verification", cost: 1500 },
];

export const REWARD_BY_KEY = Object.fromEntries(REWARDS.map((reward) => [reward.key, reward]));

export const LISTING_COST = 20;

export const CITIES = {
  Warszawa: { lat: 52.2297, lng: 21.0122 },
  Kraków: { lat: 50.0647, lng: 19.945 },
  Wrocław: { lat: 51.1079, lng: 17.0385 },
  Poznań: { lat: 52.4064, lng: 16.9252 },
  Gdańsk: { lat: 54.352, lng: 18.6466 },
  Łódź: { lat: 51.7592, lng: 19.456 },
  Katowice: { lat: 50.2649, lng: 19.0238 },
  Lublin: { lat: 51.2465, lng: 22.5684 },
  Szczecin: { lat: 53.4285, lng: 14.5528 },
  Bydgoszcz: { lat: 53.1235, lng: 18.0084 },
  Białystok: { lat: 53.1325, lng: 23.1688 },
  Rzeszów: { lat: 50.0412, lng: 21.9991 },
};

export function coordsFor(city) {
  return CITIES[city] ?? null;
}
