/**
 * Szyfrowanie end-to-end (E2E) dla messengera PURRE PETS — jak w Messengerze Meta.
 *
 * Schemat: ECDH P-256 (klucz prywatny zostaje na urządzeniu w localStorage,
 * klucz publiczny rejestrowany na serwerze) + AES-GCM 256 na treść wiadomości.
 * Serwer przechowuje wyłącznie ciphertext — nie może odczytać treści.
 *
 * API:
 *   await ensureE2eKeys()                       — generuje i rejestruje parę kluczy (raz)
 *   await encryptFor(recipientId, plaintext)    — → { ciphertext, iv, e2e: true }
 *   await decryptFrom(senderId, msg)            — → plaintext
 */

const PRIV_KEY = "purre:e2e:priv";
const PUB_KEY = "purre:e2e:pub";
const ALGO = { name: "ECDH", namedCurve: "P-256" };
const AES = { name: "AES-GCM", length: 256 };

function b64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function unb64(str) {
  return Uint8Array.from(atob(str), (c) => c.charCodeAt(0));
}

async function importPrivJwk(jwk) {
  return crypto.subtle.importKey("jwk", jwk, ALGO, true, ["deriveKey"]);
}
async function importPubJwk(jwk) {
  return crypto.subtle.importKey("jwk", jwk, ALGO, true, []);
}

async function sharedAesKey(privCryptoKey, theirPubCryptoKey) {
  return crypto.subtle.deriveKey(
    { name: "ECDH", public: theirPubCryptoKey },
    privCryptoKey,
    AES,
    false,
    ["encrypt", "decrypt"]
  );
}

let cachedPriv = null;
let cachedPub = null;

/** Generuje (jeśli trzeba) parę kluczy i rejestruje publiczny na serwerze. */
export async function ensureE2eKeys(registerFn) {
  if (cachedPriv && cachedPub) return { private: cachedPriv, public: cachedPub };
  let privJwk = null;
  try {
    const raw = localStorage.getItem(PRIV_KEY);
    if (raw) privJwk = JSON.parse(raw);
  } catch { /* Niepoprawny lub niedostępny zapisany klucz zostanie odtworzony. */ }
  if (!privJwk) {
    const pair = await crypto.subtle.generateKey(ALGO, true, ["deriveKey"]);
    privJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
    const pubJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
    localStorage.setItem(PRIV_KEY, JSON.stringify(privJwk));
    localStorage.setItem(PUB_KEY, JSON.stringify(pubJwk));
  }
  const pubJwk = JSON.parse(localStorage.getItem(PUB_KEY) ?? "null");
  if (!pubJwk) throw new Error("Brak klucza publicznego E2E");
  cachedPriv = await importPrivJwk(privJwk);
  cachedPub = await importPubJwk(pubJwk);
  if (typeof registerFn === "function") {
    await registerFn({ public_key: JSON.stringify(pubJwk), device_id: "web" }).catch(() => null);
  }
  return { private: cachedPriv, public: cachedPub };
}

const pubKeyCache = new Map(); // userId -> JWK

async function getRecipientPubKey(recipientId, fetchFn) {
  if (pubKeyCache.has(recipientId)) return pubKeyCache.get(recipientId);
  const res = await fetchFn(recipientId);
  const first = res?.items?.[0];
  if (!first) return null;
  const jwk = JSON.parse(first.public_key);
  pubKeyCache.set(recipientId, jwk);
  return jwk;
}

/** Szyfruje treść dla odbiorcy. Zwraca null, gdy odbiorca nie ma klucza (fallback do zwykłej wiadomości). */
export async function encryptFor(recipientId, plaintext, { fetchKeys }) {
  const { private: priv } = await ensureE2eKeys();
  const theirJwk = await getRecipientPubKey(recipientId, fetchKeys);
  if (!theirJwk) return null;
  const theirPub = await importPubJwk(theirJwk);
  const aes = await sharedAesKey(priv, theirPub);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aes, new TextEncoder().encode(plaintext));
  return { ciphertext: b64(ct), iv: b64(iv), e2e: true };
}

/** Odszyfrowuje wiadomość e2e. Zwraca komunikat o błędzie, gdy deszyfrowanie się nie powiedzie. */
export async function decryptFrom(senderId, msg, { fetchKeys }) {
  if (!msg?.e2e || !msg?.ciphertext || !msg?.iv) return msg?.content ?? "";
  try {
    const { private: priv } = await ensureE2eKeys();
    const theirJwk = await getRecipientPubKey(senderId, fetchKeys);
    if (!theirJwk) return "🔒 (nadawca zmienił kluczze — brak możliwości odszyfrowania)";
    const theirPub = await importPubJwk(theirJwk);
    const aes = await sharedAesKey(priv, theirPub);
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: unb64(msg.iv) },
      aes,
      unb64(msg.ciphertext)
    );
    return new TextDecoder().decode(pt);
  } catch {
    return "🔒 (nie udało się odszyfrować wiadomości)";
  }
}

/** Czy to urządzenie ma już wygenerowane klucze E2E. */
export function hasE2eKeys() {
  try {
    return !!localStorage.getItem(PRIV_KEY) && !!localStorage.getItem(PUB_KEY);
  } catch {
    return false;
  }
}
