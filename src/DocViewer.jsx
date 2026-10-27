import { useEffect, useState } from "react";
import { downloadFile } from "./download.js";

/* A document (PDF, Excel, Word…) opened inside the dashboard, with a big ✕ to close, so phones
   never get stuck on a file with no way back. PDFs show a preview where the browser can;
   everything can be downloaded or opened in the browser. Photos use ImageViewer.jsx. */
export default function DocViewer({ file, onClose }) {
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const onKey = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (!file?.url) return null;
  const name = file.name || "Document";
  const isPdf = /\.pdf($|\?)/i.test(name) || /\.pdf($|\?)/i.test(file.url) || /pdf/i.test(file.mime || "");
  const save = async () => {
    setSaving(true);
    try { await downloadFile(file.url, name); } catch { window.open(file.url, "_blank", "noopener"); } finally { setSaving(false); }
  };
  return (
    <div className="tc-lightbox iv dv" onClick={onClose}>
      <div className="tc-lightbox-bar" onClick={(event) => event.stopPropagation()}>
        <span>{name}</span>
        <button type="button" className="iv-btn" onClick={save} disabled={saving}>{saving ? "Saving…" : "Download"}</button>
        <button type="button" className="iv-close" onClick={onClose} aria-label="Close">✕</button>
      </div>
      <div className="dv-body" onClick={(event) => event.stopPropagation()}>
        {isPdf && <iframe className="dv-frame" src={file.url} title={name} />}
        <div className="dv-card">
          <span className="dv-icon">{isPdf ? "📕" : /xls|csv|sheet/i.test(name) ? "📊" : /doc|word/i.test(name) ? "📝" : "📄"}</span>
          <b>{name}</b>
          <small>{isPdf ? "If the preview doesn't show, download it or open it in the browser." : "This file can't be shown here. Download it, or open it in the browser."}</small>
          <div className="dv-actions">
            <button type="button" className="dv-primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "⬇ Download"}</button>
            <a className="dv-secondary" href={file.url} target="_blank" rel="noreferrer">Open in browser</a>
            <button type="button" className="dv-secondary" onClick={onClose}>✕ Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}
