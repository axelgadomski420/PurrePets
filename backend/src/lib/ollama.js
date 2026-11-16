// Wspólny klient lokalnego Ollama.
// Ogranicza czas żądania, rozmiar odpowiedzi i normalizuje błędy.
import { config } from "../config.js";

const DEFAULT_TIMEOUT_MS = 60000;
const MAX_TIMEOUT_MS = 180000;
const MAX_RESPONSE_CHARS = 30000;

function safeTimeout(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return DEFAULT_TIMEOUT_MS;
  return Math.max(5000, Math.min(MAX_TIMEOUT_MS, Math.floor(number)));
}

function ollamaBaseUrl() {
  const value = String(config.ollamaUrl || "").trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(value)) {
    throw new Error("Nieprawidłowy adres Ollama");
  }
  return value;
}

function safeErrorMessage(error) {
  const message = String(error?.message || error || "Nieznany błąd");
  return message.replace(/[\r\n]+/g, " ").slice(0, 500);
}

export async function ollamaGenerate(
  prompt,
  { system, model, timeoutMs = DEFAULT_TIMEOUT_MS } = {}
) {
  const cleanPrompt = String(prompt ?? "").trim();
  if (!cleanPrompt) {
    return { ok: false, error: "Pusty prompt", text: "" };
  }

  if (cleanPrompt.length > 20000) {
    return { ok: false, error: "Prompt przekracza limit", text: "" };
  }

  const selectedModel = String(model || config.ollamaModel || "").trim();
  if (!selectedModel || selectedModel.length > 120) {
    return { ok: false, error: "Nieprawidłowy model Ollama", text: "" };
  }

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    safeTimeout(timeoutMs)
  );

  try {
    const response = await fetch(`${ollamaBaseUrl()}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: selectedModel,
        prompt: cleanPrompt,
        ...(system ? { system: String(system).slice(0, 5000) } : {}),
        stream: false,
        options: {
          temperature: 0.2,
          num_predict: 1600,
        },
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `Ollama HTTP ${response.status}: ${body.slice(0, 200)}`
      );
    }

    const data = await response.json();
    const text = typeof data?.response === "string"
      ? data.response.trim().slice(0, MAX_RESPONSE_CHARS)
      : "";

    if (!text) {
      return {
        ok: false,
        error: "Ollama zwróciło pustą odpowiedź",
        text: "",
      };
    }

    return { ok: true, text, model: selectedModel };
  } catch (error) {
    const message = error?.name === "AbortError"
      ? "Przekroczono czas oczekiwania na Ollama"
      : safeErrorMessage(error);

    return { ok: false, error: message, text: "" };
  } finally {
    clearTimeout(timer);
  }
}

export async function ollamaHealth() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);

  try {
    const response = await fetch(`${ollamaBaseUrl()}/api/tags`, {
      signal: controller.signal,
    });

    if (!response.ok) {
      return { online: false, models: [] };
    }

    const data = await response.json();
    const models = Array.isArray(data?.models)
      ? data.models
          .map((item) => String(item?.name || "").slice(0, 120))
          .filter(Boolean)
          .slice(0, 50)
      : [];

    return { online: true, models };
  } catch {
    return { online: false, models: [] };
  } finally {
    clearTimeout(timer);
  }
}
