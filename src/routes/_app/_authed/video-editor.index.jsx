import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Film } from "lucide-react";
import TopBar from "@/components/layout/TopBar";
import PurreStudio from "@/components/studio/PurreStudio";
import { base44, storiesApi, getUploadedFileUrl, getUploadErrorMessage } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { ensureProfile } from "@/lib/useProfile";

export const Route = createFileRoute("/_app/_authed/video-editor/")({
  head: () => ({ meta: [{ title: "PURRE PETS — Studio Reels" }] }),
  component: VideoEditorPage,
});

/**
 * Studio Reels — ścieżka wejściowa do WSPÓLNEGO PURRE PETS STUDIO (tryb reel, 9:16).
 * Wieloklipowy import, split/reorder/trim/speed, filtry, tekst, naklejki,
 * muzyka + voiceover miksowane w eksporcie, MP4/H.264 lub WebM.
 * Publikacja wysyła WYEXPORTOWANY materiał (+ okładka) — nigdy oryginał.
 */
function readInitialMusic() {
  try {
    if (typeof window === "undefined") return null;

    const raw = new URLSearchParams(window.location.search).get("music");
    if (!raw) return null;

    const track = JSON.parse(raw);

    if (
      !track ||
      typeof track !== "object" ||
      typeof track.url !== "string" ||
      !track.url.trim()
    ) {
      return null;
    }

    return track;
  } catch {
    return null;
  }
}

function VideoEditorPage() {
  const navigate = useNavigate();
  const { user, navigateToLogin } = useAuth();
  const [initialMusic] = useState(readInitialMusic);
  const [studioOpen, setStudioOpen] = useState(false);
  const [stage, setStage] = useState("");

  const publish = async ({ kind, files, coverBlob, meta }) => {
    if (!user) {
      navigateToLogin();
      return;
    }
    setStage("upload");
    try {
      const videoUrl = getUploadedFileUrl(
        await base44.integrations.Core.UploadPublicFile({ file: files[0] })
      );

      let coverUrl = "";
      if (coverBlob) {
        const upCover = await base44.integrations.Core.UploadPublicFile({
          file: new File([coverBlob], "purre-cover.jpg", { type: "image/jpeg" }),
        });
        coverUrl = getUploadedFileUrl(upCover);
      }

      if (kind === "story") {
        setStage("save");
        await storiesApi.create({
          media_url: videoUrl,
          media_type: files[0].type.startsWith("video/") ? "video" : "image",
          caption: null,
          music_title: meta?.musicTitle ?? null,
          music_url: meta?.musicUrl ?? null,
          // Efekty są wypalone w wyeksportowanym pliku.
          filter: null,
          overlay_text: null,
          overlay_position: null,
        });
        toast.success("Relacja opublikowana — zniknie po 24 h");
        navigate({ to: "/" });
        return;
      }

      setStage("save");
      const currentProfile = await ensureProfile(user);
      await base44.entities.Post.create({
        author_id: user.id,
        author_name: currentProfile?.kennel_name || currentProfile?.display_name || user.full_name,
        author_handle: currentProfile?.handle,
        author_avatar: currentProfile?.avatar_url,
        author_verified: !!currentProfile?.verified,
        caption: String(meta?.caption ?? "").trim() || "Mój nowy reel",
        image_url: coverUrl,
        image_urls: coverUrl ? [coverUrl] : [],
        video_url: videoUrl,
        likes: 0,
        comment_count: 0,
        status: "published",
      });
      toast.success("Reel opublikowany — materiał jest w aplikacji");
      navigate({ to: "/reels" });
    } catch (error) {
      // Rzucamy dalej — Studio pozostaje otwarte i nie traci projektu.
      throw new Error(getUploadErrorMessage(error, "Nie udało się opublikować materiału."), { cause: error });
    } finally {
      setStage("");
    }
  };

  return (
    <div>
      <TopBar title="Studio Reels" />
      <div className="px-4 pb-12 pt-6 lg:px-8">
        <p className="text-[10px] uppercase tracking-[0.4em] text-muted-foreground">purre pets studio</p>
        <h1 className="mt-2 font-display text-4xl">
          <span className="aura-text">Twórca Reels</span>
        </h1>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          Wspólny edytor PURRE PETS STUDIO: wiele klipów, oś czasu z miniaturami, podział i kolejność klipów,
          przycinanie, tempo, filtry, tekst, naklejki, muzyka i voiceover miksowane w eksportowanym pliku
          (MP4/H.264, a gdy przeglądarka nie wspiera — WebM).
        </p>

        <button
          type="button"
          onClick={() => setStudioOpen(true)}
          className="btn-aura mt-6 flex items-center gap-2 rounded-xl px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.18em]"
        >
          <Film className="h-4 w-4" /> Otwórz Studio (9:16)
        </button>
        <p className="mt-3 text-[11px] text-muted-foreground">
          W Studiu dodasz klipy i zdjęcia (także wiele naraz). Projekt autosave'uje się lokalnie —
          po powrocie przywrócisz niedokończoną edycję.
        </p>
        {stage === "upload" && <p className="mt-3 text-[11px] text-aura">Wysyłam wyeksportowany materiał na serwer…</p>}
        {stage === "save" && <p className="mt-3 text-[11px] text-aura">Zapisuję publikację…</p>}
      </div>

      <PurreStudio
        open={studioOpen}
        initialMusic={initialMusic}
        mode="reel"
        publishLabel="Publikuj jako Reel"
        onClose={() => setStudioOpen(false)}
        onPublish={publish}
      />
    </div>
  );
}
