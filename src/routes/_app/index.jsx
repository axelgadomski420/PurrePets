import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { CalendarDays, Film, Plus, ShieldCheck, Users } from "lucide-react";
import TopBar from "@/components/layout/TopBar";
import { StoriesBar } from "@/components/stories/StoriesBar";
import PostCard from "@/components/feed/PostCard";
import DiscoverRail from "@/components/discover/DiscoverRail";
import AdSenseUnit from "@/components/ads/AdSenseUnit";
import { useAds } from "@/hooks/useAds";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useI18n } from "@/lib/i18n";
import { SAMPLE_BREEDERS, SAMPLE_POSTS } from "@/data/sample";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/")({
  head: () => ({
    meta: [
      { title: "PURRE PETS — PurreFeed" },
      {
        name: "description",
        content:
          "PurreFeed PURRE PETS — najlepsze momenty z polskich hodowli psów i kotów rasowych.",
      },
    ],
  }),
  component: DiscoverPage,
});

function DiscoverPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const { mix } = useAds();
  const [tab, setTab] = useState("forYou");
  const [posts, setPosts] = useState([]);
  const [breeders, setBreeders] = useState([]);
  const [followingIds, setFollowingIds] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([
      base44.entities.Post.filter({ status: "published" }, { sort: "-created_date", limit: 20 }),
      base44.entities.Profile.list({ sort: "-followers", limit: 8 }),
    ])
      .then(([postPage, profilePage]) => {
        if (!active) return;
        setPosts(postPage.items ?? []);
        setBreeders(profilePage.items ?? []);
      })
      .catch(() => null)
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;
    base44.entities.Follow.filter({ follower_id: user.id }, { limit: 200 })
      .then((page) => setFollowingIds((page.items ?? []).map((item) => item.following_id)))
      .catch(() => null);
  }, [isAuthenticated, user?.id]);

  const isDemo = !loading && posts.length === 0;
  const visiblePosts = useMemo(() => {
    if (isDemo) return SAMPLE_POSTS;
    if (tab === "following") return posts.filter((post) => followingIds.includes(post.author_id));
    return posts;
  }, [isDemo, posts, tab, followingIds]);

  // Reklamy wplecione w feed (co kilka postów) — PREMIUM ich nie widzi.
  const feedRows = useMemo(() => mix(visiblePosts, "feed", "feed"), [mix, visiblePosts]);

  const storyBreeders = breeders.length
    ? breeders.map((profile) => ({
        id: profile.id,
        name: profile.kennel_name || profile.display_name,
        handle: profile.handle || profile.display_name,
        avatar: profile.avatar_url || SAMPLE_BREEDERS[0].avatar,
        verified: profile.verified,
        breed: profile.breeds?.[0] ?? "",
        city: profile.city ?? "",
      }))
    : SAMPLE_BREEDERS;

  return (
    <div>
      <TopBar />
      <div className="flex gap-8 px-4 pb-10 pt-6 lg:px-8">
        <div className="min-w-0 flex-1">
          <div className="fade-up">
            <p className="text-[10px] uppercase tracking-[0.4em] text-muted-foreground">purre pets</p>
            <h1 className="mt-2 font-display text-4xl leading-none tracking-tight sm:text-5xl">
              <span className="aura-text">PurreFeed</span>
            </h1>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">{t("feed.subtitle")}</p>
          </div>

          <div className="mt-5 flex items-center gap-2">
            {[
              { id: "forYou", label: t("feed.forYou") },
              { id: "following", label: t("feed.following") },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={cn(
                  "rounded-full px-4 py-1.5 text-xs font-medium transition",
                  tab === item.id
                    ? "bg-foreground text-background"
                    : "border border-border/70 text-muted-foreground hover:text-foreground"
                )}
              >
                {item.label}
              </button>
            ))}
            <Link
              to="/reels"
              className="ml-auto flex items-center gap-1.5 rounded-full border border-aura/50 bg-aura/10 px-3 py-1.5 text-xs font-medium text-aura transition hover:bg-aura/20"
            >
              <Film className="h-3.5 w-3.5" /> Reels
            </Link>
            <button
              type="button"
              onClick={() => navigate({ to: "/create" })}
              className="flex items-center gap-1.5 rounded-full border border-violet/50 bg-violet/10 px-3 py-1.5 text-xs font-medium text-violet transition hover:bg-violet/20"
            >
              <Plus className="h-3.5 w-3.5" /> {t("nav.add")}
            </button>
          </div>

          <div className="mt-4 flex gap-2 overflow-x-auto pb-1 lg:hidden">
            {[
              { to: "/events", label: "Wydarzenia", icon: CalendarDays },
              { to: "/community", label: "Społeczność", icon: Users },
              { to: "/video-editor", label: "Edytor", icon: Film },
              { to: "/verify", label: "Weryfikacja", icon: ShieldCheck },
            ]
              .filter((item) =>
                isAuthenticated || !["/events", "/community"].includes(item.to)
              )
              .map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border/70 px-3 py-1.5 text-[11px] text-muted-foreground"
              >
                <item.icon className="h-3.5 w-3.5" />
                {item.label}
              </Link>
            ))}
          </div>

          <div className="mt-6">
            <StoriesBar />
          </div>

          {isDemo && (
            <p className="mb-4 rounded-xl border border-aura/30 bg-aura/5 px-3 py-2 text-[11px] text-muted-foreground">
              Przykładowe treści — dodaj pierwszy post, aby PurreFeed zaczął żyć Twoją hodowlą.
            </p>
          )}

          {loading ? (
            <div className="space-y-4">
              {Array.from({ length: 2 }).map((_, index) => (
                <div key={index} className="h-80 animate-pulse rounded-[var(--radius)] bg-secondary/40" />
              ))}
            </div>
          ) : feedRows.length === 0 ? (
            <div className="rounded-[var(--radius)] border border-dashed border-border/70 p-10 text-center">
              <p className="text-sm text-muted-foreground">
                {tab === "following" ? "Obserwuj hodowle, aby zobaczyć ich posty." : t("common.empty")}
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {feedRows.map((row, index) =>
                row?.type === "ad" ? (
                  <AdSenseUnit key={row.id} slotName="feed" format="auto" className="w-full" />
                ) : (
                  <PostCard key={row?.data?.id ?? index} post={row?.data} demo={isDemo} />
                )
              )}
            </div>
          )}
        </div>

        <DiscoverRail breeders={storyBreeders} onNavigate={(path) => navigate({ to: path })} />
      </div>
    </div>
  );
}
