import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { BadgeCheck, Crown, Globe, Instagram, MapPin, MessageCircle, Music2 } from "lucide-react";
import TopBar from "@/components/layout/TopBar";
import { Image } from "@/components/ui/image";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useI18n } from "@/lib/i18n";
import { formatNumber } from "@/lib/format";
import { openConversation } from "@/lib/conversations";

export const Route = createFileRoute("/_app/profile/$id")({
  head: () => ({ meta: [{ title: "PURRE PETS — hodowla" }] }),
  component: PublicProfilePage,
});

function PublicProfilePage() {
  const { id } = useParams({ from: "/_app/profile/$id" });
  const { t } = useI18n();
  const { user, isAuthenticated, navigateToLogin } = useAuth();
  const navigate = useNavigate();
  const [starting, setStarting] = useState(false);
  const [profile, setProfile] = useState(null);
  const [listings, setListings] = useState([]);
  const [posts, setPosts] = useState([]);
  const [pets, setPets] = useState([]);
  const [followers, setFollowers] = useState(0);
  const [following, setFollowing] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([base44.entities.Profile.get(id)])
      .then(([record]) => {
        setProfile(record);
        return Promise.all([
          base44.entities.Listing.filter({ seller_id: record.user_id }, { sort: "-created_date", limit: 12 }),
          base44.entities.Pet.filter({ owner_id: record.user_id }, { limit: 12 }),
          base44.entities.Follow.count({ following_id: record.user_id }),
          base44.entities.Post.filter({ author_id: record.user_id, status: "published" }, { sort: "-created_date", limit: 12 }),
        ]);
      })
      .then(([listingPage, petPage, followCount, postPage]) => {
        setListings(listingPage.items ?? []);
        setPets(petPage.items ?? []);
        setFollowers(followCount ?? 0);
        setPosts(postPage.items ?? []);
      })
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!user?.id || !profile?.user_id) return;
    base44.entities.Follow.filter({ follower_id: user.id, following_id: profile.user_id }, { limit: 1 }).then(
      (page) => setFollowing(!!page.items?.length)
    );
  }, [user?.id, profile?.user_id]);

  const toggleFollow = async () => {
    if (!isAuthenticated) {
      navigateToLogin();
      return;
    }
    if (following) {
      const page = await base44.entities.Follow.filter(
        { follower_id: user.id, following_id: profile.user_id },
        { limit: 5 }
      );
      await Promise.all((page.items ?? []).map((item) => base44.entities.Follow.delete(item.id)));
      setFollowing(false);
      setFollowers((value) => Math.max(0, value - 1));
    } else {
      await base44.entities.Follow.create({
        follower_id: user.id,
        following_id: profile.user_id,
        following_name: profile.display_name,
      });
      setFollowing(true);
      setFollowers((value) => value + 1);
    }
  };

  const startChat = async () => {
    if (!isAuthenticated) {
      navigateToLogin();
      return;
    }
    setStarting(true);
    try {
      const conversation = await openConversation({
        me: user,
        otherId: profile.user_id,
        otherName: profile.kennel_name || profile.display_name,
      });
      if (conversation) navigate({ to: "/messages/$id", params: { id: conversation.id } });
    } finally {
      setStarting(false);
    }
  };

  if (loading) return <div className="p-6 text-sm text-muted-foreground">{t("common.loading")}</div>;
  if (!profile) return <div className="p-6 text-sm text-muted-foreground">{t("common.empty")}</div>;

  const socials = [
    { url: profile.website_url, label: "Strona", Icon: Globe },
    { url: profile.instagram_url, label: "Instagram", Icon: Instagram },
    { url: profile.tiktok_url, label: "TikTok", Icon: Music2 },
  ].filter((s) => s.url);
  const gallery = (profile.gallery_urls ?? []).slice(0, 12);

  return (
    <div>
      <TopBar />
      <div className="px-4 pb-12 pt-6 lg:px-8">
        <div className="relative overflow-hidden rounded-[var(--radius)] border border-border/70">
          <Image src={profile.cover_url} alt="" className="h-32 w-full object-cover sm:h-44" />
          <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent" />
        </div>

        <div className="-mt-10 flex items-end gap-4 px-2">
          <span className="rounded-full bg-gradient-to-br from-violet to-aura p-[2px]">
            <span className="block rounded-full bg-background p-1">
              <Image src={profile.avatar_url} alt={profile.display_name} className="h-20 w-20 rounded-full object-cover" />
            </span>
          </span>
          <div className="min-w-0 flex-1 pb-1">
            <h1 className="flex items-center gap-1.5 font-display text-2xl">
              <span className="truncate">{profile.kennel_name || profile.display_name}</span>
              {profile.verified && <BadgeCheck className="h-4 w-4 text-aura" />}
            </h1>
            <p className="text-[11px] text-muted-foreground">
              {profile.handle}
              {profile.city ? ` · ${profile.city}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={toggleFollow}
            className={`mb-1 rounded-xl px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] transition ${
              following ? "border border-border/70 text-muted-foreground" : "btn-aura"
            }`}
          >
            {following ? t("common.following") : t("common.follow")}
          </button>
          {profile.user_id !== user?.id && (
            <button
              type="button"
              onClick={startChat}
              disabled={starting}
              className="mb-1 grid h-9 w-9 place-items-center rounded-xl border border-border/70 text-muted-foreground transition hover:text-foreground disabled:opacity-50"
              aria-label="Napisz wiadomość"
            >
              <MessageCircle className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="mt-4 flex items-center gap-4 text-[11px] text-muted-foreground">
          <span>
            <b className="text-foreground">{formatNumber(followers)}</b> {t("profile.followers")}
          </span>
          <span>
            <b className="text-foreground">{listings.length}</b> {t("profile.listings")}
          </span>
          <span>
            <b className="text-foreground">{pets.length}</b> {t("profile.pets")}
          </span>
          <span>
            <b className="text-foreground">{posts.length}</b> {t("profile.posts")}
          </span>
        </div>

        {profile.bio && (
          <p className="mt-4 whitespace-pre-line text-[13px] leading-relaxed text-foreground/85">{profile.bio}</p>
        )}

        {/* Socials + konto PRO */}
        {(socials.length > 0 || profile.verified) && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {socials.map(({ url, label, Icon }) => (
              <a
                key={label}
                href={url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="flex items-center gap-1.5 rounded-full border border-border/70 px-3 py-1.5 text-[10px] uppercase tracking-[0.16em] text-muted-foreground transition hover:border-aura/60 hover:text-aura"
              >
                <Icon className="h-3.5 w-3.5" /> {label}
              </a>
            ))}
            {profile.verified && (
              <span className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-violet/20 to-aura/20 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-aura">
                <Crown className="h-3.5 w-3.5" /> Konto PRO
              </span>
            )}
          </div>
        )}

        {profile.breeds?.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {profile.breeds.map((breed) => (
              <span
                key={breed}
                className="rounded-full border border-border/70 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-muted-foreground"
              >
                {breed}
              </span>
            ))}
          </div>
        )}

        {gallery.length > 0 && (
          <section className="mt-6">
            <h2 className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Galeria</h2>
            <div className="mt-3 grid grid-cols-3 gap-1.5 sm:grid-cols-4">
              {gallery.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="overflow-hidden rounded-xl border border-border/70">
                  <Image src={url} alt={`${profile.display_name} — zdjęcie ${i + 1}`} className="aspect-square w-full object-cover transition hover:scale-105" />
                </a>
              ))}
            </div>
          </section>
        )}

        {posts.length > 0 && (
          <section className="mt-6">
            <h2 className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Publikacje</h2>
            <div className="mt-3 grid grid-cols-3 gap-1.5 sm:grid-cols-4">
              {posts.map((post) => {
                const href = post.video_url || post.image_urls?.[0] || post.image_url || "";
                if (!href) return null;
                const isVideo = Boolean(post.video_url);
                return (
                  <a
                    key={post.id}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="relative overflow-hidden rounded-xl border border-border/70"
                  >
                    <Image src={isVideo ? post.image_urls?.[0] || post.image_url : href} alt={post.caption?.slice(0, 60) || "Publikacja"} className="aspect-square w-full object-cover transition hover:scale-105" />
                    {isVideo && (
                      <span className="absolute bottom-1.5 right-1.5 rounded-full bg-background/80 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider">
                        Wideo
                      </span>
                    )}
                  </a>
                );
              })}
            </div>
          </section>
        )}

        <section className="mt-6">
          <h2 className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">{t("profile.listings")}</h2>
          {listings.length === 0 ? (
            <p className="mt-2 text-[11px] text-muted-foreground">{t("common.empty")}</p>
          ) : (
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {listings.map((listing) => (
                <Link
                  key={listing.id}
                  to="/listings/$id"
                  params={{ id: listing.id }}
                  className="overflow-hidden rounded-2xl border border-border/70 bg-card/60"
                >
                  <Image src={listing.image_urls?.[0]} alt={listing.title} className="aspect-square w-full object-cover" />
                  <p className="truncate p-2 text-[11px]">{listing.title}</p>
                </Link>
              ))}
            </div>
          )}
        </section>

        {pets.length > 0 && (
          <section className="mt-6">
            <h2 className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">{t("profile.pets")}</h2>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {pets.map((pet) => (
                <li key={pet.id}>
                  <Link
                    to="/pets/$id"
                    params={{ id: pet.id }}
                    className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card/60 p-2.5 transition hover:border-aura/60"
                  >
                    <Image src={pet.photos?.[0]} alt={pet.name} className="h-12 w-12 rounded-xl object-cover" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{pet.name}</p>
                      <p className="truncate text-[10px] text-muted-foreground">{pet.breed || pet.species}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="mt-8 flex items-center gap-2 text-[11px] text-muted-foreground">
          <MapPin className="h-3.5 w-3.5" /> {profile.city || "Polska"}
          <MessageCircle className="ml-auto h-3.5 w-3.5" /> Napisz z ogłoszenia, aby rozpocząć rozmowę
        </div>
      </div>
    </div>
  );
}
