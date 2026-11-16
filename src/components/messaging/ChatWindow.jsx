import { useCallback, useEffect, useRef, useState } from "react";
import { Check, CheckCheck, File as FileIcon, Image as ImageIcon, Loader2, Lock, MoreVertical, Paperclip, Phone, Search, Send, Smile, Trash2, Video } from "lucide-react";
import { toast } from "sonner";
import { io } from "socket.io-client";
import { base44, messagesApi } from "@/api/base44Client";
import { decryptFrom, encryptFor, ensureE2eKeys } from "@/lib/e2e";
import { cn } from "@/lib/utils";
import CallOverlay from "@/components/messaging/CallOverlay";

const REACTIONS = ["❤️", "😂", "😮", "😢", "👍", "🔥"];
const TOKEN_KEY = "purre_access_token";
const meOf = () => {
  try {
    return JSON.parse(localStorage.getItem("purre:user") || "null");
  } catch {
    return null;
  }
};

/**
 * ChatWindow — Messenger PRO:
 *  • E2E (ECDH P-256 + AES-GCM) — serwer nie widzi treści,
 *  • realtime przez Socket.IO (message:new / typing / read / react / delete),
 *  • infinite scroll historii (?before=), statusy dostarczono/odczytano,
 *  • załączniki multimedialne, reakcje, usuwanie, wyszukiwarka,
 *  • H: połączenia głosowe/wideo (WebRTC przez CallOverlay).
 */
export default function ChatWindow({ conversationId, peer, onClose }) {
  const me = meOf();
  const myId = me?.id ?? me?.user_id ?? null;
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [typing, setTyping] = useState([]);
  const [e2eReady, setE2eReady] = useState(false);
  const [search, setSearch] = useState("");
  const [menuFor, setMenuFor] = useState(null);
  const [callRequest, setCallRequest] = useState(null); // H: { kind, seq }
  const [socketInstance, setSocketInstance] = useState(null);
  const endRef = useRef(null);
  const topRef = useRef(null);
  const fileRef = useRef(null);
  const docRef = useRef(null);
  const listRef = useRef(null);
  const socketRef = useRef(null);
  const lastTypingSent = useRef(0);
  const peerId = peer?.user_id ?? peer?.id ?? null;

  const decryptOne = useCallback(async (m) => {
    if (!m.e2e) return { ...m, plain: m.content ?? "" };
    const senderForDecrypt = m.sender_id === myId ? peerId : m.sender_id;
    return {
      ...m,
      plain: await decryptFrom(senderForDecrypt, m, { fetchKeys: (id) => base44.e2e.keys(id) }),
    };
  }, [myId, peerId]);

  const load = useCallback(async () => {
    if (!conversationId) return;
    try {
      const res = await messagesApi.messages(conversationId);
      const items = await Promise.all((res.items ?? []).map(decryptOne));
      setHasMore(!!res.has_more);
      setMessages(items);
    } catch (err) {
      toast.error(err?.message ?? "Nie udało się wczytać rozmowy");
    }
  }, [conversationId, decryptOne]);

  const loadOlder = useCallback(async () => {
    if (!conversationId || loadingOlder || !messages.length || !hasMore) return;
    setLoadingOlder(true);
    const list = listRef.current;
    const prevHeight = list?.scrollHeight ?? 0;
    try {
      const oldest = messages[0]?.created_date;
      const res = await messagesApi.history(conversationId, oldest);
      const older = await Promise.all((res.items ?? []).map(decryptOne));
      setMessages((prev) => [...older, ...prev]);
      setHasMore(!!res.has_more);
      requestAnimationFrame(() => {
        if (list) list.scrollTop = list.scrollHeight - prevHeight;
      });
    } catch { /* Błąd operacji wiadomości nie powinien przerwać widoku czatu. */ } finally {
      setLoadingOlder(false);
    }
  }, [conversationId, hasMore, loadingOlder, messages, decryptOne]);

  // Init: klucze E2E + historia + socket
  useEffect(() => {
    (async () => {
      try {
        await ensureE2eKeys((body) => base44.e2e.register(body));
        setE2eReady(true);
      } catch {
        setE2eReady(false);
      }
      load();
    })();
  }, [load]);

  useEffect(() => {
    if (!conversationId) return undefined;
    let disposed = false;
    const socket = io(base44.socketUrl ?? window.location.origin, {
      path: "/socket.io",
      auth: { token: localStorage.getItem(TOKEN_KEY) },
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;
    setSocketInstance(socket);
    socket.emit("subscribe", { room: `conversation:${conversationId}` });

    socket.on("message:new", async (m) => {
      if (m.conversation_id !== conversationId || disposed) return;
      const dec = await decryptOne(m);
      setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, dec]));
    });
    socket.on("message:read", ({ conversation_id, user_id }) => {
      if (conversation_id !== conversationId || user_id === myId) return;
      setMessages((prev) => prev.map((m) => (m.sender_id === myId ? { ...m, read: true, seen: true } : m)));
    });
    socket.on("message:typing", ({ conversation_id: cid, user_id, name }) => {
      if (cid !== conversationId || user_id === myId) return;
      setTyping([{ user_id, name }]);
      setTimeout(() => setTyping((t) => t.filter((x) => x.user_id !== user_id)), 4000);
    });
    socket.on("message:react", ({ message_id, reaction }) => {
      setMessages((prev) => prev.map((m) => (m.id === message_id ? { ...m, reactions: reaction ? [reaction] : [] } : m)));
    });
    socket.on("message:delete", ({ message_id }) => {
      setMessages((prev) => prev.filter((m) => m.id !== message_id));
    });

    return () => {
      disposed = true;
      socket.disconnect();
    };
  }, [conversationId, myId, decryptOne]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const signalTyping = () => {
    if (!conversationId) return;
    const now = Date.now();
    if (now - lastTypingSent.current < 1500) return;
    lastTypingSent.current = now;
    socketRef.current?.emit("message:typing", { conversation_id: conversationId });
    messagesApi.typingSignal(conversationId).catch(() => null);
  };

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setBusy(true);
    setInput("");
    try {
      let payload;
      if (peerId && e2eReady) {
        const enc = await encryptFor(peerId, text, { fetchKeys: (id) => base44.e2e.keys(id) });
        payload = enc
          ? { conversation_id: conversationId, recipient_id: peerId, ciphertext: enc.ciphertext, iv: enc.iv, e2e: true }
          : { conversation_id: conversationId, recipient_id: peerId, content: text };
      } else {
        payload = { conversation_id: conversationId, recipient_id: peerId, content: text };
      }
      const res = await messagesApi.send(payload);
      setMessages((m) => (m.some((x) => x.id === res.message.id) ? m : [...m, { ...res.message, plain: text }]));
    } catch (err) {
      setInput(text);
      toast.error(err?.message ?? "Nie udało się wysłać");
    } finally {
      setBusy(false);
    }
  };

  const sendMedia = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const up = await base44.integrations.Core.UploadPublicFile({ file });
      const media_type = file.type.startsWith("video")
        ? "video"
        : file.type.startsWith("image")
          ? "image"
          : file.type.startsWith("audio")
            ? "audio"
            : "file"; // dowolny plik: PDF, dokument, archiwum…
      const res = await messagesApi.send({
        conversation_id: conversationId,
        recipient_id: peerId,
        media_url: up.file_url,
        media_type,
      });
      setMessages((m) => (m.some((x) => x.id === res.message.id) ? m : [...m, { ...res.message, plain: "" }]));
    } catch (err) {
      toast.error(err?.message ?? "Upload nie powiódł się");
    } finally {
      setBusy(false);
    }
  };

  const react = async (m, emoji) => {
    setMenuFor(null);
    try {
      await messagesApi.react(m.id, emoji);
    } catch { /* Błąd operacji wiadomości nie powinien przerwać widoku czatu. */ }
  };

  const remove = async (m) => {
    setMenuFor(null);
    try {
      await messagesApi.remove(m.id);
      setMessages((list) => list.filter((x) => x.id !== m.id));
    } catch { /* Błąd operacji wiadomości nie powinien przerwać widoku czatu. */ }
  };

  const visible = search.trim()
    ? messages.filter((m) => (m.plain || "").toLowerCase().includes(search.trim().toLowerCase()))
    : messages;

  const startCall = (kind) => setCallRequest((prev) => ({ kind, seq: (prev?.seq ?? 0) + 1 }));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
        <img src={peer?.avatar_url} alt="" className="h-9 w-9 rounded-full object-cover" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{peer?.display_name || peer?.name || "Rozmowa"}</p>
          <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Lock className="h-3 w-3" /> Szyfrowanie end-to-end
            {typing.length > 0 && <span className="ml-1 text-aura">· {typing[0].name ?? "ktoś"} pisze…</span>}
          </p>
        </div>
        {/* H: połączenia głosowe / wideo */}
        <button
          type="button"
          onClick={() => startCall("audio")}
          className="grid h-8 w-8 place-items-center rounded-xl border border-border/60 text-muted-foreground hover:text-foreground"
          aria-label="Połączenie głosowe"
          title="Połączenie głosowe"
        >
          <Phone className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => startCall("video")}
          className="grid h-8 w-8 place-items-center rounded-xl border border-border/60 text-muted-foreground hover:text-foreground"
          aria-label="Połączenie wideo"
          title="Połączenie wideo"
        >
          <Video className="h-4 w-4" />
        </button>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Szukaj…"
            className="h-8 w-32 rounded-xl border border-border/60 bg-background/50 pl-7 pr-2 text-xs outline-none"
          />
        </div>
        {onClose && (
          <button type="button" onClick={onClose} className="rounded-full px-2 py-1 text-xs text-muted-foreground">
            ✕
          </button>
        )}
      </div>

      <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
        <div ref={topRef} className="flex justify-center py-1">
          {hasMore && (
            <button type="button" onClick={loadOlder} className="flex items-center gap-1 rounded-full border border-border/60 px-3 py-1 text-[10px] text-muted-foreground">
              {loadingOlder ? <Loader2 className="h-3 w-3 animate-spin" /> : null} Wczytaj starsze
            </button>
          )}
        </div>
        {visible.map((m) => {
          const mine = m.sender_id === myId;
          return (
            <div key={m.id} className={cn("group flex items-end gap-1", mine ? "justify-end" : "justify-start")}>
              <button
                type="button"
                onClick={() => setMenuFor(menuFor === m.id ? null : m.id)}
                className="grid h-6 w-6 place-items-center rounded-full text-muted-foreground opacity-0 transition group-hover:opacity-100"
                aria-label="Reakcja"
              >
                <Smile className="h-4 w-4" />
              </button>
              <div className={cn("max-w-[75%] rounded-2xl px-3 py-2 text-sm", mine ? "bg-aura/25 text-foreground" : "bg-secondary/60 text-foreground")}>
                {m.media_url && (
                  m.media_type === "video" ? (
                    <video src={m.media_url} controls className="mb-1 max-h-56 rounded-xl" />
                  ) : m.media_type === "audio" ? (
                    <audio src={m.media_url} controls className="mb-1 max-w-full" />
                  ) : m.media_type === "file" ? (
                    <a
                      href={m.media_url}
                      target="_blank"
                      rel="noreferrer"
                      download
                      className="mb-1 flex items-center gap-2 rounded-xl border border-border/60 bg-background/40 px-3 py-2 text-xs hover:underline"
                    >
                      <FileIcon className="h-4 w-4 shrink-0" />
                      <span className="truncate">Pobierz plik</span>
                    </a>
                  ) : (
                    <img src={m.media_url} alt="" className="mb-1 max-h-56 rounded-xl object-cover" />
                  )
                )}
                {m.e2e && (
                  <p className="mb-0.5 flex items-center gap-1 text-[9px] uppercase tracking-wider text-muted-foreground">
                    <Lock className="h-2.5 w-2.5" /> e2e
                  </p>
                )}
                {m.plain || (m.e2e ? "🔒 …" : "")}
                <div className="mt-0.5 flex items-center justify-end gap-1 text-[9px] text-muted-foreground">
                  {m.reactions?.length > 0 && <span>{m.reactions.map((r) => r.emoji).join("")}</span>}
                  <span>{new Date(m.created_date).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })}</span>
                  {mine && (m.read ? <CheckCheck className="h-3 w-3 text-aura" /> : m.delivered ? <CheckCheck className="h-3 w-3" /> : <Check className="h-3 w-3" />)}
                </div>
              </div>
              {menuFor === m.id && (
                <div className="absolute z-10 mt-24 rounded-xl border border-border/70 bg-card p-2 shadow-xl">
                  <div className="flex gap-1">
                    {REACTIONS.map((emoji) => (
                      <button key={emoji} type="button" onClick={() => react(m, emoji)} className="text-lg">
                        {emoji}
                      </button>
                    ))}
                  </div>
                  {m.sender_id === myId && (
                    <button type="button" onClick={() => remove(m)} className="mt-2 flex w-full items-center gap-1 rounded-lg px-2 py-1 text-xs text-red-400 hover:bg-red-500/10">
                      <Trash2 className="h-3 w-3" /> Usuń dla wszystkich
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <div className="flex items-center gap-2 border-t border-border/60 p-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={(e) => {
            sendMedia(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <button type="button" onClick={() => fileRef.current?.click()} className="grid h-10 w-10 place-items-center rounded-xl border border-border/60" aria-label="Zdjęcie lub wideo">
          <ImageIcon className="h-4 w-4" />
        </button>
        <input
          ref={docRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            sendMedia(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <button type="button" onClick={() => docRef.current?.click()} className="grid h-10 w-10 place-items-center rounded-xl border border-border/60" aria-label="Załącz plik" title="Załącz dowolny plik">
          <Paperclip className="h-4 w-4" />
        </button>
        <input
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            signalTyping();
          }}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Napisz wiadomość…"
          className="h-10 flex-1 rounded-xl border border-border/60 bg-background/50 px-3 text-sm outline-none"
        />
        <button type="button" onClick={send} disabled={busy} className="grid h-10 w-10 place-items-center rounded-xl bg-aura text-black disabled:opacity-50">
          <Send className="h-4 w-4" />
        </button>
      </div>

      {/* H: WebRTC — połączenia głosowe/wideo */}
      <CallOverlay
        socket={socketInstance}
        conversationId={conversationId}
        peerId={peerId}
        peerName={peer?.display_name || peer?.name}
        peerAvatar={peer?.avatar_url}
        request={callRequest}
      />
    </div>
  );
}
