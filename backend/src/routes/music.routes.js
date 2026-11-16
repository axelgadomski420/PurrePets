import { Router } from "express";
import { asyncHandler } from "../lib/errors.js";

export const musicRouter = Router();

/**
 * GET /api/music/search?q=&limit= — wyszukiwarka muzyki (iTunes Search API).
 * Zwraca legalne 30-sekundowe podglądy (m4a) — działa bez kluczy API.
 * (Spotify wymaga OAuth i nie streamuje pełnych utworów — iTunes to legalna alternatywa.)
 */
musicRouter.get(
  "/search",
  asyncHandler(async (req, res) => {
    const q = String(req.query.q ?? "").trim();
    const limit = Math.min(25, Math.max(1, parseInt(String(req.query.limit ?? "15"), 10) || 15));
    if (q.length < 2) return res.json({ items: [], provider: "itunes" });

    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&media=music&entity=song&limit=${limit}&country=PL`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`iTunes ${response.status}`);
      const data = await response.json();
      const items = (data.results ?? [])
        .map((track) => ({
          id: `itunes-${track.trackId}`,
          title: track.trackName ?? "",
          artist: track.artistName ?? "",
          album: track.collectionName ?? "",
          url: track.previewUrl ?? null, // 30 s m4a
          artwork: (track.artworkUrl100 ?? "").replace("100x100", "300x300"),
          duration: 30,
          mood: track.primaryGenreName ?? "",
          source: "itunes",
        }))
        .filter((track) => track.url);
      res.json({ items, provider: "itunes" });
    } catch (err) {
      console.error("music search failed:", err?.message);
      // Degradacja: pusta lista zamiast 500 — picker pokaże bibliotekę lokalną.
      res.json({ items: [], provider: "itunes", degraded: true });
    } finally {
      clearTimeout(timer);
    }
  })
);

// GET /api/music/trending — podpowiedzi startowe (popularne gatunki na start).
musicRouter.get("/trending", asyncHandler(async (_req, res) => {
  const seeds = ["pop hits", "rock classics", "chill lofi", "electronic dance"];
  res.json({ seeds });
}));
