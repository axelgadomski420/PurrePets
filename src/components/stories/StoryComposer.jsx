import { useEffect, useRef, useState } from "react";
import { Loader2, Send, Type, X } from "lucide-react";
import { toast } from "sonner";
import { base44, storiesApi } from "@/api/base44Client";
import SoundPicker from "@/components/reels/SoundPicker";
import { cn } from "@/lib/utils";
import { exportStudioImage, STUDIO_FILTERS } from "@/lib/purre-studio";

// Wspólne presety PURRE PETS STUDIO — podgląd i eksport.
export const STORY_FILTERS = STUDIO_FILTERS;

export const filterCss = (id) =>
  STORY_FILTERS.find((filter) => filter.id === id)?.css ?? "none";

const POSITIONS = { top: "items-start pt-14", center: "items-center", bottom: "items-end pb-24" };

/**
 * StoryComposer — publikacja relacji 24 h w stylu Instagram Premium:
 * zdjęcie/wideo, filtry, nakładka tekstowa, muzyka (PURRE + iTunes), podgląd.
 */
export default function StoryComposer({ onClose, onPublished }) {
  const [file, setFile] = useState(null);
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaType, setMediaType] = useState("image");
  const [filter, setFilter] = useState("none");
  const [overlay, setOverlay] = useState("");
  const [overlayPos, setOverlayPos] = useState("bottom");
  const [caption, setCaption] = useState("");
  const [track, setTrack] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const fileRef = useRef(null);
  const previewRef = useRef(null);
  const imageRef = useRef(null);

  useEffect(() => () => URL.revokeObjectURL(mediaUrl), [mediaUrl]);

  const pickFile = (selected) => {
    if (!selected) return;
    const imageTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "image/avif",
    ];
    const videoTypes = [
      "video/mp4",
      "video/webm",
      "video/quicktime",
    ];

    const isImage = imageTypes.includes(selected.type);
    const isVideo = videoTypes.includes(selected.type);

    if (!isImage && !isVideo) {
      toast.error("Obsługiwane formaty: JPG, PNG, WEBP, GIF, AVIF, MP4, WEBM i MOV");
      return;
    }

    const limit = isVideo ? 100 * 1024 * 1024 : 10 * 1024 * 1024;
    if (selected.size <= 0 || selected.size > limit) {
      toast.error(isVideo
        ? "Wideo musi mieć rozmiar do 100 MB"
        : "Zdjęcie musi mieć rozmiar do 10 MB");
      return;
    }
    setFile(selected);
    setMediaType(selected.type.startsWith("video") ? "video" : "image");
    setMediaUrl(URL.createObjectURL(selected));
  };

  const publish = async () => {
    if (!file || publishing) return;
    setPublishing(true);
    try {
      setUploading(true);
      let uploadFile = file;

      if (mediaType === "image") {
        const image = imageRef.current;

        if (!image) {
          throw new Error("Nie znaleziono zdjęcia do eksportu.");
        }

        if (typeof image.decode === "function") {
          await image.decode();
        } else if (!image.complete) {
          await new Promise((resolve, reject) => {
            image.addEventListener("load", resolve, { once: true });
            image.addEventListener(
              "error",
              () => reject(new Error("Nie udało się wczytać zdjęcia.")),
              { once: true }
            );
          });
        }

        if (!image.complete || !image.naturalWidth || !image.naturalHeight) {
          throw new Error("Zdjęcie jest uszkodzone lub nie zostało poprawnie wczytane.");
        }

        const blob = await exportStudioImage(image, {
          format: "story",
          filter,
          text: overlay.trim(),
          textOptions: {
            position: overlayPos,
            fontSize: 48,
            fontWeight: 700,
            align: "center",
            color: "#ffffff",
            background: true,
            backgroundColor: "rgba(0,0,0,0.35)",
          },
          type: "image/jpeg",
          quality: 0.92,
        });

        if (typeof File === "undefined") {
          throw new Error("Ta przeglądarka nie obsługuje przygotowania pliku wynikowego.");
        }

        const baseName = (file.name || "story").replace(/\.[^.]+$/, "");
        uploadFile = new File(
          [blob],
          `${baseName || "story"}-purre-studio.jpg`,
          { type: "image/jpeg", lastModified: Date.now() }
        );
      }

      const up = await base44.integrations.Core.UploadPublicFile({
        file: uploadFile,
      });
      const uploadedUrl = up?.file_url || up?.url;

      if (typeof uploadedUrl !== "string" || !uploadedUrl.trim()) {
        throw new Error("Serwer nie zwrócił adresu przesłanego pliku");
      }

      setUploading(false);
      await storiesApi.create({
        media_url: uploadedUrl.trim(),
        media_type: mediaType,
        caption: caption.trim() || null,
        music_title: track ? `${track.title}${track.artist ? ` — ${track.artist}` : ""}` : null,
        music_url: track?.url ?? null,
        // Efekty zdjęć są już wypalone w eksporcie Canvas.
        // Dla wideo zachowujemy dotychczasowe metadane.
        filter: mediaType === "image" ? null : (filter !== "none" ? filter : null),
        overlay_text: mediaType === "image" ? null : (overlay.trim() || null),
        overlay_position: mediaType === "image"
          ? null
          : (overlay.trim() ? overlayPos : null),
      });
      toast.success("Relacja opublikowana — zniknie po 24 h");
      onPublished?.();
      onClose?.();
    } catch (err) {
      toast.error(err?.message ?? "Nie udało się opublikować relacji");
    } finally {
      setPublishing(false);
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/90 backdrop-blur-sm">
      <header className="flex items-center gap-2 px-4 py-3">
        <p className="font-display text-sm text-white">Nowa relacja</p>
        <button type="button" onClick={onClose} className="ml-auto grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white" aria-label="Zamknij">
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="flex min-h-0 flex-1 gap-3 px-4 pb-4 lg:flex-row lg:px-8">
        {/* Podgląd 9:16 */}
        <div className="mx-auto flex w-full max-w-sm flex-1 items-center justify-center lg:mx-0">
          <div className="relative flex h-full max-h-[70vh] w-full items-center justify-center overflow-hidden rounded-3xl bg-zinc-950 ring-1 ring-white/10">
            {mediaUrl ? (
              mediaType === "video" ? (
                <video ref={previewRef} src={mediaUrl} autoPlay loop muted playsInline className="h-full w-full object-cover" style={{ filter: filterCss(filter) }} />
              ) : (
                <img ref={imageRef} src={mediaUrl} alt="" className="h-full w-full object-cover" style={{ filter: filterCss(filter) }} />
              )
            ) : (
              <button type="button" onClick={() => fileRef.current?.click()} className="grid h-full w-full place-items-center text-center text-[11px] uppercase tracking-[0.2em] text-white/60">
                Kliknij, aby wybrać zdjęcie lub wideo
              </button>
            )}
            {overlay.trim() && (
              <div className={cn("pointer-events-none absolute inset-x-0 flex justify-center px-6", POSITIONS[overlayPos])}>
                <span className="rounded-lg bg-black/35 px-2.5 py-1 text-center text-sm font-semibold text-white drop-shadow" style={{ textShadow: "0 1px 6px rgba(0,0,0,0.7)" }}>
                  {overlay}
                </span>
              </div>
            )}
            {track && (
              <p className="absolute bottom-3 left-3 flex items-center gap-1 rounded-full bg-black/50 px-2.5 py-1 text-[10px] text-white">
                ♫ {track.title}{track.artist ? ` — ${track.artist}` : ""}
              </p>
            )}
          </div>
        </div>

        {/* Panel narzędzi */}
        <div className="no-scrollbar w-full shrink-0 space-y-3 overflow-y-auto rounded-3xl border border-white/10 bg-card/60 p-3 lg:w-96">
          <div className="flex gap-2">
            <button type="button" disabled={publishing} onClick={() => fileRef.current?.click()} className="flex-1 rounded-xl border border-white/15 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-white disabled:opacity-50">
              {file ? "Zmień medium" : "Wybierz plik"}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,image/avif,video/mp4,video/webm,video/quicktime"
              className="hidden"
              disabled={publishing}
              onChange={(e) => {
                pickFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </div>

          <div>
            <p className="mb-1.5 text-[9px] uppercase tracking-[0.2em] text-white/60">Filtry</p>
            <div className="grid grid-cols-4 gap-1.5">
              {STORY_FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilter(f.id)}
                  className={cn(
                    "rounded-lg border px-1 py-1.5 text-[9px] font-medium",
                    filter === f.id ? "border-aura bg-aura/20 text-aura" : "border-white/15 text-white/70"
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1.5 flex items-center gap-1 text-[9px] uppercase tracking-[0.2em] text-white/60">
              <Type className="h-3 w-3" /> Nakładka tekstowa
            </p>
            <input
              value={overlay}
              onChange={(e) => setOverlay(e.target.value)}
              maxLength={80}
              placeholder="Np. Miot F — 4 tygodnie ❤️"
              className="h-9 w-full rounded-xl border border-white/15 bg-black/30 px-3 text-xs text-white outline-none placeholder:text-white/40"
            />
            <div className="mt-1.5 flex gap-1.5">
              {["top", "center", "bottom"].map((pos) => (
                <button
                  key={pos}
                  type="button"
                  onClick={() => setOverlayPos(pos)}
                  className={cn(
                    "flex-1 rounded-lg border py-1 text-[9px] uppercase",
                    overlayPos === pos ? "border-aura text-aura" : "border-white/15 text-white/60"
                  )}
                >
                  {pos === "top" ? "Góra" : pos === "center" ? "Środek" : "Dół"}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-[9px] uppercase tracking-[0.2em] text-white/60">Muzyka</p>
            <div className="text-foreground [&_.text-muted-foreground]:text-white/60 [&_input]:bg-black/30 [&_input]:text-white [&_li]:text-white [&_p.text-\[10px\].uppercase]:text-white/60">
              <SoundPicker value={track} onChange={setTrack} />
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-[9px] uppercase tracking-[0.2em] text-white/60">Podpis</p>
            <input
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              maxLength={200}
              placeholder="Krótki podpis (opcjonalnie)"
              className="h-9 w-full rounded-xl border border-white/15 bg-black/30 px-3 text-xs text-white outline-none placeholder:text-white/40"
            />
          </div>

          <button
            type="button"
            onClick={publish}
            disabled={!file || publishing}
            className="btn-aura flex w-full items-center justify-center gap-2 rounded-xl py-3 text-[10px] font-semibold uppercase tracking-[0.18em] disabled:opacity-50"
          >
            {publishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            {publishing ? (uploading ? "Wysyłam…" : "Publikuję…") : "Publikuj relację"}
          </button>
        </div>
      </div>
    </div>
  );
}
