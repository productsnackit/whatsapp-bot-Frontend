import { useEffect, useState } from "react";
import { downloadFile } from "./download.js";

/* Full-screen photo viewer inside the dashboard (never opens another site).
   images: [{ url, caption }]. Click the photo to zoom; arrows/keys to move. */
export default function ImageViewer({ images, index, onIndex, onClose }) {
  const [zoomed, setZoomed] = useState(false);
  const [saving, setSaving] = useState(false);
  const current = images[index];

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight" && index < images.length - 1) { setZoomed(false); onIndex(index + 1); }
      if (event.key === "ArrowLeft" && index > 0) { setZoomed(false); onIndex(index - 1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [images.length, index, onClose, onIndex]);

  if (!current) return null;
  const go = (next) => (event) => {
    event.stopPropagation();
    setZoomed(false);
    onIndex(next);
  };
  const save = async (event) => {
    event.stopPropagation();
    setSaving(true);
    try {
      await downloadFile(current.url);
    } catch {
      window.alert("Could not download this photo.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="tc-lightbox iv" onClick={onClose}>
      <div className="tc-lightbox-bar" onClick={(event) => event.stopPropagation()}>
        <span>{current.caption || ""}{images.length > 1 ? ` · ${index + 1} / ${images.length}` : ""}</span>
        <button type="button" className="iv-btn" onClick={() => setZoomed((value) => !value)}>{zoomed ? "Fit" : "Zoom"}</button>
        <button type="button" className="iv-btn" onClick={save} disabled={saving}>{saving ? "Saving…" : "Download"}</button>
        <button type="button" onClick={onClose} aria-label="Close">✕</button>
      </div>
      {index > 0 && <button type="button" className="tc-lightbox-nav is-prev" onClick={go(index - 1)} aria-label="Previous">‹</button>}
      <div className={`iv-stage ${zoomed ? "is-zoomed" : ""}`} onClick={(event) => event.stopPropagation()}>
        <img src={current.url} alt={current.caption || ""} onClick={() => setZoomed((value) => !value)} />
      </div>
      {index < images.length - 1 && <button type="button" className="tc-lightbox-nav is-next" onClick={go(index + 1)} aria-label="Next">›</button>}
    </div>
  );
}
