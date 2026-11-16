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
    const candidate = line ? \`\${line} \${word}\` : word;

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
  context.font = \`\${options.fontWeight || 700} \${fontSize}px \${options.fontFamily || "Arial, sans-serif"}\`;
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
  context.font = \`\${layer.fontWeight || 700} \${fontSize}px \${layer.fontFamily || "Arial, sans-serif"}\`;

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
    \`brightness(\${brightness}%)\`,
    \`contrast(\${contrast}%)\`,
    \`saturate(\${saturation}%)\`,
  ].filter(Boolean);

  context.filter = filterParts.join(" ") || "none";

  drawCover(context, media, width, height, options);
  context.restore();

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
      context.font = \`\${clamp(sticker.size ?? 64, 18, 180)}px Arial, sans-serif\`;
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
