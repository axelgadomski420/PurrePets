import { useEffect, useState } from "react";
import { BadgeCheck, Heart, MessageCircle, Send, MapPin } from "lucide-react";
import { Image } from "@/components/ui/image";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useI18n } from "@/lib/i18n";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function PostCard({ post, demo = false }) {
  const { t } = useI18n();
  const { user, isAuthenticated, navigateToLogin } = useAuth();
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(post.likes ?? 0);
  const [comments, setComments] = useState([]);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (demo) return;
    Promise.all([
      base44.entities.Like.count({ post_id: post.id }),
      base44.entities.Comment.filter({ post_id: post.id }, { sort: "created_date", limit: 30 }),
    ])
      .then(([count, page]) => {
        setLikeCount(count ?? 0);
        setComments(page.items ?? []);
      })
      .catch(() => null);
  }, [post.id, demo]);

  useEffect(() => {
    if (demo || !user?.id) return;
    base44.entities.Like.filter({ post_id: post.id, user_id: user.id }, { limit: 1 })
      .then((page) => setLiked(!!page.items?.length))
      .catch(() => null);
  }, [post.id, demo, user?.id]);

  const toggleLike = async () => {
    if (demo) {
      setLiked((prev) => !prev);
      setLikeCount((count) => count + (liked ? -1 : 1));
      return;
    }
    if (!isAuthenticated) {
      navigateToLogin();
      return;
    }
    if (liked) {
      const page = await base44.entities.Like.filter({ post_id: post.id, user_id: user.id }, { limit: 5 });
      await Promise.all((page.items ?? []).map((item) => base44.entities.Like.delete(item.id)));
      setLiked(false);
      setLikeCount((count) => Math.max(0, count - 1));
    } else {
      await base44.entities.Like.create({ post_id: post.id, user_id: user.id });
      setLiked(true);
      setLikeCount((count) => count + 1);
    }
  };

  const addComment = async () => {
    const content = draft.trim();
    if (!content || busy) return;
    if (!isAuthenticated) {
      navigateToLogin();
      return;
    }
    setBusy(true);
    try {
      const created = await base44.entities.Comment.create({
        post_id: post.id,
        author_id: user.id,
        author_name: user.full_name || user.email,
        content,
      });
      setComments((prev) => [...prev, created]);
      setDraft("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="overflow-hidden rounded-[var(--radius)] border border-border/70 bg-card/60">
      <header className="flex items-center gap-3 px-4 py-3">
        <Image
          src={post.author_avatar || post.avatar}
          alt={post.author_name || post.author}
          className="h-10 w-10 rounded-full object-cover ring-2 ring-violet/40"
        />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-semibold">{post.author_name || post.author}</p>
            {(post.author_verified ?? post.verified) && <BadgeCheck className="h-4 w-4 shrink-0 text-aura" />}
          </div>
          <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <MapPin className="h-3 w-3" /> {post.city}
            {post.breed && (
              <>
                <span className="mx-1 opacity-40">•</span>
                {post.breed}
              </>
            )}
            {post.created_date && !demo && (
              <>
                <span className="mx-1 opacity-40">•</span>
                {timeAgo(post.created_date)}
              </>
            )}
          </p>
        </div>
      </header>

      <div className="relative bg-secondary/40">
        {post.video_url ? (
          <video
            src={post.video_url}
            className="aspect-[4/5] w-full object-cover sm:aspect-[5/4]"
            muted
            loop
            playsInline
            controls
          />
        ) : (
          <Image
            src={post.image_url || post.image}
            alt={post.caption}
            className="aspect-[4/5] w-full object-cover sm:aspect-[5/4]"
            originWidth={1200}
            originHeight={1500}
          />
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/55 to-transparent" />
      </div>

      <div className="px-4 pb-4 pt-3">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={toggleLike}
            className="flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground"
            aria-pressed={liked}
            aria-label={t("feed.likes")}
          >
            <Heart className={cn("h-5 w-5 transition", liked && "fill-destructive text-destructive")} />
            <span className={cn(liked && "text-foreground")}>{likeCount}</span>
          </button>
          <button
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            className="flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground"
          >
            <MessageCircle className="h-5 w-5" />
            {comments.length || post.comments || 0}
          </button>
          <button
            type="button"
            className="ml-auto text-muted-foreground transition hover:text-foreground"
            aria-label="Udostępnij"
          >
            <Send className="h-[18px] w-[18px]" />
          </button>
        </div>

        <p className="mt-3 text-[13px] leading-relaxed text-foreground/90">{post.caption}</p>

        {post.tags?.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {post.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-border/70 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}

        {open && (
          <div className="mt-3 rounded-xl border border-border/60 bg-background/40 p-3">
            {comments.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">{t("feed.noComments")}</p>
            ) : (
              <ul className="max-h-52 space-y-2 overflow-y-auto pr-1">
                {comments.map((comment) => (
                  <li key={comment.id} className="text-[12px] leading-relaxed">
                    <span className="font-semibold">{comment.author_name}</span>{" "}
                    <span className="text-foreground/85">{comment.content}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-2 flex items-center gap-2">
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") addComment();
                }}
                placeholder={t("feed.addComment")}
                className="h-9 flex-1 rounded-lg border border-border/60 bg-transparent px-3 text-xs outline-none placeholder:text-muted-foreground/70 focus:border-violet/60"
              />
              <button
                type="button"
                onClick={addComment}
                disabled={busy || !draft.trim()}
                className="rounded-lg bg-foreground px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-background disabled:opacity-50"
              >
                {t("common.send")}
              </button>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}
