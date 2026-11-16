import { useEffect, useState } from "react";
import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { ArrowLeft, Users, Send } from "lucide-react";
import { toast } from "sonner";
import TopBar from "@/components/layout/TopBar";
import { groupsApi } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { formatNumber, timeAgo } from "@/lib/format";
import { AuthGateError, requireSignedIn } from "@/components/auth/AuthGate";

export const Route = createFileRoute("/_app/community/$id")({
  ssr: false,
  beforeLoad: requireSignedIn,
  errorComponent: AuthGateError,
  head: () => ({ meta: [{ title: "PURRE PETS — grupa" }] }),
  component: GroupPage,
});

function GroupPage() {
  const { id } = useParams({ from: "/_app/community/$id" });
  const navigate = useNavigate();
  const { isAuthenticated, navigateToLogin } = useAuth();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [caption, setCaption] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const result = await groupsApi.get(id);
      setData(result);
    } catch (error) {
      setData(null);
      toast.error(error?.message || "Nie udało się otworzyć grupy.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [id]);

  const toggleMembership = async () => {
    if (!isAuthenticated) {
      navigateToLogin();
      return;
    }
    if (!data?.group || busy) return;

    setBusy(true);
    try {
      const result = data.joined
        ? await groupsApi.leave(id)
        : await groupsApi.join(id);

      setData((current) => current ? ({
        ...current,
        joined: result.joined,
        group: {
          ...current.group,
          members_count: result.members_count,
        },
      }) : current);

      toast.success(result.joined ? "Dołączono do grupy." : "Opuszczono grupę.");
    } catch (error) {
      toast.error(error?.message || "Nie udało się zmienić członkostwa.");
    } finally {
      setBusy(false);
    }
  };

  const publishPost = async (event) => {
    event.preventDefault();
    const text = caption.trim();

    if (!text || busy) return;
    if (!isAuthenticated) {
      navigateToLogin();
      return;
    }
    if (!data?.joined) {
      toast.error("Dołącz do grupy, aby publikować.");
      return;
    }

    setBusy(true);
    try {
      const post = await groupsApi.post(id, { caption: text });
      setData((current) => current ? ({
        ...current,
        posts: [post, ...(current.posts || [])],
      }) : current);
      setCaption("");
      toast.success("Post opublikowany w grupie.");
    } catch (error) {
      toast.error(error?.message || "Nie udało się opublikować postu.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Ładowanie grupy…</div>;
  }

  if (!data?.group) {
    return (
      <div className="p-6">
        <button type="button" onClick={() => navigate({ to: "/community" })}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <ArrowLeft className="h-4 w-4" /> Wróć do społeczności
        </button>
        <p className="mt-6 text-sm text-muted-foreground">Nie znaleziono grupy.</p>
      </div>
    );
  }

  const { group, posts = [], joined, is_group_admin } = data;

  return (
    <div className="min-h-screen pb-12">
      <TopBar title="Grupa społeczności" />

      <div className="mx-auto max-w-4xl px-4 pt-5 lg:px-8">
        <button type="button" onClick={() => navigate({ to: "/community" })}
          className="mb-4 inline-flex min-h-9 items-center gap-2 text-xs text-muted-foreground">
          <ArrowLeft className="h-4 w-4" /> Wszystkie grupy
        </button>

        <section className="overflow-hidden rounded-2xl border border-border/70 bg-card/70">
          <div className="h-24 bg-gradient-to-r from-violet/30 via-fuchsia-500/20 to-aura/20 sm:h-36" />
          <div className="p-4 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  {group.type === "breed" ? "Grupa rasowa" : group.type === "regional" ? "Grupa regionalna" : "Grupa tematyczna"}
                  {group.breed ? ` · ${group.breed}` : ""}
                  {group.city ? ` · ${group.city}` : ""}
                </p>
                <h1 className="mt-2 break-words font-display text-2xl sm:text-3xl">{group.name}</h1>
                {group.description && (
                  <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">{group.description}</p>
                )}
                <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                  <Users className="h-4 w-4" />
                  {formatNumber(group.members_count || 0)} członków
                </p>
              </div>

              <button type="button" onClick={toggleMembership} disabled={busy}
                className="btn-aura min-h-10 rounded-xl px-4 py-2 text-xs disabled:opacity-50">
                {busy ? "Proszę czekać…" : joined ? "Opuść grupę" : "Dołącz do grupy"}
              </button>
            </div>
            {is_group_admin && (
              <p className="mt-3 text-[10px] font-semibold uppercase tracking-wider text-aura">
                Administrator grupy
              </p>
            )}
          </div>
        </section>

        {joined && (
          <form onSubmit={publishPost}
            className="mt-5 space-y-3 rounded-2xl border border-border/70 bg-card/60 p-4">
            <label className="block text-xs font-semibold text-muted-foreground">
              Napisz post w grupie
              <textarea value={caption} onChange={(event) => setCaption(event.target.value)}
                rows={3} maxLength={4000} placeholder="Podziel się informacją z członkami grupy…"
                className="mt-2 w-full resize-y rounded-xl border border-border bg-background p-3 text-sm text-foreground outline-none focus:border-violet" />
            </label>
            <button type="submit" disabled={busy || !caption.trim()}
              className="btn-aura inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 py-2 text-xs disabled:opacity-50">
              <Send className="h-4 w-4" /> Opublikuj
            </button>
          </form>
        )}

        <div className="mt-6">
          <h2 className="font-display text-xl">Dyskusje grupy</h2>
          {!posts.length ? (
            <p className="mt-3 rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">
              Nie ma jeszcze postów. Dołącz do grupy i rozpocznij pierwszą dyskusję.
            </p>
          ) : (
            <div className="mt-3 space-y-3">
              {posts.map((post) => (
                <article key={post.id}
                  className="rounded-xl border border-border/70 bg-card/60 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold">{post.author_name || "Użytkownik PURRE PETS"}</p>
                    <time className="text-[10px] text-muted-foreground">
                      {post.created_date ? timeAgo(post.created_date) : ""}
                    </time>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed">{post.caption}</p>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
