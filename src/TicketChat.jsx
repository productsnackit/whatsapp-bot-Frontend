import { useEffect, useMemo, useRef, useState } from "react";

/* Customer ticket chat for admin takeover: photos, videos, documents and voice
   notes both ways, delivery ticks, quick replies and WhatsApp's 24-hour window. */

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_FILES = 10;
const ACCEPT = "image/*,video/mp4,video/3gpp,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt";
const DAY_MS = 24 * 60 * 60 * 1000;

const Icons = {
  clip: <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.4 11.1l-9.2 9.2a6 6 0 01-8.5-8.5l9.2-9.2a4 4 0 015.7 5.7l-9.2 9.2a2 2 0 01-2.8-2.8l8.5-8.5" /></svg>,
  bolt: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>,
  send: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" /></svg>,
  file: <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6" /></svg>,
};

function dayLabel(date) {
  const today = new Date();
  const yesterday = new Date(Date.now() - DAY_MS);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: date.getFullYear() === today.getFullYear() ? undefined : "numeric" });
}

function timeLabel(date) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function sizeLabel(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// Large photos are shrunk in the browser first so they upload quickly.
async function compressImage(file) {
  if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type) || file.size < 1.5 * 1024 * 1024) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    return blob ? new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" }) : file;
  } catch {
    return file;
  }
}

function Ticks({ message }) {
  if (message.sender !== "admin") return null;
  if (message.status === "failed") return <span className="tc-tick is-failed" title={message.error || "Not delivered"}>!</span>;
  if (message.status === "read") return <span className="tc-tick is-read" title="Read">✓✓</span>;
  if (message.status === "delivered") return <span className="tc-tick" title="Delivered">✓✓</span>;
  if (message.status === "sent") return <span className="tc-tick" title="Sent">✓</span>;
  return null;
}

function MediaBlock({ message, onOpenImage }) {
  const { media_url: url, media_type: kind, file_name: name } = message;
  if (!url) return null;
  if (kind === "image" || kind === "sticker") {
    return <button type="button" className={`tc-media-image ${kind === "sticker" ? "is-sticker" : ""}`} onClick={() => onOpenImage(url)}><img src={url} alt={name || "Photo"} loading="lazy" /></button>;
  }
  if (kind === "video") return <video className="tc-media-video" src={url} controls preload="metadata" />;
  if (kind === "audio") return <audio className="tc-media-audio" src={url} controls preload="metadata" />;
  return (
    <a className="tc-media-doc" href={url} target="_blank" rel="noreferrer" download={name || true}>
      {Icons.file}
      <span><b>{name || "Document"}</b><small>{(message.mime_type || "").split("/").pop()?.toUpperCase() || "FILE"} · Tap to open</small></span>
    </a>
  );
}

function Lightbox({ images, index, onClose, onIndex }) {
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight") onIndex((i) => Math.min(images.length - 1, i + 1));
      if (event.key === "ArrowLeft") onIndex((i) => Math.max(0, i - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [images.length, onClose, onIndex]);
  const current = images[index];
  if (!current) return null;
  return (
    <div className="tc-lightbox" onClick={onClose}>
      <div className="tc-lightbox-bar" onClick={(event) => event.stopPropagation()}>
        <span>{current.sender === "admin" ? `Sent by ${current.sent_by || "support"}` : "From customer"} · {timeLabel(new Date(current.created_at))} · {index + 1} / {images.length}</span>
        <a href={current.media_url} target="_blank" rel="noreferrer" download>Open original</a>
        <button type="button" onClick={onClose} aria-label="Close">✕</button>
      </div>
      {index > 0 && <button type="button" className="tc-lightbox-nav is-prev" onClick={(event) => { event.stopPropagation(); onIndex(index - 1); }} aria-label="Previous">‹</button>}
      <img src={current.media_url} alt="" onClick={(event) => event.stopPropagation()} />
      {index < images.length - 1 && <button type="button" className="tc-lightbox-nav is-next" onClick={(event) => { event.stopPropagation(); onIndex(index + 1); }} aria-label="Next">›</button>}
    </div>
  );
}

function QuickReplies({ api, headers, onPick, onClose }) {
  const [replies, setReplies] = useState([]);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState(null);

  const authorization = headers.Authorization;
  useEffect(() => {
    api.get("/admin/quick-replies", { headers: { Authorization: authorization } }).then((response) => setReplies(response.data || [])).catch(() => {});
  }, [api, authorization]);

  const save = async (event) => {
    event.preventDefault();
    const response = await api.post("/admin/quick-replies", draft, { headers });
    setReplies((list) => [...list, response.data].sort((a, b) => a.title.localeCompare(b.title)));
    setDraft(null);
  };

  const remove = async (reply) => {
    if (!window.confirm(`Delete quick reply "${reply.title}"?`)) return;
    await api.delete(`/admin/quick-replies/${reply.id}`, { headers });
    setReplies((list) => list.filter((item) => item.id !== reply.id));
  };

  const q = query.trim().toLowerCase();
  const shown = replies.filter((reply) => !q || `${reply.title} ${reply.text}`.toLowerCase().includes(q));
  return (
    <div className="tc-quick" onClick={(event) => event.stopPropagation()}>
      <div className="tc-quick-head">
        <b>Quick replies</b>
        <button type="button" onClick={onClose} aria-label="Close">✕</button>
      </div>
      {draft ? (
        <form className="tc-quick-form" onSubmit={save}>
          <input autoFocus placeholder="Title, e.g. Need screenshot" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
          <textarea rows="3" placeholder="Message text" value={draft.text} onChange={(event) => setDraft({ ...draft, text: event.target.value })} />
          <div><button type="button" onClick={() => setDraft(null)}>Cancel</button><button type="submit" disabled={!draft.title.trim() || !draft.text.trim()}>Save</button></div>
        </form>
      ) : <>
        <input className="tc-quick-search" placeholder="Search replies" value={query} onChange={(event) => setQuery(event.target.value)} autoFocus />
        <div className="tc-quick-list">
          {shown.map((reply) => (
            <div key={reply.id} className="tc-quick-item">
              <button type="button" onClick={() => onPick(reply.text)}><b>{reply.title}</b><span>{reply.text}</span></button>
              <button type="button" className="tc-quick-del" onClick={() => remove(reply)} title="Delete">🗑</button>
            </div>
          ))}
          {!shown.length && <p className="tc-quick-empty">No quick replies found.</p>}
        </div>
        <button type="button" className="tc-quick-add" onClick={() => setDraft({ title: "", text: "" })}>+ New quick reply</button>
      </>}
    </div>
  );
}

// The 24-hour customer-service window WhatsApp allows for free-form replies.
function ReplyWindow({ lastCustomerAt, now }) {
  if (!lastCustomerAt) return null;
  const left = lastCustomerAt.getTime() + DAY_MS - now;
  if (left <= 0) {
    return <div className="tc-window is-closed">⏰ 24-hour reply window closed. WhatsApp won't deliver new replies until the customer messages again.</div>;
  }
  const hours = Math.floor(left / 3600000);
  const minutes = Math.floor((left % 3600000) / 60000);
  return <div className={`tc-window ${left < 2 * 3600000 ? "is-soon" : ""}`} title="WhatsApp delivers replies for 24 hours after the customer's last message">🟢 Can reply · {hours ? `${hours}h ` : ""}{minutes}m left</div>;
}

export default function TicketChat({ ticket, messages, typing, api, headers, onChanged, onTakeover }) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [showQuick, setShowQuick] = useState(false);
  const [showMedia, setShowMedia] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const endRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const canReply = Boolean(ticket.takeover);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  const lastId = messages.at(-1)?.id;
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [lastId, typing]);

  // Photo previews are freed when removed, sent, or when the chat closes.
  const filesRef = useRef(files);
  useEffect(() => { filesRef.current = files; }, [files]);
  useEffect(() => () => filesRef.current.forEach((item) => item.preview && URL.revokeObjectURL(item.preview)), []);
  const clearFiles = () => {
    files.forEach((item) => item.preview && URL.revokeObjectURL(item.preview));
    setFiles([]);
  };

  const images = useMemo(() => messages.filter((m) => m.media_url && ["image", "sticker"].includes(m.media_type)), [messages]);
  const mediaMessages = useMemo(() => messages.filter((m) => m.media_url), [messages]);
  const lastCustomerAt = useMemo(() => {
    const last = [...messages].reverse().find((m) => m.sender === "user");
    return last ? new Date(last.created_at) : null;
  }, [messages]);

  const addFiles = async (list) => {
    setError("");
    const incoming = Array.from(list || []);
    const next = [];
    for (const raw of incoming) {
      const file = await compressImage(raw);
      if (file.size > MAX_FILE_BYTES) {
        setError(`${raw.name} is larger than 15 MB`);
        continue;
      }
      next.push({ file, preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : null });
    }
    setFiles((current) => [...current, ...next].slice(0, MAX_FILES));
    inputRef.current?.focus();
  };

  const removeFile = (index) => {
    if (files[index]?.preview) URL.revokeObjectURL(files[index].preview);
    setFiles((current) => current.filter((_, i) => i !== index));
  };

  const send = async () => {
    const body = text.trim();
    if (!canReply || sending || (!body && !files.length)) return;
    setSending(true);
    setError("");
    try {
      const payloadFiles = await Promise.all(files.map(async ({ file }) => ({ name: file.name, type: file.type || "application/octet-stream", data: await readAsDataUrl(file) })));
      const response = await api.post(`/admin/tickets/${ticket.id}/send`, { text: body, files: payloadFiles }, { headers });
      setText("");
      clearFiles();
      if (response.data?.error) setError(response.data.error);
      await onChanged();
    } catch (err) {
      setError(err.response?.data?.error || "Could not send. Check your connection and try again.");
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const retry = async (message) => {
    try {
      const response = await api.post(`/admin/tickets/${ticket.id}/messages/${message.id}/retry`, {}, { headers });
      setError(response.data?.error || "");
      await onChanged();
    } catch (err) {
      setError(err.response?.data?.error || "Could not resend");
    }
  };

  const onKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  };

  const onPaste = (event) => {
    const pasted = Array.from(event.clipboardData?.files || []);
    if (pasted.length) {
      event.preventDefault();
      addFiles(pasted);
    }
  };

  const onDrop = (event) => {
    event.preventDefault();
    setDragging(false);
    if (canReply) addFiles(event.dataTransfer.files);
  };

  // Grow the text box with its content, up to a limit.
  useEffect(() => {
    const box = inputRef.current;
    if (!box) return;
    box.style.height = "auto";
    box.style.height = `${Math.min(box.scrollHeight, 140)}px`;
  }, [text]);

  // A date line ("Today", "Yesterday", "12 Sep") goes above the first message of each day.
  const dayBreaks = messages.map((m, idx) => {
    const day = dayLabel(new Date(m.created_at));
    return idx === 0 || day !== dayLabel(new Date(messages[idx - 1].created_at)) ? day : null;
  });

  return (
    <div
      className="tc"
      onDragOver={(event) => { if (canReply) { event.preventDefault(); setDragging(true); } }}
      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false); }}
      onDrop={onDrop}
    >
      {dragging && <div className="tc-drop">Drop photos or files to send</div>}

      <div className="tc-strip">
        <ReplyWindow lastCustomerAt={lastCustomerAt} now={now} />
        {mediaMessages.length > 0 && <button type="button" className="tc-media-toggle" onClick={() => setShowMedia((value) => !value)}>📎 Photos & files ({mediaMessages.length})</button>}
      </div>

      {showMedia && (
        <div className="tc-gallery">
          {mediaMessages.map((m) => (
            m.media_type === "image" || m.media_type === "sticker"
              ? <button type="button" key={m.id} onClick={() => setLightbox(images.findIndex((img) => img.id === m.id))} title={m.sender === "admin" ? "Sent by support" : "From customer"}><img src={m.media_url} alt="" loading="lazy" /><i className={m.sender === "admin" ? "is-admin" : ""} /></button>
              : <a key={m.id} href={m.media_url} target="_blank" rel="noreferrer" className="tc-gallery-file">{m.media_type === "video" ? "🎬" : m.media_type === "audio" ? "🎤" : "📄"}<span>{m.file_name || m.media_type}</span></a>
          ))}
        </div>
      )}

      <div className="tc-body">
        {!messages.length && !typing && <div className="tc-empty">💬<p>No messages yet</p></div>}
        {messages.map((m, idx) => {
          const date = new Date(m.created_at);
          const day = dayBreaks[idx];
          const side = m.sender === "admin" ? "out" : m.sender === "bot" ? "bot" : "in";
          const body = m.message && m.message !== "[media]" ? m.message : "";
          return (
            <div key={m.id || `${m.created_at}-${idx}`}>
              {day && <div className="tc-day"><span>{day}</span></div>}
              <div className={`tc-row is-${side}`}>
                <div className={`tc-bubble ${m.media_url ? "has-media" : ""} ${m.status === "failed" ? "is-failed" : ""}`}>
                  {side === "out" && m.sent_by && <div className="tc-sender">{m.sent_by}</div>}
                  {side === "bot" && <div className="tc-sender">🤖 Bot</div>}
                  <MediaBlock message={m} onOpenImage={() => setLightbox(images.findIndex((img) => img.id === m.id))} />
                  {!m.media_url && m.message === "[media]" && <div className="tc-legacy-media">📎 Photo or file (sent before attachments were saved)</div>}
                  {body && <div className="tc-text">{body}</div>}
                  <div className="tc-meta">{timeLabel(date)}<Ticks message={m} /></div>
                  {m.status === "failed" && (
                    <div className="tc-failed">
                      <span>{m.error || "Not delivered"}</span>
                      <button type="button" onClick={() => retry(m)}>Retry</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {typing && <div className="tc-row is-in"><div className="tc-bubble tc-typing"><span /><span /><span /></div></div>}
        <div ref={endRef} />
      </div>

      {canReply ? (
        <div className="tc-composer">
          {error && <div className="tc-error"><span>{error}</span><button type="button" onClick={() => setError("")} aria-label="Dismiss">✕</button></div>}
          {files.length > 0 && (
            <div className="tc-tray">
              {files.map(({ file, preview }, index) => (
                <div key={`${file.name}-${index}`} className="tc-tray-item">
                  {preview ? <img src={preview} alt="" /> : <div className="tc-tray-file">{Icons.file}<span>{file.name}</span></div>}
                  <small>{sizeLabel(file.size)}</small>
                  <button type="button" onClick={() => removeFile(index)} aria-label={`Remove ${file.name}`}>✕</button>
                </div>
              ))}
              {files.length < MAX_FILES && <button type="button" className="tc-tray-add" onClick={() => fileInputRef.current?.click()}>+</button>}
            </div>
          )}
          <div className="tc-input-row">
            <button type="button" className="tc-icon" onClick={() => fileInputRef.current?.click()} title="Attach photo or file">{Icons.clip}</button>
            <input ref={fileInputRef} type="file" multiple hidden accept={ACCEPT} onChange={(event) => { addFiles(event.target.files); event.target.value = ""; }} />
            <div className="tc-quick-wrap">
              <button type="button" className={`tc-icon ${showQuick ? "active" : ""}`} onClick={() => setShowQuick((value) => !value)} title="Quick replies">{Icons.bolt}</button>
              {showQuick && <QuickReplies api={api} headers={headers} onClose={() => setShowQuick(false)} onPick={(value) => { setText((current) => (current ? `${current} ${value}` : value)); setShowQuick(false); inputRef.current?.focus(); }} />}
            </div>
            <textarea
              ref={inputRef}
              rows="1"
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={onKeyDown}
              onPaste={onPaste}
              placeholder={files.length ? "Add a caption…" : "Type a message"}
            />
            <button type="button" className="tc-send" onClick={send} disabled={sending || (!text.trim() && !files.length)} aria-label="Send">
              {sending ? <span className="tc-spinner" /> : Icons.send}
            </button>
          </div>
          <div className="tc-hint">Enter to send · Shift+Enter for a new line · paste or drop photos</div>
        </div>
      ) : (
        <div className="tc-locked">
          <span>🤖 The bot is handling this chat.</span>
          <button type="button" onClick={onTakeover}>Take over to reply</button>
        </div>
      )}

      {lightbox !== null && lightbox >= 0 && <Lightbox images={images} index={lightbox} onIndex={setLightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}
