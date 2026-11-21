// Drop-in replacement for the Base44 SDK client.
//
// Keeps the same exported API surface used across the app ("base44.entities.*",
// "base44.auth.*", "base44.integrations.Core.UploadPublicFile") but talks to the
// self-hosted backend (Express + PostgreSQL + Socket.IO) instead of Base44.
//
// Requires: npm i socket.io-client
// Env: VITE_API_URL (e.g. "" when same-origin behind nginx, or "https://purrepets.pl")

import { io } from "socket.io-client";

const API_URL = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
const TOKEN_KEY = "purre_access_token";

if (typeof window !== "undefined") {
  try {
    const current = new URL(window.location.href);
    const googleToken = current.searchParams.get("google_token");
    if (googleToken) {
      localStorage.setItem(TOKEN_KEY, googleToken);
      current.searchParams.delete("google_token");
      window.history.replaceState({}, "", current.toString());
    }
  } catch { /* Środowisko może blokować dostęp do localStorage lub odpowiedź może nie być JSON-em. */ }
}

export class ApiError extends Error {
  constructor(status, payload) {
    super(payload?.error?.message || payload?.detail || `Request failed (${status})`);
    this.name = "ApiError";
    this.status = status;
    this.data = payload;
    this.code =
      payload?.code ||
      payload?.error?.code ||
      payload?.detail?.code ||
      null;
  }
}

export function getUploadedFileUrl(result) {
  const url = result?.file_url || result?.url;

  if (typeof url !== "string" || !url.trim()) {
    throw new Error("Serwer nie zwrócił prawidłowego adresu przesłanego pliku.");
  }

  return url.trim();
}

export function getUploadErrorMessage(error, fallback = "Upload nie powiódł się") {
  const code =
    error?.code ||
    error?.data?.code ||
    error?.data?.error?.code ||
    error?.data?.detail?.code;

  if (code === "MEDIA_PENDING_REVIEW") {
    return "Materiał oczekuje na zatwierdzenie moderatora. Nie wysyłaj go ponownie.";
  }

  if (code === "MEDIA_REJECTED") {
    return "Materiał został odrzucony podczas moderacji i nie został opublikowany.";
  }

  if (code === "MEDIA_PROCESSING_TIMEOUT") {
    return "Przetwarzanie materiału trwa zbyt długo. Sprawdź status przed ponownym wysłaniem.";
  }

  return error?.message || fallback;
}

function token() {
  try {
    // Kompatybilność: purre:token (główny), token i auth_token (starsze klucze).
    return localStorage.getItem(TOKEN_KEY) ?? localStorage.getItem("purre:token") ?? localStorage.getItem("token") ?? localStorage.getItem("auth_token") ?? null;
  } catch {
    return null;
  }
}

async function request(path, { method = "GET", body, formData } = {}) {
  const headers = {};
  const current = token();
  if (current) headers.Authorization = `Bearer ${current}`;
  if (formData === undefined) headers["Content-Type"] = "application/json";
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      credentials: "omit",
      body: formData ?? (body === undefined ? undefined : JSON.stringify(body)),
    });
  } catch (cause) {
    if (cause instanceof TypeError) {
      const error = new Error("Nie udało się połączyć z serwerem API.");
      error.name = "ApiNetworkError";
      error.cause = cause;
      throw error;
    }
    throw cause;
  }
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) throw new ApiError(response.status, payload);
  return payload;
}

// ---------------------------------------------------------------- Socket.IO


async function requestBlob(path) {
  const headers = {};
  const current = token();
  if (current) headers.Authorization = `Bearer ${current}`;

  const response = await fetch(`${API_URL}${path}`, {
    method: "GET",
    headers,
    credentials: "omit",
  });

  if (!response.ok) {
    const text = await response.text();
    let payload = null;
    try { payload = text ? JSON.parse(text) : null; } catch { /* Środowisko może blokować dostęp do localStorage lub odpowiedź może nie być JSON-em. */ }
    throw new ApiError(response.status, payload);
  }

  return response.blob();
}

let socket = null;

function getSocket() {
  if (socket) return socket;
  socket = io(API_URL || window.location.origin, {
    path: "/socket.io",
    auth: { token: token() },
    transports: ["websocket", "polling"],
  });
  return socket;
}

// ---------------------------------------------------------------- Entities

const ENTITY_PATHS = {
  Profile: "Profile",
  Listing: "Listing",
  Pet: "Pet",
  Post: "Post",
  Comment: "Comment",
  Like: "Like",
  Follow: "Follow",
  Conversation: "Conversation",
  Message: "Message",
  Wallet: "Wallet",
  Redemption: "Redemption",
  GameScore: "GameScore",
  Event: "Event",
  Group: "Group",
  EventTicket: "EventTicket",
  VerificationRequest: "VerificationRequest",
  CoinPurchase: "CoinPurchase",
};

function pageOptions(opts = {}) {
  const params = new URLSearchParams();
  if (opts.sort) params.set("sort", opts.sort);
  if (opts.limit != null) params.set("limit", String(opts.limit));
  if (opts.offset != null) params.set("offset", String(opts.offset));
  if (opts.skip != null) params.set("skip", String(opts.skip));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

function createEntity(name) {
  const base = `/api/entities/${ENTITY_PATHS[name]}`;
  return {
    async list(params, opts) {
      return request(`${base}/list${pageOptions({ ...(params ?? {}), ...(opts ?? {}) })}`);
    },
    async filter(where, opts) {
      return request(`${base}/query`, {
        method: "POST",
        body: { where: where ?? {}, ...(opts ?? {}) },
      });
    },
    async count(where) {
      const result = await request(`${base}/count`, { method: "POST", body: { where: where ?? {} } });
      return typeof result === "number" ? result : result?.count ?? 0;
    },
    async get(id) {
      return request(`${base}/${id}`);
    },
    async create(data) {
      return request(base, { method: "POST", body: data ?? {} });
    },
    async update(id, data) {
      return request(`${base}/${id}`, { method: "PATCH", body: data ?? {} });
    },
    async delete(id) {
      return request(`${base}/${id}`, { method: "DELETE" });
    },
    subscribe(callback) {
      const client = getSocket();
      const handler = (event) => callback(event);
      client.on("entity:event", handler);
      client.emit("subscribe", { entity: name });
      return () => {
        client.off("entity:event", handler);
        client.emit("unsubscribe", {});
      };
    },
  };
}

const entities = Object.fromEntries(Object.keys(ENTITY_PATHS).map((name) => [name, createEntity(name)]));

// ---------------------------------------------------------------- Auth

export const auth = {
  hasToken: () => !!token(),
  setToken: (value) => {
    try {
      if (value) {
        localStorage.setItem(TOKEN_KEY, value);
        localStorage.setItem("purre:token", value);
      } else {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem("purre:token");
        localStorage.removeItem("token");
        localStorage.removeItem("auth_token");
      }
    } catch { /* Środowisko może blokować dostęp do localStorage lub odpowiedź może nie być JSON-em. */ }
  },
  async me() {
    if (!token()) {
      const error = new Error("Unauthorized");
      error.status = 401;
      throw error;
    }
    return request("/api/auth/me");
  },
  async loginWithPassword(email, password) {
    const result = await request("/api/auth/login", { method: "POST", body: { email, password } });
    if (result.access_token) auth.setToken(result.access_token);
    return result;
  },
  async register(email, password, fullName) {
    return request("/api/auth/register", { method: "POST", body: { email, password, full_name: fullName } });
  },
  async verifyOtp(email, otpCode) {
    const result = await request("/api/auth/verify-otp", { method: "POST", body: { email, otp_code: otpCode } });
    if (result.access_token) auth.setToken(result.access_token);
    return result;
  },
  async resendOtp(email) {
    return request("/api/auth/resend-otp", { method: "POST", body: { email } });
  },
  async logout() {
    try {
      await request("/api/auth/logout", { method: "POST" });
    } catch {
      // token cleanup happens regardless
    }
    auth.setToken(null);
  },
  loginWithProvider: (provider, returnTo) => {
    window.location.assign(`/login?returnTo=${encodeURIComponent(returnTo ?? window.location.href)}`);
  },
  redirectToLogin: (returnTo) => {
    window.location.assign(`/login?returnTo=${encodeURIComponent(returnTo ?? window.location.href)}`);
  },
};

// ---------------------------------------------------------------- Server functions

export const functions = {
  submitScore: (data) => request("/api/games/submit", { method: "POST", body: data }),
  redeemReward: (data) => request("/api/rewards/redeem", { method: "POST", body: data }),
  createListing: (data) => request("/api/listings/with-cost", { method: "POST", body: { data } }),
  moderateListing: (data) => request(`/api/listings/${data.listing_id}/moderate`, { method: "POST", body: {} }),
  askAssistant: (data) => request("/api/assistant/ask", { method: "POST", body: data }),
  aiChat: (data) => request("/api/ai/chat", { method: "POST", body: data }),
  aiConversations: () => request("/api/ai/conversations"),
  createAiConversation: () => request("/api/ai/conversations", { method: "POST", body: {} }),
  aiConversationMessages: (id) => request(`/api/ai/conversations/${encodeURIComponent(id)}/messages`),
  aiHealth: () => request("/api/ai/health"),
  nearbyVets: (body) => request("/api/ai/vets/nearby", { method: "POST", body }),
  assistantHealth: () => request("/api/assistant/health"),
};

export const social = {
  events: (city) => request(`/api/social/events${city ? `?city=${encodeURIComponent(city)}` : ""}`),
  createEvent: (body) => request("/api/social/events", { method: "POST", body }),
  buyTicket: (id) => request(`/api/social/events/${id}/ticket`, { method: "POST", body: {} }),
  groups: (type) => request(`/api/social/groups${type && type !== "all" ? `?type=${encodeURIComponent(type)}` : ""}`),
  createGroup: (body) => request("/api/social/groups", { method: "POST", body }),
  joinGroup: (id) => request(`/api/social/groups/${id}/join`, { method: "POST", body: {} }),
  leaveGroup: (id) => request(`/api/social/groups/${id}/leave`, { method: "POST", body: {} }),
  myVerification: () => request("/api/social/verification/mine"),
  submitVerification: (body) => request("/api/social/verification", { method: "POST", body }),
};

// Rozbudowane grupy (jak na Facebooku)
export const groupsApi = {
  list: ({ q, type, mine } = {}) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (type && type !== "all") params.set("type", type);
    if (mine) params.set("mine", "1");
    const qs = params.toString();
    return request(`/api/groups${qs ? `?${qs}` : ""}`);
  },
  get: (id) => request(`/api/groups/${id}`),
  create: (body) => request("/api/groups", { method: "POST", body }),
  update: (id, body) => request(`/api/groups/${id}`, { method: "PATCH", body }),
  join: (id) => request(`/api/groups/${id}/join`, { method: "POST", body: {} }),
  leave: (id) => request(`/api/groups/${id}/leave`, { method: "POST", body: {} }),
  post: (id, body) => request(`/api/groups/${id}/posts`, { method: "POST", body }),
};

// Globalna wyszukiwarka
export const searchApi = {
  search: (q, type = "all") => request(`/api/search?q=${encodeURIComponent(q)}&type=${encodeURIComponent(type)}`),
};

// Powiadomienia
export const notificationsApi = {
  list: (unreadOnly = false) => request(`/api/notifications${unreadOnly ? "?unread=1" : ""}`),
  markRead: (id) => request(`/api/notifications/${id}/read`, { method: "POST", body: {} }),
  markAllRead: () => request("/api/notifications/read-all", { method: "POST", body: {} }),
};

// Messenger (media, odczyty, reakcje, usuwanie)
export const messagesApi = {
  conversations: (q) => request(`/api/messages/conversations${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  messages: (conversationId, q) =>
    request(`/api/messages/conversations/${conversationId}/messages${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  history: (conversationId, before, limit = 50) =>
    request(`/api/messages/conversations/${conversationId}/messages?before=${encodeURIComponent(before ?? "")}&limit=${limit}`),
  send: (body) => request("/api/messages/send", { method: "POST", body }),
  markRead: (id) => request(`/api/messages/${id}/read`, { method: "POST", body: {} }),
  react: (id, emoji) => request(`/api/messages/${id}/react`, { method: "POST", body: { emoji } }),
  remove: (id) => request(`/api/messages/${id}`, { method: "DELETE" }),
  typingSignal: (conversationId) => request(`/api/messages/typing/${conversationId}`, { method: "POST", body: {} }),
  typing: (conversationId) => request(`/api/messages/typing/${conversationId}`),
};

// Muzyka / audio do rolek
export const reelsAudioApi = {
  list: (q, mood) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (mood) params.set("mood", mood);
    const qs = params.toString();
    return request(`/api/reels-audio${qs ? `?${qs}` : ""}`);
  },
  add: (body) => request("/api/reels-audio", { method: "POST", body }),
  use: (id) => request(`/api/reels-audio/${id}/use`, { method: "POST", body: {} }),
};

// Premium — wyłącznie subskrypcja PLN (Purre Pets PRO)
export const premiumApi = {
  status: () => request("/api/premium/status"),
  subscribe: (plan = "month") => request("/api/premium/subscribe", { method: "POST", body: { plan } }),
  confirm: (sessionId) => request(`/api/premium/confirm?session_id=${encodeURIComponent(sessionId)}`),
  proCheckout: (plan = "month") => request("/api/stripe/create-pro-checkout", { method: "POST", body: { plan } }),
};

// Zgłoszenia naruszeń
export const reportsApi = {
  create: (body) => request("/api/reports", { method: "POST", body }),
};

export const adminApi = {
  overview: () => request("/api/admin/overview"),
  audit: (take = 100) => request(`/api/admin/audit?take=${encodeURIComponent(take)}`),
  moderatorStats: () => request("/api/admin/moderator-stats"),
  reports: () => request("/api/admin/reports"),
  mediaModeration: () => request("/api/admin/media-moderation"),
  reviewMedia: (id, body) => request(
    `/api/admin/media-moderation/${encodeURIComponent(id)}`,
    { method: "POST", body }
  ),
  getMediaPreview: (id) => requestBlob(
    `/api/admin/media-moderation/${encodeURIComponent(id)}/file`
  ),
  reviewVerification: (id, body) => request(`/api/admin/verification/${id}`, { method: "POST", body }),
  reviewListing: (id, body) => request(`/api/admin/listings/${id}`, { method: "POST", body }),
  reviewPost: (id, body) => request(`/api/admin/posts/${id}`, { method: "POST", body }),
  users: (q) => request(`/api/admin/users${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  updateUser: (id, body) => request(`/api/admin/users/${id}`, { method: "PATCH", body }),
  analyzeVerification: (id) => request("/api/ai/verify-breeder", { method: "POST", body: { id } }),
  getVerificationDocument: (id) => requestBlob(`/api/admin/verification/${encodeURIComponent(id)}/document`),
  resolveReport: (id, body) => request(`/api/admin/reports/${id}`, { method: "POST", body }),
  deleteComment: (id) => request(`/api/admin/comments/${id}`, { method: "DELETE" }),
};

export const billing = {
  packages: () => request("/api/stripe/packages"),
  checkout: (packageId) => request("/api/stripe/create-checkout", { method: "POST", body: { package_id: packageId } }),
  // I: fallback księgowania po powrocie z Checkout (idempotentny, jak webhook)
  confirm: (sessionId) => request(`/api/stripe/confirm?session_id=${encodeURIComponent(sessionId)}`),
};

// Konta zwierząt (moduł E) — dedykowane API z weryfikacją właściciela/opiekuna.
export const petsApi = {
  mine: () => request("/api/pets/mine"),
  get: (id) => request(`/api/pets/${encodeURIComponent(id)}`),
  update: (id, body) => request(`/api/pets/${encodeURIComponent(id)}`, { method: "PATCH", body }),
  health: (id) => request(`/api/pets/${encodeURIComponent(id)}/health`),
  addHealth: (id, body) => request(`/api/pets/${encodeURIComponent(id)}/health`, { method: "POST", body }),
  removeHealth: (id, recordId) => request(`/api/pets/${encodeURIComponent(id)}/health/${encodeURIComponent(recordId)}`, { method: "DELETE" }),
  calendar: (id) => request(`/api/pets/${encodeURIComponent(id)}/calendar`),
  addEvent: (id, body) => request(`/api/pets/${encodeURIComponent(id)}/calendar`, { method: "POST", body }),
  toggleEvent: (id, eventId, done) => request(`/api/pets/${encodeURIComponent(id)}/calendar/${encodeURIComponent(eventId)}`, { method: "PATCH", body: { done } }),
  removeEvent: (id, eventId) => request(`/api/pets/${encodeURIComponent(id)}/calendar/${encodeURIComponent(eventId)}`, { method: "DELETE" }),
  measurements: (id) => request(`/api/pets/${encodeURIComponent(id)}/measurements`),
  addMeasurement: (id, body) => request(`/api/pets/${encodeURIComponent(id)}/measurements`, { method: "POST", body }),
  removeMeasurement: (id, mid) => request(`/api/pets/${encodeURIComponent(id)}/measurements/${encodeURIComponent(mid)}`, { method: "DELETE" }),
  achievements: (id) => request(`/api/pets/${encodeURIComponent(id)}/achievements`),
  addAchievement: (id, body) => request(`/api/pets/${encodeURIComponent(id)}/achievements`, { method: "POST", body }),
  removeAchievement: (id, aid) => request(`/api/pets/${encodeURIComponent(id)}/achievements/${encodeURIComponent(aid)}`, { method: "DELETE" }),
  caregivers: (id) => request(`/api/pets/${encodeURIComponent(id)}/caregivers`),
  addCaregiver: (id, body) => request(`/api/pets/${encodeURIComponent(id)}/caregivers`, { method: "POST", body }),
  removeCaregiver: (id, userId) => request(`/api/pets/${encodeURIComponent(id)}/caregivers/${encodeURIComponent(userId)}`, { method: "DELETE" }),
  upcomingReminders: () => request("/api/pets/reminders/upcoming"),
  syncReminders: () => request("/api/pets/reminders/sync", { method: "POST", body: {} }),
};

// ---------------------------------------------------------------- Public client


// ---------------------------------------------------------------- E2E / Stories / Profile (dodane)

export const e2eApi = {
  register: (body) => request("/api/e2e/keys", { method: "POST", body }),
  keys: (userId) => request(`/api/e2e/keys/${encodeURIComponent(userId)}`),
  status: () => request("/api/e2e/status"),
};

export const storiesApi = {
  list: () => request("/api/stories"),
  create: (body) => request("/api/stories", { method: "POST", body }),
  view: (id) => request(`/api/stories/${id}/view`, { method: "POST", body: {} }),
  react: (id, emoji) => request(`/api/stories/${id}/react`, { method: "POST", body: { emoji } }),
  mine: () => request("/api/stories/mine"),
  remove: (id) => request(`/api/stories/${id}`, { method: "DELETE" }),
};

export const profileApi = {
  me: () => request("/api/profile/me"),
  suggestions: (limit = 12) => request(`/api/profile/suggestions?limit=${encodeURIComponent(limit)}`),
  update: (body) => request("/api/profile/me", { method: "PATCH", body }),
  // PROFIL ULTRA — wspólny widok własny/publiczny, liczby z bazy.
  publicProfile: (id) => request(`/api/profile/${encodeURIComponent(id)}/public`),
  visit: (id) => request(`/api/profile/${encodeURIComponent(id)}/visit`, { method: "POST", body: {} }),
  stats: (id) => request(`/api/profile/${encodeURIComponent(id)}/stats`),
  followers: (id, { q, limit = 20, offset = 0 } = {}) => {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (q) params.set("q", q);
    return request(`/api/profile/${encodeURIComponent(id)}/followers?${params.toString()}`);
  },
  following: (id, { q, limit = 20, offset = 0 } = {}) => {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (q) params.set("q", q);
    return request(`/api/profile/${encodeURIComponent(id)}/following?${params.toString()}`);
  },
  follow: (id) => request(`/api/profile/${encodeURIComponent(id)}/follow`, { method: "POST", body: {} }),
  unfollow: (id) => request(`/api/profile/${encodeURIComponent(id)}/follow`, { method: "DELETE" }),
};

// RODO: eksport danych (art. 15/20) i usunięcie konta (art. 17)
export const privacyApi = {
  exportData: () => request("/api/privacy/export"),
  deleteAccount: () => request("/api/privacy/delete-account", { method: "POST", body: {} }),
};

// Rozszerzenia messagesApi: wskaźnik „pisze…”
export const typingApi = {
  signal: (conversationId) => request(`/api/messages/typing/${conversationId}`, { method: "POST", body: {} }),
  get: (conversationId) => request(`/api/messages/typing/${conversationId}`),
};

// URL gniazda realtime (Socket.IO) — używane przez ChatWindow.
export const socketUrl = API_URL || (typeof window !== "undefined" ? window.location.origin : "");

// Otwiera plik wymagający autoryzacji (np. prywatny dokument weryfikacji) w nowej karcie.
export async function openAuthorizedFile(url) {
  if (typeof window === "undefined") return;
  const target = /^https?:\/\//.test(url) ? url : `${API_URL}${url}`;
  const headers = {};
  const current = token();
  if (current) headers.Authorization = `Bearer ${current}`;
  const response = await fetch(target, { headers, credentials: "omit" });
  if (!response.ok) throw new ApiError(response.status, null);
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  window.open(objectUrl, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
}

export const base44 = {
  auth,
  functions,
  social,
  groups: groupsApi,
  search: searchApi,
  notifications: notificationsApi,
  messages: messagesApi,
  reelsAudio: reelsAudioApi,
  premium: premiumApi,
  reports: reportsApi,
  e2e: e2eApi,
  stories: storiesApi,
  profile: profileApi,
  pets: petsApi,
  privacy: privacyApi,
  admin: adminApi,
  billing,
  entities,
  integrations: {
    Core: {
            async UploadPublicFile({ file }) {
        const formData = new FormData();
        formData.append("file", file);

        return request("/api/uploads", {
          method: "POST",
          formData,
        });
      },
      async UploadPrivateVerificationDocument({ file }) {
        const formData = new FormData();
        formData.append("file", file);
        return request("/api/uploads/verification-document", { method: "POST", formData });
      },
      async UploadPrivateFile({ file }) {
        const formData = new FormData();
        formData.append("file", file);
        return request("/api/uploads/private", { method: "POST", formData });
      },
    },
  },
};

base44.socketUrl = socketUrl;

export default base44;
