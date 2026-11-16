/**
 * Google AdSense integration for PURRE PETS.
 * Missing placement configuration never falls back to another slot.
 */

export function getAdSenseClient() {
  try {
    return import.meta.env.VITE_ADSENSE_CLIENT || "";
  } catch {
    return "";
  }
}

export function getAdSenseSlot(name = "feed") {
  try {
    const map = {
      feed: import.meta.env.VITE_ADSENSE_SLOT_FEED,
      explore: import.meta.env.VITE_ADSENSE_SLOT_EXPLORE,
      reels: import.meta.env.VITE_ADSENSE_SLOT_REELS,
      arcade: import.meta.env.VITE_ADSENSE_SLOT_ARCADE,
    };
    return map[name] || "";
  } catch {
    return "";
  }
}

export function isAdSenseEnabled() {
  return Boolean(getAdSenseClient());
}

let scriptPromise = null;

export function loadAdSenseScript() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.resolve(false);
  }

  const client = getAdSenseClient();
  if (!client) return Promise.resolve(false);

  let script = document.querySelector("script[data-purre-adsense]");

  if (script?.dataset.purreLoaded === "true" && window.adsbygoogle) {
    return Promise.resolve(true);
  }

  if (scriptPromise) return scriptPromise;

  // A failed script element cannot be reused for another network request.
  if (script?.dataset.purreLoaded === "false") {
    script.remove();
    script = null;
  }

  // Compatibility with a script loaded by the previous implementation.
  if (script && window.adsbygoogle && !script.dataset.purreLoading) {
    script.dataset.purreLoaded = "true";
    return Promise.resolve(true);
  }

  scriptPromise = new Promise((resolve) => {
    let settled = false;
    let createdHere = false;

    const finish = (success) => {
      if (settled) return;
      settled = true;

      if (script) {
        script.removeEventListener("load", onLoad);
        script.removeEventListener("error", onError);
        delete script.dataset.purreLoading;
      }

      if (success) {
        if (script) script.dataset.purreLoaded = "true";
      } else {
        if (script) {
          script.dataset.purreLoaded = "false";
          script.remove();
        }
        scriptPromise = null;
      }

      resolve(success);
    };

    const onLoad = () => finish(true);
    const onError = () => finish(false);

    if (!script) {
      script = document.createElement("script");
      createdHere = true;
      script.async = true;
      script.crossOrigin = "anonymous";
      script.dataset.purreAdsense = "1";
      script.src =
        "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" +
        encodeURIComponent(client);
    }

    script.dataset.purreLoading = "1";
    script.addEventListener("load", onLoad, { once: true });
    script.addEventListener("error", onError, { once: true });

    if (createdHere) {
      document.head.appendChild(script);
    }
  });

  return scriptPromise;
}

export function pushAdSense() {
  if (typeof window === "undefined") return false;

  try {
    const queue = window.adsbygoogle = window.adsbygoogle || [];
    queue.push({});
    return true;
  } catch {
    return false;
  }
}
