import { useEffect, useRef, useState } from "react";
import { base44, storiesApi } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { usePremium } from "@/components/ads/AdSlot";
import AdSenseUnit from "@/components/ads/AdSenseUnit";
import { getAdSenseSlot, isAdSenseEnabled } from "@/lib/adsense";
import { Plus, Send, X, Trash2 } from "lucide-react";
import { toast } from "sonner";
import StoryComposer, { filterCss } from "@/components/stories/StoryComposer";
import { cn } from "@/lib/utils";

/**
 * StoriesBar + StoryViewer — pełnoekranowe relacje (24 h) z paskiem czasu,
 * automatycznym przejściem, reakcjami, filtrami, nakładką i muzyką.
 */
export function StoriesBar({ onOpen }) {
  const { user, isAuthenticated } = useAuth();
  const premium = usePremium();

  const [groups, setGroups] = useState([]);
  const [composerOpen, setComposerOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState(null);

  const reload = async () => {
    if (!isAuthenticated || !user?.id) {
      setGroups([]);
      return;
    }

    try {
      const [storyResult, followResult] = await Promise.all([
        storiesApi.list(),
        base44.entities.Follow.filter(
          { follower_id: user.id },
          { limit: 500 }
        ).catch(() => [])
      ]);

      const allGroups = Array.isArray(storyResult?.groups)
        ? storyResult.groups
        : [];

      const followRows = Array.isArray(followResult)
        ? followResult
        : Array.isArray(followResult?.items)
          ? followResult.items
          : [];

      const followedIds = new Set(
        followRows
          .map((follow) => follow?.following_id)
          .filter(Boolean)
      );

      // Instagram-like order: own stories, followed accounts,
      // then all other accounts. Newest groups appear first.
      const sorted = [...allGroups].sort((a, b) => {
        const priority = (group) => {
          if (group.author_id === user.id) return 0;
          if (followedIds.has(group.author_id)) return 1;
          return 2;
        };

        const priorityDifference = priority(a) - priority(b);
        if (priorityDifference !== 0) return priorityDifference;

        return (
          new Date(b.latest || b.stories?.[0]?.created_date || 0).getTime() -
          new Date(a.latest || a.stories?.[0]?.created_date || 0).getTime()
        );
      });

      setGroups(sorted);
    } catch {
      // Nie czyścimy istniejących relacji przy chwilowym błędzie sieci.
    }
  };

  useEffect(() => {
    reload();
  }, [isAuthenticated, user?.id]);

  if (!isAuthenticated) return null;

  const googleAdsAvailable =
    isAdSenseEnabled() && Boolean(getAdSenseSlot("feed"));

  const openGroup = (group) => {
    if (onOpen) {
      onOpen(group);
    } else {
      setSelectedGroup(group);
    }
  };

  return (
    <>
      <div className="no-scrollbar flex gap-3 overflow-x-auto px-4 py-3">
        <button
          type="button"
          onClick={() => setComposerOpen(true)}
          className="flex h-16 w-16 shrink-0 flex-col items-center justify-center gap-1 rounded-full border-2 border-dashed border-fuchsia-400/60 bg-fuchsia-500/5 text-muted-foreground shadow-[0_0_14px_rgba(217,70,239,0.12)] transition hover:bg-fuchsia-500/15 hover:text-aura"
        >
          <Plus className="h-5 w-5" />
          <span className="text-[9px] uppercase tracking-wider">Relacja</span>
        </button>

        {groups.map((group, index) => {
          const firstStory = group.stories?.[0];
          const insertAd = (index + 1) % 3 === 0;

          return (
            <div key={group.author_id} className="contents">
              <div className="flex w-16 shrink-0 flex-col items-center">
                <button
                  type="button"
                  onClick={() => openGroup(group)}
                  className="relative h-16 w-16 overflow-hidden rounded-full border-[3px] border-fuchsia-400 p-[2px] shadow-[0_0_16px_rgba(217,70,239,0.25)] ring-2 ring-violet-500/70"
                  aria-label={`Otwórz relacje: ${group.author_name}`}
                >
                  {firstStory?.media_url ? (
                    firstStory.media_type === "video" ? (
                      <video
                        src={firstStory.media_url}
                        muted
                        playsInline
                        preload="metadata"
                        className="h-full w-full object-cover"
                        style={{ filter: filterCss(firstStory.filter) }}
                      />
                    ) : (
                      <img
                        src={firstStory.media_url}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover"
                        style={{ filter: filterCss(firstStory.filter) }}
                      />
                    )
                  ) : (
                    <div className="h-full w-full bg-secondary" />
                  )}

                  <span className="absolute bottom-1 left-1 right-1 truncate text-[9px] font-semibold text-white drop-shadow">
                    {group.author_id === user.id
                      ? "Twoja relacja"
                      : group.author_name}
                  </span>
                </button>
              </div>

              {insertAd && googleAdsAvailable && !premium && (
                <div className="flex w-[280px] min-w-[280px] shrink-0 items-center justify-center">
                  <AdSenseUnit
                    slotName="feed"
                    format="auto"
                    className="w-full min-h-24"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {composerOpen && (
        <StoryComposer
          onClose={() => setComposerOpen(false)}
          onPublished={reload}
        />
      )}

      {!onOpen && selectedGroup && (
        <StoryViewer
          group={selectedGroup}
          userId={user?.id}
          onDeleted={reload}
          onClose={() => setSelectedGroup(null)}
        />
      )}
    </>
  );
}

export function StoryViewer({ group, userId, onDeleted, onClose }) {
  const [idx, setIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [reacted, setReacted] = useState(null);
  const [muted, setMuted] = useState(true);
  const [paused, setPaused] = useState(false);
  const [viewCount, setViewCount] = useState(0);
  const [deleting, setDeleting] = useState(false);

  const timerRef = useRef(null);
  const audioRef = useRef(null);
  const videoRef = useRef(null);
  const touchStartRef = useRef(null);
  const elapsedRef = useRef(0);

  const stories = group?.stories ?? [];
  const current = stories[idx];

  const goNext = () => {
    if (idx + 1 < stories.length) {
      setIdx((value) => value + 1);
    } else {
      onClose?.();
    }
  };

  const goPrevious = () => {
    if (idx > 0) setIdx((value) => value - 1);
  };

  // Obsługa klawiatury — Escape, strzałki i spacja.
  useEffect(() => {
    const handleKey = (event) => {
      if (event.key === "Escape") onClose?.();
      if (event.key === "ArrowRight") goNext();
      if (event.key === "ArrowLeft") goPrevious();
      if (event.code === "Space" && current?.media_type === "video") {
        event.preventDefault();
        setPaused((value) => !value);
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [idx, stories.length, current?.media_type, onClose]);

  // Rejestracja wyświetlenia i licznik zwrócony przez API.
  useEffect(() => {
    if (!current?.id) return;

    let active = true;
    setViewCount(Number(current.views) || 0);

    storiesApi.view(current.id)
      .then((result) => {
        if (active && Number.isFinite(Number(result?.views))) {
          setViewCount(Number(result.views));
        }
      })
      .catch(() => null);

    return () => {
      active = false;
    };
  }, [current?.id]);

  // Zdjęcia: pięć sekund odtwarzania z możliwością pauzy.
  // Wideo korzysta z rzeczywistego czasu odtwarzania elementu video.
  useEffect(() => {
    if (!current) return undefined;

    clearInterval(timerRef.current);
    elapsedRef.current = 0;
    setProgress(0);

    if (current.media_type === "video" || paused) {
      return () => clearInterval(timerRef.current);
    }

    let startedAt = Date.now();

    timerRef.current = setInterval(() => {
      const elapsed = elapsedRef.current + (Date.now() - startedAt);
      const nextProgress = Math.min(100, (elapsed / 5000) * 100);
      setProgress(nextProgress);

      if (nextProgress >= 100) {
        clearInterval(timerRef.current);
        goNext();
      }
    }, 80);

    return () => {
      clearInterval(timerRef.current);
      elapsedRef.current += Date.now() - startedAt;
    };
  }, [idx, current?.id, paused]);

  // Pauza i wznowienie filmu.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (paused) {
      video.pause();
    } else {
      video.play().catch(() => setPaused(true));
    }
  }, [paused, current?.id]);

  // Muzyka dla zdjęć.
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    if (current?.music_url && current.media_type !== "video") {
      const audio = new Audio(current.music_url);
      audio.loop = true;
      audio.muted = muted;
      audio.volume = 0.5;
      audioRef.current = audio;
      audio.play().catch(() => null);
    }

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [current?.id, current?.music_url, current?.media_type, muted]);

  const canDelete = Boolean(
    current?.id &&
    userId &&
    (current.author_id === userId || group?.author_id === userId)
  );

  const deleteCurrentStory = async () => {
    if (!canDelete || deleting) return;

    if (!window.confirm("Czy na pewno chcesz usunąć tę relację?")) return;

    setDeleting(true);
    try {
      await storiesApi.remove(current.id);
      toast.success("Relacja została usunięta.");
      onDeleted?.();
      onClose?.();
    } catch (error) {
      console.error("Story delete failed:", error);
      toast.error("Nie udało się usunąć relacji.");
    } finally {
      setDeleting(false);
    }
  };

  const react = async (emoji) => {
    const previous = reacted;
    setReacted(emoji);

    try {
      await storiesApi.react(current.id, emoji);
    } catch {
      setReacted(previous);
      toast.error("Nie udało się wysłać reakcji.");
    }
  };

  const handleTouchStart = (event) => {
    const touch = event.touches?.[0];
    if (touch) {
      touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    }
  };

  const handleTouchEnd = (event) => {
    const start = touchStartRef.current;
    const touch = event.changedTouches?.[0];
    touchStartRef.current = null;
    if (!start || !touch) return;

    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;

    if (Math.abs(dx) > 65 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) goNext();
      else goPrevious();
    } else if (dy > 100) {
      onClose?.();
    }
  };

  if (!current) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex h-[100dvh] w-full flex-col overflow-hidden bg-black text-white"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className="flex shrink-0 gap-1 px-3 pt-[max(12px,env(safe-area-inset-top))]">
        {stories.map((story, index) => (
          <div key={story.id || index} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/25">
            <div
              className="h-full rounded-full bg-white"
              style={{
                width: index < idx ? "100%" : index === idx ? `${progress}%` : "0%",
              }}
            />
          </div>
        ))}
      </div>

      <header className="z-10 flex shrink-0 items-center gap-2 px-4 py-3">
        <img
          src={group.author_avatar || ""}
          alt=""
          className="h-9 w-9 rounded-full border border-white/30 object-cover"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{group.author_name}</p>
          <p className="text-[10px] text-white/55">
            {current.created_date
              ? new Date(current.created_date).toLocaleTimeString("pl-PL", {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : ""}
          </p>
        </div>

        {canDelete && (
          <button
            type="button"
            onClick={deleteCurrentStory}
            disabled={deleting}
            aria-label="Usuń relację"
            className="flex shrink-0 items-center gap-1 rounded-full bg-red-500/20 px-3 py-2 text-xs text-red-200 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
            {deleting ? "Usuwanie..." : "Usuń"}
          </button>
        )}

        {current.music_url && (
          <button
            type="button"
            onClick={() => setMuted((value) => !value)}
            className="rounded-full bg-white/10 px-3 py-2 text-xs"
          >
            {muted ? "♪ Wyciszono" : "♪ Dźwięk"}
          </button>
        )}

        <button
          type="button"
          onClick={onClose}
          aria-label="Zamknij relacje"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/10"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <main className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden">
        {current.media_type === "video" ? (
          <video
            key={current.id}
            ref={videoRef}
            src={current.media_url}
            autoPlay
            playsInline
            muted={muted}
            onTimeUpdate={(event) => {
              const video = event.currentTarget;
              if (video.duration > 0) {
                setProgress(Math.min(100, (video.currentTime / video.duration) * 100));
              }
            }}
            onEnded={goNext}
            onClick={() => setPaused((value) => !value)}
            className="h-full w-full object-contain"
            style={{ filter: filterCss(current.filter) }}
          />
        ) : (
          <div
            className="relative flex shrink-0 items-center justify-center overflow-hidden"
            style={{
              width: "min(100%, calc(100dvh - 190px))",
              maxHeight: "100%",
              aspectRatio: "1 / 1",
            }}
          >
            <img
              src={current.media_url}
              alt=""
              className="h-full w-full object-contain"
              style={{ filter: filterCss(current.filter) }}
            />
          </div>
        )}

        {current.overlay_text && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6">
            <span className="rounded-xl bg-black/40 px-4 py-2 text-center text-lg font-semibold shadow-xl">
              {current.overlay_text}
            </span>
          </div>
        )}

        {current.caption && (
          <p className="pointer-events-none absolute bottom-5 left-4 right-4 rounded-xl bg-black/35 px-4 py-3 text-center text-sm shadow-lg">
            {current.caption}
          </p>
        )}

        {(current.music_title || current.music_url) && (
          <p className="pointer-events-none absolute bottom-4 left-4 max-w-[70%] truncate rounded-full bg-black/50 px-3 py-1.5 text-xs">
            ♫ {current.music_title || "Muzyka"}
          </p>
        )}

        {current.media_type === "video" && paused && (
          <button
            type="button"
            onClick={() => setPaused(false)}
            className="absolute left-1/2 top-1/2 grid h-14 w-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-2xl"
            aria-label="Wznów film"
          >
            ▶
          </button>
        )}

        <button
          type="button"
          onClick={goPrevious}
          aria-label="Poprzednia relacja"
          className="absolute bottom-0 left-0 top-0 w-[22%] bg-transparent"
        />
        <button
          type="button"
          onClick={goNext}
          aria-label="Następna relacja"
          className="absolute bottom-0 right-0 top-0 w-[22%] bg-transparent"
        />
      </main>

      <footer className="flex shrink-0 items-center justify-center gap-3 px-3 pb-[max(18px,env(safe-area-inset-bottom))] pt-3">
        {["❤️", "😂", "😮", "🔥"].map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => react(emoji)}
            className={cn(
              "grid h-11 w-11 place-items-center rounded-full bg-white/10 text-xl transition",
              reacted === emoji && "scale-110 bg-fuchsia-500/40"
            )}
            aria-label={`Reakcja ${emoji}`}
          >
            {emoji}
          </button>
        ))}

        <div className="flex items-center gap-1 rounded-full bg-white/10 px-3 py-2 text-[10px] text-white/75">
          <Send className="h-3 w-3" />
          {viewCount} wyświetleń
        </div>
      </footer>
    </div>
  );
}
