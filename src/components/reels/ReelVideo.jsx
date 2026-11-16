import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { BadgeCheck, Heart, Loader2, MapPin, MessageCircle, Share2, Volume2, VolumeX, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { openConversation } from "@/lib/conversations";
import { cn } from "@/lib/utils";

/**
 * ReelVideo — odtwarzacz w stylu TikToka:
 *  • autoodtwarzanie przez IntersectionObserver (60% widoczności),
 *  • preload=auto dla aktywnego wideo, buforowanie i spinner,
 *  • podwójne tapnięcie = polubienie z animacją serca,
 *  • pasek postępu, wyciszanie, udostępnianie.
 */
export default function ReelVideo({ post, onDeleted }) {
  const { user, isAuthenticated, navigateToLogin } = useAuth();
  const navigate = useNavigate();
  const sectionRef = useRef(null);
  const videoRef = useRef(null);
  const lastTapRef = useRef(0);
  const [active, setActive] = useState(false);
  const [muted, setMuted] = useState(true);
  const [buffering, setBuffering] = useState(true);
  const [progress, setProgress] = useState(0);
  const [liked, setLiked] = useState(false);
  const [likes, setLikes] = useState(post.likes ?? 0);
  const [burst, setBurst] = useState(false);
  const [starting, setStarting] = useState(false);
  const [removed, setRemoved] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const actionLockRef = useRef(false);
  const [displayCaption, setDisplayCaption] = useState(post.caption || "");
  const [displayTags, setDisplayTags] = useState(
    Array.isArray(post.tags) ? post.tags : []
  );
  const canManage = isAuthenticated &&
    (post.author_id === user?.id || post.created_by_id === user?.id);

  useEffect(() => {
    const element = sectionRef.current;
    if (!element) return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => setActive(entry.isIntersecting && entry.intersectionRatio > 0.6),
      { threshold: [0, 0.6, 1] }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (active) {
      video.play().catch(() => null);
    } else {
      video.pause();
      video.currentTime = 0;
    }
  }, [active]);

  const toggleLike = async (silent = false) => {
    if (!isAuthenticated) {
      navigateToLogin();
      return;
    }
    if (liked) {
      if (silent) return;
      const page = await base44.entities.Like.filter({ post_id: post.id, user_id: user.id }, { limit: 5 });
      await Promise.all((page.items ?? []).map((item) => base44.entities.Like.delete(item.id)));
      setLiked(false);
      setLikes((value) => Math.max(0, value - 1));
    } else {
      await base44.entities.Like.create({ post_id: post.id, user_id: user.id });
      setLiked(true);
      setLikes((value) => value + 1);
      setBurst(true);
      setTimeout(() => setBurst(false), 600);
    }
  };

  const onVideoTap = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      lastTapRef.current = 0;
      if (!liked) toggleLike(true);
      setBurst(true);
      setTimeout(() => setBurst(false), 600);
    } else {
      lastTapRef.current = now;
    }
  };

  const share = async () => {
    const url = `${window.location.origin}/reels?post=${post.id}`;
    try {
      if (navigator.share) await navigator.share({ title: "PURRE PETS", url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success("Link skopiowany");
      }
    } catch { /* Użytkownik może anulować systemowe udostępnianie. */ }
  };

  const editReel = async () => {
    if (!canManage || actionLockRef.current || removed) return;

    actionLockRef.current = true;
    setActionBusy(true);

    try {
      const caption = window.prompt(
        "Edytuj opis rolki:",
        displayCaption
      );
      if (caption === null) return;

      const tagsInput = window.prompt(
        "Hashtagi oddzielone przecinkami:",
        displayTags.join(", ")
      );
      if (tagsInput === null) return;

      const cleanCaption = caption.trim();
      const tags = tagsInput
        .split(",")
        .map((tag) => tag.trim().replace(/^#/, ""))
        .filter(Boolean)
        .slice(0, 30);

      await base44.entities.Post.update(post.id, {
        caption: cleanCaption,
        tags,
      });

      setDisplayCaption(cleanCaption);
      setDisplayTags(tags);
      toast.success("Rolka została zaktualizowana.");
    } catch (error) {
      toast.error(error?.message || "Nie udało się edytować rolki.");
    } finally {
      actionLockRef.current = false;
      setActionBusy(false);
    }
  };

  const deleteReel = async () => {
    if (!canManage || actionLockRef.current || removed) return;

    actionLockRef.current = true;
    setActionBusy(true);

    try {
      if (!window.confirm("Usunąć tę rolkę? Tej operacji nie można cofnąć.")) {
        return;
      }

      await base44.entities.Post.delete(post.id);
      setRemoved(true);
      onDeleted?.(post.id);
      toast.success("Rolka została usunięta.");
    } catch (error) {
      toast.error(error?.message || "Nie udało się usunąć rolki.");
    } finally {
      actionLockRef.current = false;
      setActionBusy(false);
    }
  };

  const message = async () => {
    if (!isAuthenticated) {
      navigateToLogin();
      return;
    }
    if (!post.author_id || post.author_id === user?.id) return;
    setStarting(true);
    try {
      const conversation = await openConversation({
        me: user,
        otherId: post.author_id,
        otherName: post.author_name,
      });
      if (conversation) navigate({ to: "/messages/$id", params: { id: conversation.id } });
    } finally {
      setStarting(false);
    }
  };

  if (removed) return null;

  return (
    <section ref={sectionRef} className="relative h-full w-full snap-start snap-always overflow-hidden bg-black">
      <video
        ref={videoRef}
        src={post.video_url}
        className="h-full w-full object-cover"
        loop
        playsInline
        muted={muted}
        preload={active ? "auto" : "metadata"}
        onWaiting={() => setBuffering(true)}
        onPlaying={() => setBuffering(false)}
        onLoadedData={() => setBuffering(false)}
        onTimeUpdate={(e) => {
          const v = e.currentTarget;
          if (v.duration) setProgress((v.currentTime / v.duration) * 100);
        }}
        onClick={onVideoTap}
      />

      {buffering && (
        <div className="absolute inset-0 grid place-items-center">
          <Loader2 className="h-8 w-8 animate-spin text-white/70" />
        </div>
      )}

      {burst && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <Heart className="h-24 w-24 animate-ping fill-destructive text-destructive opacity-80" />
        </div>
      )}

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-black/40" />

      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/15">
        <div className="h-full bg-aura transition-[width] duration-150" style={{ width: `${progress}%` }} />
      </div>

      <div className="absolute inset-x-0 bottom-0 flex items-end gap-3 p-4 pb-6">
        <div className="min-w-0 flex-1 text-white">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <span className="truncate">{post.author_name || "Hodowca PURRE"}</span>
            {post.author_verified && <BadgeCheck className="h-4 w-4 shrink-0 text-aura" />}
          </p>
          <p className="mt-1 line-clamp-3 text-[12px] leading-relaxed text-white/85">{displayCaption}</p>
          <p className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-white/60">
            {post.city && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" /> {post.city}
              </span>
            )}
            {post.breed && <span>{post.breed}</span>}
          </p>
          {displayTags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {displayTags.map((tag) => (
                <span key={tag} className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/80">
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col items-center gap-3">
          <button type="button" onClick={() => toggleLike()} className="flex flex-col items-center gap-1 text-white" aria-pressed={liked} aria-label="Polub">
            <span className={cn("grid h-11 w-11 place-items-center rounded-full bg-black/40 backdrop-blur transition", liked && "scale-110")}>
              <Heart className={cn("h-5 w-5 transition", liked && "fill-destructive text-destructive")} />
            </span>
            <span className="text-[10px]">{likes}</span>
          </button>

          <button type="button" onClick={message} disabled={starting} className="flex flex-col items-center gap-1 text-white disabled:opacity-60" aria-label="Napisz wiadomość">
            <span className="grid h-11 w-11 place-items-center rounded-full bg-black/40 backdrop-blur">
              <MessageCircle className="h-5 w-5" />
            </span>
            <span className="text-[10px]">Napisz</span>
          </button>

          <button type="button" onClick={share} className="flex flex-col items-center gap-1 text-white" aria-label="Udostępnij">
            <span className="grid h-11 w-11 place-items-center rounded-full bg-black/40 backdrop-blur">
              <Share2 className="h-5 w-5" />
            </span>
            <span className="text-[10px]">Udostępnij</span>
          </button>

          {canManage && (
            <>
              <button type="button" onClick={editReel}
                disabled={actionBusy}
                className="grid h-11 w-11 place-items-center rounded-full bg-black/40 text-white backdrop-blur disabled:opacity-50"
                aria-label="Edytuj rolkę" aria-busy={actionBusy}>
                <Pencil className="h-5 w-5" />
              </button>
              <button type="button" onClick={deleteReel}
                disabled={actionBusy}
                className="grid h-11 w-11 place-items-center rounded-full bg-black/40 text-white backdrop-blur disabled:opacity-50"
                aria-label="Usuń rolkę" aria-busy={actionBusy}>
                <Trash2 className="h-5 w-5" />
              </button>
            </>
          )}
          <button type="button" onClick={() => setMuted((value) => !value)} className="grid h-11 w-11 place-items-center rounded-full bg-black/40 text-white backdrop-blur" aria-label={muted ? "Włącz dźwięk" : "Wycisz"}>
            {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </button>
        </div>
      </div>
    </section>
  );
}
