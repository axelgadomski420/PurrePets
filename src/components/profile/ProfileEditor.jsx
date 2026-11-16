import { useEffect, useRef, useState } from "react";
import { Camera, Image as ImageIcon, Save } from "lucide-react";
import { toast } from "sonner";
import { base44, profileApi, getUploadedFileUrl, getUploadErrorMessage } from "@/api/base44Client";
import { cn } from "@/lib/utils";

/**
 * ProfileEditor — pełna edycja profilu: awatar, zdjęcie w tle, imię, bio,
 * miasto, nazwa hodowli. Zapis przez PATCH /api/profile/me, natychmiastowe
 * odświeżenie widoku po zapisie.
 */
export default function ProfileEditor({ onSaved, className }) {
  const [profile, setProfile] = useState(null);
  const [busy, setBusy] = useState(false);
  const avatarRef = useRef(null);
  const coverRef = useRef(null);
  const galleryRef = useRef(null);

  useEffect(() => {
    profileApi.me().then(setProfile).catch(() => null);
  }, []);

  const upload = async (file) => {
    if (!file) throw new Error("Nie wybrano pliku");

    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "image/avif",
    ];

    if (!allowedTypes.includes(file.type)) {
      throw new Error("Obsługiwane formaty: JPG, PNG, WEBP, GIF i AVIF");
    }

    if (file.size <= 0 || file.size > 10 * 1024 * 1024) {
      throw new Error("Zdjęcie musi mieć rozmiar do 10 MB");
    }

    const up = await base44.integrations.Core.UploadPublicFile({ file });
    return getUploadedFileUrl(up);
  };

  const pick = async (file, field) => {
    if (!file) return;
    setBusy(true);
    try {
      const url = await upload(file);
      setProfile((p) => ({ ...p, [field]: url }));
    } catch (err) {
      toast.error(getUploadErrorMessage(err, "Upload nie powiódł się"));
    } finally {
      setBusy(false);
    }
  };

  const pickGallery = async (fileList) => {
    const current = profile.gallery_urls ?? [];
    const selected = Array.from(fileList ?? []);
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "image/avif",
    ];

    const validFiles = selected.filter((file) =>
      allowedTypes.includes(file.type) &&
      file.size > 0 &&
      file.size <= 10 * 1024 * 1024
    );

    if (validFiles.length !== selected.length) {
      toast.error("Pominięto pliki w nieobsługiwanym formacie lub większe niż 10 MB");
    }

    const remaining = Math.max(0, 12 - current.length);
    const files = validFiles.slice(0, remaining);

    if (validFiles.length > remaining) {
      toast.error("Galeria może zawierać maksymalnie 12 zdjęć");
    }

    if (!files.length) {
      toast.error(remaining === 0
        ? "Galeria jest pełna — usuń zdjęcie przed dodaniem kolejnego"
        : "Nie wybrano prawidłowych zdjęć");
      return;
    }

    setBusy(true);
    try {
      const urls = [];
      for (const file of files) {
        urls.push(await upload(file));
      }

      setProfile((p) => ({
        ...p,
        gallery_urls: [...(p.gallery_urls ?? []), ...urls].slice(0, 12),
      }));

      if (urls.length) {
        toast.success(`Dodano ${urls.length} zdjęć. Zapisz profil, aby zatwierdzić zmiany.`);
      }
    } catch (err) {
      toast.error(getUploadErrorMessage(err, "Nie udało się dodać zdjęć"));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      const saved = await profileApi.update({
        display_name: profile.display_name,
        handle: profile.handle ?? undefined,
        kennel_name: profile.kennel_name ?? undefined,
        bio: profile.bio ?? undefined,
        city: profile.city ?? undefined,
        avatar_url: profile.avatar_url ?? undefined,
        cover_url: profile.cover_url ?? undefined,
        gallery_urls: profile.gallery_urls ?? [],
        account_type: profile.account_type,
      });
      setProfile(saved);
      toast.success("Profil zaktualizowany");
      onSaved?.(saved);
    } catch (err) {
      toast.error(getUploadErrorMessage(err, "Nie udało się zapisać profilu"));
    } finally {
      setBusy(false);
    }
  };

  if (!profile) return <div className="p-6 text-sm text-muted-foreground">Ładowanie profilu…</div>;

  const field = (label, key, type = "text") => (
    <div className="space-y-1">
      <label className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{label}</label>
      <input
        type={type}
        value={profile[key] ?? ""}
        onChange={(e) => setProfile((p) => ({ ...p, [key]: e.target.value }))}
        className="h-11 w-full rounded-xl border border-border/60 bg-background/50 px-3 text-sm outline-none"
      />
    </div>
  );

  return (
    <div className={cn("overflow-hidden rounded-2xl border border-border/70 bg-card/50", className)}>
      <div className="relative h-36">
        {profile.cover_url ? (
          <img src={profile.cover_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-violet/30 to-aura/20" />
        )}
        <button
          type="button"
          onClick={() => coverRef.current?.click()}
          disabled={busy}
          className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-black/50 px-3 py-1.5 text-[10px] text-white disabled:opacity-50"
        >
          <ImageIcon className="h-3 w-3" /> Zmień tło
        </button>
        <input ref={coverRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" className="hidden" disabled={busy} onChange={(e) => { pick(e.target.files?.[0], "cover_url"); e.target.value = ""; }} />

        <div className="absolute -bottom-8 left-4">
          <div className="relative">
            <img
              src={profile.avatar_url}
              alt=""
              className="h-20 w-20 rounded-full border-4 border-card object-cover"
            />
            <button
              type="button"
              onClick={() => avatarRef.current?.click()}
              disabled={busy}
              className="absolute -bottom-1 -right-1 grid h-7 w-7 place-items-center rounded-full bg-aura text-black disabled:opacity-50"
              aria-label="Zmień awatar"
            >
              <Camera className="h-3.5 w-3.5" />
            </button>
            <input ref={avatarRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" className="hidden" disabled={busy} onChange={(e) => { pick(e.target.files?.[0], "avatar_url"); e.target.value = ""; }} />
          </div>
        </div>
      </div>

      <div className="space-y-3 px-4 pb-4 pt-12">
        {field("Nazwa wyświetlana", "display_name")}
        {field("Nazwa hodowli (opcjonalnie)", "kennel_name")}
        {field("Miasto", "city")}
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Bio</label>
          <textarea
            value={profile.bio ?? ""}
            onChange={(e) => setProfile((p) => ({ ...p, bio: e.target.value }))}
            rows={3}
            className="w-full rounded-xl border border-border/60 bg-background/50 px-3 py-2 text-sm outline-none"
          />
        </div>
        <section className="space-y-3 rounded-xl border border-border/60 p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">Galeria profilu</p>
              <p className="text-xs text-muted-foreground">
                {(profile.gallery_urls ?? []).length}/12 zdjęć
              </p>
            </div>
            <button
              type="button"
              disabled={busy || (profile.gallery_urls ?? []).length >= 12}
              onClick={() => galleryRef.current?.click()}
              className="rounded-lg bg-aura px-3 py-2 text-xs font-semibold text-black disabled:opacity-50"
            >
              Dodaj zdjęcia
            </button>
            <input
              ref={galleryRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
              multiple
              disabled={busy}
              className="hidden"
              onChange={(e) => {
                pickGallery(e.target.files);
                e.target.value = "";
              }}
            />
          </div>

          {(profile.gallery_urls ?? []).length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {(profile.gallery_urls ?? []).map((url, index) => (
                <div key={`${url}-${index}`} className="relative aspect-square overflow-hidden rounded-lg">
                  <img src={url} alt={`Zdjęcie galerii ${index + 1}`} className="h-full w-full object-cover" />
                  <button
                    type="button"
                    aria-label="Usuń zdjęcie"
                    onClick={() => setProfile((p) => ({
                      ...p,
                      gallery_urls: (p.gallery_urls ?? []).filter((_, i) => i !== index),
                    }))}
                    className="absolute right-1 top-1 rounded-full bg-black/70 px-2 py-1 text-xs text-white"
                  >
                    Usuń
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="btn-aura flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] disabled:opacity-50"
        >
          <Save className="h-4 w-4" /> {busy ? "Zapisuję…" : "Zapisz profil"}
        </button>
      </div>
    </div>
  );
}
