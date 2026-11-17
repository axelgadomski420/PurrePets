import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft, ArrowRight, Crop, Download, Film, Image as ImageIcon,
  Layers, Loader2, Mic, Music2, Plus, Redo2, RotateCcw, Scissors, Sliders,
  Sparkles, Sticker, Trash2, Type, Undo2, Volume2, VolumeX, Wand2, X,
} from "lucide-react";
import { toast } from "sonner";
import SoundPicker from "@/components/reels/SoundPicker";
import { cn } from "@/lib/utils";
import {
  exportStudioImage, exportStudioVideo, renderStudioFrame, STUDIO_FILTERS,
  STUDIO_FORMATS, validateStudioFile,
} from "@/lib/purre-studio";

const STICKERS = ["🐶", "🐱", "🐾", "❤️", "⭐", "🔥", "🏆", "😂", "🦴", "🏅", "✨", "🎵"];
const FONTS = [
  { id: "Arial, sans-serif", label: "Sans" },
  { id: "Georgia, serif", label: "Serif" },
  { id: "Courier New, monospace", label: "Mono" },
];
const FORMATS = [
  { id: "square", label: "1:1" },
  { id: "portrait", label: "4:5" },
  { id: "story", label: "9:16" },
  { id: "landscape", label: "16:9" },
];
const TABS = [
  { id: "edit", label: "Edycja", Icon: Sliders },
  { id: "filters", label: "Filtry", Icon: Wand2 },
  { id: "effects", label: "Efekty", Icon: Sparkles },
  { id: "text", label: "Tekst", Icon: Type },
  { id: "stickers", label: "Naklejki", Icon: Sticker },
  { id: "audio", label: "Audio", Icon: Music2 },
  { id: "layers", label: "Warstwy", Icon: Layers },
  { id: "crop", label: "Kadrowanie", Icon: Crop },
  { id: "export", label: "Eksport", Icon: Download },
];
const DRAFT_KEY = "purre-studio-draft-v1";

const emptyEdit = () => ({
  filter: "none", brightness: 100, contrast: 100, saturation: 100,
  temperature: 0, vignette: 0, grain: 0, blur: 0,
  rotation: 0, flipX: false, flipY: false, zoom: 1, offsetX: 0, offsetY: 0,
});

function formatForMode(mode) {
  if (mode === "post") return "square";
  if (mode === "story" || mode === "reel") return "story";
  return "landscape";
}

/**
 * PURRE PETS STUDIO — jeden wspólny edytor dla zdjęć i wideo.
 * Używany przez: StoryComposer (story), edytor wideo (reel), posty (1:1/4:5).
 * Zakładki: Edycja/Filtry/Efekty/Tekst/Naklejki/Audio/Warstwy/Kadrowanie/Eksport.
 * Undo/redo, reset, autosave projektu + przywracanie wersji roboczej.
 * Publikacja zwraca WYEXPORTOWANE pliki (efekty wypalone), nigdy oryginały.
 */
export default function PurreStudio({ open, mode = "free", initialFiles = [], onClose, onPublish, publishLabel = "Publikuj" }) {
  const [items, setItems] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [tab, setTab] = useState("edit");
  const [textLayers, setTextLayers] = useState([]);
  const [stickers, setStickers] = useState([]);
  const [selectedLayerId, setSelectedLayerId] = useState(null);
  const [audio, setAudio] = useState({ music: null, musicVolume: 0.8, musicFadeIn: 1, musicFadeOut: 1.5, voice: null, voiceVolume: 1, muteOriginal: false, originalVolume: 1 });
  const audioRef = useRef(audio);
  const exportingRef = useRef(false);
  const pendingAudioDisposalsRef = useRef([]);

  const disposeAudioSource = (source) => {
    if (!source) return;

    try {
      const element = source.element;
      if (element) {
        element.pause();
        element.onended = null;
        element.onerror = null;
        element.removeAttribute("src");
        element.load();
      }
    } catch {
      // Czyszczenie audio nie może przerwać pracy edytora.
    }

    try {
      if (typeof source.url === "string" && source.url.startsWith("blob:")) {
        URL.revokeObjectURL(source.url);
      }
    } catch {
      // Zwolnienie URL jest best-effort.
    }
  };

  const disposeOrDeferAudioSource = (source) => {
    if (!source) return;

    if (exportingRef.current) {
      pendingAudioDisposalsRef.current.push(source);
      return;
    }

    disposeAudioSource(source);
  };

  useEffect(() => {
    audioRef.current = audio;
  }, [audio]);

  useEffect(() => () => {
    const current = audioRef.current;
    disposeOrDeferAudioSource(current?.music);

    if (current?.voice?.element !== current?.music?.element) {
      disposeOrDeferAudioSource(current?.voice);
    }
  }, []);
  const [recording, setRecording] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [quality, setQuality] = useState(mode === "reel" || mode === "story" ? "sd" : "hd");
  const [draftOffer, setDraftOffer] = useState(null);
  const past = useRef([]);
  const future = useRef([]);
  const cancelRef = useRef(false);
  const mediaRecorderRef = useRef(null);
  const fileInputRef = useRef(null);
  const previewCanvasRef = useRef(null);
  const videoRefs = useRef(new Map());
  const dragRef = useRef(null);

  const active = items.find((item) => item.id === activeId) ?? items[0] ?? null;
  const isVideo = items.some((item) => item.type === "video");
  const defaultFormat = formatForMode(mode);

  // ---------- Historia (undo/redo) ----------
  const snapshot = useCallback(
    () => JSON.stringify({
      edits: items.map((i) => ({ id: i.id, edit: { ...emptyEdit(), ...i } })),
      textLayers, stickers,
    }),
    [items, textLayers, stickers]
  );
  const pushHistory = useCallback(() => {
    past.current = [...past.current.slice(-29), snapshot()];
    future.current = [];
  }, [snapshot]);
  const applySnapshot = (json) => {
    try {
      const data = JSON.parse(json);
      setItems((prevItems) => data.edits
        .map((saved) => {
          const live = prevItems.find((i) => i.id === saved.id);
          return live ? { ...live, ...saved.edit } : null;
        })
        .filter(Boolean));
      setTextLayers(data.textLayers ?? []);
      setStickers(data.stickers ?? []);
    } catch { /* uszkodzony snapshot */ }
  };
  const undo = () => {
    if (!past.current.length) return;
    future.current = [...future.current, snapshot()];
    applySnapshot(past.current.pop());
  };
  const redo = () => {
    if (!future.current.length) return;
    past.current = [...past.current, snapshot()];
    applySnapshot(future.current.pop());
  };

  // ---------- Autosave + przywracanie ----------
  useEffect(() => {
    if (!open || !items.length) return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({
          savedAt: Date.now(), mode,
          items: items.map((i) => ({ name: i.file?.name, size: i.file?.size, type: i.type, edit: { ...emptyEdit(), ...i } })),
          textLayers, stickers,
          audio: { ...audio, music: null, voice: null },
        }));
      } catch { /* quota — pomiń */ }
    }, 800);
    return () => clearTimeout(timer);
  }, [open, items, textLayers, stickers, audio, mode]);

  useEffect(() => {
    if (!open) return;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) setDraftOffer(JSON.parse(raw));
    } catch { /* brak draftu */ }
  }, [open]);

  const restoreDraft = () => {
    if (!draftOffer) return;
    let restored = 0;
    setItems((prev) => prev.map((item) => {
      const saved = (draftOffer.items ?? []).find((d) => d.name === item.file?.name && d.size === item.file?.size);
      if (saved) { restored += 1; return { ...item, ...saved.edit }; }
      return item;
    }));
    setTextLayers(draftOffer.textLayers ?? []);
    setStickers(draftOffer.stickers ?? []);
    setDraftOffer(null);
    toast.success(restored ? "Przywrócono ustawienia (" + restored + " plików)" : "Przywrócono warstwy i ustawienia");
  };
  const discardDraft = () => {
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
    setDraftOffer(null);
  };

  // ---------- Dodawanie mediów ----------
  const addFiles = useCallback((files) => {
    const next = [];
    for (const file of files) {
      try {
        const kind = validateStudioFile(file);
        next.push({
          id: "m" + Date.now() + Math.random().toString(36).slice(2, 7),
          type: kind.type, file, url: URL.createObjectURL(file),
          duration: 0, trimStart: 0, trimEnd: 0, speed: 1,
          ...emptyEdit(), format: defaultFormat,
        });
      } catch (err) {
        toast.error(err?.message ?? "Nieobsługiwany plik");
      }
    }
    if (!next.length) return;
    pushHistory();
    setItems((prev) => [...prev, ...next]);
    setActiveId((prevActive) => prevActive ?? next[0].id);
  }, [defaultFormat, pushHistory]);

  useEffect(() => {
    if (open && initialFiles.length && !items.length) addFiles(initialFiles);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Metadane wideo + miniatury klatek
  useEffect(() => {
    for (const item of items) {
      if (item.type !== "video" || item.thumb || item.duration) continue;
      const video = document.createElement("video");
      video.src = item.url;
      video.muted = true;
      video.playsInline = true;
      video.preload = "metadata";
      video.addEventListener("loadedmetadata", () => {
        const duration = Number.isFinite(video.duration) ? video.duration : 0;
        setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, duration, trimEnd: duration } : i)));
        video.currentTime = Math.min(0.1, duration || 0.1);
      });
      video.addEventListener("seeked", () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = 96;
          canvas.height = 170;
          canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
          const thumb = canvas.toDataURL("image/jpeg", 0.6);
          setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, thumb } : i)));
        } catch { /* miniatura opcjonalna */ }
      }, { once: true });
    }
  }, [items.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Podgląd zdjęć (canvas + silnik)
  useEffect(() => {
    if (isVideo || !active || active.type !== "image" || !previewCanvasRef.current) return;
    const image = new Image();
    image.onload = () => {
      try {
        renderStudioFrame(image, previewCanvasRef.current, {
          format: active.format ?? defaultFormat,
          filter: active.filter, brightness: active.brightness, contrast: active.contrast,
          saturation: active.saturation, temperature: active.temperature, vignette: active.vignette,
          grain: active.grain, blur: active.blur, rotation: active.rotation, flipX: active.flipX,
          flipY: active.flipY, zoom: active.zoom, offsetX: active.offsetX, offsetY: active.offsetY,
          textLayers, stickers,
        });
      } catch { /* klatka dojdzie */ }
    };
    image.src = active.url;
  }, [active, textLayers, stickers, isVideo, defaultFormat]);

  const updateActive = (patchData, history = true) => {
    if (!active) return;
    if (history) pushHistory();
    setItems((prev) => prev.map((item) => (item.id === active.id ? { ...item, ...patchData } : item)));
  };
  const resetActive = () => {
    if (!active) return;
    pushHistory();
    setItems((prev) => prev.map((item) => (item.id === active.id ? { ...item, ...emptyEdit() } : item)));
  };

  // ---------- Warstwy ----------
  const addTextLayer = () => {
    pushHistory();
    const layer = { id: "t" + Date.now(), text: "Nowy tekst", x: 0.5, y: 0.5, size: 54, color: "#ffffff", fontFamily: FONTS[0].id, rotation: 0, background: true };
    setTextLayers((prev) => [...prev.slice(0, 29), layer]);
    setSelectedLayerId(layer.id);
    setTab("text");
  };
  const addStickerLayer = (emoji) => {
    pushHistory();
    const layer = { id: "s" + Date.now(), text: emoji, x: 0.5, y: 0.4, size: 72, rotation: 0 };
    setStickers((prev) => [...prev.slice(0, 29), layer]);
    setSelectedLayerId(layer.id);
  };
  const patchLayer = (setList, id, patchData) => {
    setList((prev) => prev.map((layer) => (layer.id === id ? { ...layer, ...patchData } : layer)));
  };
  const removeLayer = (id) => {
    pushHistory();
    setTextLayers((prev) => prev.filter((l) => l.id !== id));
    setStickers((prev) => prev.filter((l) => l.id !== id));
    setSelectedLayerId(null);
  };
  const moveLayer = (setList, id, dir) => {
    pushHistory();
    setList((prev) => {
      const index = prev.findIndex((l) => l.id === id);
      const target = index + dir;
      if (index < 0 || target < 0 || target >= prev.length) return prev;
      const copy = [...prev];
      [copy[index], copy[target]] = [copy[target], copy[index]];
      return copy;
    });
  };
  const selectedLayer = [...textLayers, ...stickers].find((l) => l.id === selectedLayerId) ?? null;

  // ---------- Gesty: drag / wheel (rozkładanie na warstwy podglądu) ----------
  const previewPoint = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1),
      y: Math.min(Math.max((event.clientY - rect.top) / rect.height, 0), 1),
    };
  };
  const onPreviewPointerDown = (event) => {
    const point = previewPoint(event);
    const candidates = [
      ...textLayers.map((l) => ({ ...l, kind: "text" })),
      ...stickers.map((l) => ({ ...l, kind: "sticker" })),
    ];
    let best = null;
    let bestDist = 0.14;
    for (const layer of candidates) {
      const dist = Math.hypot(layer.x - point.x, layer.y - point.y);
      if (dist < bestDist) { best = layer; bestDist = dist; }
    }
    if (!best) return;
    setSelectedLayerId(best.id);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = { id: best.id, kind: best.kind, startX: point.x, startY: point.y, origX: best.x, origY: best.y };
  };
  const onPreviewPointerMove = (event) => {
    const drag = dragRef.current;
    if (!drag) return;
    const point = previewPoint(event);
    const x = Math.min(Math.max(drag.origX + (point.x - drag.startX), 0), 1);
    const y = Math.min(Math.max(drag.origY + (point.y - drag.startY), 0), 1);
    if (drag.kind === "text") patchLayer(setTextLayers, drag.id, { x, y });
    else patchLayer(setStickers, drag.id, { x, y });
  };
  const onPreviewPointerUp = () => { dragRef.current = null; };
  const onPreviewWheel = (event) => {
    if (!selectedLayer) return;
    event.preventDefault();
    const delta = event.deltaY > 0 ? -4 : 4;
    if (textLayers.some((l) => l.id === selectedLayer.id)) {
      patchLayer(setTextLayers, selectedLayer.id, { size: Math.min(180, Math.max(16, (selectedLayer.size ?? 54) + delta)) });
    } else {
      patchLayer(setStickers, selectedLayer.id, { size: Math.min(180, Math.max(18, (selectedLayer.size ?? 72) + delta)) });
    }
  };

  // ---------- Audio (wideo) ----------
  const pickMusicFile = (file) => {
    if (!file) return;

    if (!String(file.type || "").startsWith("audio/")) {
      toast.error("Wybierz plik muzyczny w obsługiwanym formacie.");
      return;
    }

    if (file.size <= 0 || file.size > 20 * 1024 * 1024) {
      toast.error("Plik muzyczny musi mieć maksymalnie 20 MB.");
      return;
    }

    const url = URL.createObjectURL(file);
    const element = new Audio();
    element.preload = "auto";
    element.onerror = () => {
      toast.error("Przeglądarka nie może odczytać wybranego pliku audio.");
    };

    element.src = url;
    element.load();

    const nextMusic = {
      title: file.name.replace(/\.[^.]+$/, ""),
      artist: "Z urządzenia",
      url,
      element,
      local: true,
    };

    disposeOrDeferAudioSource(audioRef.current?.music);
    audioRef.current = { ...audioRef.current, music: nextMusic };

    setAudio((prev) => ({
      ...prev,
      music: nextMusic,
    }));

    toast.success("Dodano muzykę z urządzenia.");
  };

  const pickMusicTrack = (track) => {
    let element = null;

    if (track?.url) {
      element = new Audio();
      element.preload = "auto";

      try {
        const sourceUrl = new URL(track.url, window.location.href);
        if (sourceUrl.origin !== window.location.origin) {
          element.crossOrigin = "anonymous";
        }
      } catch {
        // Nieprawidłowy adres zostanie zgłoszony przez element audio.
      }

      element.onerror = () => {
        toast.error("Nie udało się wczytać wybranej ścieżki muzycznej.");
      };

      element.src = track.url;
      element.load();
    }

    const nextMusic = track ? { ...track, element } : null;

    disposeOrDeferAudioSource(audioRef.current?.music);
    audioRef.current = { ...audioRef.current, music: nextMusic };

    setAudio((prev) => ({
      ...prev,
      music: nextMusic,
    }));
  };
  const toggleRecording = async () => {
    if (recording) {
      mediaRecorderRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "";
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        const url = URL.createObjectURL(blob);
        const nextVoice = {
          title: "Voiceover",
          url,
          element: new Audio(url),
        };

        disposeOrDeferAudioSource(audioRef.current?.voice);
        audioRef.current = { ...audioRef.current, voice: nextVoice };

        setAudio((prev) => ({
          ...prev,
          voice: nextVoice,
        }));
        setRecording(false);
        toast.success("Voiceover nagrany");
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      toast.error("Brak dostępu do mikrofonu");
    }
  };

  // ---------- Klipy: split / reorder / delete ----------
  const splitActive = () => {
    if (!active || active.type !== "video") return;
    const video = videoRefs.current.get(active.id);
    const at = video?.currentTime ?? (active.trimStart + active.trimEnd) / 2;
    if (at <= active.trimStart + 0.2 || at >= active.trimEnd - 0.2) {
      toast.error("Odtwórz/ustaw moment w środku przyciętego fragmentu, aby przeciąć");
      return;
    }
    pushHistory();
    const clone = { ...active, id: "m" + Date.now(), trimStart: at };
    setItems((prev) => {
      const index = prev.findIndex((i) => i.id === active.id);
      const copy = [...prev];
      copy[index] = { ...active, trimEnd: at };
      copy.splice(index + 1, 0, clone);
      return copy;
    });
    toast.success("Klip podzielony");
  };
  const moveClip = (id, dir) => {
    pushHistory();
    setItems((prev) => {
      const index = prev.findIndex((i) => i.id === id);
      const target = index + dir;
      if (index < 0 || target < 0 || target >= prev.length) return prev;
      const copy = [...prev];
      [copy[index], copy[target]] = [copy[target], copy[index]];
      return copy;
    });
  };
  const removeItem = (id) => {
    pushHistory();
    setItems((prev) => prev.filter((item) => item.id !== id));
    setActiveId((prev) => (prev === id ? null : prev));
  };

  // ---------- Eksport ----------
  const exportDims = () => {
    const format = STUDIO_FORMATS[active?.format ?? defaultFormat] ?? STUDIO_FORMATS.story;
    const scale = quality === "sd" ? (2 / 3) : 1;
    return { width: Math.round(format.width * scale), height: Math.round(format.height * scale) };
  };

  const exportPhotos = async () => {
    const photos = items.filter((item) => item.type === "image");
    const files = [];
    for (const item of photos) {
      const image = new Image();
      image.src = item.url;
      await image.decode().catch(() => new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; }));
      const { width, height } = exportDims();
      const blob = await exportStudioImage(image, {
        ...item, width, height, format: item.format ?? defaultFormat, textLayers, stickers,
        type: "image/jpeg", quality: 0.94,
      });
      const base = (item.file?.name ?? "photo").replace(/\.[^.]+$/, "");
      files.push(new File([blob], base + "-purre-studio.jpg", { type: "image/jpeg" }));
    }
    return files;
  };

  const buildVideoExport = async () => {
    const clips = [];

    for (const item of items) {
      if (item.type === "video") {
        const video = document.createElement("video");
        video.src = item.url;
        video.playsInline = true;
        video.preload = "auto";

        await new Promise((resolve) => {
          if (video.readyState >= 2) return resolve();
          video.addEventListener("loadeddata", resolve, { once: true });
          video.addEventListener("error", resolve, { once: true });
          setTimeout(resolve, 8000);
        });

        if (!video.videoWidth) {
          throw new Error("Nie udało się wczytać klipu: " + (item.file?.name ?? ""));
        }

        const start = Math.max(0, Number(item.trimStart) || 0);
        const end = Math.min(
          Number(item.trimEnd) > start ? Number(item.trimEnd) : video.duration,
          video.duration || Number(item.trimEnd) || 0
        );

        if (!Number.isFinite(end) || end <= start) {
          throw new Error("Nieprawidłowy zakres klipu: " + (item.file?.name ?? ""));
        }

        clips.push({
          video,
          trimStart: start,
          trimEnd: end,
          duration: end - start,
          speed: item.speed,
          ...Object.fromEntries([
            "filter", "brightness", "contrast", "saturation", "temperature",
            "vignette", "grain", "blur", "rotation", "flipX", "flipY",
            "zoom", "offsetX", "offsetY"
          ].map((key) => [key, item[key]])),
        });
      } else if (item.type === "image") {
        const image = new Image();
        image.decoding = "async";
        image.src = item.url;

        try {
          if (image.decode) await image.decode();
          else await new Promise((resolve, reject) => {
            image.onload = resolve;
            image.onerror = reject;
          });
        } catch {
          throw new Error("Nie udało się wczytać zdjęcia: " + (item.file?.name ?? ""));
        }

        if (!image.naturalWidth || !image.naturalHeight) {
          throw new Error("Zdjęcie jest niedostępne: " + (item.file?.name ?? ""));
        }

        const duration = Math.min(30, Math.max(1, Number(item.duration) || 3));

        clips.push({
          image,
          trimStart: 0,
          trimEnd: duration,
          duration,
          speed: 1,
          ...Object.fromEntries([
            "filter", "brightness", "contrast", "saturation", "temperature",
            "vignette", "grain", "blur", "rotation", "flipX", "flipY",
            "zoom", "offsetX", "offsetY"
          ].map((key) => [key, item[key]])),
        });
      }
    }

    if (!clips.length) throw new Error("Projekt nie zawiera materiałów do eksportu.");
    return clips;
  };

  const buildAudioOptions = () => ({
    originalVolume: audio.originalVolume,
    muteOriginal: audio.muteOriginal,
    music: audio.music?.element ? { element: audio.music.element, volume: audio.musicVolume, fadeIn: audio.musicFadeIn, fadeOut: audio.musicFadeOut } : null,
    voice: audio.voice?.element ? { element: audio.voice.element, volume: audio.voiceVolume, fadeIn: 0.2, fadeOut: 0.5 } : null,
  });

  const captureCover = async (clips) => {
    const first = clips?.[0];
    if (!first) return null;
    try {
      const { width, height } = exportDims();
      const canvas = document.createElement("canvas");
      renderStudioFrame(first.video ?? first.image, canvas, { width, height, format: active?.format ?? defaultFormat, filter: first.filter, brightness: first.brightness, contrast: first.contrast, saturation: first.saturation, textLayers, stickers });
      return await new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.9));
    } catch { return null; }
  };

  const runExport = async ({ publish }) => {
    if (!items.length || exporting || exportingRef.current) return;

    exportingRef.current = true;
    setExporting(true);
    setProgress(0);
    cancelRef.current = false;
    try {
      if (isVideo || audio.music?.element || audio.voice?.element) {
        const clips = await buildVideoExport();
        const { width, height } = exportDims();
        const result = await exportStudioVideo({
          clips, width, height, fps: 30, format: active?.format ?? defaultFormat,
          overlays: { textLayers, stickers },
          audio: buildAudioOptions(),
          onProgress: setProgress,
          shouldCancel: () => cancelRef.current,
          onWarning: (msg) => toast.warning(msg),
        });
        const file = new File([result.blob], "purre-studio." + result.extension, { type: result.mimeType });
        if (publish) {
          const coverBlob = await captureCover(clips);
          await onPublish?.({ kind: "video", files: [file], coverBlob, meta: { filter: active?.filter, textLayers, stickers, musicTitle: audio.music?.title ?? null, musicUrl: audio.music?.url ?? null, hasAudio: Boolean(audio.music?.element || audio.voice?.element) } });
        } else {
          const url = URL.createObjectURL(result.blob);
          const anchor = document.createElement("a");
          anchor.href = url;
          anchor.download = file.name;
          anchor.click();
          setTimeout(() => URL.revokeObjectURL(url), 5000);
          toast.success("Wideo zapisane na urządzenie");
        }
      } else {
        const files = await exportPhotos();
        if (!files.length) throw new Error("Brak zdjęć do eksportu");
        if (publish) {
          await onPublish?.({ kind: "photos", files, coverBlob: null, meta: { filter: active?.filter, textLayers, stickers } });
        } else {
          files.forEach((file, index) => {
            setTimeout(() => {
              const url = URL.createObjectURL(file);
              const anchor = document.createElement("a");
              anchor.href = url;
              anchor.download = file.name;
              anchor.click();
              setTimeout(() => URL.revokeObjectURL(url), 5000);
            }, index * 300);
          });
          toast.success("Zapisano " + files.length + " zdjęć");
        }
      }
    } catch (err) {
      if (err?.name === "ExportCancelled") toast.info("Eksport anulowany");
      else toast.error(err?.message ?? "Eksport nie powiódł się");
    } finally {
      exportingRef.current = false;

      const pendingDisposals = pendingAudioDisposalsRef.current.splice(0);
      for (const source of pendingDisposals) {
        disposeAudioSource(source);
      }

      setExporting(false);
      setProgress(0);
      cancelRef.current = false;
    }
  };

  const dims = exportDims();
  const fmtLabel = (STUDIO_FORMATS[active?.format ?? defaultFormat] ?? {}).label ?? "";
  if (!open) return null;

  return (
    <div className="purre-studio fixed inset-0 z-[70] flex h-[100dvh] flex-col overflow-hidden bg-[#08090d] text-white backdrop-blur-xl">
      <header className="relative z-20 flex shrink-0 items-center gap-3 border-b border-white/[0.08] bg-[#0c0c12]/95 px-4 py-3 shadow-2xl shadow-black/20 sm:px-6">
        <p className="font-display bg-gradient-to-r from-white via-white to-fuchsia-300 bg-clip-text text-sm font-black tracking-[0.2em] text-transparent sm:text-base">PURRE PETS STUDIO</p>
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[9px] uppercase tracking-widest text-white/70">{fmtLabel}</span>
        <div className="ml-auto flex items-center gap-1.5">
          <button type="button" onClick={undo} disabled={!past.current.length} className="grid h-8 w-8 place-items-center rounded-lg bg-white/10 text-white disabled:opacity-40" aria-label="Cofnij"><Undo2 className="h-4 w-4" /></button>
          <button type="button" onClick={redo} disabled={!future.current.length} className="grid h-8 w-8 place-items-center rounded-lg bg-white/10 text-white disabled:opacity-40" aria-label="Ponów"><Redo2 className="h-4 w-4" /></button>
          <button type="button" onClick={resetActive} disabled={!active} className="grid h-8 w-8 place-items-center rounded-lg bg-white/10 text-white disabled:opacity-40" aria-label="Reset"><RotateCcw className="h-4 w-4" /></button>
          {onClose && <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg bg-white/10 text-white" aria-label="Zamknij"><X className="h-4 w-4" /></button>}
        </div>
      </header>

      {draftOffer && (
        <div className="mx-3 mb-2 flex flex-wrap items-center gap-2 rounded-xl border border-aura/40 bg-aura/10 px-3 py-2 text-[11px] text-white">
          <span>Niedokończona edycja z {new Date(draftOffer.savedAt).toLocaleTimeString("pl-PL")} — przywrócić?</span>
          <button type="button" onClick={restoreDraft} className="ml-auto rounded-lg bg-aura px-2.5 py-1 text-[10px] font-semibold uppercase text-black">Przywróć</button>
          <button type="button" onClick={discardDraft} className="rounded-lg bg-white/10 px-2.5 py-1 text-[10px] uppercase">Odrzuć</button>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3 sm:p-4 lg:flex-row lg:gap-5 lg:p-5">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
          <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-[1.75rem] border border-white/[0.09] bg-[radial-gradient(ellipse_at_center,_#24202e_0%,_#111018_48%,_#08090d_100%)] shadow-[0_24px_90px_-35px_rgba(0,0,0,0.9)] ring-1 ring-white/[0.04]">
            {isVideo ? (
              <VideoPreview items={items} activeId={active?.id} videoRefs={videoRefs} textLayers={textLayers} stickers={stickers} audio={audio} selectedLayerId={selectedLayerId} onPreviewPointerDown={onPreviewPointerDown} onPreviewPointerMove={onPreviewPointerMove} onPreviewPointerUp={onPreviewPointerUp} onPreviewWheel={onPreviewWheel} />
            ) : active ? (
              <canvas
                ref={previewCanvasRef}
                width={dims.width} height={dims.height}
                className="max-h-full max-w-full touch-none"
                onPointerDown={onPreviewPointerDown}
                onPointerMove={onPreviewPointerMove}
                onPointerUp={onPreviewPointerUp}
                onWheel={onPreviewWheel}
              />
            ) : (
              <button type="button" onClick={() => fileInputRef.current?.click()} className="grid h-full w-full place-items-center text-center text-[11px] uppercase tracking-[0.2em] text-white/60">
                Dodaj zdjęcia lub wideo<br />(Studio wspiera wiele plików)
              </button>
            )}
          </div>
          <div className="no-scrollbar flex shrink-0 items-center gap-2 overflow-x-auto rounded-2xl border border-white/[0.07] bg-[#111118]/90 p-2 pb-2 shadow-xl">
            {items.map((item, index) => (
              <button key={item.id} type="button" onClick={() => setActiveId(item.id)} className={cn("relative h-[4.25rem] w-[3.1rem] shrink-0 overflow-hidden rounded-xl border-2 transition-all duration-200", item.id === active?.id ? "border-fuchsia-400 shadow-[0_0_18px_rgba(217,70,239,0.25)]" : "border-white/10 opacity-70 hover:opacity-100")}>
                {item.thumb ? <img src={item.thumb} alt="" className="h-full w-full object-cover" /> : <span className="grid h-full w-full place-items-center text-white/60">{item.type === "video" ? <Film className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />}</span>}
                <span className="absolute bottom-0 left-0 bg-black/60 px-1 text-[8px] text-white">{index + 1}</span>
              </button>
            ))}
            <button type="button" onClick={() => fileInputRef.current?.click()} className="grid h-[4.25rem] w-[3.1rem] shrink-0 place-items-center rounded-xl border border-dashed border-white/20 bg-white/[0.03] text-white/60 transition hover:border-fuchsia-400/60 hover:bg-fuchsia-400/10 hover:text-white" aria-label="Dodaj medium"><Plus className="h-4 w-4" /></button>
            {active && items.length > 1 && (
              <>
                <button type="button" onClick={() => moveClip(active.id, -1)} className="grid h-[4.25rem] w-10 shrink-0 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.05] text-white/80 transition hover:bg-white/10 hover:text-white" aria-label="Przenieś w lewo"><ArrowLeft className="h-4 w-4" /></button>
                <button type="button" onClick={() => moveClip(active.id, 1)} className="grid h-[4.25rem] w-10 shrink-0 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.05] text-white/80 transition hover:bg-white/10 hover:text-white" aria-label="Przenieś w prawo"><ArrowRight className="h-4 w-4" /></button>
                {active.type === "video" && (
                  <button type="button" onClick={splitActive} className="grid h-[4.25rem] w-10 shrink-0 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.05] text-white/80 transition hover:bg-white/10 hover:text-white" aria-label="Przetnij klip"><Scissors className="h-4 w-4" /></button>
                )}
                <button type="button" onClick={() => removeItem(active.id)} className="grid h-[4.25rem] w-10 shrink-0 place-items-center rounded-xl border border-red-400/20 bg-red-500/10 text-red-300 transition hover:bg-red-500/20" aria-label="Usuń"><Trash2 className="h-4 w-4" /></button>
              </>
            )}
          </div>
        </div>

        <div className="no-scrollbar flex max-h-[43dvh] w-full shrink-0 flex-col overflow-y-auto rounded-[1.5rem] border border-white/[0.09] bg-[#12121a]/95 p-3 shadow-[0_20px_70px_-30px_rgba(0,0,0,0.9)] backdrop-blur-2xl sm:p-4 lg:max-h-none lg:w-[22rem] lg:rounded-[1.75rem] lg:p-5">
          <div className="no-scrollbar flex shrink-0 gap-1.5 overflow-x-auto border-b border-white/[0.08] pb-3">
            {TABS.map(({ id, label, Icon }) => (
              <button key={id} type="button" onClick={() => setTab(id)} className={cn("flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2 text-[9px] font-bold uppercase tracking-wider transition-all duration-200", tab === id ? "border-fuchsia-400/40 bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white shadow-lg shadow-fuchsia-500/20" : "border-white/[0.07] bg-white/[0.035] text-white/55 hover:border-white/20 hover:bg-white/[0.08] hover:text-white")}>
                <Icon className="h-3 w-3" /> {label}
              </button>
            ))}
          </div>

          <div className="mt-4 min-h-0 space-y-4 px-0.5 pb-2 text-white [&_input:not([type=range]):not([type=color]):not([type=checkbox])]:outline-none [&_input:not([type=range]):not([type=color]):not([type=checkbox])]:focus:border-fuchsia-400/60 [&_button]:transition-all [&_button]:duration-200">
            {tab === "edit" && active && (
              <>
                {active.type === "image" && (
                  <Slider
                    label="Czas zdjęcia (sekundy)"
                    min={1}
                    max={30}
                    step={0.5}
                    value={active.duration || 3}
                    onChange={(v) => updateActive({ duration: v }, false)}
                    onCommit={pushHistory}
                  />
                )}
                <Slider label="Jasność" min={0} max={200} value={active.brightness} onChange={(v) => updateActive({ brightness: v }, false)} onCommit={pushHistory} />
                <Slider label="Kontrast" min={0} max={200} value={active.contrast} onChange={(v) => updateActive({ contrast: v }, false)} onCommit={pushHistory} />
                <Slider label="Nasycenie" min={0} max={200} value={active.saturation} onChange={(v) => updateActive({ saturation: v }, false)} onCommit={pushHistory} />
                <Slider label="Temperatura" min={-100} max={100} value={active.temperature} onChange={(v) => updateActive({ temperature: v }, false)} onCommit={pushHistory} />
              </>
            )}
            {tab === "filters" && (
              <div className="grid grid-cols-3 gap-1.5">
                {STUDIO_FILTERS.map((f) => (
                  <button key={f.id} type="button" onClick={() => updateActive({ filter: f.id })} className={cn("rounded-lg border px-1 py-2 text-[9px]", active?.filter === f.id ? "border-aura bg-aura/20 text-aura" : "border-white/15 text-white/70")}>{f.label}</button>
                ))}
              </div>
            )}
            {tab === "effects" && active && (
              <>
                <Slider label="Winieta" min={0} max={100} value={active.vignette} onChange={(v) => updateActive({ vignette: v }, false)} onCommit={pushHistory} />
                <Slider label="Ziarno" min={0} max={100} value={active.grain} onChange={(v) => updateActive({ grain: v }, false)} onCommit={pushHistory} />
                <Slider label="Rozmycie" min={0} max={20} value={active.blur} onChange={(v) => updateActive({ blur: v }, false)} onCommit={pushHistory} />
              </>
            )}
            {tab === "text" && (
              <>
                <button type="button" onClick={addTextLayer} className="btn-aura w-full rounded-xl py-2 text-[10px] font-semibold uppercase tracking-widest">Dodaj warstwę tekstu</button>
                {textLayers.map((layer, index) => (
                  <div key={layer.id} className={cn("group rounded-2xl border bg-gradient-to-br from-white/[0.055] to-white/[0.015] p-3 shadow-lg shadow-black/10 transition-all duration-200", selectedLayerId === layer.id ? "border-fuchsia-400/50 ring-1 ring-fuchsia-400/20 shadow-fuchsia-500/10" : "border-white/[0.08] hover:border-white/20")}>
                    <div className="flex items-center gap-1">
                      <input value={layer.text} onFocus={() => setSelectedLayerId(layer.id)} onChange={(e) => patchLayer(setTextLayers, layer.id, { text: e.target.value })} className="h-10 flex-1 rounded-xl border border-white/10 bg-black/30 px-3 text-xs text-white placeholder:text-white/30 focus:border-fuchsia-400/60 focus:ring-2 focus:ring-fuchsia-400/10" maxLength={160} />
                      <button type="button" onClick={() => removeLayer(layer.id)} className="text-white/60 hover:text-red-400" aria-label="Usuń warstwę"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                    {selectedLayerId === layer.id && (
                      <div className="mt-2 space-y-2">
                        <Slider label="Rozmiar" min={16} max={180} value={layer.size} onChange={(v) => patchLayer(setTextLayers, layer.id, { size: v })} />
                        <Slider label="Obrót" min={-180} max={180} value={layer.rotation} onChange={(v) => patchLayer(setTextLayers, layer.id, { rotation: v })} />
                        <div className="flex gap-1">
                          {FONTS.map((font) => (
                            <button key={font.id} type="button" onClick={() => patchLayer(setTextLayers, layer.id, { fontFamily: font.id })} className={cn("flex-1 rounded-xl border py-2 text-[9px] font-semibold transition", layer.fontFamily === font.id ? "border-fuchsia-400/50 bg-fuchsia-500/15 text-fuchsia-200" : "border-white/[0.08] bg-white/[0.025] text-white/55 hover:bg-white/[0.07] hover:text-white")}>{font.label}</button>
                          ))}
                        </div>
                        <div className="flex items-center gap-2">
                          <input type="color" value={layer.color} onChange={(e) => patchLayer(setTextLayers, layer.id, { color: e.target.value })} className="h-7 w-10 rounded" aria-label="Kolor tekstu" />
                          <label className="flex items-center gap-1 text-[10px] text-white/70">
                            <input type="checkbox" checked={layer.background} onChange={(e) => patchLayer(setTextLayers, layer.id, { background: e.target.checked })} /> tło
                          </label>
                          <span className="ml-auto text-[9px] text-white/40">warstwa {index + 1}</span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                <p className="text-[9px] text-white/40">Przeciągnij warstwę na podglądzie; kółko myszy zmienia rozmiar.</p>
              </>
            )}
            {tab === "stickers" && (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {STICKERS.map((emoji) => (
                    <button key={emoji} type="button" onClick={() => addStickerLayer(emoji)} className="grid h-12 w-12 place-items-center rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.07] to-white/[0.015] text-2xl shadow-lg shadow-black/10 transition duration-200 hover:scale-110 hover:border-fuchsia-400/50 hover:bg-fuchsia-500/10 active:scale-95">{emoji}</button>
                  ))}
                </div>
                {stickers.map((layer) => (
                  <div key={layer.id} className={cn("group rounded-2xl border bg-gradient-to-br from-white/[0.055] to-white/[0.015] p-3 shadow-lg shadow-black/10 transition-all duration-200", selectedLayerId === layer.id ? "border-fuchsia-400/50 ring-1 ring-fuchsia-400/20 shadow-fuchsia-500/10" : "border-white/[0.08] hover:border-white/20")}>
                    <div className="flex items-center justify-between text-[11px]">
                      <span>{layer.text}</span>
                      <button type="button" onClick={() => removeLayer(layer.id)} className="text-white/60 hover:text-red-400" aria-label="Usuń naklejkę"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                    {selectedLayerId === layer.id && (
                      <div className="mt-1.5 grid grid-cols-2 gap-2">
                        <Slider label="Rozmiar" min={18} max={180} value={layer.size} onChange={(v) => patchLayer(setStickers, layer.id, { size: v })} />
                        <Slider label="Obrót" min={-180} max={180} value={layer.rotation} onChange={(v) => patchLayer(setStickers, layer.id, { rotation: v })} />
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}
            {tab === "audio" && (
              items.length > 0 ? (
                <>
                  <p className="text-[9px] uppercase tracking-widest text-white/50">Muzyka (biblioteka PURRE / urządzenie)</p>
                  <SoundPicker value={audio.music} onChange={pickMusicTrack} />
                  <label className="block text-[10px] text-white/60">
                    Muzyka z urządzenia
                    <input type="file" accept="audio/*" onChange={(e) => { pickMusicFile(e.target.files?.[0]); e.target.value = ""; }} className="mt-1 block w-full text-[10px]" />
                  </label>
                  <Slider label="Głośność muzyki" min={0} max={1} step={0.05} value={audio.musicVolume} onChange={(v) => setAudio((prev) => ({ ...prev, musicVolume: v }))} />
                  <Slider label="Fade in (s)" min={0} max={5} step={0.5} value={audio.musicFadeIn} onChange={(v) => setAudio((prev) => ({ ...prev, musicFadeIn: v }))} />
                  <Slider label="Fade out (s)" min={0} max={5} step={0.5} value={audio.musicFadeOut} onChange={(v) => setAudio((prev) => ({ ...prev, musicFadeOut: v }))} />
                  <div className="rounded-2xl border border-white/[0.09] bg-gradient-to-br from-white/[0.055] to-transparent p-3 shadow-xl shadow-black/10">
                    <button type="button" onClick={toggleRecording} className={cn("flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 py-3 text-[10px] font-bold uppercase tracking-widest transition", recording ? "border-red-400/40 bg-red-500 text-white shadow-lg shadow-red-500/20" : "bg-white/[0.06] text-white hover:border-fuchsia-400/40 hover:bg-white/10")}>
                      <Mic className="h-3.5 w-3.5" /> {recording ? "Zatrzymaj nagrywanie" : "Nagraj voiceover"}
                    </button>
                    {audio.voice && (
                      <div className="mt-2 space-y-1">
                        <p className="text-[10px] text-white/60">🎧 {audio.voice.title}</p>
                        <audio src={audio.voice.url} controls className="w-full" />
                        <Slider label="Głośność voiceoveru" min={0} max={1.5} step={0.05} value={audio.voiceVolume} onChange={(v) => setAudio((prev) => ({ ...prev, voiceVolume: v }))} />
                      </div>
                    )}
                  </div>
                  <label className="flex items-center gap-2 text-[10px] text-white/70">
                    <input type="checkbox" checked={audio.muteOriginal} onChange={(e) => setAudio((prev) => ({ ...prev, muteOriginal: e.target.checked }))} />
                    {audio.muteOriginal ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />} Wycisz oryginalny dźwięk
                  </label>
                  {!audio.muteOriginal && <Slider label="Głośność oryginału" min={0} max={1.5} step={0.05} value={audio.originalVolume} onChange={(v) => setAudio((prev) => ({ ...prev, originalVolume: v }))} />}
                  <p className="text-[9px] text-white/40">Muzyka i voiceover są MIKSOWANE w eksportowanym pliku. Korzystaj wyłącznie z utworów, do których masz prawa.</p>
                </>
              ) : <p className="text-[11px] text-white/50">Audio dotyczy wideo — dodaj klip.</p>
            )}
            {tab === "layers" && (
              <div className="space-y-1.5">
                {[...textLayers.map((l) => ({ ...l, kind: "text" })), ...stickers.map((l) => ({ ...l, kind: "sticker" }))].map((layer) => (
                  <div key={layer.id} className={cn("flex items-center gap-1 rounded-lg border p-1.5 text-[11px]", selectedLayerId === layer.id ? "border-aura" : "border-white/15")}>
                    <button type="button" onClick={() => setSelectedLayerId(layer.id)} className="flex-1 truncate text-left">{layer.kind === "text" ? "T" : "🙂"} {layer.kind === "text" ? layer.text : layer.text}</button>
                    <button type="button" onClick={() => (layer.kind === "text" ? moveLayer(setTextLayers, layer.id, -1) : moveLayer(setStickers, layer.id, -1))} className="text-white/60" aria-label="Wyżej"><ArrowLeft className="h-3 w-3 rotate-90" /></button>
                    <button type="button" onClick={() => (layer.kind === "text" ? moveLayer(setTextLayers, layer.id, 1) : moveLayer(setStickers, layer.id, 1))} className="text-white/60" aria-label="Niżej"><ArrowRight className="h-3 w-3 -rotate-90" /></button>
                    <button type="button" onClick={() => removeLayer(layer.id)} className="text-white/60 hover:text-red-400" aria-label="Usuń"><Trash2 className="h-3 w-3" /></button>
                  </div>
                ))}
                {!textLayers.length && !stickers.length && <p className="text-[11px] text-white/50">Brak warstw — dodaj tekst lub naklejki.</p>}
              </div>
            )}
            {tab === "crop" && active && (
              <>
                <div className="grid grid-cols-4 gap-1.5">
                  {FORMATS.map((format) => (
                    <button key={format.id} type="button" onClick={() => updateActive({ format: format.id })} className={cn("rounded-lg border py-2 text-[10px]", (active.format ?? defaultFormat) === format.id ? "border-aura text-aura" : "border-white/15 text-white/70")}>{format.label}</button>
                  ))}
                </div>
                <Slider label="Obrót" min={-180} max={180} value={active.rotation} onChange={(v) => updateActive({ rotation: v }, false)} onCommit={pushHistory} />
                <Slider label="Zoom" min={1} max={4} step={0.05} value={active.zoom} onChange={(v) => updateActive({ zoom: v }, false)} onCommit={pushHistory} />
                <div className="flex gap-2">
                  <button type="button" onClick={() => updateActive({ flipX: !active.flipX })} className={cn("flex-1 rounded-lg border py-2 text-[10px]", active.flipX ? "border-aura text-aura" : "border-white/15 text-white/70")}>Odbij ↔</button>
                  <button type="button" onClick={() => updateActive({ flipY: !active.flipY })} className={cn("flex-1 rounded-lg border py-2 text-[10px]", active.flipY ? "border-aura text-aura" : "border-white/15 text-white/70")}>Odbij ↕</button>
                </div>
                <p className="text-[9px] text-white/40">Przesuwanie kadru: przeciągnij palcem po podglądzie.</p>
              </>
            )}
            {tab === "export" && (
              <>
                {mode !== "reel" && (
                  <div className="flex gap-1.5">
                    {[{ id: "hd", label: "Wysoka (1080p)" }, { id: "sd", label: "Standard (720p)" }].map((q) => (
                      <button key={q.id} type="button" onClick={() => setQuality(q.id)} className={cn("flex-1 rounded-lg border py-2 text-[10px]", quality === q.id ? "border-aura text-aura" : "border-white/15 text-white/70")}>{q.label}</button>
                    ))}
                  </div>
                )}
                {exporting && (
                  <div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full bg-gradient-to-r from-violet to-aura transition-all" style={{ width: progress + "%" }} />
                    </div>
                    <button type="button" onClick={() => { cancelRef.current = true; }} className="mt-2 w-full rounded-lg border border-red-400/50 py-1.5 text-[10px] uppercase text-red-300">Anuluj eksport</button>
                  </div>
                )}
                <button type="button" onClick={() => runExport({ publish: true })} disabled={!items.length || exporting} className="btn-aura flex w-full items-center justify-center gap-2 rounded-xl py-3 text-[10px] font-semibold uppercase tracking-widest disabled:opacity-50">
                  {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} {publishLabel}
                </button>
                <button type="button" onClick={() => runExport({ publish: false })} disabled={!items.length || exporting} className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 py-2.5 text-[10px] uppercase tracking-widest text-white/80 disabled:opacity-50">
                  <Download className="h-3.5 w-3.5" /> Zapisz na urządzenie
                </button>
                <p className="text-[9px] text-white/40">Eksport: MP4/H.264 gdy przeglądarka wspiera (Safari iOS), inaczej WebM. Efekty, tekst i muzyka są wypalane w pliku.</p>
              </>
            )}
          </div>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/avif,video/mp4,video/webm,video/quicktime"
        multiple
        className="hidden"
        onChange={(e) => { addFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }}
      />
    </div>
  );
}

function Slider({ label, min, max, step = 1, value, onChange, onCommit }) {
  return (
    <label className="group block rounded-xl border border-white/[0.055] bg-white/[0.018] px-3 py-2.5 text-[10px] uppercase tracking-wider text-white/65 transition hover:border-white/[0.12]">
      <span className="flex items-center justify-between gap-3">
        <span className="font-semibold tracking-[0.12em]">{label}</span>
        <span className="rounded-lg border border-fuchsia-400/20 bg-fuchsia-500/10 px-2 py-1 font-mono text-[10px] font-bold tabular-nums text-fuchsia-200">
          {value}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={onCommit}
        onKeyUp={onCommit}
        className="mt-3 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/15 accent-fuchsia-400 transition"
      />
    </label>
  );
}

/** Podgląd wideo: aktywny klip z filtrami CSS i warstwami HTML (drag na warstwach). */
function VideoPreview({ items, activeId, videoRefs, textLayers, stickers, audio, selectedLayerId, onPreviewPointerDown, onPreviewPointerMove, onPreviewPointerUp, onPreviewWheel }) {
  const videos = items.filter((item) => item.type === "video");
  const first = videos.find((item) => item.id === activeId) ?? videos[0];

  return (
    <div className="relative flex h-full max-h-full items-center justify-center" onPointerDown={onPreviewPointerDown} onPointerMove={onPreviewPointerMove} onPointerUp={onPreviewPointerUp} onPointerCancel={onPreviewPointerUp} onWheel={onPreviewWheel}>
      <div className="relative aspect-[9/16] max-h-full overflow-hidden rounded-2xl bg-black touch-none select-none">
        {first ? (
          <video
            ref={(el) => { if (el) videoRefs.current.set(first.id, el); }}
            src={first.url}
            autoPlay
            loop
            muted
            playsInline
            className="h-full w-full object-cover"
            style={{ filter: STUDIO_FILTERS.find((f) => f.id === first.filter)?.css ?? "none" }}
          />
        ) : null}
        {textLayers.map((layer) => (
          <span
            key={layer.id}
            className={cn("pointer-events-none absolute whitespace-pre rounded px-1.5 py-0.5 text-center", selectedLayerId === layer.id && "ring-1 ring-aura")}
            style={{ left: layer.x * 100 + "%", top: layer.y * 100 + "%", fontSize: layer.size / 3, color: layer.color, fontFamily: layer.fontFamily, transform: "translate(-50%, -50%) rotate(" + layer.rotation + "deg)", background: layer.background ? "rgba(0,0,0,0.38)" : "transparent" }}
          >
            {layer.text}
          </span>
        ))}
        {stickers.map((layer) => (
          <span
            key={layer.id}
            className={cn("pointer-events-none absolute", selectedLayerId === layer.id && "rounded ring-1 ring-aura")}
            style={{ left: layer.x * 100 + "%", top: layer.y * 100 + "%", fontSize: layer.size / 3, transform: "translate(-50%, -50%) rotate(" + layer.rotation + "deg)" }}
          >
            {layer.text}
          </span>
        ))}
        {audio.music && (
          <p className="absolute bottom-2 left-2 rounded-full bg-black/50 px-2 py-0.5 text-[9px] text-white">♫ {audio.music.title}</p>
        )}
      </div>
    </div>
  );
}
