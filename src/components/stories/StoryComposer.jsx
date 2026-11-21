import { useEffect, useRef, useState } from "react";
import { Loader2, Send, Wand2, X } from "lucide-react";
import { toast } from "sonner";
import { base44, storiesApi, getUploadedFileUrl, getUploadErrorMessage } from "@/api/base44Client";
import SoundPicker from "@/components/reels/SoundPicker";
import PurreStudio from "@/components/studio/PurreStudio";
import { STUDIO_FILTERS } from "@/lib/purre-studio";

// Zachowana kompatybilność eksportów (inne komponenty importują te nazwy).
export const STORY_FILTERS = STUDIO_FILTERS;

export const filterCss = (id) =>
  STORY_FILTERS.find((filter) => filter.id === id)?.css ?? "none";

/**
 * StoryComposer — publikacja relacji 24 h przez WSPÓLNY PURRE PETS STUDIO.
 * Zdjęcia I wideo są edytowane (filtry, tekst, naklejki, muzyka/voiceover)
 * i publikowane jako WYEXPORTOWANY plik — efekty są wypalone w materiale,
 * a muzyka zmiksowana z dźwiękiem (nie tylko metadane).
 */
export default function StoryComposer({ onClose, onPublished }) {
  const [file, setFile] = useState(null);
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaType, setMediaType] = useState("image");
  const [studioOpen, setStudioOpen] = useState(false);
  const [caption, setCaption] = useState("");
  const [track, setTrack] = useState(null);
  const [publishing, setPublishing] = useState(false);
  const fileRef = useRef(null);
  const publishLockRef = useRef(false);

  useEffect(() => () => {
    if (mediaUrl) URL.revokeObjectURL(mediaUrl);
  }, [mediaUrl]);

  const pickFile = (selected) => {
    if (!selected) return;
    try {
      const kind = validateKind(selected);
      setFile(selected);
      setMediaType(kind);
      setMediaUrl(URL.createObjectURL(selected));
      setStudioOpen(true); // od razu otwieramy wspólne Studio
    } catch (err) {
      toast.error(err?.message ?? "Nieobsługiwany plik");
    }
  };

  function validateKind(selected) {
    const imageTypes = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];
    const videoTypes = ["video/mp4", "video/webm", "video/quicktime"];
    const isImage = imageTypes.includes(selected.type);
    const isVideo = videoTypes.includes(selected.type);
    if (!isImage && !isVideo) throw new Error("Obsługiwane formaty: JPG, PNG, WEBP, GIF, AVIF, MP4, WEBM i MOV");
    const limit = isVideo ? 100 * 1024 * 1024 : 10 * 1024 * 1024;
    if (selected.size <= 0 || selected.size > limit) {
      throw new Error(isVideo ? "Wideo musi mieć rozmiar do 100 MB" : "Zdjęcie musi mieć rozmiar do 10 MB");
    }
    return isVideo ? "video" : "image";
  }

  // Publikacja: onPublish dostaje WYEXPORTOWANE pliki z PurreStudio.
  const handlePublish = async ({ kind, files, coverBlob, meta }) => {
    if (publishLockRef.current) return;

    const fileToPublish = Array.isArray(files) ? files[0] : null;
    if (!(fileToPublish instanceof File) || fileToPublish.size <= 0) {
      toast.error("Studio nie przygotowało prawidłowego pliku do publikacji.");
      throw new Error("Brak prawidłowego pliku wynikowego.");
    }

    publishLockRef.current = true;
    setPublishing(true);
    try {
      const up = await base44.integrations.Core.UploadPublicFile({ file: fileToPublish });
      const uploadedUrl = getUploadedFileUrl(up);
      // Muzyka: dla wideo jest już ZMIKSOWANA w pliku; tytuł zapisujemy jako metadane.
      const musicTitle = track
        ? track.title + (track.artist ? " — " + track.artist : "")
        : (meta?.musicTitle ?? null);
      const musicUrl = track?.url ?? meta?.musicUrl ?? null;
      await storiesApi.create({
        media_url: uploadedUrl.trim(),
        media_type: kind === "video" ? "video" : "image",
        caption: caption.trim() || null,
        music_title: musicTitle,
        music_url: musicUrl,
        // Efekty są WYPAŁONE w eksporcie — nie przekazujemy presetu do renderowania po stronie klienta.
        filter: null,
        overlay_text: null,
        overlay_position: null,
      });
      toast.success("Relacja opublikowana — zniknie po 24 h");
      onPublished?.();
      onClose?.();
    } catch (err) {
      toast.error(getUploadErrorMessage(err, "Nie udało się opublikować relacji"));
      throw err; // Studio pozostaje otwarte — użytkownik nie traci projektu
    } finally {
      publishLockRef.current = false;
      setPublishing(false);
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

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4">
        {!file ? (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="grid flex-1 place-items-center rounded-3xl border border-dashed border-white/20 text-center text-[11px] uppercase tracking-[0.2em] text-white/60"
          >
            Kliknij, aby wybrać zdjęcie lub wideo
          </button>
        ) : (
          <div className="space-y-3 rounded-3xl border border-white/10 bg-card/60 p-3 text-white">
            <p className="text-[11px] text-white/70">
              Materiał gotowy ({mediaType === "video" ? "wideo" : "zdjęcie"}). Edytuj go we wspólnym Studio —
              filtry, tekst, naklejki, a dla wideo także muzyka i voiceover.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setStudioOpen(true)}
                disabled={publishing}
                className="btn-aura flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-[10px] font-semibold uppercase tracking-widest disabled:opacity-50"
              >
                <Wand2 className="h-3.5 w-3.5" /> Otwórz Studio
              </button>
              <button
                type="button"
                onClick={() => { setFile(null); if (mediaUrl) URL.revokeObjectURL(mediaUrl); setMediaUrl(""); }}
                className="rounded-xl border border-white/15 px-3 text-[10px] uppercase tracking-widest text-white/70"
              >
                Zmień plik
              </button>
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
            <div>
              <p className="mb-1.5 text-[9px] uppercase tracking-[0.2em] text-white/60">Muzyka (metadana dla zdjęć; dla wideo zmiksowana w Studio)</p>
              <div className="text-foreground [&_.text-muted-foreground]:text-white/60 [&_input]:bg-black/30 [&_input]:text-white [&_li]:text-white">
                <SoundPicker value={track} onChange={setTrack} />
              </div>
            </div>
            {publishing && (
              <p className="flex items-center gap-2 text-[11px] text-aura">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Publikuję…
              </p>
            )}
          </div>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/avif,video/mp4,video/webm,video/quicktime"
        className="hidden"
        onChange={(e) => {
          pickFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      {/* JEDEN wspólny edytor — tryb story (9:16) */}
      <PurreStudio
        open={studioOpen && !!file}
        mode="story"
        imageFormat="square"
        initialFiles={file ? [file] : []}
        initialMusic={track}
        publishLabel="Publikuj relację"
        onClose={() => setStudioOpen(false)}
        onPublish={handlePublish}
      />
    </div>
  );
}
