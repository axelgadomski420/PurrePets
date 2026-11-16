import { useEffect, useRef, useState } from "react";
import { Globe, Music2, Pause, Play, Search, Volume2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { FREE_SFX, FREE_TRACKS, playBeep } from "@/lib/sounds";
import { cn } from "@/lib/utils";

/**
 * SoundPicker — wyszukiwarka muzyki i audio do rolek i relacji:
 *  • Muzyka — biblioteka PURRE (/api/reels-audio) + darmowe sample (Mixkit),
 *  • Globalna — iTunes Search API przez backend (/api/music/search): legalne
 *    30-sekundowe podglądy największych przebojów, bez kluczy API,
 *  • SFX — lokalne efekty.
 */
export default function SoundPicker({ value, onChange, className }) {
  const audioRef = useRef(null);
  const [playingId, setPlayingId] = useState(null);
  const [tab, setTab] = useState("music");
  const [query, setQuery] = useState("");
  const [remote, setRemote] = useState([]);
  const [itunes, setItunes] = useState([]);
  const [loading, setLoading] = useState(false);

  // Biblioteka PURRE
  useEffect(() => {
    if (tab !== "music") return;
    let alive = true;
    const timer = setTimeout(() => {
      setLoading(true);
      base44.reelsAudio
        .list(query.trim())
        .then((res) => {
          if (alive) setRemote(res?.items ?? []);
        })
        .catch(() => {
          if (alive) setRemote([]);
        })
        .finally(() => alive && setLoading(false));
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query, tab]);

  // iTunes (globalne przeboje)
  useEffect(() => {
    if (tab !== "global") return;
    let alive = true;
    const timer = setTimeout(() => {
      setLoading(true);
      fetch(`/api/music/search?limit=20&q=${encodeURIComponent(query.trim() || "pop hits")}`)
        .then((r) => r.json())
        .then((data) => {
          if (alive) setItunes(data?.items ?? []);
        })
        .catch(() => {
          if (alive) setItunes([]);
        })
        .finally(() => alive && setLoading(false));
    }, 300);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query, tab]);

  const localList = tab === "music" ? FREE_TRACKS : FREE_SFX;
  const q = query.trim().toLowerCase();
  const localFiltered = q
    ? localList.filter((t) => (t.title || "").toLowerCase().includes(q) || (t.mood || "").toLowerCase().includes(q))
    : localList;
  const remoteFiltered = q
    ? remote.filter((t) => !localFiltered.some((l) => l.id === t.id))
    : remote;

  const preview = async (track) => {
    try {
      if (playingId === track.id) {
        audioRef.current?.pause();
        setPlayingId(null);
        return;
      }
      if (audioRef.current) audioRef.current.pause();
      const audio = new Audio(track.url);
      audio.volume = 0.55;
      audioRef.current = audio;
      audio.onended = () => setPlayingId(null);
      await audio.play();
      setPlayingId(track.id);
    } catch {
      playBeep(tab === "sfx" ? 660 : 440, 150);
      setPlayingId(null);
    }
  };

  const pick = (track) => {
    onChange?.(track);
    if (track.id && !track.id.startsWith("local-") && !track.id.startsWith("itunes-")) {
      base44.reelsAudio.use(track.id).catch(() => null);
    }
  };

  const Row = ({ track, source, artwork }) => {
    const selected = value?.id === track.id;
    const isPlaying = playingId === track.id;
    return (
      <li
        className={cn(
          "flex items-center gap-2 rounded-xl px-2 py-2 text-sm",
          selected ? "bg-aura/15 ring-1 ring-aura/40" : "hover:bg-secondary/40"
        )}
      >
        {artwork ? (
          <img src={artwork} alt="" className="h-8 w-8 shrink-0 rounded-md object-cover" />
        ) : (
          <button type="button" className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border/60" onClick={() => preview(track)}>
            {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          </button>
        )}
        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => pick(track)}>
          <p className="truncate font-medium">{track.title}</p>
          <p className="truncate text-[10px] text-muted-foreground">
            {track.artist ? `${track.artist} · ` : ""}
            {track.mood || "sfx"} {track.duration ? `· ${track.duration}s` : ""} · {source}
          </p>
        </button>
        <button type="button" className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted-foreground hover:text-foreground" onClick={() => preview(track)}>
          {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3 w-3" />}
        </button>
        {selected && <Volume2 className="h-3.5 w-3.5 shrink-0 text-aura" />}
      </li>
    );
  };

  return (
    <div className={cn("rounded-2xl border border-border/70 bg-card/50 p-3", className)}>
      <div className="flex items-center gap-2">
        <Music2 className="h-4 w-4 text-aura" />
        <p className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">Dźwięk · muzyka i SFX</p>
      </div>
      <div className="mt-2 flex gap-2">
        {[
          { id: "music", label: "Muzyka" },
          { id: "global", label: "Globalna" },
          { id: "sfx", label: "SFX" },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "flex items-center gap-1 rounded-full px-3 py-1 text-[10px] uppercase tracking-wider",
              tab === t.id ? "bg-foreground text-background" : "border border-border/70"
            )}
          >
            {t.id === "global" && <Globe className="h-3 w-3" />}
            {t.label}
          </button>
        ))}
      </div>

      {tab !== "sfx" && (
        <div className="relative mt-2">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tab === "global" ? "Szukaj przebojów (iTunes)…" : "Szukaj muzyki… (tytuł, nastrój)"}
            className="h-9 w-full rounded-xl border border-border/60 bg-background/50 pl-9 pr-3 text-xs outline-none"
          />
        </div>
      )}

      {tab === "sfx" ? (
        <ul className="mt-3 max-h-48 space-y-1.5 overflow-y-auto">
          {localFiltered.map((track) => (
            <Row key={track.id} track={track} source="Mixkit" />
          ))}
          {localFiltered.length === 0 && (
            <li className="py-3 text-center text-xs text-muted-foreground">Brak wyników.</li>
          )}
        </ul>
      ) : tab === "global" ? (
        <ul className="mt-3 max-h-48 space-y-1.5 overflow-y-auto">
          {itunes.map((track) => (
            <Row key={track.id} track={track} source="iTunes · 30s podgląd" artwork={track.artwork} />
          ))}
          {itunes.length === 0 && (
            <li className="py-3 text-center text-xs text-muted-foreground">
              {loading ? "Szukam…" : "Brak wyników — spróbuj innej frazy."}
            </li>
          )}
        </ul>
      ) : (
        <ul className="mt-3 max-h-48 space-y-1.5 overflow-y-auto">
          {localFiltered.map((track) => (
            <Row key={track.id} track={track} source="Mixkit" />
          ))}
          {remoteFiltered.map((track) => (
            <Row key={track.id} track={{ ...track, duration: track.duration ? `${track.duration}` : undefined }} source={track.source === "upload" ? "społeczność" : "PURRE Library"} />
          ))}
          {localFiltered.length === 0 && remoteFiltered.length === 0 && (
            <li className="py-3 text-center text-xs text-muted-foreground">
              {loading ? "Szukam…" : "Brak wyników — spróbuj innej frazy."}
            </li>
          )}
        </ul>
      )}
      <p className="mt-2 text-[9px] text-muted-foreground">
        Mixkit + biblioteka PURRE + iTunes (30 s podglądów). Wybierz ścieżkę do rolki lub relacji.
      </p>
    </div>
  );
}
