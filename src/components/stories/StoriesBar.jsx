import { useEffect, useRef, useState } from "react";
import { base44, storiesApi } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { usePremium } from "@/components/ads/AdSlot";
import AdSenseUnit from "@/components/ads/AdSenseUnit";
import { getAdSenseSlot, isAdSenseEnabled } from "@/lib/adsense";
import { Plus, Send, X } from "lucide-react";
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
          className="flex h-24 w-16 shrink-0 flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-border/70 text-muted-foreground transition hover:border-aura/60 hover:text-aura"
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
                  className="relative h-24 w-16 overflow-hidden rounded-2xl ring-2 ring-aura/60"
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
                <div className="flex w-40 shrink-0 items-center justify-center">
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
          onClose={() => setSelectedGroup(null)}
        />
      )}
    </>
  );
}

export function StoryViewer({ group, onClose }) {
  const [idx, setIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [reacted, setReacted] = useState(null);
  const [muted, setMuted] = useState(true);
  const timerRef = useRef(null);
  const audioRef = useRef(null);
  const stories = group?.stories ?? [];
  const current = stories[idx];

  useEffect(() => {
    if (!current) return;
    storiesApi.view(current.id).catch(() => null);
    setProgress(0);
    const duration = current.media_type === "video" ? 15000 : 5000;
    const started = Date.now();
    timerRef.current = setInterval(() => {
      const p = Math.min(100, ((Date.now() - started) / duration) * 100);
      setProgress(p);
      if (p >= 100) {
        clearInterval(timerRef.current);
        if (idx + 1 < stories.length) setIdx(idx + 1);
        else onClose?.();
      }
    }, 100);
    return () => clearInterval(timerRef.current);
  }, [idx, current, stories.length, onClose]);

  // Muzyka relacji (30 s podgląd z iTunes lub biblioteka PURRE).
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (current?.music_url && !current.media_type?.includes("video")) {
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
  }, [current, muted]);

  if (!current) return null;

  const react = async (emoji) => {
    setReacted(emoji);
    storiesApi.react(current.id, emoji).catch(() => null);
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black">
      <div className="flex gap-1 px-3 pt-3">
        {stories.map((_, i) => (
          <div key={i} className="h-0.5 flex-1 overflow-hidden rounded bg-white/25">
            <div
              className="h-full bg-white transition-[width] duration-100"
              style={{ width: i < idx ? "100%" : i === idx ? `${progress}%` : "0%" }}
            />
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 px-4 py-2">
        <img src={group.author_avatar} alt="" className="h-8 w-8 rounded-full object-cover" />
        <span className="text-sm font-semibold text-white">{group.author_name}</span>
        <span className="text-[10px] text-white/60">
          {new Date(current.created_date).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })}
        </span>
        {current.music_url && (
          <button type="button" onClick={() => setMuted((m) => !m)} className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] text-white">
            {muted ? "♪ wyciszone" : "♪ gra"}
          </button>
        )}
        <button type="button" onClick={onClose} className="ml-auto grid h-8 w-8 place-items-center rounded-full bg-white/10 text-white">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="relative flex-1" onClick={() => (idx + 1 < stories.length ? setIdx(idx + 1) : onClose?.())}>
        {current.media_type === "video" ? (
          <video src={current.media_url} autoPlay playsInline className="h-full w-full object-contain" style={{ filter: filterCss(current.filter) }} />
        ) : (
          <img src={current.media_url} alt="" className="h-full w-full object-contain" style={{ filter: filterCss(current.filter) }} />
        )}
        {current.overlay_text && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6">
            <span className="rounded-lg bg-black/35 px-3 py-1.5 text-center text-base font-semibold text-white" style={{ textShadow: "0 1px 8px rgba(0,0,0,0.7)" }}>
              {current.overlay_text}
            </span>
          </div>
        )}
        {current.caption && (
          <p className="absolute bottom-20 left-0 right-0 px-6 text-center text-sm text-white drop-shadow">{current.caption}</p>
        )}
        {(current.music_title || current.music_url) && (
          <p className="absolute bottom-32 left-4 flex items-center gap-1 rounded-full bg-black/40 px-3 py-1 text-[10px] text-white">
            ♫ {current.music_title || "Muzyka"}
          </p>
        )}
      </div>

      <div className="flex items-center justify-center gap-3 pb-8">
        {["❤️", "😂", "😮", "🔥"].map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              react(emoji);
            }}
            className={cn("grid h-11 w-11 place-items-center rounded-full bg-white/10 text-xl transition", reacted === emoji && "bg-aura/40 scale-110")}
          >
            {emoji}
          </button>
        ))}
        <div className="flex items-center gap-1 rounded-full bg-white/10 px-3 py-2 text-[10px] text-white/70">
          <Send className="h-3 w-3" /> {current.views ?? 0} wyświetleń
        </div>
      </div>
    </div>
  );
}
