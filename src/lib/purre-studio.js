/**
 * PURRE PETS STUDIO — shared browser media rendering core.
 * No external dependencies. Works with HTMLImageElement and HTMLVideoElement.
 */

export const STUDIO_FILTERS = [
  { id: "none", label: "Oryginał", css: "none" },
  { id: "aurora", label: "Aurora", css: "saturate(1.35) contrast(1.08) hue-rotate(18deg)" },
  { id: "warm", label: "Ciepły", css: "sepia(0.25) saturate(1.25) hue-rotate(-8deg)" },
  { id: "cool", label: "Chłodny", css: "saturate(1.1) hue-rotate(12deg) brightness(1.05)" },
  { id: "mono", label: "Mono", css: "grayscale(1) contrast(1.15)" },
  { id: "vivid", label: "Żywy", css: "saturate(1.7) contrast(1.12)" },
  { id: "fade", label: "Fade", css: "saturate(0.72) brightness(1.1) contrast(0.92)" },
  { id: "drama", label: "Dramat", css: "contrast(1.35) brightness(0.92) saturate(1.2)" },
  { id: "dream", label: "Dream", css: "contrast(0.92) brightness(1.08) saturate(0.8)" },
];

export const STUDIO_FORMATS = {
  story: { width: 1080, height: 1920, label: "Story 9:16" },
  reel: { width: 1080, height: 1920, label: "Reel 9:16" },
  portrait: { width: 1080, height: 1350, label: "Portret 4:5" },
  square: { width: 1080, height: 1080, label: "Kwadrat 1:1" },
  landscape: { width: 1920, height: 1080, label: "Poziom 16:9" },
};

const clamp = (value, min, max) =>
  Math.min(max, Math.max(min, Number.isFinite(Number(value)) ? Number(value) : min));

export function createStudioCanvas(width = 1080, height = 1920) {
  if (typeof document === "undefined") {
    throw new Error("Renderowanie wymaga przeglądarki.");
  }

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(clamp(width, 1, 4096));
  canvas.height = Math.round(clamp(height, 1, 4096));
  return canvas;
}

export function getStudioFilter(id) {
  return STUDIO_FILTERS.find((filter) => filter.id === id) ?? STUDIO_FILTERS[0];
}

function getMediaSize(media) {
  const width = media?.videoWidth || media?.naturalWidth || media?.width || 0;
  const height = media?.videoHeight || media?.naturalHeight || media?.height || 0;

  if (!width || !height) {
    throw new Error("Medium nie jest jeszcze gotowe do renderowania.");
  }

  return { width, height };
}

function drawCover(context, media, width, height, options) {
  const { width: sourceWidth, height: sourceHeight } = getMediaSize(media);
  const rotation = ((Number(options.rotation) || 0) % 360) * Math.PI / 180;
  const cosine = Math.abs(Math.cos(rotation));
  const sine = Math.abs(Math.sin(rotation));

  const rotatedWidth = sourceWidth * cosine + sourceHeight * sine;
  const rotatedHeight = sourceWidth * sine + sourceHeight * cosine;

  const zoom = clamp(options.zoom ?? 1, 1, 4);
  const scale = Math.max(width / rotatedWidth, height / rotatedHeight) * zoom;

  context.save();
  context.translate(width / 2, height / 2);
  context.rotate(rotation);
  context.scale(
    options.flipX ? -scale : scale,
    options.flipY ? -scale : scale
  );

  const offsetX = Number(options.offsetX) || 0;
  const offsetY = Number(options.offsetY) || 0;

  context.drawImage(
    media,
    -sourceWidth / 2 + offsetX,
    -sourceHeight / 2 + offsetY,
    sourceWidth,
    sourceHeight
  );

  context.restore();
}

function wrapText(context, text, maxWidth) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;

    if (line && context.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }

  if (line) lines.push(line);
  return lines;
}

function drawRoundedRect(context, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);

  if (typeof context.roundRect === "function") {
    context.roundRect(x, y, width, height, r);
    return;
  }

  context.moveTo(x + r, y);
  context.lineTo(x + width - r, y);
  context.quadraticCurveTo(x + width, y, x + width, y + r);
  context.lineTo(x + width, y + height - r);
  context.quadraticCurveTo(
    x + width, y + height, x + width - r, y + height
  );
  context.lineTo(x + r, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - r);
  context.lineTo(x, y + r);
  context.quadraticCurveTo(x, y, x + r, y);
  context.closePath();
}

function drawText(context, width, height, text, options = {}) {
  const value = String(text || "").trim();
  if (!value) return;

  const fontSize = clamp(options.fontSize ?? 54, 16, 180);
  const maxWidth = width * 0.84;
  const lineHeight = fontSize * 1.2;
  const padding = fontSize * 0.32;

  context.save();
  context.font = `${options.fontWeight || 700} ${fontSize}px ${options.fontFamily || "Arial, sans-serif"}`;
  context.textAlign = options.align || "center";
  context.textBaseline = "middle";

  const lines = wrapText(context, value, maxWidth - padding * 2).slice(0, 8);
  const blockHeight = lines.length * lineHeight + padding * 2;

  const position = options.position || "bottom";
  const centerY = position === "top"
    ? height * 0.16
    : position === "center"
      ? height * 0.5
      : height * 0.82;

  const boxY = clamp(centerY - blockHeight / 2, 8, height - blockHeight - 8);

  if (options.background !== false) {
    context.fillStyle = options.backgroundColor || "rgba(0,0,0,0.38)";
    context.beginPath();
    drawRoundedRect(
      context,
      width * 0.08,
      boxY,
      width * 0.84,
      blockHeight,
      Math.max(8, fontSize * 0.18)
    );
    context.fill();
  }

  context.fillStyle = options.color || "#ffffff";
  context.shadowColor = "rgba(0,0,0,0.55)";
  context.shadowBlur = 8;
  context.shadowOffsetY = 2;

  const x = options.align === "left"
    ? width * 0.12 + padding
    : options.align === "right"
      ? width * 0.88 - padding
      : width / 2;

  lines.forEach((line, index) => {
    context.fillText(
      line,
      x,
      boxY + padding + lineHeight * (index + 0.5),
      maxWidth - padding * 2
    );
  });

  context.restore();
}

function drawTextLayer(context, width, height, layer = {}) {
  const value = String(layer.text || "").trim().slice(0, 160);
  if (!value) return;

  const fontSize = clamp(layer.size ?? layer.fontSize ?? 54, 16, 180);
  const maxWidth = width * 0.84;
  const lineHeight = fontSize * 1.2;
  const padding = fontSize * 0.32;

  context.save();
  context.font = `${layer.fontWeight || 700} ${fontSize}px ${layer.fontFamily || "Arial, sans-serif"}`;

  // Pomiar i zawijanie muszą używać tej samej czcionki co renderowanie.
  const lines = wrapText(context, value, maxWidth - padding * 2).slice(0, 8);
  if (!lines.length) {
    context.restore();
    return;
  }

  const blockHeight = lines.length * lineHeight + padding * 2;
  const x = clamp(layer.x ?? 0.5, 0, 1) * width;
  const y = clamp(layer.y ?? 0.82, 0, 1) * height;
  const align = ["left", "center", "right"].includes(layer.align)
    ? layer.align
    : "center";

  context.translate(x, y);
  context.rotate((Number(layer.rotation) || 0) * Math.PI / 180);
  context.textAlign = align;
  context.textBaseline = "middle";

  if (layer.background !== false) {
    context.fillStyle = layer.backgroundColor || "rgba(0,0,0,0.38)";
    context.beginPath();
    drawRoundedRect(
      context,
      -maxWidth / 2,
      -blockHeight / 2,
      maxWidth,
      blockHeight,
      Math.max(8, fontSize * 0.18)
    );
    context.fill();
  }

  context.fillStyle = layer.color || "#ffffff";
  context.shadowColor = "rgba(0,0,0,0.55)";
  context.shadowBlur = 8;
  context.shadowOffsetY = 2;

  const textX = align === "left"
    ? -maxWidth / 2 + padding
    : align === "right"
      ? maxWidth / 2 - padding
      : 0;

  lines.forEach((line, index) => {
    context.fillText(
      line,
      textX,
      -blockHeight / 2 + padding + lineHeight * (index + 0.5),
      maxWidth - padding * 2
    );
  });

  context.restore();
}

/**
 * Render one image/video frame to a canvas.
 * options:
 * format, width, height, filter, brightness, contrast, saturation,
 * rotation, flipX, flipY, zoom, offsetX, offsetY, text, textOptions.
 */
export function renderStudioFrame(media, canvas, options = {}) {
  if (!canvas?.getContext) {
    throw new Error("Nieprawidłowa powierzchnia renderowania.");
  }

  const format = STUDIO_FORMATS[options.format] || STUDIO_FORMATS.story;
  const width = Math.round(clamp(options.width ?? format.width, 1, 4096));
  const height = Math.round(clamp(options.height ?? format.height, 1, 4096));

  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;

  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Canvas 2D nie jest dostępny.");

  const preset = getStudioFilter(options.filter);
  const brightness = clamp(options.brightness ?? 100, 0, 200);
  const contrast = clamp(options.contrast ?? 100, 0, 200);
  const saturation = clamp(options.saturation ?? 100, 0, 200);

  context.save();
  context.fillStyle = options.backgroundColor || "#08080b";
  context.fillRect(0, 0, width, height);
  const filterParts = [
    preset.id === "none" ? "" : preset.css,
    `brightness(${brightness}%)`,
    `contrast(${contrast}%)`,
    `saturate(${saturation}%)`,
  ].filter(Boolean);

  // Temperatura (ciepło/zimno) i rozmycie — dodatkowe korekcje obrazu.
  const temperature = clamp(options.temperature ?? 0, -100, 100);
  const blurPx = clamp(options.blur ?? 0, 0, 20);
  const extraParts = [];
  if (temperature !== 0) {
    extraParts.push("hue-rotate(" + (temperature * 0.18).toFixed(1) + "deg)");
    if (temperature > 0) extraParts.push("sepia(" + (temperature / 400).toFixed(3) + ")");
  }
  if (blurPx > 0) extraParts.push("blur(" + blurPx.toFixed(1) + "px)");
  context.filter = [...filterParts, ...extraParts].join(" ") || "none";

  drawCover(context, media, width, height, options);
  context.restore();

  // Efekty: winieta + ziarno (po medium, przed warstwami tekstu).
  const vignette = clamp(options.vignette ?? 0, 0, 100);
  if (vignette > 0) {
    const gradient = context.createRadialGradient(
      width / 2, height / 2, Math.min(width, height) * 0.35,
      width / 2, height / 2, Math.max(width, height) * 0.72
    );
    gradient.addColorStop(0, "rgba(0,0,0,0)");
    gradient.addColorStop(1, "rgba(0,0,0," + (vignette / 100 * 0.85).toFixed(3) + ")");
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
  }
  const grain = clamp(options.grain ?? 0, 0, 100);
  if (grain > 0 && typeof document !== "undefined") {
    const tile = 64;
    const noise = document.createElement("canvas");
    noise.width = tile;
    noise.height = tile;
    const nctx = noise.getContext("2d");
    const imageData = nctx.createImageData(tile, tile);
    const strength = grain / 100 * 90;
    for (let i = 0; i < imageData.data.length; i += 4) {
      const value = 128 + Math.round(Math.sin(i * 12.9898) * strength);
      imageData.data[i] = value;
      imageData.data[i + 1] = value;
      imageData.data[i + 2] = value;
      imageData.data[i + 3] = Math.round(grain * 1.6);
    }
    nctx.putImageData(imageData, 0, 0);
    const pattern = context.createPattern(noise, "repeat");
    if (pattern) {
      context.save();
      context.globalAlpha = 0.5;
      context.fillStyle = pattern;
      context.fillRect(0, 0, width, height);
      context.restore();
    }
    noise.width = 1;
    noise.height = 1;
  }

  // Zachowanie zgodności ze starszymi projektami.
  if (options.text) {
    drawText(context, width, height, options.text, options.textOptions);
  }

  // Niezależne warstwy tekstowe Studio.
  if (Array.isArray(options.textLayers)) {
    for (const layer of options.textLayers.slice(0, 30)) {
      drawTextLayer(context, width, height, layer);
    }
  }

  if (Array.isArray(options.stickers)) {
    for (const sticker of options.stickers.slice(0, 30)) {
      const value = String(sticker?.text || "").slice(0, 80);
      if (!value) continue;

      context.save();
      context.translate(
        clamp(sticker.x ?? 0.5, 0, 1) * width,
        clamp(sticker.y ?? 0.5, 0, 1) * height
      );
      context.rotate(
        (Number(sticker.rotation) || 0) * Math.PI / 180
      );
      context.font = `${clamp(sticker.size ?? 64, 18, 180)}px Arial, sans-serif`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(value, 0, 0);
      context.restore();
    }
  }

  return canvas;
}

export function canvasToBlob(canvas, type = "image/jpeg", quality = 0.92) {
  return new Promise((resolve, reject) => {
    if (!canvas?.toBlob) {
      reject(new Error("Eksport obrazu nie jest obsługiwany."));
      return;
    }

    canvas.toBlob(
      (blob) => {
        if (!blob?.size) {
          reject(new Error("Nie udało się utworzyć pliku wynikowego."));
          return;
        }
        resolve(blob);
      },
      type,
      clamp(quality, 0.1, 1)
    );
  });
}

/**
 * Eksport zdjęcia Stories przez wspólny silnik STUDIO.
 * Zwraca gotowy Blob; nie modyfikuje źródłowego medium.
 */
export async function exportStudioImage(media, options = {}) {
  if (!media) {
    throw new Error("Brak zdjęcia do eksportu.");
  }

  const width = options.width ?? 1080;
  const height = options.height ?? 1920;
  const canvas = createStudioCanvas(width, height);

  try {
    renderStudioFrame(media, canvas, {
      ...options,
      format: options.format || "story",
      width,
      height,
    });

    return await canvasToBlob(
      canvas,
      options.type || "image/jpeg",
      options.quality ?? 0.92
    );
  } finally {
    // Zwolnienie pamięci zajmowanej przez bitmapę Canvas.
    canvas.width = 1;
    canvas.height = 1;
  }
}

export function getSupportedVideoMimeType() {
  if (typeof MediaRecorder === "undefined") return "";

  return [
    "video/mp4;codecs=h264,aac",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ].find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

export function downloadStudioBlob(blob, filename) {
  if (!(blob instanceof Blob) || !blob.size) {
    throw new Error("Brak poprawnego pliku do zapisania.");
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function validateStudioFile(file, mode = "all") {
  if (typeof File === "undefined" || !file || !(file instanceof File) || file.size <= 0) {
    throw new Error("Wybierz prawidłowy plik.");
  }

  const imageTypes = new Set([
    "image/jpeg", "image/png", "image/webp", "image/avif", "image/gif",
  ]);
  const videoTypes = new Set([
    "video/mp4", "video/webm", "video/quicktime",
  ]);

  const isImage = imageTypes.has(file.type);
  const isVideo = videoTypes.has(file.type);

  if ((!isImage && !isVideo) || (mode === "image" && !isImage) || (mode === "video" && !isVideo)) {
    throw new Error("Nieobsługiwany format pliku.");
  }

  const limit = isVideo ? 100 * 1024 * 1024 : 20 * 1024 * 1024;
  if (file.size > limit) {
    throw new Error(isVideo ? "Film może mieć maksymalnie 100 MB." : "Zdjęcie może mieć maksymalnie 20 MB.");
  }

  return { type: isVideo ? "video" : "image", size: file.size };
}

// ------------------------------------------------------------------
// EKSPORT WIDEO (Studio) — MediaRecorder z wykrywaniem możliwości
// przeglądarki: preferowany MP4/H.264 (Safari iOS), fallback WebM.
// Obsługuje wiele klipów (nagrywanych sekwencyjnie do JEDNEGO pliku),
// miks audio (oryginał + muzyka + voiceover) z głośnością i fade,
// pasek postępu, anulowanie i pełne zwalnianie zasobów.
// ------------------------------------------------------------------

const studioVideoAudioCtx = new WeakMap(); // window -> AudioContext (singleton per karta)
const studioMediaSources = new WeakMap(); // element -> MediaElementAudioSourceNode

function studioAudioContext() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  let ctx = studioVideoAudioCtx.get(window);
  if (!ctx || ctx.state === "closed") {
    ctx = new Ctx();
    studioVideoAudioCtx.set(window, ctx);
  }
  return ctx;
}

// MediaElementSource można utworzyć tylko RAZ na element — cache w WeakMap.
function mediaSourceFor(ctx, element) {
  if (!element) return null;
  let source = studioMediaSources.get(element);
  if (source) return source;
  try {
    source = ctx.createMediaElementSource(element);
    studioMediaSources.set(element, source);
    return source;
  } catch {
    return null;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForSeek(video, target) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      video.removeEventListener("seeked", finish);
      resolve();
    };
    video.addEventListener("seeked", finish);
    video.currentTime = target;
    setTimeout(finish, 1200); // nigdy nie zawieszaj eksportu na seeku
  });
}

function canvasSupportsFilter(context) {
  try {
    const previous = context.filter;
    context.filter = "blur(1px)";
    const supported = context.filter !== "none" && context.filter !== previous;
    context.filter = previous || "none";
    return supported;
  } catch {
    return false;
  }
}

function scheduleGain(gain, ctx, startAt, duration, { volume = 1, fadeIn = 0, fadeOut = 0 }) {
  const v = Math.min(Math.max(Number(volume) || 0, 0), 1.5);
  const inSec = Math.min(Math.max(Number(fadeIn) || 0, 0), duration / 2);
  const outSec = Math.min(Math.max(Number(fadeOut) || 0, 0), duration / 2);
  gain.gain.cancelScheduledValues(startAt);
  gain.gain.setValueAtTime(inSec > 0 ? 0.0001 : v, startAt);
  if (inSec > 0) gain.gain.linearRampToValueAtTime(v, startAt + inSec);
  if (outSec > 0) {
    gain.gain.setValueAtTime(v, startAt + duration - outSec);
    gain.gain.linearRampToValueAtTime(0.0001, startAt + duration);
  }
}

/**
 * Eksport wideo STUDIO.
 * clips: [{ video: HTMLVideoElement (załadowany), trimStart, trimEnd, speed, filter,
 *           brightness, contrast, saturation }]
 * overlays: { textLayers, stickers } — wspólne dla wszystkich klipów.
 * audio: { originalVolume, music: { element, volume, fadeIn, fadeOut },
 *          voice: { element, volume, fadeIn, fadeOut } }
 * Opcje: width, height, fps, videoBitsPerSecond, onProgress(0-100),
 *        shouldCancel() => bool, onWarning(msg).
 * Zwraca { blob, mimeType, extension }. Rzuca ExportCancelled przy anulowaniu.
 */
export async function exportStudioVideo(options = {}) {
  const clips = (options.clips ?? []).filter((clip) =>
    Boolean(clip?.video?.videoWidth || clip?.image?.naturalWidth)
  );

  if (!clips.length) throw new Error("Brak zdjęć lub klipów wideo do eksportu.");
  if (typeof MediaRecorder === "undefined") {
    throw new Error("Ta przeglądarka nie obsługuje nagrywania wideo (MediaRecorder).");
  }

  const mime = getSupportedVideoMimeType();
  if (!mime) throw new Error("Brak obsługiwanego formatu nagrywania w tej przeglądarce.");

  const width = Math.round(options.width ?? 720);
  const height = Math.round(options.height ?? 1280);
  const fps = Math.min(Math.max(options.fps ?? 30, 10), 60);
  const shouldCancel = options.shouldCancel ?? (() => false);
  const onProgress = options.onProgress ?? (() => {});
  const onWarning = options.onWarning ?? (() => {});
  const canvas = createStudioCanvas(width, height);
  const context = canvas.getContext("2d", { alpha: false });
  const filterSupported = canvasSupportsFilter(context);
  const overlays = options.overlays ?? {};

  const spanOf = (clip) => {
    if (clip.image) return Math.max(1, Number(clip.duration ?? clip.trimEnd) || 3);
    const start = Math.max(0, Number(clip.trimStart) || 0);
    const end = Number(clip.trimEnd) || clip.video.duration || start + 0.1;
    return Math.max(0.1, end - start);
  };

  const totalSpan = clips.reduce((sum, clip) => sum + spanOf(clip), 0);
  let recorded = 0;

  const audio = options.audio ?? {};
  const audioCtx = studioAudioContext();
  let destStream = null;
  const connected = [];

  if (audioCtx) {
    try {
      await audioCtx.resume().catch(() => {});
      const destination = audioCtx.createMediaStreamDestination();
      destStream = destination.stream;

      const originalVolume = audio.muteOriginal
        ? 0
        : Math.min(Math.max(audio.originalVolume ?? 1, 0), 1.5);

      for (const clip of clips) {
        if (!clip.video) continue;
        const source = mediaSourceFor(audioCtx, clip.video);
        if (!source) continue;

        const gain = audioCtx.createGain();
        source.connect(gain);
        gain.connect(destination);
        connected.push({ source, gain, original: true, volume: originalVolume });
      }

      for (const track of [audio.music, audio.voice]) {
        if (!track?.element) continue;
        const source = mediaSourceFor(audioCtx, track.element);
        if (!source) {
          onWarning("Nie udało się podłączyć ścieżki audio — eksport bez tej ścieżki.");
          continue;
        }

        const gain = audioCtx.createGain();
        source.connect(gain);
        gain.connect(destination);
        connected.push({ source, gain, track });
      }
    } catch {
      destStream = null;
      onWarning("Miks audio niedostępny — eksport może być bez dźwięku.");
    }
  } else if (audio.music?.element || audio.voice?.element) {
    onWarning("AudioContext jest niedostępny — eksport może być bez muzyki.");
  }

  const stream = canvas.captureStream(fps);
  if (destStream) {
    for (const track of destStream.getAudioTracks()) stream.addTrack(track);
  }

  const recorder = new MediaRecorder(stream, {
    mimeType: mime,
    videoBitsPerSecond: options.videoBitsPerSecond ?? 4_000_000,
  });

  const chunks = [];
  recorder.ondataavailable = (event) => {
    if (event.data?.size) chunks.push(event.data);
  };

  const stopped = new Promise((resolve) => {
    recorder.onstop = resolve;
  });

  class ExportCancelled extends Error {
    constructor() {
      super("Eksport anulowany.");
      this.name = "ExportCancelled";
    }
  }

  const cleanup = () => {
    try {
      for (const clip of clips) clip.video?.pause();
      for (const track of [audio.music, audio.voice]) {
        track?.element?.pause?.();
      }
      for (const item of connected) {
        try { item.gain.disconnect(); } catch { /* już rozłączony */ }
      }
      for (const track of stream.getTracks()) track.stop();
      canvas.width = 1;
      canvas.height = 1;
    } catch {
      /* Sprzątanie nie może maskować błędu eksportu. */
    }
  };

  const paint = (clip) => {
    if (shouldCancel()) return false;

    const media = clip.video ?? clip.image;
    const preset = getStudioFilter(clip.filter);

    renderStudioFrame(media, canvas, {
      width,
      height,
      format: options.format ?? "reel",
      filter: filterSupported ? preset.id : "none",
      brightness: clip.brightness ?? 100,
      contrast: clip.contrast ?? 100,
      saturation: clip.saturation ?? 100,
      temperature: clip.temperature ?? 0,
      vignette: clip.vignette ?? 0,
      grain: clip.grain ?? 0,
      blur: clip.blur ?? 0,
      rotation: clip.rotation,
      flipX: clip.flipX,
      flipY: clip.flipY,
      zoom: clip.zoom,
      offsetX: clip.offsetX,
      offsetY: clip.offsetY,
      textLayers: overlays.textLayers,
      stickers: overlays.stickers,
    });

    return true;
  };

  try {
    // Muzyka i voiceover startują od początku filmu.
    for (const track of [audio.music, audio.voice]) {
      const element = track?.element;
      if (!element) continue;
      try {
        element.pause();
        element.currentTime = 0;
        await element.play();
      } catch {
        onWarning("Przeglądarka nie uruchomiła jednej ze ścieżek audio.");
      }
    }

    recorder.start(250);

    for (const clip of clips) {
      if (shouldCancel()) throw new ExportCancelled();

      const span = spanOf(clip);
      const start = Math.max(0, Number(clip.trimStart) || 0);
      const end = clip.video ? start + span : span;
      const speed = Math.min(Math.max(clip.speed ?? 1, 0.25), 4);

      if (clip.video) {
        await waitForSeek(clip.video, start);
        clip.video.playbackRate = speed;

        const played = clip.video.play();
        const started = await Promise.race([
          played.then(() => true).catch(() => false),
          sleep(2500).then(() => false),
        ]);

        if (!started || clip.video.paused) {
          throw new Error("Nie udało się uruchomić filmu do eksportu. Kliknij stronę i spróbuj ponownie.");
        }
      }

      // Głośność dźwięku oryginalnego danego klipu.
      if (clip.video && audioCtx) {
        const item = connected.find((entry) =>
          entry.original && studioMediaSources.get(clip.video) === entry.source
        );
        if (item) {
          scheduleGain(item.gain, audioCtx, audioCtx.currentTime, span, {
            volume: audio.muteOriginal ? 0 : (audio.originalVolume ?? 1),
          });
        }
      }

      // Fade muzyki i voiceoveru przez całą długość projektu.
      if (audioCtx) {
        for (const item of connected) {
          if (!item.track) continue;
          if (!item.scheduled) {
            scheduleGain(item.gain, audioCtx, audioCtx.currentTime, totalSpan, item.track);
            item.scheduled = true;
          }
        }
      }

      const startedAt = performance.now();

      await new Promise((resolve, reject) => {
        const loop = () => {
          if (shouldCancel()) {
            reject(new ExportCancelled());
            return;
          }

          const elapsed = clip.video
            ? Math.max(0, clip.video.currentTime - start) / speed
            : (performance.now() - startedAt) / 1000;

          const finished = clip.video
            ? clip.video.currentTime >= end || clip.video.ended
            : elapsed >= span;

          if (finished) {
            clip.video?.pause();
            recorded += span;
            onProgress(Math.min(99, Math.round((recorded / totalSpan) * 100)));
            resolve();
            return;
          }

          if (!paint(clip)) {
            reject(new ExportCancelled());
            return;
          }

          onProgress(Math.min(
            99,
            Math.round(((recorded + Math.min(elapsed, span)) / totalSpan) * 100)
          ));

          requestAnimationFrame(loop);
        };

        loop();
      });
    }

    onProgress(100);
    recorder.stop();
    await stopped;

    const blob = new Blob(chunks, { type: mime });
    if (!blob.size) throw new Error("Eksport nie wygenerował danych wideo.");

    return {
      blob,
      mimeType: mime,
      extension: mime.includes("mp4") ? "mp4" : "webm",
    };
  } catch (error) {
    try {
      if (recorder.state !== "inactive") recorder.stop();
    } catch { /* rejestrator mógł już się zatrzymać */ }
    await stopped;
    throw error;
  } finally {
    cleanup();
  }
}
