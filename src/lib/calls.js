// H: WebRTC — konfiguracja i pomocnicze funkcje połączeń głosowych/wideo.
// Sygnalizacja idzie przez Socket.IO (call:invite/answer/ice/reject/end),
// media płyną bezpośrednio peer-to-peer.

export const RTC_CONFIG = {
  iceServers: [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
    // TURN dla restrykcyjnego NAT/sieci komórkowych — dodać własne poświadczenia:
    // { urls: "turn:twoj-serwer:3478", username: "...", credential: "..." },
  ],
};

export async function getLocalStream(kind) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Ta przeglądarka nie obsługuje połączeń głosowych/wideo");
  }
  return navigator.mediaDevices.getUserMedia(
    kind === "video"
      ? { audio: true, video: { width: { ideal: 1280 }, facingMode: "user" } }
      : { audio: { echoCancellation: true, noiseSuppression: true }, video: false }
  );
}

export function formatCallDuration(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return \`\${m}:\${String(s).padStart(2, "0")}\`;
}
