import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  BadgeCheck, BarChart3, Camera, Crown, Facebook, Globe, Instagram, Lock,
  MapPin, MessageCircle, Music2, Pencil, Search, Share2, Shield, UserMinus,
  UserPlus, Users, X, Youtube,
} from "lucide-react";
import { toast } from "sonner";
import { Image } from "@/components/ui/image";
import { base44, profileApi, getUploadedFileUrl, getUploadErrorMessage } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { formatNumber } from "@/lib/format";
import { openConversation } from "@/lib/conversations";
import { cn } from "@/lib/utils";

const SOCIAL_FIELDS = [
  { key: "website_url", label: "Strona", Icon: Globe },
  { key: "instagram_url", label: "Instagram", Icon: Instagram },
  { key: "tiktok_url", label: "TikTok", Icon: Music2 },
  { key: "facebook_url", label: "Facebook", Icon: Facebook },
  { key: "youtube_url", label: "YouTube", Icon: Youtube },
];

// Bezpieczne linki: wyłącznie http(s) — blokada javascript:/data: (spójnie z backendem).
function safeHref(url) {
  const value = String(url ?? "").trim();
  return /^https?:\/\//i.test(value) ? value : null;
}

const PRIVACY_TOGGLES = [
  { key: "is_private", label: "Profil prywatny (tylko zatwierdzeni mogą widzieć treści)" },
  { key: "show_gallery", label: "Galeria widoczna publicznie" },
  { key: "show_followers", label: "Listy obserwujących/obserwowanych widoczne" },
  { key: "show_stats", label: "Statystyki publikacji widoczne dla innych" },
  { key: "show_kennel_data", label: "Dane hodowli (rasy/gatunki) widoczne publicznie" },
];

/**
 * PROFIL PURRE PETS ULTRA — jeden wspólny komponent dla profilu własnego
 * i publicznego (backend GET /api/profile/:id/public rozstrzyga uprawnienia).
 * Liczby zawsze z bazy (counts z backendu), follow przez API serwerowe,
 * odwiedziny deduplikowane per osoba/dzień, analityka tylko dla właściciela.
 */
export default function ProfileView({ profileId }) {
  const navigate = useNavigate();
  const { user, isAuthenticated, navigateToLogin } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("posts");
  const [posts, setPosts] = useState([]);
  const [listings, setListings] = useState([]);
  const [pets, setPets] = useState([]);
  const [stats, setStats] = useState(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [starting, setStarting] = useState(false);
  const [uploading, setUploading] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [form, setForm] = useState(null);
  const [listModal, setListModal] = useState(null);
  const [listQ, setListQ] = useState("");
  const [listOffset, setListOffset] = useState(0);
  const [listItems, setListItems] = useState([]);
  const [listTotal, setListTotal] = useState(0);
  const [listHasMore, setListHasMore] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const avatarInputRef = useRef(null);
  const coverInputRef = useRef(null);
  const galleryInputRef = useRef(null);

  const userId = data?.profile?.user_id ?? null;
  const publicUrl = typeof window !== "undefined" && userId
    ? window.location.origin + "/profile/" + userId
    : "";

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await profileApi.publicProfile(profileId);
      setData(result);
      setForm({
        display_name: result.profile.display_name ?? "",
        kennel_name: result.profile.kennel_name ?? "",
        bio: result.profile.bio ?? "",
        city: result.profile.city ?? "",
        website_url: result.profile.website_url ?? "",
        instagram_url: result.profile.instagram_url ?? "",
        tiktok_url: result.profile.tiktok_url ?? "",
        facebook_url: result.profile.facebook_url ?? "",
        youtube_url: result.profile.youtube_url ?? "",
        is_private: !!result.profile.is_private,
        show_gallery: result.profile.show_gallery !== false,
        show_followers: result.profile.show_followers !== false,
        show_stats: result.profile.show_stats !== false,
        show_kennel_data: result.profile.show_kennel_data !== false,
      });
    } catch (err) {
      setError(err?.message ?? "Nie udało się wczytać profilu");
    } finally {
      setLoading(false);
    }
  }, [profileId]);

  useEffect(() => { load(); }, [load]);

  // Odwiedziny: dedupe po stronie serwera (osoba × dzień UTC), self nie liczone.
  useEffect(() => {
    if (!data || data.is_self || !user?.id) return;
    profileApi.visit(profileId).catch(() => {});
  }, [data, profileId, user?.id]);

  // Treści profilu (lockowane profile ich nie ładują).
  useEffect(() => {
    if (!data || data.locked || !userId) return;
    const petWhere = data.is_self ? { owner_id: userId } : { owner_id: userId, is_public: true };
    base44.entities.Post.filter({ author_id: userId, status: "published" }, { sort: "-created_date", limit: 24 })
      .then((page) => setPosts(page.items ?? [])).catch(() => {});
    base44.entities.Listing.filter({ seller_id: userId }, { sort: "-created_date", limit: 24 })
      .then((page) => setListings(page.items ?? [])).catch(() => {});
    base44.entities.Pet.filter(petWhere, { limit: 24 })
      .then((page) => setPets(page.items ?? [])).catch(() => {});
  }, [data, userId]);

  // Analityka — wyłącznie właściciel (backend: 403 dla pozostałych).
  useEffect(() => {
    if (!data?.is_self) return;
    profileApi.stats(profileId).then(setStats).catch(() => {});
  }, [data?.is_self, profileId]);

  // Open Graph dla linku udostępnianego (m.in. podgląd w komunikatorze).
  useEffect(() => {
    if (typeof document === "undefined" || !data?.profile) return;
    const name = data.profile.kennel_name || data.profile.display_name || "PURRE PETS";
    document.title = name + " — PURRE PETS";
    const setMeta = (selector, content) => {
      if (!content) return;
      const el = document.head.querySelector(selector);
      if (el) el.setAttribute("content", content);
    };
    const description = String(data.profile.bio || "Profil w społeczności PURRE PETS").slice(0, 200);
    setMeta('meta[property="og:title"]', name);
    setMeta('meta[property="og:description"]', description);
    setMeta('meta[property="og:url"]', publicUrl);
    setMeta('meta[property="og:image"]', data.profile.avatar_url || data.profile.cover_url || "");
  }, [data, publicUrl]);

  // Listy obserwujących/obserwowanych: paginacja + wyszukiwanie (guard po stronie backendu).
  useEffect(() => {
    if (!listModal || !profileId) return;
    let cancelled = false;
    setListLoading(true);
    const fetcher = listModal === "followers" ? profileApi.followers : profileApi.following;
    fetcher(profileId, { q: listQ, limit: 20, offset: listOffset })
      .then((page) => {
        if (cancelled) return;
        setListItems((prev) => (listOffset === 0 ? page.items ?? [] : [...prev, ...(page.items ?? [])]));
        setListTotal(page.total ?? 0);
        setListHasMore(!!page.has_more);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setListLoading(false); });
    return () => { cancelled = true; };
  }, [listModal, listQ, listOffset, profileId]);

  const openList = (kind) => {
    if (!data) return;
    if (!data.is_self && data.profile.show_followers === false) {
      toast.message("Prywatność", { description: "Właściciel ukrył listy obserwujących." });
      return;
    }
    setListQ("");
    setListOffset(0);
    setListItems([]);
    setListModal(kind);
  };

  const toggleFollow = async () => {
    if (!isAuthenticated) {
      navigateToLogin();
      return;
    }
    if (!data || data.is_self || followBusy) return;
    setFollowBusy(true);
    try {
      const result = data.is_following
        ? await profileApi.unfollow(profileId)
        : await profileApi.follow(profileId);
      setData((prev) => ({
        ...prev,
        is_following: !!result.following,
        counts: { ...prev.counts, followers: result.followers ?? prev.counts?.followers ?? 0 },
      }));
    } catch (err) {
      toast.error(err?.message ?? "Operacja nie powiodła się");
    } finally {
      setFollowBusy(false);
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
        otherId: userId,
        otherName: data?.profile?.kennel_name || data?.profile?.display_name,
      });
      if (conversation) navigate({ to: "/messages/$id", params: { id: conversation.id } });
    } finally {
      setStarting(false);
    }
  };

  const shareProfile = async () => {
    if (!publicUrl) return;
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: (data?.profile?.kennel_name || data?.profile?.display_name || "PURRE PETS"),
          url: publicUrl,
        });
        return;
      } catch { /* anulowane lub brak zgody → modal z linkiem */ }
    }
    setShareOpen(true);
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      toast.success("Link do profilu skopiowany");
    } catch {
      setShareOpen(true);
    }
  };

  const saveProfile = async () => {
    if (!form || saving) return;
    setSaving(true);
    try {
      const cleanUrl = (value) => {
        const v = String(value ?? "").trim();
        if (!v) return null;
        return /^https?:\/\//i.test(v) ? v : "https://" + v;
      };
      const payload = {
        website_url: cleanUrl(form.website_url),
        instagram_url: cleanUrl(form.instagram_url),
        tiktok_url: cleanUrl(form.tiktok_url),
        facebook_url: cleanUrl(form.facebook_url),
        youtube_url: cleanUrl(form.youtube_url),
        is_private: form.is_private,
        show_gallery: form.show_gallery,
        show_followers: form.show_followers,
        show_stats: form.show_stats,
        show_kennel_data: form.show_kennel_data,
      };
      if (form.display_name.trim().length >= 2) {
        payload.display_name = form.display_name.trim();
      }

      // Puste wartości również wysyłamy — umożliwia to
      // wyczyszczenie wcześniej zapisanych danych profilu.
      payload.kennel_name = form.kennel_name.trim();
      payload.bio = form.bio.trim();
      payload.city = form.city.trim();
      await profileApi.update(payload);
      toast.success("Profil zapisany");
      setEditing(false);
      await load();
    } catch (err) {
      toast.error(err?.message ?? "Nie udało się zapisać profilu");
    } finally {
      setSaving(false);
    }
  };

  const uploadMedia = async (file, field) => {
    if (!file || !userId) return;
    setUploading(field);
    try {
      const uploadResult = await base44.integrations.Core.UploadPublicFile({ file });
      const fileUrl = getUploadedFileUrl(uploadResult);
      let payload;
      if (field === "gallery") {
        payload = { gallery_urls: [...(data.profile.gallery_urls ?? []), fileUrl].slice(0, 12) };
      } else {
        payload = { [field]: fileUrl };
      }
      await profileApi.update(payload);
      toast.success(field === "avatar_url" ? "Awatar zaktualizowany" : field === "gallery" ? "Zdjęcie dodane do galerii" : "Tło zaktualizowane");
      await load();
    } catch (err) {
      toast.error(getUploadErrorMessage(err, "Upload nie powiódł się"));
    } finally {
      setUploading("");
    }
  };

  const removeGalleryPhoto = async (url) => {
    try {
      await profileApi.update({ gallery_urls: (data.profile.gallery_urls ?? []).filter((item) => item !== url) });
      await load();
    } catch (err) {
      toast.error(err?.message ?? "Nie udało się usunąć zdjęcia");
    }
  };

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Ładowanie profilu…</div>;
  if (error || !data) {
    return (
      <div className="rounded-2xl border border-border/70 bg-card/60 p-6 text-center text-sm text-muted-foreground">
        {error || "Nie znaleziono profilu"}
      </div>
    );
  }

  const profile = data.profile;
  const counts = data.counts ?? { followers: 0, following: 0, posts: 0, listings: 0, pets: 0 };
  const isSelf = !!data.is_self;
  const gallery = profile.gallery_urls ?? [];
  const showGallery = isSelf || profile.show_gallery !== false;
  const reelPosts = posts.filter((post) => post.video_url);
  const photoPosts = posts.filter((post) => !post.video_url);
  const role = data.role ?? "user";
  const socials = SOCIAL_FIELDS
    .map(({ key, label, Icon }) => ({ url: safeHref(profile[key]), label, Icon }))
    .filter((item) => !!item.url);
  const maxDaily = Math.max(...(stats?.daily ?? []).map((d) => d.visits), 1);

  return (
    <div>
      {/* Cover */}
      <div className="relative mb-4 h-28 overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-br from-violet/30 via-background to-aura/20 sm:h-40">
        {profile.cover_url ? (
          <Image src={profile.cover_url} alt="Tło profilu" className="h-full w-full object-cover" />
        ) : null}
        {isSelf && (
          <>
            <button
              type="button"
              disabled={!!uploading}
              onClick={() => coverInputRef.current?.click()}
              className="absolute bottom-2 right-2 flex items-center gap-1 rounded-xl bg-black/50 px-2.5 py-1.5 text-[10px] uppercase tracking-wider text-white backdrop-blur"
            >
              <Camera className="h-3 w-3" /> {uploading === "cover_url" ? "…" : "Tło"}
            </button>
            <input
              ref={coverInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadMedia(f, "cover_url"); e.target.value = ""; }}
            />
          </>
        )}
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="relative shrink-0 self-start">
          <span className="rounded-full bg-gradient-to-br from-violet to-aura p-[2px]">
            <span className="block rounded-full bg-background p-1">
              <Image src={profile.avatar_url} alt={profile.display_name ?? "Profil"} className="h-20 w-20 rounded-full object-cover" />
            </span>
          </span>
          {isSelf && (
            <>
              <button
                type="button"
                disabled={!!uploading}
                onClick={() => avatarInputRef.current?.click()}
                className="absolute -bottom-1 -right-1 grid h-8 w-8 place-items-center rounded-full border border-border/70 bg-card text-muted-foreground shadow"
                aria-label="Zmień awatar"
              >
                <Camera className="h-3.5 w-3.5" />
              </button>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadMedia(f, "avatar_url"); e.target.value = ""; }}
              />
            </>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h1 className="flex flex-wrap items-center gap-1.5 font-display text-2xl">
            <span className="truncate">{profile.kennel_name || profile.display_name}</span>
            {profile.verified && <BadgeCheck className="h-4 w-4 shrink-0 text-aura" />}
            {data.is_premium && (
              <span className="inline-flex items-center gap-1 rounded-full border border-aura/50 bg-aura/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-aura">
                <Crown className="h-3 w-3" /> PRO
              </span>
            )}
            {role === "admin" && (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/60 bg-amber-400/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-amber-300">
                <Shield className="h-3 w-3" /> Admin
              </span>
            )}
            {role === "moderator" && (
              <span className="inline-flex items-center gap-1 rounded-full border border-sky-400/60 bg-sky-400/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-sky-300">
                <Shield className="h-3 w-3" /> Moderator
              </span>
            )}
            {data.locked && <Lock className="h-4 w-4 text-muted-foreground" />}
          </h1>
          <p className="text-[11px] text-muted-foreground">{profile.handle || "—"}</p>
          {(role === "admin" || role === "moderator") && (
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-widest">
              {role === "admin" ? "Rola konta: Administrator" : "Rola konta: Moderator"}
            </p>
          )}
          {profile.city && (
            <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
              <MapPin className="h-3 w-3" /> {profile.city}
            </p>
          )}
          {profile.bio && <p className="mt-1.5 line-clamp-3 max-w-md text-xs text-foreground/80">{profile.bio}</p>}
          {socials.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {socials.map(({ url, label, Icon }) => (
                <a
                  key={label}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  title={label}
                  className="grid h-8 w-8 place-items-center rounded-xl border border-border/70 bg-card/60 text-muted-foreground transition hover:border-aura/50 hover:text-aura"
                >
                  <Icon className="h-3.5 w-3.5" />
                </a>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isSelf ? (
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              className="flex items-center gap-1 rounded-xl border border-border/70 px-3 py-2 text-[10px] uppercase tracking-[0.16em] text-muted-foreground"
            >
              <Pencil className="h-3 w-3" /> Edytuj profil
            </button>
          ) : (
            <button
              type="button"
              onClick={toggleFollow}
              disabled={followBusy}
              className={cn(
                "flex items-center gap-1 rounded-xl px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] disabled:opacity-50",
                data.is_following ? "border border-border/70 text-muted-foreground" : "btn-aura"
              )}
            >
              {data.is_following ? <UserMinus className="h-3 w-3" /> : <UserPlus className="h-3 w-3" />}
              {data.is_following ? "Obserwujesz" : "Obserwuj"}
            </button>
          )}
          {!isSelf && (
            <button
              type="button"
              onClick={startChat}
              disabled={starting}
              className="grid h-9 w-9 place-items-center rounded-xl border border-border/70 text-muted-foreground disabled:opacity-50"
              aria-label="Napisz wiadomość"
            >
              <MessageCircle className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={shareProfile}
            className="flex items-center gap-1 rounded-xl border border-border/70 px-3 py-2 text-[10px] uppercase tracking-[0.16em] text-muted-foreground"
          >
            <Share2 className="h-3 w-3" /> Udostępnij
          </button>
          {(role === "admin" || role === "moderator") && (
            <Link
              to="/admin"
              className="flex items-center gap-1 rounded-xl border border-amber-400/50 px-3 py-2 text-[10px] uppercase tracking-[0.16em] text-amber-300"
            >
              <Shield className="h-3 w-3" /> {role === "admin" ? "Panel administratora" : "Panel moderatora"}
            </Link>
          )}
        </div>
      </div>

      {/* Statystyki — wyłącznie z bazy (counts z backendu) */}
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-muted-foreground">
        <button type="button" onClick={() => openList("followers")} className="hover:text-foreground">
          <b className="text-foreground">{formatNumber(counts.followers)}</b> obserwujących
        </button>
        <button type="button" onClick={() => openList("following")} className="hover:text-foreground">
          <b className="text-foreground">{formatNumber(counts.following)}</b> obserwowanych
        </button>
        <span><b className="text-foreground">{formatNumber(counts.posts)}</b> publikacje</span>
        <span><b className="text-foreground">{formatNumber(counts.listings)}</b> ogłoszenia</span>
        <span><b className="text-foreground">{formatNumber(counts.pets)}</b> zwierzęta</span>
      </div>

      {/* Analityka — tylko właściciel (backend egzekwuje 403) */}
      {isSelf && stats && (
        <section className="mt-4 rounded-2xl border border-border/70 bg-card/60 p-4">
          <p className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.24em] text-muted-foreground">
            <BarChart3 className="h-3.5 w-3.5" /> Analityka profilu (tylko Ty)
          </p>
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <p className="font-display text-lg">{formatNumber(stats.total_visits)}</p>
              <p className="text-[10px] text-muted-foreground">odwiedziny łącznie</p>
            </div>
            <div>
              <p className="font-display text-lg">{formatNumber(stats.unique_visitors)}</p>
              <p className="text-[10px] text-muted-foreground">unikalni odwiedzający</p>
            </div>
            <div>
              <p className="font-display text-lg">{formatNumber(stats.new_followers_7d)}</p>
              <p className="text-[10px] text-muted-foreground">nowi obserwujący (7 dni)</p>
            </div>
            <div>
              <p className="font-display text-lg">
                {stats.posts.length
                  ? Math.round(stats.posts.reduce((sum, p) => sum + (p.engagement ?? 0), 0) / stats.posts.length)
                  : 0}
              </p>
              <p className="text-[10px] text-muted-foreground">śr. zaangażowanie posta</p>
            </div>
          </div>
          <p className="mt-3 text-[9px] uppercase tracking-[0.2em] text-muted-foreground">Odwiedziny — 14 dni</p>
          <div className="mt-1 flex h-20 items-end gap-1">
            {(stats.daily ?? []).map((d) => (
              <div
                key={d.day}
                title={d.day + ": " + d.visits}
                className="flex-1 rounded-t bg-gradient-to-t from-violet to-aura"
                style={{ height: Math.max(4, (d.visits / maxDaily) * 100) + "%" }}
              />
            ))}
          </div>
          <p className="mt-1 text-[9px] text-muted-foreground">
            Odwiedziny liczone raz na osobę na dobę (UTC); własne wejścia nie są naliczane.
          </p>
        </section>
      )}

      {/* Edycja + prywatność */}
      {isSelf && editing && form && (
        <div className="mt-4 space-y-2 rounded-2xl border border-border/70 bg-card/60 p-4">
          {[
            { key: "display_name", label: "Nazwa wyświetlana" },
            { key: "kennel_name", label: "Nazwa hodowli" },
            { key: "city", label: "Miasto" },
            { key: "website_url", label: "Strona WWW" },
            { key: "instagram_url", label: "Instagram (link)" },
            { key: "tiktok_url", label: "TikTok (link)" },
            { key: "facebook_url", label: "Facebook (link)" },
            { key: "youtube_url", label: "YouTube (link)" },
          ].map((field) => (
            <label key={field.key} className="block">
              <span className="mb-1 block text-[9px] uppercase tracking-[0.2em] text-muted-foreground">{field.label}</span>
              <input
                value={form[field.key] ?? ""}
                onChange={(e) => setForm((prev) => ({ ...prev, [field.key]: e.target.value }))}
                className="w-full rounded-xl border border-border/70 bg-background/40 px-3 py-2 text-sm outline-none focus:border-violet/60"
              />
            </label>
          ))}
          <label className="block">
            <span className="mb-1 block text-[9px] uppercase tracking-[0.2em] text-muted-foreground">O profilu</span>
            <textarea
              value={form.bio}
              rows={3}
              maxLength={2000}
              onChange={(e) => setForm((prev) => ({ ...prev, bio: e.target.value }))}
              className="w-full rounded-xl border border-border/70 bg-background/40 px-3 py-2 text-sm outline-none focus:border-violet/60"
            />
          </label>
          <div className="rounded-xl border border-border/70 p-3">
            <p className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground">Prywatność</p>
            {PRIVACY_TOGGLES.map((toggle) => (
              <label key={toggle.key} className="mt-1.5 flex items-center gap-2 text-[11px] text-foreground/85">
                <input
                  type="checkbox"
                  checked={form[toggle.key]}
                  onChange={(e) => setForm((prev) => ({ ...prev, [toggle.key]: e.target.checked }))}
                />
                {toggle.label}
              </label>
            ))}
          </div>
          <button
            type="button"
            onClick={saveProfile}
            disabled={saving}
            className="btn-aura w-full rounded-xl py-2.5 text-[10px] font-semibold uppercase tracking-[0.2em] disabled:opacity-60"
          >
            {saving ? "Zapisuję…" : "Zapisz profil"}
          </button>
        </div>
      )}

      {/* Treści */}
      {data.locked ? (
        <div className="mt-6 rounded-2xl border border-border/70 bg-card/60 p-6 text-center">
          <Lock className="mx-auto h-5 w-5 text-muted-foreground" />
          <p className="mt-2 text-sm">To konto jest prywatne.</p>
          <p className="mt-1 text-[11px] text-muted-foreground">Obserwuj profil, aby zobaczyć treści po akceptacji właściciela.</p>
        </div>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap gap-2">
            {[
              { id: "posts", label: "Posty" },
              { id: "reels", label: "Reels" },
              { id: "listings", label: "Ogłoszenia" },
              { id: "pets", label: "Zwierzęta" },
              ...(showGallery ? [{ id: "gallery", label: "Galeria (" + gallery.length + "/12)" }] : []),
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em]",
                  tab === item.id ? "bg-foreground text-background" : "border border-border/70 text-muted-foreground"
                )}
              >
                {item.label}
              </button>
            ))}
          </div>

          {tab === "posts" && (
            <section className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {photoPosts.length === 0 && <p className="col-span-full text-[11px] text-muted-foreground">Brak postów.</p>}
              {photoPosts.map((post) => (
                <div key={post.id} className="overflow-hidden rounded-2xl border border-border/70 bg-card/60">
                  <Image src={post.image_url || post.image_urls?.[0]} alt={post.caption?.slice(0, 60) || "Post"} className="aspect-square w-full object-cover" />
                  <p className="line-clamp-2 p-2 text-[10px] text-muted-foreground">{post.caption}</p>
                </div>
              ))}
            </section>
          )}

          {tab === "reels" && (
            <section className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {reelPosts.length === 0 && <p className="col-span-full text-[11px] text-muted-foreground">Brak rolek.</p>}
              {reelPosts.map((post) => (
                <div key={post.id} className="relative overflow-hidden rounded-2xl border border-border/70 bg-card/60">
                  <Image src={post.image_url || post.image_urls?.[0] || post.video_url} alt={post.caption?.slice(0, 60) || "Reel"} className="aspect-[9/16] w-full object-cover" />
                  <span className="absolute bottom-1.5 right-1.5 rounded-full bg-background/80 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider">Reel</span>
                </div>
              ))}
            </section>
          )}

          {tab === "listings" && (
            <section className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {listings.length === 0 && <p className="col-span-full text-[11px] text-muted-foreground">Brak ogłoszeń.</p>}
              {listings.map((listing) => (
                <Link key={listing.id} to="/listings/$id" params={{ id: listing.id }} className="overflow-hidden rounded-2xl border border-border/70 bg-card/60">
                  <Image src={listing.image_urls?.[0]} alt={listing.title} className="aspect-square w-full object-cover" />
                  <p className="truncate p-2 text-[11px]">{listing.title}</p>
                </Link>
              ))}
            </section>
          )}

          {tab === "pets" && (
            <section className="mt-4">
              {pets.length === 0 && <p className="text-[11px] text-muted-foreground">Brak widocznych zwierząt.</p>}
              <ul className="grid gap-2 sm:grid-cols-2">
                {pets.map((pet) => (
                  <li key={pet.id}>
                    <Link to="/pets/$id" params={{ id: pet.id }} className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card/60 p-2.5 transition hover:border-aura/60">
                      <Image src={pet.photos?.[0]} alt={pet.name} className="h-11 w-11 rounded-xl object-cover" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{pet.name}</p>
                        <p className="truncate text-[10px] text-muted-foreground">{pet.breed || pet.species}{pet.pedigree ? " · rodowód" : ""}</p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {tab === "gallery" && showGallery && (
            <section className="mt-4">
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {gallery.map((url) => (
                  <div key={url} className="group relative overflow-hidden rounded-xl border border-border/70">
                    <img src={url} alt="Galeria" className="aspect-square w-full object-cover" />
                    {isSelf && (
                      <button
                        type="button"
                        onClick={() => removeGalleryPhoto(url)}
                        className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-black/60 text-white opacity-0 transition group-hover:opacity-100"
                        aria-label="Usuń zdjęcie"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ))}
                {isSelf && gallery.length < 12 && (
                  <button
                    type="button"
                    disabled={!!uploading}
                    onClick={() => galleryInputRef.current?.click()}
                    className="grid aspect-square w-full place-items-center rounded-xl border border-dashed border-border/70 text-muted-foreground"
                    aria-label="Dodaj zdjęcie do galerii"
                  >
                    <Camera className="h-5 w-5" />
                  </button>
                )}
              </div>
              {isSelf && (
                <input
                  ref={galleryInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadMedia(f, "gallery"); e.target.value = ""; }}
                />
              )}
            </section>
          )}
        </>
      )}

      {/* Modal: obserwujący / obserwowani */}
      {listModal && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/70 p-4" onClick={() => setListModal(null)}>
          <div className="w-full max-w-sm rounded-2xl border border-border/70 bg-background p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-sm font-semibold">
                <Users className="h-4 w-4" /> {listModal === "followers" ? "Obserwujący" : "Obserwowani"} ({listTotal})
              </p>
              <button type="button" onClick={() => setListModal(null)} className="text-muted-foreground" aria-label="Zamknij"><X className="h-4 w-4" /></button>
            </div>
            <div className="mt-2 flex items-center gap-2 rounded-xl border border-border/70 bg-background/40 px-2">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <input
                value={listQ}
                onChange={(e) => { setListOffset(0); setListQ(e.target.value); }}
                placeholder="Szukaj po nazwie lub handle…"
                className="h-9 w-full bg-transparent text-xs outline-none"
              />
            </div>
            <ul className="mt-2 max-h-72 space-y-1 overflow-y-auto">
              {listItems.map((item) => (
                <li key={item.user_id}>
                  <Link
                    to="/profile/$id"
                    params={{ id: item.user_id }}
                    onClick={() => setListModal(null)}
                    className="flex items-center gap-2 rounded-xl p-2 hover:bg-card/70"
                  >
                    <Image src={item.avatar_url} alt={item.display_name ?? "?"} className="h-8 w-8 rounded-full object-cover" />
                    <span className="min-w-0 flex-1 truncate text-xs">
                      {item.display_name ?? item.handle ?? item.user_id.slice(0, 8)}
                      {item.verified && <BadgeCheck className="ml-1 inline h-3 w-3 text-aura" />}
                    </span>
                  </Link>
                </li>
              ))}
              {!listLoading && listItems.length === 0 && (
                <li className="p-2 text-[11px] text-muted-foreground">Brak wyników.</li>
              )}
            </ul>
            {listHasMore && (
              <button
                type="button"
                onClick={() => setListOffset((prev) => prev + 20)}
                disabled={listLoading}
                className="mt-2 w-full rounded-xl border border-border/70 py-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground disabled:opacity-50"
              >
                {listLoading ? "Ładuję…" : "Pokaż więcej"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Modal: udostępnianie (link + QR) */}
      {shareOpen && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/70 p-4" onClick={() => setShareOpen(false)}>
          <div className="w-full max-w-xs rounded-2xl border border-border/70 bg-background p-4 text-center" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-semibold">Udostępnij profil</p>
            <img
              src={"https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=" + encodeURIComponent(publicUrl)}
              alt="QR kod profilu"
              className="mx-auto mt-3 h-40 w-40 rounded-xl bg-white p-1"
            />
            <input
              readOnly
              value={publicUrl}
              onFocus={(e) => e.target.select()}
              className="mt-3 h-9 w-full rounded-xl border border-border/70 bg-background/40 px-2 text-center text-[11px]"
            />
            <button type="button" onClick={copyLink} className="btn-aura mt-2 w-full rounded-xl py-2 text-[10px] font-semibold uppercase tracking-[0.2em]">
              Kopiuj link
            </button>
            <p className="mt-2 text-[9px] text-muted-foreground">Link prowadzi do publicznego widoku profilu.</p>
          </div>
        </div>
      )}
    </div>
  );
}
