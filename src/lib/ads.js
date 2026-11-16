/**
 * PURRE PETS — Google AdSense placement helpers.
 * No partner cards or sponsored-listing fallbacks.
 */

const INTERVAL_MIN = 5;
const INTERVAL_MAX = 7;

export function adInterval(seed = "purre") {
  let h = 0;
  const s = String(seed);
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return INTERVAL_MIN + (h % (INTERVAL_MAX - INTERVAL_MIN + 1));
}

/** Tworzy miejsca reklamowe Google AdSense. */
export function interleaveAds(items, { seed = "purre", enabled = true } = {}) {
  const source = Array.isArray(items) ? items : [];

  if (!enabled || !source.length) {
    return source.map((data) => ({ type: "item", data }));
  }

  const every = adInterval(seed);
  const out = [];

  for (let i = 0; i < source.length; i++) {
    out.push({ type: "item", data: source[i] });

    if ((i + 1) % every === 0) {
      out.push({
        type: "ad",
        id: `google-${seed}-${i + 1}`,
      });
    }
  }

  return out;
}

const PREMIUM_KEY = "purre_ads_disabled";

export function readAdsDisabledLocal() {
  try {
    return localStorage.getItem(PREMIUM_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeAdsDisabledLocal(value) {
  try {
    if (value) localStorage.setItem(PREMIUM_KEY, "1");
    else localStorage.removeItem(PREMIUM_KEY);
  } catch {
    /* ignore */
  }
}

export function isAdsDisabled(wallet) {
  if (readAdsDisabledLocal()) return true;
  if (!wallet) return false;

  if (
    Array.isArray(wallet.badges) &&
    wallet.badges.includes("premium")
  ) return true;

  if (
    wallet.boost_until &&
    new Date(wallet.boost_until) > new Date()
  ) return true;

  return false;
}
