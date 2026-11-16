import { useState } from "react";
import PhotoStudioEditor from "@/components/studio/PhotoStudioEditor";
import { exportStudioImage, STUDIO_FORMATS } from "@/lib/purre-studio";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  BadgeCheck,
  Film,
  ImagePlus,
  Loader2,
  X,
  PawPrint,
  ShieldAlert,
  Store,
} from "lucide-react";
import TopBar from "@/components/layout/TopBar";
import { Image } from "@/components/ui/image";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useI18n } from "@/lib/i18n";
import { CITY_NAMES } from "@/lib/geo";
import { ensureProfile, useProfile } from "@/lib/useProfile";
import { useWallet } from "@/lib/useWallet";
import { createListing, LISTING_COST, moderateListing } from "@/lib/server-fns";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/_authed/create")({
  head: () => ({ meta: [{ title: "PURRE PETS — dodaj" }] }),
  component: CreatePage,
});

const CHOICES = [
  {
    id: "post",
    title: "Post / HoloFeed",
    hint: "Zdjecie lub krotki tekst w feedzie spolecznosci",
    icon: ImagePlus,
    accent: "from-violet/25 to-aura/10",
  },
  {
    id: "reel",
    title: "Reel / wideo",
    hint: "Pionowy film — otworz Studio edytora TikTok-style",
    icon: Film,
    accent: "from-aura/25 to-violet/15",
    href: "/video-editor",
  },
  {
    id: "listing",
    title: "Ogloszenie",
    hint: "Sprzedaz lub adopcja — tylko zweryfikowany hodowca",
    icon: Store,
    accent: "from-chart-4/20 to-violet/10",
    requiresVerified: true,
  },
  {
    id: "pet",
    title: "Profil zwierzaka",
    hint: "Karta pupila w Twoim profilu",
    icon: PawPrint,
    accent: "from-violet/15 to-aura/20",
  },
];

function CreatePage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { user } = useAuth();
  const moderate = useServerFn(moderateListing);
  const create = useServerFn(createListing);
  const { profile } = useProfile();
  const { coins } = useWallet();

  const [tab, setTab] = useState(null);
  const [busy, setBusy] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [imageUrls, setImageUrls] = useState([]);
  const [postDrafts, setPostDrafts] = useState([]);
  const [editingPhotoIndex, setEditingPhotoIndex] = useState(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [kind, setKind] = useState("sale");
  const [form, setForm] = useState({
    title: "",
    description: "",
    price: "",
    city: "Warszawa",
    species: "dog",
    breed: "",
    age_months: "",
    postCaption: "",
    petName: "",
    petBirth: "",
    petBio: "",
  });

  const isVerifiedBreeder = !!(profile?.verified);
  const set = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));

  const upload = async (event) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length) return;

    const isPost = tab === "post";
    const videos = files.filter((file) => file.type.startsWith("video/"));
    const images = files.filter((file) => file.type.startsWith("image/"));

    if (files.some((file) => !file.type.startsWith("image/") && !file.type.startsWith("video/"))) {
      toast.error("Dozwolone są tylko zdjęcia i filmy");
      return;
    }

    if (videos.length && (videos.length !== 1 || files.length !== 1)) {
      toast.error("Film dodaj osobno, bez zdjęć");
      return;
    }

    if (isPost && images.length) {
      if (files.length !== images.length) {
        toast.error("Nie można łączyć zdjęć i filmu w jednym poście");
        return;
      }
      if (postDrafts.length + images.length > 10) {
        toast.error("Post może zawierać maksymalnie 10 zdjęć");
        return;
      }
      if (images.some((file) => file.type === "image/gif")) {
        toast.error("Animowane GIF nie są jeszcze obsługiwane przez eksport Studio. Wybierz JPEG, PNG, WebP lub AVIF.");
        return;
      }
      const allowed = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
      if (images.some((file) => !allowed.has(file.type))) {
        toast.error("Obsługiwane zdjęcia: JPEG, PNG, WebP i AVIF");
        return;
      }
      if (images.some((file) => file.size <= 0 || file.size > 10 * 1024 * 1024)) {
        toast.error("Każde zdjęcie musi mieć maksymalnie 10 MB");
        return;
      }

      const drafts = images.map((file) => ({
        id: `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2)}`,
        file,
        previewUrl: URL.createObjectURL(file),
        edits: {},
      }));

      setPostDrafts((previous) => [...previous, ...drafts]);
      setVideoUrl("");
      setImageUrl("");
      setImageUrls([]);
      toast.success(drafts.length === 1 ? "Zdjęcie dodane do Studio" : `Dodano ${drafts.length} zdjęć do Studio`);
      return;
    }

    setBusy(true);
    let uploadedCount = 0;
    try {
      for (const file of files) {
        const { file_url } = await base44.integrations.Core.UploadPublicFile({ file });
        if (!file_url) throw new Error("Serwer nie zwrócił adresu przesłanego pliku");

        if (file.type.startsWith("video/")) {
          setVideoUrl(file_url);
          setImageUrl("");
          setImageUrls([]);
          setPostDrafts((previous) => {
            previous.forEach((item) => URL.revokeObjectURL(item.previewUrl));
            return [];
          });
        } else {
          setImageUrl(file_url);
        }
        uploadedCount += 1;
      }
      toast.success(uploadedCount === 1 ? "Plik wgrany" : `Wgrano ${uploadedCount} plików`);
    } catch (error) {
      toast.error(error?.message ?? "Upload nie powiódł się");
    } finally {
      setBusy(false);
    }
  };

  const selectChoice = (choice) => {
    if (choice.href) {
      navigate({ to: choice.href });
      return;
    }
    if (choice.requiresVerified && !isVerifiedBreeder) {
      toast.message("Ogloszenia po weryfikacji", {
        description: "Najpierw wyslij dokumenty hodowli — admin musi zatwierdzic wniosek.",
      });
      setTab("listing");
      return;
    }
    setTab(choice.id);
  };

  const submit = async () => {
    setBusy(true);
    try {
      const currentProfile = await ensureProfile(user);

      if (tab === "listing") {
        if (!currentProfile?.verified) {
          toast.error("Konto nie jest zweryfikowanym hodowca");
          navigate({ to: "/verify" });
          return;
        }
        const { listing, cost } = await create({
          data: {
            kind,
            title: form.title,
            description: form.description,
            price: Number(form.price) || 0,
            species: form.species,
            breed: form.breed || undefined,
            age_months: Number(form.age_months) || undefined,
            city: form.city,
            image_urls: imageUrl ? [imageUrl] : [],
          },
        });
        if (cost > 0) toast.success(`Opublikowano — pobrano ${cost} PURRE coinow.`);
        toast.loading(t("create.moderation"), { id: "mod" });
        try {
          const result = await moderate({ data: { listing_id: listing.id } });
          toast.success(
            result.decision === "review" ? t("create.moderationReview") : t("create.moderationOk"),
            { id: "mod" }
          );
        } catch (error) {
          toast.error(error?.message ?? "Moderacja niedostepna", { id: "mod" });
        }
        navigate({ to: "/listings/$id", params: { id: listing.id } });
        return;
      }

      if (tab === "post") {
        let publishedImageUrls = imageUrls;

        if (!videoUrl && postDrafts.length) {
          publishedImageUrls = [];

          for (const draft of postDrafts) {
            const image = new window.Image();
            image.decoding = "async";
            image.src = draft.previewUrl;

            if (typeof image.decode === "function") {
              await image.decode();
            } else {
              await new Promise((resolve, reject) => {
                image.onload = resolve;
                image.onerror = () => reject(new Error("Nie udało się odczytać zdjęcia."));
              });
            }

            const edits = draft.edits || {};
            const selectedFormat = STUDIO_FORMATS[edits.format] || STUDIO_FORMATS.square;
            const exportWidth = 1080;
            const exportHeight = Math.round(
              exportWidth * selectedFormat.height / selectedFormat.width
            );

            const blob = await exportStudioImage(image, {
              ...edits,
              format: edits.format || "square",
              width: exportWidth,
              height: exportHeight,
              text: edits.text || "",
              textOptions: {
                position: edits.textPosition || "bottom",
                fontSize: 52,
                fontWeight: 700,
                align: "center",
                color: "#ffffff",
                background: true,
                backgroundColor: "rgba(0,0,0,0.38)",
              },
              type: "image/jpeg",
              quality: 0.92,
            });

            const baseName = draft.file.name.replace(/\.[^.]+$/, "") || "purre-photo";
            const processedFile = new File(
              [blob],
              `${baseName}-purre-studio.jpg`,
              { type: "image/jpeg", lastModified: Date.now() }
            );

            const response = await base44.integrations.Core.UploadPublicFile({
              file: processedFile,
            });
            const url = response?.file_url || response?.url;
            if (!url) throw new Error("Nie udało się przesłać przetworzonego zdjęcia.");
            publishedImageUrls.push(url);
          }
        }

        await base44.entities.Post.create({
          author_id: user.id,
          author_name: currentProfile?.kennel_name || currentProfile?.display_name || user.full_name,
          author_handle: currentProfile?.handle,
          author_avatar: currentProfile?.avatar_url,
          author_verified: !!currentProfile?.verified,
          city: form.city,
          breed: form.breed,
          caption: form.postCaption,
          image_url: videoUrl ? "" : (publishedImageUrls[0] || imageUrl),
          image_urls: videoUrl ? [] : (publishedImageUrls.length ? publishedImageUrls : (imageUrl ? [imageUrl] : [])),
          video_url: videoUrl,
          tags: form.breed ? [form.breed.toLowerCase()] : [],
          likes: 0,
          comment_count: 0,
          status: "published",
        });
        toast.success(t("create.success"));
        navigate({ to: "/" });
        return;
      }

      await base44.entities.Pet.create({
        owner_id: user.id,
        owner_name: currentProfile?.display_name || user.full_name,
        name: form.petName,
        species: form.species,
        breed: form.breed || undefined,
        birth_date: form.petBirth || undefined,
        bio: form.petBio || undefined,
        photos: imageUrl ? [imageUrl] : [],
        city: form.city,
      });
      toast.success("Profil zwierzaka zapisany");
      navigate({ to: "/profile" });
    } catch (error) {
      toast.error(error?.message ?? "Nie udalo sie zapisac");
    } finally {
      setBusy(false);
    }
  };

  const inputClass =
    "mt-1.5 h-11 w-full rounded-xl border border-border/70 bg-background/40 px-3 text-sm outline-none focus:border-aura/50";

  if (!tab) {
    return (
      <div>
        <TopBar title="Dodaj" />
        <div className="px-4 pb-12 pt-6 lg:px-8">
          <p className="text-[10px] uppercase tracking-[0.4em] text-muted-foreground">create</p>
          <h1 className="mt-2 font-display text-4xl">
            <span className="aura-text">Co chcesz dodac?</span>
          </h1>
          <p className="mt-2 max-w-lg text-sm text-muted-foreground">
            Najpierw post lub reel — ogloszenia sprzedazy dopiero po weryfikacji dokumentow hodowli.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {CHOICES.map((choice) => (
              <button
                key={choice.id}
                type="button"
                onClick={() => selectChoice(choice)}
                className={cn(
                  "card-hover flex flex-col items-start rounded-[var(--radius)] border border-border/70 bg-gradient-to-br p-5 text-left",
                  choice.accent
                )}
              >
                <choice.icon className="h-6 w-6 text-aura" />
                <p className="mt-3 font-display text-lg">{choice.title}</p>
                <p className="mt-1 text-[12px] text-muted-foreground">{choice.hint}</p>
                {choice.requiresVerified && (
                  <span
                    className={cn(
                      "mt-3 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] uppercase tracking-wider",
                      isVerifiedBreeder ? "bg-aura/20 text-aura" : "bg-violet/15 text-violet"
                    )}
                  >
                    {isVerifiedBreeder ? (
                      <>
                        <BadgeCheck className="h-3 w-3" /> Zweryfikowany
                      </>
                    ) : (
                      <>
                        <ShieldAlert className="h-3 w-3" /> Wymaga weryfikacji
                      </>
                    )}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <TopBar title="Dodaj" />
      <div className="px-4 pb-12 pt-6 lg:px-8">
        <button
          type="button"
          onClick={() => setTab(null)}
          className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground"
        >
          ← Wroc do wyboru
        </button>
        <h1 className="mt-2 font-display text-3xl">
          <span className="aura-text">
            {tab === "post" && "Nowy post"}
            {tab === "listing" && "Ogloszenie"}
            {tab === "pet" && "Profil zwierzaka"}
          </span>
        </h1>

        <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_320px]">
          <div className="space-y-3 rounded-[var(--radius)] border border-border/70 bg-card/60 p-4">
            {tab === "listing" && !isVerifiedBreeder && (
              <div className="rounded-2xl border border-violet/40 bg-violet/10 p-4">
                <p className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-violet">
                  <ShieldAlert className="h-3.5 w-3.5" /> Wymagana weryfikacja
                </p>
                <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
                  Ogloszenia moga publikowac wylacznie hodowcy po zatwierdzeniu dokumentow przez
                  administratora. Nie da sie „przelaczyc” konta jednym kliknieciem — wyslij wniosek
                  z legitymacja / rejestrem klubu.
                </p>
                <Link
                  to="/verify"
                  className="btn-aura mt-3 inline-flex w-full items-center justify-center rounded-xl py-2.5 text-[10px] font-semibold uppercase tracking-[0.2em]"
                >
                  Przejdz do weryfikacji
                </Link>
              </div>
            )}

            {(tab === "post" || (tab === "listing" && isVerifiedBreeder) || tab === "pet") && (
              <>
                <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border/70 bg-background/30 px-4 py-8 text-center">
                  <ImagePlus className="h-5 w-5 text-muted-foreground" />
                  <span className="mt-2 text-xs text-muted-foreground">
                    {tab === "post" ? "Zdjecie lub wideo" : "Zdjecie"}
                  </span>
                  <input
                    type="file"
                    accept={tab === "post" ? "image/*,video/*" : "image/*"}
                    multiple={tab === "post"}
                    className="sr-only"
                    onChange={upload}
                  />
                </label>
                {videoUrl && (
                  <div className="overflow-hidden rounded-xl border border-border/50">
                    <video src={videoUrl} className="max-h-64 w-full object-contain" controls />
                  </div>
                )}

                {!videoUrl && tab === "post" && postDrafts.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold">Zdjęcia w Studio</p>
                      <p className="text-[10px] text-muted-foreground">
                        {postDrafts.length}/10 · efekty zostaną zapisane w pliku
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {postDrafts.map((draft, index) => (
                        <div key={draft.id} className="relative overflow-hidden rounded-xl border border-border/50">
                          <img
                            src={draft.previewUrl}
                            alt={`Zdjęcie posta ${index + 1}`}
                            className="aspect-square w-full object-cover"
                          />
                          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-black/75 p-2">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => setEditingPhotoIndex(index)}
                              className="rounded-lg bg-white/15 px-2 py-1.5 text-[10px] font-semibold text-white"
                            >
                              Edytuj
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => {
                                URL.revokeObjectURL(draft.previewUrl);
                                setPostDrafts((previous) => previous.filter((item) => item.id !== draft.id));
                                if (editingPhotoIndex === index) setEditingPhotoIndex(null);
                              }}
                              className="rounded-lg bg-red-500/80 px-2 py-1.5 text-[10px] font-semibold text-white"
                            >
                              Usuń
                            </button>
                          </div>
                          {index === 0 && (
                            <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-1 text-[10px] text-white">
                              Okładka
                            </span>
                          )}
                          {draft.edits?.filter && draft.edits.filter !== "none" && (
                            <span className="absolute right-2 top-2 rounded-full bg-aura/90 px-2 py-1 text-[9px] text-white">
                              Studio
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {editingPhotoIndex !== null && postDrafts[editingPhotoIndex] && (
                  <PhotoStudioEditor
                    file={postDrafts[editingPhotoIndex].file}
                    previewUrl={postDrafts[editingPhotoIndex].previewUrl}
                    initialSettings={postDrafts[editingPhotoIndex].edits}
                    onCancel={() => setEditingPhotoIndex(null)}
                    onSave={(edits) => {
                      const editingId = postDrafts[editingPhotoIndex].id;
                      setPostDrafts((previous) =>
                        previous.map((item) =>
                          item.id === editingId ? { ...item, edits } : item
                        )
                      );
                      setEditingPhotoIndex(null);
                      toast.success("Zapisano ustawienia zdjęcia");
                    }}
                  />
                )}

                {!videoUrl && tab !== "post" && imageUrl && (
                  <div className="overflow-hidden rounded-xl border border-border/50">
                    <Image src={imageUrl} alt="" className="max-h-48 w-full object-cover" />
                  </div>
                )}

                {tab === "post" && (
                  <>
                    <Field label="Opis">
                      <textarea
                        value={form.postCaption}
                        onChange={set("postCaption")}
                        rows={4}
                        className={inputClass}
                        placeholder="Co sie dzieje w hodowli?"
                      />
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Miasto">
                        <select value={form.city} onChange={set("city")} className={inputClass}>
                          {CITY_NAMES.map((c) => (
                            <option key={c} value={c} className="bg-popover">
                              {c}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Rasa (opcjonalnie)">
                        <input value={form.breed} onChange={set("breed")} className={inputClass} />
                      </Field>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Pelny edytor filmow:{" "}
                      <Link to="/video-editor" className="text-aura underline">
                        Studio Reels
                      </Link>
                    </p>
                  </>
                )}

                {tab === "listing" && isVerifiedBreeder && (
                  <>
                    <div className="flex gap-2">
                      {[
                        { id: "sale", label: "Sprzedaz" },
                        { id: "adoption", label: "Adopcja" },
                      ].map((k) => (
                        <button
                          key={k.id}
                          type="button"
                          onClick={() => setKind(k.id)}
                          className={cn(
                            "rounded-full px-3 py-1.5 text-xs",
                            kind === k.id ? "bg-foreground text-background" : "border border-border/70"
                          )}
                        >
                          {k.label}
                        </button>
                      ))}
                    </div>
                    <Field label="Tytul">
                      <input value={form.title} onChange={set("title")} className={inputClass} required />
                    </Field>
                    <Field label="Opis">
                      <textarea value={form.description} onChange={set("description")} rows={4} className={inputClass} />
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Cena (zl)">
                        <input value={form.price} onChange={set("price")} inputMode="decimal" className={inputClass} />
                      </Field>
                      <Field label="Miasto">
                        <select value={form.city} onChange={set("city")} className={inputClass}>
                          {CITY_NAMES.map((c) => (
                            <option key={c} value={c} className="bg-popover">
                              {c}
                            </option>
                          ))}
                        </select>
                      </Field>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Gatunek">
                        <select value={form.species} onChange={set("species")} className={inputClass}>
                          <option value="dog" className="bg-popover">
                            Pies
                          </option>
                          <option value="cat" className="bg-popover">
                            Kot
                          </option>
                        </select>
                      </Field>
                      <Field label="Rasa">
                        <input value={form.breed} onChange={set("breed")} className={inputClass} />
                      </Field>
                    </div>
                    <Field label="Wiek (miesiace)">
                      <input value={form.age_months} onChange={set("age_months")} inputMode="numeric" className={inputClass} />
                    </Field>
                    <p className="text-[10px] text-muted-foreground">
                      Pierwsze ogloszenie gratis · kolejne {LISTING_COST} coinow · masz {coins}.
                    </p>
                  </>
                )}

                {tab === "pet" && (
                  <>
                    <Field label="Imie">
                      <input value={form.petName} onChange={set("petName")} className={inputClass} />
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Gatunek">
                        <select value={form.species} onChange={set("species")} className={inputClass}>
                          <option value="dog" className="bg-popover">
                            Pies
                          </option>
                          <option value="cat" className="bg-popover">
                            Kot
                          </option>
                        </select>
                      </Field>
                      <Field label="Rasa">
                        <input value={form.breed} onChange={set("breed")} className={inputClass} />
                      </Field>
                    </div>
                    <Field label="Data urodzenia">
                      <input type="date" value={form.petBirth} onChange={set("petBirth")} className={inputClass} />
                    </Field>
                    <Field label="Opis">
                      <textarea value={form.petBio} onChange={set("petBio")} rows={3} className={inputClass} />
                    </Field>
                  </>
                )}

                {(tab !== "listing" || isVerifiedBreeder) && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={submit}
                    className="btn-aura mt-2 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-[11px] font-semibold uppercase tracking-[0.18em] disabled:opacity-60"
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Opublikuj
                  </button>
                )}
              </>
            )}
          </div>

          <aside className="rounded-[var(--radius)] border border-border/70 bg-card/40 p-4 text-[12px] text-muted-foreground">
            <p className="text-[10px] uppercase tracking-[0.24em]">Zasady</p>
            <ul className="mt-2 list-disc space-y-1.5 pl-4">
              <li>Posty i reels — kazdy zalogowany uzytkownik.</li>
              <li>Ogloszenia — tylko po zatwierdzeniu dokumentow przez admina.</li>
              <li>Odznaka „Zweryfikowany hodowca” pojawia sie automatycznie po approve.</li>
            </ul>
            {profile?.verified && (
              <p className="mt-3 flex items-center gap-1.5 text-aura">
                <BadgeCheck className="h-4 w-4" /> Twoje konto jest zweryfikowane
              </p>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block text-[11px] text-muted-foreground">
      {label}
      {children}
    </label>
  );
}
