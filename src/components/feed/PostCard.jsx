import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { BadgeCheck, Heart, MessageCircle, Send, MapPin, Pencil, Trash2 } from "lucide-react";
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
  const [commentLikes, setCommentLikes] = useState({});
  const [commentLikeCounts, setCommentLikeCounts] = useState({});
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [removed, setRemoved] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editCaption, setEditCaption] = useState(post.caption || "");
  const [editTags, setEditTags] = useState((post.tags || []).join(", "));
  const [displayCaption, setDisplayCaption] = useState(post.caption || "");
  const [displayTags, setDisplayTags] = useState(
    Array.isArray(post.tags) ? post.tags : []
  );
  const mutationLockRef = useRef(false);
  const commentLikeLocksRef = useRef(new Set());
  const canManage = !demo && isAuthenticated &&
    (post.author_id === user?.id || post.created_by_id === user?.id);

  useEffect(() => {
    if (demo) return;
    Promise.all([
      base44.entities.Like.count({ post_id: post.id }),
      base44.entities.Comment.filter({ post_id: post.id }, { sort: "created_date", limit: 30 }),
    ])
      .then(([count, page]) => {
        const loadedComments = page.items ?? [];
        setLikeCount(count ?? 0);
        setComments(loadedComments);

        if (loadedComments.length === 0) {
          setCommentLikes({});
          setCommentLikeCounts({});
          return;
        }

        const commentKeys = loadedComments.map((comment) => `comment:${comment.id}`);

        Promise.all([
          fetch(
            `/api/social/comment-likes?ids=${encodeURIComponent(
              loadedComments.map((comment) => comment.id).join(",")
            )}`,
            { credentials: "include" }
          ).then(async (response) => {
            if (!response.ok) {
              throw new Error("Nie udało się pobrać liczników polubień.");
            }
            const data = await response.json();
            return data.counts ?? {};
          }),
          user?.id
            ? base44.entities.Like.filter(
                { post_id: { $in: commentKeys }, user_id: user.id },
                { limit: 200 }
              )
            : Promise.resolve({ items: [] }),
        ])
          .then(([counts, likesPage]) => {
            setCommentLikeCounts(counts ?? {});

            const likedKeys = new Set(
              (likesPage.items ?? []).map((like) => like.post_id)
            );
            const next = {};
            for (const comment of loadedComments) {
              if (likedKeys.has(`comment:${comment.id}`)) {
                next[comment.id] = true;
              }
            }
            setCommentLikes(next);
          })
          .catch(() => {
            setCommentLikes({});
            setCommentLikeCounts({});
          });
      })
      .catch(() => null);
  }, [post.id, demo, user?.id]);

  useEffect(() => {
    if (demo || !user?.id) return;
    base44.entities.Like.filter({ post_id: post.id, user_id: user.id }, { limit: 1 })
      .then((page) => setLiked(!!page.items?.length))
      .catch(() => null);
  }, [post.id, demo, user?.id]);

  const toggleLike = async () => {
    if (!isAuthenticated) {
      navigateToLogin();
      return;
    }
    if (demo) {
      setLiked((prev) => !prev);
      setLikeCount((count) => count + (liked ? -1 : 1));
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

  const toggleCommentLike = async (comment) => {
    if (!isAuthenticated) {
      navigateToLogin();
      return;
    }

    if (commentLikeLocksRef.current.has(comment.id)) return;
    commentLikeLocksRef.current.add(comment.id);

    const likeKey = `comment:${comment.id}`;
    const wasLiked = !!commentLikes[comment.id];

    try {
      if (wasLiked) {
        const page = await base44.entities.Like.filter(
          { post_id: likeKey, user_id: user.id },
          { limit: 5 }
        );
        await Promise.all(
          (page.items ?? []).map((item) => base44.entities.Like.delete(item.id))
        );
        setCommentLikes((prev) => ({ ...prev, [comment.id]: false }));
        setCommentLikeCounts((prev) => ({
          ...prev,
          [comment.id]: Math.max(0, (prev[comment.id] ?? 0) - 1),
        }));
      } else {
        await base44.entities.Like.create({
          post_id: likeKey,
          user_id: user.id,
        });
        setCommentLikes((prev) => ({ ...prev, [comment.id]: true }));
        setCommentLikeCounts((prev) => ({
          ...prev,
          [comment.id]: (prev[comment.id] ?? 0) + 1,
        }));
      }
    } catch (error) {
      toast.error(error?.message || "Nie udało się polubić komentarza.");
    } finally {
      commentLikeLocksRef.current.delete(comment.id);
    }
  };

  const sharePost = async () => {
    const url = post.video_url || post.image_url || post.image || window.location.href;
    const payload = {
      title: (post.caption || "PURRE PETS").slice(0, 100),
      text: post.caption || "Zobacz post w PURRE PETS",
      url,
    };

    try {
      if (navigator.share) {
        await navigator.share(payload);
        return;
      }
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        toast.success("Link do materiału skopiowany.");
        return;
      }
      window.prompt("Skopiuj link do materiału:", url);
    } catch (error) {
      if (error?.name !== "AbortError") {
        toast.error("Nie udało się udostępnić materiału.");
      }
    }
  };

  const savePost = async () => {
    if (!canManage || busy || mutationLockRef.current || removed) return;

    mutationLockRef.current = true;
    setBusy(true);
    try {
      const cleanCaption = editCaption.trim();
      const tags = editTags.split(",")
        .map((tag) => tag.trim().replace(/^#/, ""))
        .filter(Boolean).slice(0, 30);

      await base44.entities.Post.update(post.id, {
        caption: cleanCaption,
        tags,
      });

      setDisplayCaption(cleanCaption);
      setDisplayTags(tags);
      setEditCaption(cleanCaption);
      setEditTags(tags.join(", "));
      setEditing(false);
      toast.success("Post został zaktualizowany.");
    } catch (error) {
      toast.error(error?.message || "Nie udało się zapisać zmian.");
    } finally {
      mutationLockRef.current = false;
      setBusy(false);
    }
  };

  const deletePost = async () => {
    if (!canManage || busy || mutationLockRef.current || removed) return;

    if (!window.confirm("Czy na pewno usunąć ten post? Tej operacji nie można cofnąć.")) {
      return;
    }

    mutationLockRef.current = true;
    setBusy(true);
    try {
      await base44.entities.Post.delete(post.id);
      setRemoved(true);
      toast.success("Post został usunięty.");
    } catch (error) {
      toast.error(error?.message || "Nie udało się usunąć postu.");
    } finally {
      mutationLockRef.current = false;
      setBusy(false);
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

  if (removed) return null;

  return (
    <article className="overflow-hidden rounded-[var(--radius)] border border-border/70 bg-card/60">
      <header className="flex items-center gap-3 px-4 py-3">
        {post.author_id && !demo ? (
          <Link
            to="/profile/$id"
            params={{ id: post.author_id }}
            aria-label={`Otwórz profil: ${post.author_name || post.author}`}
            className="shrink-0 rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-aura"
          >
            <Image
              src={post.author_avatar || post.avatar}
              alt={post.author_name || post.author}
              className="h-10 w-10 rounded-full object-cover ring-2 ring-violet/40"
            />
          </Link>
        ) : (
          <Image
            src={post.author_avatar || post.avatar}
            alt={post.author_name || post.author}
            className="h-10 w-10 rounded-full object-cover ring-2 ring-violet/40"
          />
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            {post.author_id && !demo ? (
              <Link
                to="/profile/$id"
                params={{ id: post.author_id }}
                className="truncate text-sm font-semibold hover:text-aura"
              >
                {post.author_name || post.author}
              </Link>
            ) : (
              <p className="truncate text-sm font-semibold">{post.author_name || post.author}</p>
            )}
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
            onClick={sharePost}
            className="ml-auto text-muted-foreground transition hover:text-foreground"
            aria-label="Udostępnij"
          >
            <Send className="h-[18px] w-[18px]" />
          </button>
          {canManage && (
            <>
              <button type="button"
                onClick={() => {
                  setEditCaption(displayCaption);
                  setEditTags(displayTags.join(", "));
                  setEditing((value) => !value);
                }}
                disabled={busy}
                className="text-muted-foreground hover:text-foreground disabled:opacity-50"
                aria-label="Edytuj post">
                <Pencil className="h-4 w-4" />
              </button>
              <button type="button" onClick={deletePost} disabled={busy}
                className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                aria-label="Usuń post">
                <Trash2 className="h-4 w-4" />
              </button>
            </>
          )}
        </div>

        {editing && canManage && (
          <div className="mt-3 space-y-2 rounded-xl border border-border/70 bg-background/60 p-3">
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Opis
            </label>
            <textarea value={editCaption} onChange={(event) => setEditCaption(event.target.value)}
              rows={3} maxLength={4000}
              className="w-full resize-y rounded-lg border border-border/70 bg-background p-2 text-sm outline-none focus:border-violet" />
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Hashtagi — oddziel przecinkami
            </label>
            <input value={editTags} onChange={(event) => setEditTags(event.target.value)}
              maxLength={500} placeholder="psy, koty, hodowla"
              className="h-10 w-full rounded-lg border border-border/70 bg-background px-3 text-sm outline-none focus:border-violet" />
            <div className="flex gap-2">
              <button type="button" onClick={savePost} disabled={busy}
                className="btn-aura rounded-lg px-4 py-2 text-xs disabled:opacity-50">
                {busy ? "Zapisywanie…" : "Zapisz"}
              </button>
              <button type="button" onClick={() => setEditing(false)}
                disabled={busy}
                className="rounded-lg border border-border px-4 py-2 text-xs disabled:opacity-50">
                Anuluj
              </button>
            </div>
          </div>
        )}
        <p className="mt-3 text-[13px] leading-relaxed text-foreground/90">{displayCaption}</p>

        {displayTags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {displayTags.map((tag) => (
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
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <span className="font-semibold">{comment.author_name}</span>{" "}
                        <span className="text-foreground/85">{comment.content}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleCommentLike(comment)}
                        className="shrink-0 rounded-full p-1 text-muted-foreground transition hover:text-destructive"
                        aria-pressed={!!commentLikes[comment.id]}
                        aria-label={commentLikes[comment.id] ? "Cofnij polubienie komentarza" : "Polub komentarz"}
                        title={commentLikes[comment.id] ? "Cofnij polubienie" : "Polub komentarz"}
                      >
                        <Heart className={cn(
                          "h-4 w-4 transition",
                          commentLikes[comment.id] && "fill-destructive text-destructive"
                        )} />
                        <span className="ml-1 text-[10px] tabular-nums text-muted-foreground">
                          {commentLikeCounts[comment.id] ?? 0}
                        </span>
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {isAuthenticated ? (
              <div className="mt-2 flex items-center gap-2">
                <input
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") addComment();
                  }}
                  placeholder={t("feed.addComment")}
                  className="h-9 min-w-0 flex-1 rounded-lg border border-border/60 bg-transparent px-3 text-xs outline-none placeholder:text-muted-foreground/70 focus:border-violet/60"
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
            ) : (
              <button
                type="button"
                onClick={navigateToLogin}
                className="mt-2 w-full rounded-lg border border-border/70 px-3 py-2 text-xs font-medium text-muted-foreground transition hover:text-foreground"
              >
                Zaloguj się, aby dodać komentarz
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
