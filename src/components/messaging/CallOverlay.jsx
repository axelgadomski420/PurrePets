import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Phone, PhoneOff, Video, VideoOff } from "lucide-react";
import { toast } from "sonner";
import { messagesApi } from "@/api/base44Client";
import { RTC_CONFIG, formatCallDuration, getLocalStream } from "@/lib/calls";
import { Image } from "@/components/ui/image";

const RING_TIMEOUT_MS = 45000;

/**
 * CallOverlay — H: połączenia głosowe/wideo 1:1 (WebRTC).
 * Sygnalizacja: Socket.IO (call:invite/answer/ice/reject/end).
 * Stan: { role, kind, status, offer?, from? } — status: ringing | connecting | active.
 */
export default function CallOverlay({ socket, conversationId, peerId, peerName, peerAvatar, request }) {
  const [call, setCall] = useState(null);
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [remoteLive, setRemoteLive] = useState(false);

  const pcRef = useRef(null);
  const kindRef = useRef(null); // stabilny rodzaj połączenia dla handlerów socketu
  const localStreamRef = useRef(null);
  const otherIdRef = useRef(null);
  const pendingIceRef = useRef([]);
  const startedAtRef = useRef(0);
  const ringTimerRef = useRef(null);
  const tickRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const localVideoRef = useRef(null);

  const stopMedia = () => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
  };

  const clearTimers = () => {
    if (ringTimerRef.current) clearTimeout(ringTimerRef.current);
    if (tickRef.current) clearInterval(tickRef.current);
    ringTimerRef.current = null;
    tickRef.current = null;
  };

  const teardown = useCallbackSafe(() => {
    try { pcRef.current?.close(); } catch {}
    pcRef.current = null;
    stopMedia();
    pendingIceRef.current = [];
    otherIdRef.current = null;
    kindRef.current = null;
    clearTimers();
    setMuted(false);
    setCamOff(false);
    setElapsed(0);
    setRemoteLive(false);
    setCall(null);
  });

  const logCall = (kind, ms) => {
    const dur = formatCallDuration(ms);
    messagesApi
      .send({ conversation_id: conversationId, content: kind === "video" ? `📹 Rozmowa wideo — ${dur}` : `📞 Rozmowa głosowa — ${dur}` })
      .catch(() => null);
  };

  const finish = (kind, note) => {
    const effectiveKind = kind ?? kindRef.current;
    const ms = startedAtRef.current ? Date.now() - startedAtRef.current : 0;
    const wasActive = ms > 0;
    teardown();
    if (wasActive && effectiveKind) logCall(effectiveKind, ms);
    if (note) toast.info(note);
  };

  const buildPc = () => {
    const pc = new RTCPeerConnection(RTC_CONFIG);
    pc.onicecandidate = (e) => {
      if (e.candidate && otherIdRef.current) {
        socket?.emit("call:ice", { conversation_id: conversationId, to: otherIdRef.current, candidate: e.candidate.toJSON() });
      }
    };
    pc.ontrack = (e) => {
      const stream = e.streams[0];
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = stream;
      stream.onaddtrack = () => setRemoteLive(true);
      setRemoteLive(stream.getTracks().length > 0);
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        startedAtRef.current = startedAtRef.current || Date.now();
        setCall((c) => (c ? { ...c, status: "active" } : c));
        if (!tickRef.current) {
          tickRef.current = setInterval(() => {
            setElapsed(startedAtRef.current ? Date.now() - startedAtRef.current : 0);
          }, 1000);
        }
      }
      if (["failed", "closed"].includes(pc.connectionState)) finish();
    };
    return pc;
  };

  const flushIce = async (pc) => {
    for (const candidate of pendingIceRef.current.splice(0)) {
      try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
    }
  };

  const startOutgoing = async (kind) => {
    if (!socket || !peerId) return;
    if (pcRef.current) return; // już w trakcie rozmowy
    try {
      const stream = await getLocalStream(kind);
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      const pc = buildPc();
      pcRef.current = pc;
      otherIdRef.current = peerId;
      kindRef.current = kind;
      for (const track of stream.getTracks()) pc.addTrack(track, stream);
      setCall({ role: "caller", kind, status: "ringing" });
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit("call:invite", { conversation_id: conversationId, kind, offer: pc.localDescription.toJSON() });
      ringTimerRef.current = setTimeout(() => finish(kind, "Brak odpowiedzi"), RING_TIMEOUT_MS);
    } catch (err) {
      toast.error(err?.message ?? "Nie udało się rozpocząć połączenia");
      teardown();
    }
  };

  const accept = async () => {
    const current = call;
    if (!current?.offer) return;
    try {
      const stream = await getLocalStream(current.kind);
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      const pc = buildPc();
      pcRef.current = pc;
      await pc.setRemoteDescription(new RTCSessionDescription(current.offer));
      await flushIce(pc);
      for (const track of stream.getTracks()) pc.addTrack(track, stream);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket?.emit("call:answer", { conversation_id: conversationId, to: current.from, answer: pc.localDescription.toJSON() });
      setCall({ ...current, status: "connecting" });
    } catch (err) {
      toast.error(err?.message ?? "Nie udało się odebrać połączenia");
      socket?.emit("call:reject", { conversation_id: conversationId, to: current.from });
      teardown();
    }
  };

  const reject = () => {
    const current = call;
    socket?.emit("call:reject", { conversation_id: conversationId, to: current?.from ?? peerId });
    teardown();
  };

  const hangup = () => {
    const current = call;
    socket?.emit("call:end", { conversation_id: conversationId, to: otherIdRef.current ?? peerId });
    const ms = startedAtRef.current ? Date.now() - startedAtRef.current : 0;
    const kind = current?.kind ?? kindRef.current;
    const wasActive = ms > 0;
    teardown();
    if (wasActive && kind) logCall(kind, ms);
  };

  // Wychodzące: wywołane przyciskiem w nagłówku ChatWindow (request.seq rośnie).
  useEffect(() => {
    if (request?.seq && socket) startOutgoing(request.kind);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request?.seq, socket]);

  // Przychodzące / odpowiedzi / ICE / koniec.
  useEffect(() => {
    if (!socket) return undefined;

    const onIncoming = ({ from, name, kind, offer }) => {
      if (pcRef.current) {
        // zajęty — automatyczna odmowa
        socket.emit("call:reject", { conversation_id: conversationId, to: from });
        return;
      }
      otherIdRef.current = from;
      kindRef.current = kind === "video" ? "video" : "audio";
      setCall({ role: "callee", kind: kindRef.current, status: "ringing", offer, from, name });
      ringTimerRef.current = setTimeout(() => teardown(), RING_TIMEOUT_MS);
    };

    const onAnswered = async ({ from, answer }) => {
      if (from !== otherIdRef.current) return;
      const pc = pcRef.current;
      if (!pc || !answer) return;
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        await flushIce(pc);
        setCall((c) => (c ? { ...c, status: "connecting" } : c));
      } catch {}
    };

    const onIce = ({ from, candidate }) => {
      if (from !== otherIdRef.current || !candidate) return;
      const pc = pcRef.current;
      if (pc && pc.remoteDescription) {
        pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
      } else {
        pendingIceRef.current.push(candidate);
      }
    };

    const onRejected = ({ from }) => {
      if (from !== otherIdRef.current) return;
      finish(null, "Połączenie odrzucone");
    };

    const onEnded = ({ from }) => {
      if (from !== otherIdRef.current) return;
      finish(null);
    };

    socket.on("call:incoming", onIncoming);
    socket.on("call:answered", onAnswered);
    socket.on("call:ice", onIce);
    socket.on("call:rejected", onRejected);
    socket.on("call:ended", onEnded);
    return () => {
      socket.off("call:incoming", onIncoming);
      socket.off("call:answered", onAnswered);
      socket.off("call:ice", onIce);
      socket.off("call:rejected", onRejected);
      socket.off("call:ended", onEnded);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, conversationId]);

  // Sprzątanie przy odmontowaniu (np. zmiana rozmowy w trakcie połączenia).
  useEffect(() => () => {
    try { pcRef.current?.close(); } catch {}
    stopMedia();
    clearTimers();
  }, []);

  if (!call) return null;

  const toggleMute = () => {
    const track = localStreamRef.current?.getAudioTracks?.()[0];
    if (!track) return;
    track.enabled = muted;
    setMuted(!muted);
  };

  const toggleCam = () => {
    const track = localStreamRef.current?.getVideoTracks?.()[0];
    if (!track) return;
    track.enabled = camOff;
    setCamOff(!camOff);
  };

  const incoming = call.role === "callee" && call.status === "ringing";
  const statusText =
    call.status === "ringing" ? (call.role === "caller" ? "Dzwonię…" : "Połączenie przychodzące")
    : call.status === "connecting" ? "Łączenie…"
    : formatCallDuration(elapsed);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-between bg-black/90 p-6 backdrop-blur-md">
      <div className="mt-6 flex flex-col items-center gap-2 text-center">
        <p className="text-sm font-semibold text-white">{call.name ?? peerName ?? "Połączenie"}</p>
        <p className="text-[11px] uppercase tracking-[0.2em] text-white/60">
          {call.kind === "video" ? "Wideo" : "Głos"} · {statusText}
        </p>
      </div>

      {call.kind === "video" ? (
        <div className="relative flex w-full flex-1 items-center justify-center py-4">
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className={`max-h-full w-full rounded-2xl bg-black object-contain ${remoteLive ? "" : "opacity-0"}`}
          />
          {!remoteLive && call.status !== "ringing" && (
            <p className="absolute text-xs text-white/50">Oczekiwanie na obraz…</p>
          )}
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="absolute bottom-4 right-4 h-32 w-24 rounded-xl border border-white/20 object-cover sm:h-44 sm:w-32"
          />
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <span className="rounded-full bg-gradient-to-br from-violet to-aura p-[3px]">
            <span className="block rounded-full bg-background p-1">
              <Image src={peerAvatar} alt={peerName ?? ""} className="h-28 w-28 rounded-full object-cover" />
            </span>
          </span>
          <audio ref={remoteVideoRef} autoPlay />
        </div>
      )}

      <div className="mb-6 flex items-center gap-4">
        {incoming ? (
          <>
            <button
              type="button"
              onClick={reject}
              className="grid h-14 w-14 place-items-center rounded-full bg-red-500 text-white transition hover:bg-red-400"
              aria-label="Odrzuć"
            >
              <PhoneOff className="h-6 w-6" />
            </button>
            <button
              type="button"
              onClick={accept}
              className="grid h-14 w-14 place-items-center rounded-full bg-emerald-500 text-white transition hover:bg-emerald-400"
              aria-label="Odbierz"
            >
              <Phone className="h-6 w-6" />
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={toggleMute}
              className={`grid h-12 w-12 place-items-center rounded-full border border-white/20 ${muted ? "bg-white text-black" : "bg-white/10 text-white"}`}
              aria-label={muted ? "Włącz mikrofon" : "Wycisz"}
            >
              {muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            </button>
            <button
              type="button"
              onClick={hangup}
              className="grid h-14 w-14 place-items-center rounded-full bg-red-500 text-white transition hover:bg-red-400"
              aria-label="Zakończ"
            >
              <PhoneOff className="h-6 w-6" />
            </button>
            {call.kind === "video" && (
              <button
                type="button"
                onClick={toggleCam}
                className={`grid h-12 w-12 place-items-center rounded-full border border-white/20 ${camOff ? "bg-white text-black" : "bg-white/10 text-white"}`}
                aria-label={camOff ? "Włącz kamerę" : "Wyłącz kamerę"}
              >
                {camOff ? <VideoOff className="h-5 w-5" /> : <Video className="h-5 w-5" />}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Minimalny wrapper, żeby teardown nie był odtwarzany przy każdym renderze.
function useCallbackSafe(fn) {
  const ref = useRef(fn);
  ref.current = fn;
  return (...args) => ref.current(...args);
}
