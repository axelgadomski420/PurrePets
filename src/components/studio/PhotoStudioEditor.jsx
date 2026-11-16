import { useEffect, useRef, useState } from "react";
import {
  STUDIO_FILTERS,
  STUDIO_FORMATS,
  renderStudioFrame,
} from "@/lib/purre-studio";

const initial = {
  format: "square",
  filter: "none",
  rotation: 0,
  flipX: false,
  flipY: false,
  zoom: 1,
  brightness: 100,
  contrast: 100,
  saturation: 100,
  offsetX: 0,
  offsetY: 0,
  text: "",
  textPosition: "bottom",
  textLayers: [],
  stickers: [],
};

const FORMAT_OPTIONS = [
  ["square", "1:1"],
  ["portrait", "4:5"],
  ["story", "9:16"],
  ["landscape", "16:9"],
];

export default function PhotoStudioEditor({
  file,
  previewUrl,
  initialSettings,
  onCancel,
  onSave,
}) {
  const canvasRef = useRef(null);
  const imageRef = useRef(null);
  const dragRef = useRef(null);
  const [imageReady, setImageReady] = useState(false);
  const [activeSticker, setActiveSticker] = useState(-1);
  const [activeTextLayer, setActiveTextLayer] = useState(-1);
  const [settings, setSettings] = useState(() => ({
    ...initial,
    ...(initialSettings || {}),
    stickers: Array.isArray(initialSettings?.stickers)
      ? initialSettings.stickers
      : [],
    textLayers: Array.isArray(initialSettings?.textLayers)
      ? initialSettings.textLayers
      : [],
  }));
  const [stickerText, setStickerText] = useState("");
  const [textLayerDraft, setTextLayerDraft] = useState("");

  const update = (key, value) =>
    setSettings((current) => ({ ...current, [key]: value }));

  // Obraz ładujemy tylko przy zmianie źródła.
  useEffect(() => {
    let active = true;
    const image = new Image();

    imageRef.current = null;
    setImageReady(false);

    image.onload = () => {
      if (!active) return;
      imageRef.current = image;
      setImageReady(true);
    };

    image.onerror = () => {
      if (active) {
        console.error("Nie udało się wczytać zdjęcia do Studio.");
      }
    };

    image.src = previewUrl || "";

    return () => {
      active = false;
      if (imageRef.current === image) imageRef.current = null;
      image.onload = null;
      image.onerror = null;
    };
  }, [previewUrl]);

  // Zmiana ustawień odświeża Canvas bez ponownego ładowania zdjęcia.
  useEffect(() => {
    const image = imageRef.current;
    const canvas = canvasRef.current;

    if (!imageReady || !image || !canvas) return;

    const format = STUDIO_FORMATS[settings.format] || STUDIO_FORMATS.square;
    const width = 720;
    const height = Math.round(width * format.height / format.width);

    try {
      renderStudioFrame(image, canvas, {
        ...settings,
        width,
        height,
        format: settings.format,
        text: settings.text,
        textLayers: settings.textLayers || [],
        textOptions: {
          position: settings.textPosition || "bottom",
          fontSize: Math.round(width * 0.048),
          fontWeight: 700,
          align: "center",
          color: "#ffffff",
          background: true,
          backgroundColor: "rgba(0,0,0,0.38)",
        },
      });
    } catch (error) {
      console.error("PURRE STUDIO preview:", error);
    }
  }, [imageReady, settings]);

  const addSticker = () => {
    const value = stickerText.trim().slice(0, 80);
    if (!value) return;

    setSettings((current) => ({
      ...current,
      stickers: [
        ...(current.stickers || []).slice(0, 29),
        { text: value, x: 0.5, y: 0.5, size: 64, rotation: 0 },
      ],
    }));
    setActiveSticker(settings.stickers.length);
    setStickerText("");
  };


  const addTextLayer = () => {
    const value = textLayerDraft.trim().slice(0, 160);
    const currentLayers = settings.textLayers || [];

    if (!value || currentLayers.length >= 30) return;

    setSettings((current) => ({
      ...current,
      textLayers: [
        ...(current.textLayers || []),
        {
          text: value,
          x: 0.5,
          y: 0.5,
          size: 54,
          rotation: 0,
          color: "#ffffff",
          background: true,
          backgroundColor: "rgba(0,0,0,0.38)",
          align: "center",
        },
      ],
    }));

    setActiveTextLayer(currentLayers.length);
    setActiveSticker(-1);
    setTextLayerDraft("");
    dragRef.current = null;
  };

  const updateActiveTextLayer = (patch) => {
    if (activeTextLayer < 0) return;

    setSettings((current) => ({
      ...current,
      textLayers: (current.textLayers || []).map((layer, index) =>
        index === activeTextLayer ? { ...layer, ...patch } : layer
      ),
    }));
  };

  const moveTextLayer = (direction) => {
    const from = activeTextLayer;
    const to = from + direction;
    const layers = settings.textLayers || [];

    if (from < 0 || to < 0 || to >= layers.length) return;

    setSettings((current) => {
      const next = [...(current.textLayers || [])];
      if (!next[from] || !next[to]) return current;

      [next[from], next[to]] = [next[to], next[from]];
      return { ...current, textLayers: next };
    });

    setActiveTextLayer(to);
    setActiveSticker(-1);
    dragRef.current = null;
  };

  const removeTextLayer = (index) => {
    setSettings((current) => ({
      ...current,
      textLayers: (current.textLayers || []).filter(
        (_, itemIndex) => itemIndex !== index
      ),
    }));

    setActiveTextLayer((current) =>
      current === index ? -1 :
      current > index ? current - 1 : current
    );

    dragRef.current = null;
  };

  const canvasPoint = (event) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;

    return {
      x: (event.clientX - rect.left) * canvas.width / rect.width,
      y: (event.clientY - rect.top) * canvas.height / rect.height,
    };
  };

  const handlePointerDown = (event) => {
    const canvas = canvasRef.current;
    const point = canvasPoint(event);
    if (!canvas || !point) return;

    const textLayers = settings.textLayers || [];
    let hitTextIndex = -1;

    for (let index = textLayers.length - 1; index >= 0; index--) {
      const layer = textLayers[index];
      const x = (layer.x ?? 0.5) * canvas.width;
      const y = (layer.y ?? 0.5) * canvas.height;
      const radiusY = Math.max(34, (layer.size || 54) * 1.5);

      if (
        Math.abs(point.x - x) <= canvas.width * 0.44 &&
        Math.abs(point.y - y) <= radiusY
      ) {
        hitTextIndex = index;
        break;
      }
    }

    const stickers = settings.stickers || [];
    let hitIndex = -1;

    for (let index = stickers.length - 1; index >= 0; index--) {
      const sticker = stickers[index];
      const x = (sticker.x ?? 0.5) * canvas.width;
      const y = (sticker.y ?? 0.5) * canvas.height;
      const radius = Math.max(28, (sticker.size || 64) * 0.9);

      if (Math.hypot(point.x - x, point.y - y) <= radius) {
        hitIndex = index;
        break;
      }
    }

    if (hitTextIndex >= 0) {
      setActiveTextLayer(hitTextIndex);
      setActiveSticker(-1);
      dragRef.current = {
        pointerId: event.pointerId,
        kind: "text",
        index: hitTextIndex,
        startX: point.x,
        startY: point.y,
        startLayer: { ...textLayers[hitTextIndex] },
      };
    } else if (hitIndex >= 0) {
      setActiveSticker(hitIndex);
      setActiveTextLayer(-1);
      dragRef.current = {
        pointerId: event.pointerId,
        kind: "sticker",
        index: hitIndex,
        startX: point.x,
        startY: point.y,
        startSticker: { ...stickers[hitIndex] },
      };
    } else if (settings.zoom > 1 && imageRef.current) {
      setActiveSticker(-1);
      setActiveTextLayer(-1);
      dragRef.current = {
        pointerId: event.pointerId,
        kind: "image",
        startX: point.x,
        startY: point.y,
        startOffsetX: settings.offsetX || 0,
        startOffsetY: settings.offsetY || 0,
      };
    } else {
      setActiveSticker(-1);
      setActiveTextLayer(-1);
      return;
    }

    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      // Przeglądarka może nie obsługiwać przejęcia wskaźnika.
    }

    event.preventDefault();
  };

  const handlePointerMove = (event) => {
    const drag = dragRef.current;
    const canvas = canvasRef.current;
    const point = canvasPoint(event);

    if (!drag || !canvas || !point || drag.pointerId !== event.pointerId) return;

    const dx = point.x - drag.startX;
    const dy = point.y - drag.startY;

    if (drag.kind === "text") {
      setSettings((current) => ({
        ...current,
        textLayers: (current.textLayers || []).map((layer, index) =>
          index === drag.index
            ? {
                ...layer,
                x: Math.max(0, Math.min(1,
                  (drag.startLayer.x ?? 0.5) + dx / canvas.width
                )),
                y: Math.max(0, Math.min(1,
                  (drag.startLayer.y ?? 0.5) + dy / canvas.height
                )),
              }
            : layer
        ),
      }));
      return;
    }

    if (drag.kind === "sticker") {
      setSettings((current) => ({
        ...current,
        stickers: current.stickers.map((sticker, index) =>
          index === drag.index
            ? {
                ...sticker,
                x: Math.max(0, Math.min(1,
                  (drag.startSticker.x ?? 0.5) + dx / canvas.width
                )),
                y: Math.max(0, Math.min(1,
                  (drag.startSticker.y ?? 0.5) + dy / canvas.height
                )),
              }
            : sticker
        ),
      }));
      return;
    }

    const image = imageRef.current;
    if (!image) return;

    const sourceWidth = image.naturalWidth;
    const sourceHeight = image.naturalHeight;
    const radians = ((Number(settings.rotation) || 0) % 360) * Math.PI / 180;
    const cosine = Math.abs(Math.cos(radians));
    const sine = Math.abs(Math.sin(radians));
    const rotatedWidth = sourceWidth * cosine + sourceHeight * sine;
    const rotatedHeight = sourceWidth * sine + sourceHeight * cosine;
    const scale = Math.max(
      canvas.width / rotatedWidth,
      canvas.height / rotatedHeight
    ) * settings.zoom;

    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const localX = (cos * dx + sin * dy) /
      ((settings.flipX ? -1 : 1) * scale);
    const localY = (-sin * dx + cos * dy) /
      ((settings.flipY ? -1 : 1) * scale);

    setSettings((current) => ({
      ...current,
      offsetX: drag.startOffsetX + localX,
      offsetY: drag.startOffsetY + localY,
    }));
  };

  const handlePointerUp = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    dragRef.current = null;
    try {
      canvasRef.current?.releasePointerCapture(event.pointerId);
    } catch {
      // Wskaźnik został już zwolniony.
    }
  };

  const updateActiveSticker = (patch) => {
    if (activeSticker < 0) return;

    setSettings((current) => ({
      ...current,
      stickers: current.stickers.map((sticker, index) =>
        index === activeSticker ? { ...sticker, ...patch } : sticker
      ),
    }));
  };

  const moveStickerLayer = (direction) => {
    if (activeSticker < 0) return;

    const target = activeSticker + direction;
    if (target < 0 || target >= settings.stickers.length) return;

    setSettings((current) => {
      const stickers = [...current.stickers];
      [stickers[activeSticker], stickers[target]] =
        [stickers[target], stickers[activeSticker]];
      return { ...current, stickers };
    });

    setActiveSticker(target);
    dragRef.current = null;
  };

  const selectedFormat =
    STUDIO_FORMATS[settings.format] || STUDIO_FORMATS.square;

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-black/95 p-3 sm:p-6">
      <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col rounded-2xl border border-white/10 bg-card p-4 text-card-foreground shadow-2xl">
        <header className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
              PURRE PETS STUDIO
            </p>
            <h2 className="mt-1 text-lg font-semibold">Edytor zdjęcia</h2>
            <p className="text-xs text-muted-foreground">
              {file?.name || "Wybrane zdjęcie"}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-border px-3 py-2 text-sm"
          >
            Zamknij
          </button>
        </header>

        <div className="mx-auto my-4 flex w-full max-w-[420px] items-center justify-center overflow-hidden rounded-xl bg-black p-2">
          <canvas
            ref={canvasRef}
            aria-label="Podgląd zdjęcia. Przeciągaj naklejki lub przesuwaj powiększone zdjęcie."
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className="h-auto max-h-[55vh] w-full object-contain touch-none"
            style={{
              aspectRatio: `${selectedFormat.width} / ${selectedFormat.height}`,
              cursor: settings.zoom > 1 ? "grab" : "default",
            }}
          />
        </div>

        <div className="space-y-4">
          <section>
            <p className="mb-2 text-xs font-semibold">Format kadru</p>
            <div className="grid grid-cols-4 gap-2">
              {FORMAT_OPTIONS.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => update("format", id)}
                  className={`rounded-xl border px-2 py-2 text-xs ${
                    settings.format === id
                      ? "border-aura bg-aura/15 text-aura"
                      : "border-border"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </section>

          <section>
            <p className="mb-2 text-xs font-semibold">Filtry</p>
            <div className="flex flex-wrap gap-2">
              {STUDIO_FILTERS.map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  onClick={() => update("filter", filter.id)}
                  className={`rounded-full border px-3 py-2 text-xs ${
                    settings.filter === filter.id
                      ? "border-aura bg-aura/15 text-aura"
                      : "border-border"
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </section>

          <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <button
              type="button"
              onClick={() => update("rotation", (settings.rotation + 90) % 360)}
              className="rounded-lg border border-border px-3 py-2 text-xs"
            >
              Obróć 90°
            </button>
            <button
              type="button"
              onClick={() => update("flipX", !settings.flipX)}
              className={`rounded-lg border px-3 py-2 text-xs ${
                settings.flipX ? "border-aura text-aura" : "border-border"
              }`}
            >
              Odbij poziomo
            </button>
            <button
              type="button"
              onClick={() => update("flipY", !settings.flipY)}
              className={`rounded-lg border px-3 py-2 text-xs ${
                settings.flipY ? "border-aura text-aura" : "border-border"
              }`}
            >
              Odbij pionowo
            </button>
            <button
              type="button"
              onClick={() => update("rotation", 0)}
              className="rounded-lg border border-border px-3 py-2 text-xs"
            >
              Wyzeruj obrót
            </button>
          </section>

          <section className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Przeciągnij naklejkę lub powiększone zdjęcie na podglądzie.
            </p>
            <button
              type="button"
              onClick={() => {
                update("offsetX", 0);
                update("offsetY", 0);
              }}
              className="shrink-0 rounded-lg border border-border px-3 py-2 text-xs"
            >
              Wyśrodkuj kadr
            </button>
          </section>

          <section>
            <label className="block text-xs">
              <span className="mb-1 flex justify-between">
                <span>Powiększenie / kadrowanie</span>
                <span>{settings.zoom.toFixed(1)}×</span>
              </span>
              <input
                type="range"
                min="1"
                max="4"
                step="0.05"
                value={settings.zoom}
                onChange={(event) => update("zoom", Number(event.target.value))}
                className="w-full accent-current"
              />
            </label>
          </section>

          {[
            ["Jasność", "brightness"],
            ["Kontrast", "contrast"],
            ["Nasycenie", "saturation"],
          ].map(([label, key]) => (
            <label key={key} className="block text-xs">
              <span className="mb-1 flex justify-between">
                <span>{label}</span>
                <span>{settings[key]}%</span>
              </span>
              <input
                type="range"
                min="0"
                max="200"
                step="1"
                value={settings[key]}
                onChange={(event) => update(key, Number(event.target.value))}
                className="w-full accent-current"
              />
            </label>
          ))}

          <section className="grid gap-2 sm:grid-cols-[1fr_150px]">
            <label className="block text-xs">
              Tekst na zdjęciu
              <input
                value={settings.text}
                maxLength={160}
                onChange={(event) => update("text", event.target.value)}
                placeholder="Dodaj napis..."
                className="mt-1.5 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
              />
            </label>
            <label className="block text-xs">
              Pozycja tekstu
              <select
                value={settings.textPosition}
                onChange={(event) => update("textPosition", event.target.value)}
                className="mt-1.5 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
              >
                <option value="top">Góra</option>
                <option value="center">Środek</option>
                <option value="bottom">Dół</option>
              </select>
            </label>
          </section>

          <section className="space-y-3 rounded-xl border border-border p-3">
            <div>
              <p className="text-xs font-semibold">Warstwy tekstowe</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Dodawaj kilka napisów, przeciągaj je na zdjęciu i edytuj osobno.
              </p>
            </div>

            <div className="flex gap-2">
              <input
                value={textLayerDraft}
                maxLength={160}
                onChange={(event) => setTextLayerDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") addTextLayer();
                }}
                placeholder="Wpisz nowy napis..."
                className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-sm"
              />
              <button
                type="button"
                onClick={addTextLayer}
                disabled={!textLayerDraft.trim() || (settings.textLayers || []).length >= 30}
                className="rounded-xl border border-border px-4 text-xs disabled:opacity-40"
              >
                Dodaj
              </button>
            </div>

            {(settings.textLayers || []).length > 0 && (
              <div className="flex flex-wrap gap-2">
                {settings.textLayers.map((layer, index) => (
                  <div
                    key={`${index}-${layer.text}`}
                    className={`flex items-center overflow-hidden rounded-lg border ${
                      activeTextLayer === index
                        ? "border-aura bg-aura/15"
                        : "border-border"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTextLayer(index);
                        setActiveSticker(-1);
                        dragRef.current = null;
                      }}
                      aria-pressed={activeTextLayer === index}
                      className="max-w-[180px] truncate px-3 py-2 text-xs"
                    >
                      {layer.text || "Pusty tekst"}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeTextLayer(index)}
                      aria-label={`Usuń warstwę tekstową ${index + 1}`}
                      title="Usuń warstwę"
                      className="border-l border-border px-2 py-2 text-xs"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            {activeTextLayer >= 0 && settings.textLayers[activeTextLayer] && (
              <div className="space-y-3 rounded-xl bg-background/50 p-3">
                {(() => {
                  const layer = settings.textLayers[activeTextLayer];

                  return (
                    <>
                      <label className="block text-xs">
                        Treść napisu
                        <textarea
                          value={layer.text || ""}
                          maxLength={160}
                          rows={2}
                          onChange={(event) =>
                            updateActiveTextLayer({ text: event.target.value })
                          }
                          className="mt-1.5 w-full rounded-lg border border-border bg-background p-2 text-sm"
                        />
                      </label>

                      <label className="block text-xs">
                        <span className="flex justify-between">
                          <span>Rozmiar tekstu</span>
                          <span>{layer.size ?? 54}px</span>
                        </span>
                        <input
                          type="range"
                          min="16"
                          max="180"
                          step="1"
                          value={layer.size ?? 54}
                          onChange={(event) =>
                            updateActiveTextLayer({ size: Number(event.target.value) })
                          }
                          className="mt-2 w-full"
                        />
                      </label>

                      <label className="block text-xs">
                        <span className="flex justify-between">
                          <span>Obrót</span>
                          <span>{layer.rotation ?? 0}°</span>
                        </span>
                        <input
                          type="range"
                          min="-180"
                          max="180"
                          step="1"
                          value={layer.rotation ?? 0}
                          onChange={(event) =>
                            updateActiveTextLayer({ rotation: Number(event.target.value) })
                          }
                          className="mt-2 w-full"
                        />
                      </label>

                      <div className="grid grid-cols-2 gap-3">
                        <label className="block text-xs">
                          Kolor tekstu
                          <input
                            type="color"
                            value={layer.color || "#ffffff"}
                            onChange={(event) =>
                              updateActiveTextLayer({ color: event.target.value })
                            }
                            className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background p-1"
                          />
                        </label>

                        <label className="block text-xs">
                          Wyrównanie
                          <select
                            value={layer.align || "center"}
                            onChange={(event) =>
                              updateActiveTextLayer({ align: event.target.value })
                            }
                            className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-2"
                          >
                            <option value="left">Do lewej</option>
                            <option value="center">Środek</option>
                            <option value="right">Do prawej</option>
                          </select>
                        </label>
                      </div>

                      <label className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={layer.background !== false}
                          onChange={(event) =>
                            updateActiveTextLayer({ background: event.target.checked })
                          }
                        />
                        Tło pod tekstem
                      </label>

                      <label className="block text-xs">
                        Kolor tła
                        <select
                          value={layer.backgroundColor || "rgba(0,0,0,0.38)"}
                          onChange={(event) =>
                            updateActiveTextLayer({ backgroundColor: event.target.value })
                          }
                          disabled={layer.background === false}
                          className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-2 disabled:opacity-40"
                        >
                          <option value="rgba(0,0,0,0.38)">Czarne — półprzezroczyste</option>
                          <option value="rgba(0,0,0,0.72)">Czarne — ciemne</option>
                          <option value="rgba(255,255,255,0.82)">Białe — jasne</option>
                          <option value="rgba(0,0,0,0)">Przezroczyste</option>
                        </select>
                      </label>

                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => moveTextLayer(-1)}
                          disabled={activeTextLayer === 0}
                          className="rounded-lg border border-border px-3 py-2 text-xs disabled:opacity-40"
                        >
                          Przesuń niżej
                        </button>
                        <button
                          type="button"
                          onClick={() => moveTextLayer(1)}
                          disabled={activeTextLayer === settings.textLayers.length - 1}
                          className="rounded-lg border border-border px-3 py-2 text-xs disabled:opacity-40"
                        >
                          Przesuń wyżej
                        </button>
                      </div>
                    </>
                  );
                })()}
              </div>
            )}
          </section>

          <section className="space-y-2">
            <p className="text-xs font-semibold">Naklejki</p>
            <div className="flex gap-2">
              <input
                value={stickerText}
                maxLength={80}
                onChange={(event) => setStickerText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") addSticker();
                }}
                placeholder="Np. 🐾 ❤️ ⭐"
                className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-sm"
              />
              <button
                type="button"
                onClick={addSticker}
                disabled={!stickerText.trim() || settings.stickers.length >= 30}
                className="rounded-xl border border-border px-4 text-xs disabled:opacity-40"
              >
                Dodaj
              </button>
            </div>
            {settings.stickers.length > 0 && (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {settings.stickers.map((sticker, index) => (
                    <div
                      key={`${index}-${sticker.text}`}
                      className={`flex items-center overflow-hidden rounded-xl border ${
                        activeSticker === index
                          ? "border-aura bg-aura/15"
                          : "border-border"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setActiveSticker(index)}
                        className="px-3 py-2 text-sm"
                        aria-pressed={activeSticker === index}
                        title="Wybierz warstwę"
                      >
                        {sticker.text}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSettings((current) => ({
                            ...current,
                            stickers: current.stickers.filter(
                              (_, itemIndex) => itemIndex !== index
                            ),
                          }));
                          setActiveSticker((current) =>
                            current === index ? -1 :
                            current > index ? current - 1 : current
                          );
                          dragRef.current = null;
                        }}
                        className="border-l border-border px-2 py-2 text-xs"
                        title="Usuń naklejkę"
                        aria-label={`Usuń naklejkę ${sticker.text}`}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>

                {activeSticker >= 0 && settings.stickers[activeSticker] && (
                  <div className="space-y-3 rounded-xl border border-border p-3">
                    <p className="text-xs font-semibold">
                      Edycja warstwy: {settings.stickers[activeSticker].text}
                    </p>

                    <label className="block text-xs">
                      Rozmiar: {settings.stickers[activeSticker].size ?? 64}px
                      <input
                        type="range"
                        min="18"
                        max="180"
                        step="2"
                        value={settings.stickers[activeSticker].size ?? 64}
                        onChange={(event) =>
                          updateActiveSticker({ size: Number(event.target.value) })
                        }
                        className="mt-2 w-full"
                      />
                    </label>

                    <label className="block text-xs">
                      Obrót: {settings.stickers[activeSticker].rotation ?? 0}°
                      <input
                        type="range"
                        min="-180"
                        max="180"
                        step="1"
                        value={settings.stickers[activeSticker].rotation ?? 0}
                        onChange={(event) =>
                          updateActiveSticker({ rotation: Number(event.target.value) })
                        }
                        className="mt-2 w-full"
                      />
                    </label>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => moveStickerLayer(-1)}
                        disabled={activeSticker === 0}
                        className="rounded-lg border border-border px-3 py-2 text-xs disabled:opacity-40"
                      >
                        Przesuń niżej
                      </button>
                      <button
                        type="button"
                        onClick={() => moveStickerLayer(1)}
                        disabled={activeSticker === settings.stickers.length - 1}
                        className="rounded-lg border border-border px-3 py-2 text-xs disabled:opacity-40"
                      >
                        Przesuń wyżej
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setSettings({ ...initial });
                setActiveSticker(-1);
                setActiveTextLayer(-1);
                dragRef.current = null;
                setStickerText("");
                setTextLayerDraft("");
              }}
              className="rounded-xl border border-border px-4 py-3 text-sm"
            >
              Resetuj
            </button>
            <button
              type="button"
              onClick={() => onSave(settings)}
              className="btn-aura rounded-xl px-4 py-3 text-sm font-semibold"
            >
              Zastosuj zmiany
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
