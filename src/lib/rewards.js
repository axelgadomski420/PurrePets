export const REWARDS = [
  { key: "boost_listing", cost: 400, icon: "sparkles", needsTarget: true },
  { key: "boost_profile", cost: 600, icon: "trending" },
  { key: "extra_media", cost: 250, icon: "image" },
  { key: "frame", cost: 300, icon: "frame" },
  { key: "badge", cost: 900, icon: "award" },
  { key: "theme", cost: 500, icon: "palette" },
  { key: "event", cost: 1200, icon: "ticket" },
  { key: "partner", cost: 800, icon: "tag" },
  { key: "verification", cost: 1500, icon: "shield" },
];

export const REWARD_BY_KEY = Object.fromEntries(REWARDS.map((reward) => [reward.key, reward]));
