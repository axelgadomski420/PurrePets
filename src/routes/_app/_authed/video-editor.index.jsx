import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import TopBar from "@/components/layout/TopBar";
import { base44, storiesApi } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { ensureProfile } from "@/lib/useProfile";
import { renderStudioFrame, STUDIO_FILTERS } from "@/lib/purre-studio";

export const Route = createFileRoute("/_app/_authed/video-editor/")({
  head: () => ({ meta: [{ title: "PURRE PETS — Edytor wideo" }] }),
  component: VideoEditorPage,
});

const FILTERS = STUDIO_FILTERS;

const SPEEDS = [0.5, 1, 1.5, 2];

const STICKERS = ["🐶", "🐱", "🐾", "❤️", "⭐", "🔥", "🏆", "😂", "🦴", "🏅"];

const TEXT_POSITIONS = [
  { id: "top", label: "Góra" },
  { id: "center", label: "Środek" },
  { id: "bottom", label: "Dół" },
];

function VideoEditorPage() {
  const navigate = useNavigate();
  const { user, navigateToLogin } = useAuth();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const urlRef = useRef("");
  const audioCtxRef = useRef(null);
  const audioSourceRef = useRef(null);
  const coverBlobRef = useRef(null);
  const trackRef = useRef(null);
  const [src, setSrc] = useState("");
  const [duration, setDuration] = useState(0);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [time, setTime] = useState(0);
  const [filter, setFilter] = useState(FILTERS[1]);
  const [caption, setCaption] = useState("");
  const [textPos, setTextPos] = useState("bottom");
  const [stickers, setStickers] = useState([]);
  const [speed, setSpeed] = useState(1);
  const [volume, setVolume] = useState(1);
  const [hasCover, setHasCover] = useState(false);
  const [stage, setStage] = useState(""); // "" | "export" | "upload" | "save"
  const [progress, setProgress] = useState(0);
  const busy = Boolean(stage);

  useEffect(() => () => URL.revokeObjectURL(urlRef.current), []);

  const choose = (file) => {
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      toast.error("Wybierz plik wideo.");
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      toast.error("Film może mieć maksymalnie 100 MB.");
      return;
    }
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    const url = URL.createObjectURL(file);
    urlRef.current = url;
    coverBlobRef.current = null;
    setHasCover(false);
    setSrc(url);
    setStart(0);
    setEnd(0);
    setDuration(0);
    setTime(0);
    setStickers([]);
  };

  const onLoaded = () => {
    const video = videoRef.current;
    if (!video) return;
    const length = Number.isFinite(video.duration) ? video.duration : 0;
    setDuration(length);
    setEnd(length);
    video.playbackRate = speed;
    video.volume = volume;
  };

  const onTime = () => {
    const video = videoRef.current;
    if (!video) return;
    setTime(video.currentTime);
    if (!end) return;
    if (video.currentTime >= end) {
      video.pause();
      video.currentTime = start;
    }
  };

  const playTrim = () => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = speed;
    video.currentTime = start;
    video.play().catch(() => toast.error("Przeglądarka zablokowała odtwarzanie"));
  };

  const seekTo = (value) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.min(Math.max(value, 0), Math.max(duration, 0));
    setTime(video.currentTime);
  };

  const setVolumeValue = (value) => {
    setVolume(value);
    if (videoRef.current) videoRef.current.volume = value;
  };

  // --- Oś czasu: przeciąganie uchwytów trim + klik = przewinięcie -------------
  const positionFromEvent = (clientX) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || !rect.width) return 0;
    const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
    return ratio * Math.max(duration, 0);
  };

  const beginDrag = (kind) => (event) => {
    event.preventDefault();
    event.stopPropagation();
    const move = (e) => {
      const value = positionFromEvent(e.clientX);
      if (kind === "start") setStart(Math.min(value, end - 0.2));
      else setEnd(Math.max(value, start + 0.2));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const addSticker = (emoji) => {
    setStickers((prev) => [
      ...prev.slice(0, 11),
      { id: \`s\${Date.now()}\`, text: emoji, x: 0.5, y: 0.4 + prev.length * 0.05, size: 72, rotation: 0 },
    ]);
  };

  const updateSticker = (id, patch) => {
    setStickers((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const removeSticker = (id) => {
    setStickers((prev) => prev.filter((s) => s.id !== id));
  };

  const drawFrame = (video, context, width, height) => {
    if (!video?.videoWidth || !video?.videoHeight || !context?.canvas) return;
    renderStudioFrame(video, context.canvas, {
      width,
      height,
      format: "reel",
      filter: filter.id,
      brightness: 100,
      contrast: 100,
      saturation: 100,
      text: caption.trim().slice(0, 120),
      textOptions: {
        fontSize: 36,
        fontFamily: "Georgia, serif",
        fontWeight: 700,
        position: textPos,
        background: true,
        backgroundColor: "rgba(5,5,7,0.58)",
        color: "#f6f3ee",
      },
      stickers: stickers.map((s) => ({ text: s.text, x: s.x, y: s.y, size: s.size, rotation: s.rotation })),
    });
  };

  // Dźwięk oryginału: MediaElementSource można utworzyć tylko raz na element — cache w ref.
  const ensureAudioGraph = () => {
    const video = videoRef.current;
    if (!video) return null;
    if (!audioCtxRef.current) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      try {
        const ctx = new Ctx();
        audioCtxRef.current = ctx;
        audioSourceRef.current = ctx.createMediaElementSource(video);
        audioSourceRef.current.connect(ctx.destination);
      } catch {
        audioCtxRef.current = null;
        audioSourceRef.current = null;
      }
    }
    return audioCtxRef.current;
  };

  const canvasToBlob = () =>
    new Promise((resolve) => {
      const canvas = canvasRef.current;
      if (!canvas) return resolve(null);
      canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.92);
    });

  // Okładka: klatka bieżąca (przycisk) albo pierwsza klatka przycięcia (auto przy publikacji).
  const captureCoverBlob = async (atStart = false) => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth) return null;
    if (atStart) {
      video.pause();
      video.currentTime = start || 0;
      await new Promise((resolve) => {
        video.onseeked = () => resolve();
        setTimeout(resolve, 800);
      });
    }
    canvas.width = 720;
    canvas.height = 1280;
    drawFrame(video, canvas.getContext("2d"), canvas.width, canvas.height);
    return canvasToBlob();
  };

  const saveCover = async () => {
    const blob = await captureCoverBlob(false);
    if (!blob) return;
    coverBlobRef.current = blob;
    setHasCover(true);
    toast.success("Okładka ustawiona — zostanie dołączona do publikacji");
  };

  const downloadCover = async () => {
    const blob = await captureCoverBlob(false);
    if (!blob) return;
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "purre-cover.jpg";
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 5000);
  };

  // Nagranie przyciętego klipu (z filtrem, napisem, naklejkami i DŹWIĘKIEM) do bloba WebM.
  const recordClip = async () => {
    if (!user) {
      navigateToLogin();
      return null;
    }
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth) {
      toast.error("Najpierw wybierz wideo");
      return null;
    }
    if (typeof canvas.captureStream !== "function" || typeof MediaRecorder === "undefined") {
      toast.error("Ta przeglądarka nie umie nagrać WebM — użyj Chrome/Edge/Firefox");
      return null;
    }
    setStage("export");
    setProgress(0);
    canvas.width = 720;
    canvas.height = 1280;
    const context = canvas.getContext("2d");
    video.pause();
    video.currentTime = start || 0;
    await new Promise((resolve) => {
      video.onseeked = () => resolve();
      setTimeout(resolve, 800);
    });
    const stream = canvas.captureStream(30);
    const audioCtx = ensureAudioGraph();
    if (audioCtx && audioSourceRef.current) {
      await audioCtx.resume().catch(() => {});
      const dest = audioCtx.createMediaStreamDestination();
      audioSourceRef.current.connect(dest);
      dest.stream.getAudioTracks().forEach((track) => stream.addTrack(track));
    }
    const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
      ? "video/webm;codecs=vp9,opus"
      : MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
        ? "video/webm;codecs=vp9"
        : "video/webm";
    const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4_000_000 });
    const chunks = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    const done = new Promise((resolve) => {
      recorder.onstop = () => resolve();
    });
    recorder.start();
    video.playbackRate = speed;
    await video.play().catch(() => {});
    const span = Math.max(end - start, 0.2);
    const paint = () => {
      if (video.currentTime >= end || video.ended) {
        video.pause();
        recorder.stop();
        return;
      }
      drawFrame(video, context, canvas.width, canvas.height);
      setProgress(Math.min(99, Math.round(((video.currentTime - start) / span) * 100)));
      requestAnimationFrame(paint);
    };
    paint();
    await done;
    setProgress(100);
    return new Blob(chunks, { type: "video/webm" });
  };

  const saveWebm = async () => {
    const blob = await recordClip();
    setStage("");
    if (!blob) return;
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "purre-reel.webm";
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 5000);
    toast.success("Klip pobrany na urządzenie");
  };

  const publishReel = async () => {
    if (busy || !user) return;
    try {
      const blob = await recordClip();
      if (!blob) return;
      setStage("upload");
      const up = await base44.integrations.Core.UploadPublicFile({
        file: new File([blob], "purre-reel.webm", { type: "video/webm" }),
      });
      let coverUrl = "";
      const coverBlob = coverBlobRef.current || (await captureCoverBlob(true));
      if (coverBlob) {
        const upCover = await base44.integrations.Core.UploadPublicFile({
          file: new File([coverBlob], "purre-cover.jpg", { type: "image/jpeg" }),
        });
        coverUrl = upCover.file_url;
      }
      setStage("save");
      const currentProfile = await ensureProfile(user);
      await base44.entities.Post.create({
        author_id: user.id,
        author_name: currentProfile?.kennel_name || currentProfile?.display_name || user.full_name,
        author_handle: currentProfile?.handle,
        author_avatar: currentProfile?.avatar_url,
        author_verified: !!currentProfile?.verified,
        caption: caption.trim() || "Mój nowy reel",
        image_url: coverUrl,
        image_urls: coverUrl ? [coverUrl] : [],
        video_url: up.file_url,
        likes: 0,
        comment_count: 0,
        status: "published",
      });
      toast.success("Reel opublikowany — materiał jest w aplikacji, nie w pobranych");
      navigate({ to: "/reels" });
    } catch (error) {
      toast.error(error?.message ?? "Publikacja nie powiodła się");
    } finally {
      setStage("");
      setProgress(0);
    }
  };

  const publishStory = async () => {
    if (busy || !user) return;
    try {
      const blob = await recordClip();
      if (!blob) return;
      setStage("upload");
      const up = await base44.integrations.Core.UploadPublicFile({
        file: new File([blob], "purre-story.webm", { type: "video/webm" }),
      });
      setStage("save");
      await storiesApi.create({
        media_url: up.file_url,
        media_type: "video",
        caption: caption.trim() || null,
        music_title: null,
        music_url: null,
        filter: filter.id !== "none" ? filter.id : null,
        overlay_text: caption.trim() || null,
        overlay_position: textPos,
      });
      toast.success("Relacja opublikowana — zniknie po 24 h");
      navigate({ to: "/" });
    } catch (error) {
      toast.error(error?.message ?? "Publikacja relacji nie powiodła się");
    } finally {
      setStage("");
      setProgress(0);
    }
  };

  const stageLabel = stage === "export" ? \`Nagrywam… \${progress}%\` : stage === "upload" ? "Wysyłam na serwer…" : "Zapisuję publikację…";

  const pct = (value) => (duration > 0 ? \`(\${(value / duration) * 100).toFixed(2)}%\` : "0%");

  return (
    <div>
      <TopBar title="Edytor" />
      <div className="px-4 pb-12 pt-6 lg:px-8">
        <p className="text-[10px] uppercase tracking-[0.4em] text-muted-foreground">reels studio</p>
        <h1 className="mt-2 font-display text-4xl">
          <span className="aura-text">Edytor wideo</span>
        </h1>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          Przytnij na osi czasu, nałóż filtr, napis i naklejki, ustaw okładkę, a potem opublikuj materiał jako Reel lub Relację.
          Pobieranie na urządzenie to osobna, świadoma opcja.
        </p>

        <label className="mt-6 flex cursor-pointer flex-col items-center justify-center rounded-[var(--radius)] border border-dashed border-white/20 bg-white/5 px-6 py-10 text-center">
          <span className="text-sm">Wybierz wideo z telefonu lub komputera</span>
          <span className="mt-1 text-[11px] text-muted-foreground">MP4, WebM, MOV — do 100 MB</span>
          <input
            type="file"
            accept="video/*"
            className="sr-only"
            disabled={busy}
            onChange={(event) => {
              choose(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </label>

        {src && (
          <div className="mt-6 grid items-start gap-6 lg:grid-cols-[320px_1fr]">
            <div className="overflow-hidden rounded-[var(--radius)] border border-border/70 bg-black">
              <video
                ref={videoRef}
                src={src}
                playsInline
                controls={false}
                onLoadedMetadata={onLoaded}
                onTimeUpdate={onTime}
                className="aspect-[9/16] w-full object-cover"
                style={{ filter: filter.css || "none" }}
              />
              {caption && (
                <p className={\`-mt-16 px-4 pb-6 text-center font-display text-xl text-white drop-shadow \${textPos === "top" ? "hidden" : ""}\`}>{caption}</p>
              )}
            </div>
            <div className="space-y-4">
              {/* Oś czasu: trim przeciąganiem, klik = przewinięcie */}
              <div>
                <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  <span>Oś czasu</span>
                  <span>\${start.toFixed(1)} s – \${end.toFixed(1)} s (\${Math.max(end - start, 0).toFixed(1)} s)</span>
                </div>
                <div
                  ref={trackRef}
                  onPointerDown={(e) => seekTo(positionFromEvent(e.clientX))}
                  className="relative mt-2 h-12 w-full cursor-pointer select-none overflow-hidden rounded-xl border border-border/70 bg-black/60"
                >
                  <div
                    className="absolute inset-y-0 bg-aura/25 ring-1 ring-inset ring-aura/60"
                    style={{ left: pct(start), width: \`\${(((end - start) / Math.max(duration, 0.1)) * 100).toFixed(2)}%\` }}
                  />
                  <div className="absolute inset-y-0 w-0.5 bg-white" style={{ left: pct(time) }} />
                  <button
                    type="button"
                    aria-label="Uchwyt początku"
                    onPointerDown={beginDrag("start")}
                    className="absolute inset-y-0 w-4 -translate-x-1/2 cursor-ew-resize rounded-md bg-aura/90"
                    style={{ left: pct(start) }}
                  />
                  <button
                    type="button"
                    aria-label="Uchwyt końca"
                    onPointerDown={beginDrag("end")}
                    className="absolute inset-y-0 w-4 -translate-x-1/2 cursor-ew-resize rounded-md bg-aura/90"
                    style={{ left: pct(end) }}
                  />
                </div>
              </div>

              <label className="block text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Głośność podglądu {Math.round(volume * 100)}%
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={volume}
                  onChange={(event) => setVolumeValue(Number(event.target.value))}
                  className="mt-2 w-full"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                {SPEEDS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setSpeed(value);
                      if (videoRef.current) videoRef.current.playbackRate = value;
                    }}
                    className={\`rounded-full px-3 py-1.5 text-[11px] \${speed === value ? "bg-foreground text-background" : "border border-border/70"}\`}
                  >
                    {value}×
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {FILTERS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setFilter(item)}
                    className={\`rounded-full px-3 py-1.5 text-[11px] \${filter.id === item.id ? "bg-aura text-background" : "border border-border/70"}\`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <input
                value={caption}
                maxLength={42}
                placeholder="Napis na klipie"
                onChange={(event) => setCaption(event.target.value)}
                className="w-full rounded-xl border border-border/70 bg-card/60 px-3 py-2 text-sm"
              />
              <div className="flex flex-wrap gap-2">
                {TEXT_POSITIONS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setTextPos(p.id)}
                    className={\`rounded-full px-3 py-1.5 text-[11px] \${textPos === p.id ? "bg-foreground text-background" : "border border-border/70"}\`}
                  >
                    Napis: {p.label}
                  </button>
                ))}
              </div>

              {/* Naklejki — silnik purre-studio renderuje je na klipie i okładce */}
              <div className="rounded-[var(--radius)] border border-border/70 bg-card/60 p-3">
                <p className="text-[9px] uppercase tracking-[0.24em] text-muted-foreground">Naklejki (max 12)</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {STICKERS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => addSticker(emoji)}
                      disabled={busy || stickers.length >= 12}
                      className="grid h-9 w-9 place-items-center rounded-xl border border-border/70 text-lg disabled:opacity-40"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
                {stickers.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {stickers.map((s, index) => (
                      <div key={s.id} className="rounded-xl border border-border/50 bg-background/40 p-2">
                        <div className="flex items-center justify-between text-[11px]">
                          <span>{s.text} naklejka \${index + 1}</span>
                          <button type="button" onClick={() => removeSticker(s.id)} className="text-muted-foreground hover:text-red-400" aria-label="Usuń naklejkę">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="mt-1 grid grid-cols-2 gap-2">
                          <label className="text-[10px] text-muted-foreground">
                            X
                            <input type="range" min={0} max={1} step={0.01} value={s.x} onChange={(e) => updateSticker(s.id, { x: Number(e.target.value) })} className="w-full" />
                          </label>
                          <label className="text-[10px] text-muted-foreground">
                            Y
                            <input type="range" min={0} max={1} step={0.01} value={s.y} onChange={(e) => updateSticker(s.id, { y: Number(e.target.value) })} className="w-full" />
                          </label>
                          <label className="text-[10px] text-muted-foreground">
                            Rozmiar
                            <input type="range" min={24} max={180} step={2} value={s.size} onChange={(e) => updateSticker(s.id, { size: Number(e.target.value) })} className="w-full" />
                          </label>
                          <label className="text-[10px] text-muted-foreground">
                            Obrót
                            <input type="range" min={-180} max={180} step={5} value={s.rotation} onChange={(e) => updateSticker(s.id, { rotation: Number(e.target.value) })} className="w-full" />
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {busy && (
                <div>
                  <p className="text-[11px] text-aura">{stageLabel}</p>
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-border/60">
                    <div className="h-full rounded-full bg-gradient-to-r from-violet to-aura transition-all" style={{ width: \`\${stage === "export" ? progress : 100}%\` }} />
                  </div>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={playTrim} disabled={busy} className="rounded-xl border border-border/70 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.16em] disabled:opacity-50">
                  Odtwórz fragment
                </button>
                <button type="button" onClick={saveCover} disabled={busy} className={\`rounded-xl px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.16em] border \${hasCover ? "border-aura text-aura" : "border-border/70"} disabled:opacity-50\`}>
                  {hasCover ? "Okładka ustawiona ✓" : "Ustaw okładkę"}
                </button>
              </div>
              <div className="rounded-[var(--radius)] border border-border/70 bg-card/60 p-3">
                <p className="text-[9px] uppercase tracking-[0.24em] text-muted-foreground">Publikacja</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" onClick={publishReel} disabled={busy} className="btn-aura flex items-center gap-2 rounded-xl px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.16em] disabled:opacity-60">
                    {stage === "upload" || stage === "save" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    Publikuj jako Reel
                  </button>
                  <button type="button" onClick={publishStory} disabled={busy} className="flex items-center gap-2 rounded-xl border border-border/70 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.16em] disabled:opacity-50">
                    Publikuj jako Relację
                  </button>
                </div>
                <p className="mt-2 text-[10px] text-muted-foreground">
                  Materiał trafia na serwer i zostaje powiązany z Twoim kontem — bez pobierania na urządzenie.
                </p>
              </div>
              <div className="rounded-[var(--radius)] border border-border/70 bg-card/40 p-3">
                <p className="text-[9px] uppercase tracking-[0.24em] text-muted-foreground">Pobierz na urządzenie (opcjonalnie)</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" onClick={saveWebm} disabled={busy} className="rounded-xl border border-border/70 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.16em] disabled:opacity-50">
                    Zapisz WebM
                  </button>
                  <button type="button" onClick={downloadCover} disabled={busy} className="rounded-xl border border-border/70 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.16em] disabled:opacity-50">
                    Okładka JPG
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        <canvas ref={canvasRef} className="hidden" />
      </div>
    </div>
  );
}
