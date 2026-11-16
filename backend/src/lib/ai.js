/**
 * PURRE AI service helpers.
 * Prefers Ollama (OLLAMA_URL + OLLAMA_MODEL, default qwen2.5:3b).
 * Falls back to ASSISTANT_LLM_URL / ASSISTANT_LLM_KEY, then local rules.
 */

const SYSTEM = `Jesteś PURRE Assistant — asystentem marketplace'u hodowlanego PURRE PETS (psy i koty rasowe, Polska).
Odpowiadaj po polsku, zwięźle (max 900 znaków). Nie diagnozuj chorób — odsyłaj do weterynarza.
Nie pomagaj omijać prawa ani handlować zwierzętami bez dokumentacji.`;

export async function askOllama(prompt, { system = SYSTEM } = {}) {
  const base = (process.env.OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/$/, "");
  const model = process.env.OLLAMA_MODEL || "qwen2.5:3b";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(process.env.OLLAMA_TIMEOUT_MS || 25000));
  try {
    const response = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        stream: false,
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
        options: { temperature: 0.4, num_predict: 280 },
      }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    const text = data?.message?.content || data?.response || "";
    return text ? String(text).slice(0, 900) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function askExternalLlm(prompt) {
  if (!process.env.ASSISTANT_LLM_URL || !process.env.ASSISTANT_LLM_KEY) return null;
  try {
    const response = await fetch(process.env.ASSISTANT_LLM_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.ASSISTANT_LLM_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.ASSISTANT_LLM_MODEL || "gpt-4o-mini",
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!response.ok) return null;
    const parsed = await response.json().catch(() => null);
    const answer =
      parsed?.choices?.[0]?.message?.content ||
      parsed?.content ||
      parsed?.answer ||
      (typeof parsed === "string" ? parsed : "");
    return answer ? String(answer).slice(0, 900) : null;
  } catch {
    return null;
  }
}

export function ruleBasedAnswer(question) {
  const q = question.toLowerCase();
  if (/ras|rodowód|pedigree|hodowl/.test(q)) {
    return "W PURRE PETS ogłoszenia dodają konta hodowcy. Warto wybierać hodowle z weryfikacją (Odznaka zaufania) i dokumentacją rodowodową. Sprawdź sekcję „Bezpieczeństwo” na karcie ogłoszenia i nigdy nie wysyłaj zaliczki przed umową i wizytą w hodowli.";
  }
  if (/bezpiecz|oszust|zaliczk|płatnoś/.test(q)) {
    return "Zasady bezpieczeństwa: umawiaj wizytę w hodowli, podpisuj umowę, nie wysyłaj zaliczek przed obejrzeniem zwierzaka, korzystaj z płatności śledzonych. Ogłoszenia z wysokim ryzykiem oznaczamy jako „w trakcie weryfikacji”.";
  }
  if (/coin|monet|arcade|gr|poziom|xp/.test(q)) {
    return "PURRE Coins zdobywasz w Arcade (12 gier). Codzienna gra daje bonus. Monety wymienisz w Nagrodach na boosty, ramki i odznaki. PURRE Premium wyłącza reklamy.";
  }
  if (/ogłoszen|dodać|sprzedaż|wystawi/.test(q)) {
    return "Ogłoszenie dodasz w zakładce „Dodaj”: przełącz konto na hodowcę, wypełnij formularz i wgraj zdjęcia (min. 6). Kolejne ogłoszenia kosztują monety. Każde przechodzi moderację.";
  }
  if (/reklam|adsense|premium/.test(q)) {
    return "Reklamy pojawiają się co 5–7 elementów w feedzie, explore i reels. Możesz je wyłączyć w Nagrody → PURRE Premium. Partnerzy (karma, wet) i wyróżnione ogłoszenia też tam trafiają.";
  }
  if (/wideo|edytor|reel|filtr/.test(q)) {
    return "Edytor wideo (Studio) pozwala przyciąć klip, zmienić tempo, nałożyć filtr i efekt, dodać napis, obrócić/odbić, zapisać okładkę JPG lub WebM i opublikować do Holo Reels.";
  }
  return "Jestem PURRE Assistant. Pomagam w: bezpiecznym kupnie, ogłoszeniach, coinach, Arcade, edytorze wideo i reklamach. W kwestiach zdrowotnych zawsze skonsultuj się z weterynarzem.";
}

/** Simple risk score for listings/posts — keyword heuristic + optional LLM. */
export function moderateText(text = "") {
  const t = String(text).toLowerCase();
  let risk = 0;
  const flags = [];
  const patterns = [
    [/zaliczk|przelew.*z góry|western union|crypto|bitcoin/, 0.35, "advance_payment"],
    [/whatsapp|telegram|poza portal|omij/, 0.25, "offplatform"],
    [/pilne|okazja dnia|tylko dziś|100% gwaranc/, 0.2, "urgency"],
    [/bez rodowodu.*tanio|bez papierów/, 0.3, "no_docs"],
    [/szczeniak.*gratis|za darmo.*pies/, 0.15, "suspicious_free"],
  ];
  for (const [re, score, flag] of patterns) {
    if (re.test(t)) {
      risk += score;
      flags.push(flag);
    }
  }
  risk = Math.min(1, risk);
  const status = risk >= 0.55 ? "review" : risk >= 0.3 ? "flag" : "ok";
  return { risk: Number(risk.toFixed(3)), status, flags };
}

export async function answerQuestion(question) {
  const ollama = await askOllama(question);
  if (ollama) return { answer: ollama, source: "ollama" };
  const external = await askExternalLlm(question);
  if (external) return { answer: external, source: "llm" };
  return { answer: ruleBasedAnswer(question), source: "rules" };
}
