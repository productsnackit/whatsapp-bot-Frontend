import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { parseCsv } from "./csv.js";

const API = axios.create({ baseURL: "https://whatsapp-bot-backend-b3nb.onrender.com" });

const SCOPES = {
  daily: "Daily refill audit",
  weekly: "Weekly comprehensive (with expiry)",
  monthly: "Monthly technical maintenance",
};
const ALL = ["daily", "weekly", "monthly"];
const WEEKLY_UP = ["weekly", "monthly"];

const MASTER_CHECKLIST = [
  {
    id: "cat_mechanics",
    title: "Power, mechanics & safety locks",
    items: [
      { id: "power_running", text: "Power supply is stable & machine switched ON running smoothly", maxPts: 10, scopes: ALL, instruction: "Verify stable input without tripping." },
      { id: "safety_locks", text: "Cabinet safety locks, door latch & microswitches functioning securely", maxPts: 10, scopes: WEEKLY_UP, instruction: "Check all deadbolts and key locks." },
      { id: "motor_sound", text: "No abnormal sound from compressor, spiral motors or fan", maxPts: 10, scopes: WEEKLY_UP, instruction: "Listen for grinding or fan rattle." },
      { id: "water_leakage", text: "Zero water leakage inside cabinet; condensation tray intact", maxPts: 10, scopes: ALL, critical: true, instruction: "No water pools or clogged drain pan." },
      { id: "spirals_order", text: "All spirals aligned, timed and running without jamming", maxPts: 10, scopes: ALL, instruction: "Rotate & test spiral cycles if stuck." },
      { id: "dispenser_pickup_ease", text: "Dispenser flap opens freely; dispensed items easy to pick up", maxPts: 10, scopes: ALL, instruction: "Test push flap & anti-theft baffle clearance." },
    ],
  },
  {
    id: "cat_hygiene",
    title: "Cleanliness & hygiene",
    items: [
      { id: "overall_machine_cleanliness", text: "Overall machine cleanliness (cabinet, glass, keypad & surroundings)", maxPts: 10, scopes: ALL, instruction: "Spotless exterior, fingerprint-free glass, sanitised touchpoints." },
      { id: "sponge_cleanliness", text: "Internal trays cleaned with food-grade sponge", maxPts: 10, scopes: ALL, instruction: "Wipe all tray channels and dividers with a damp sanitising sponge." },
      { id: "spill_immediate", text: "Spills on trays, drop chute and dispenser cleaned immediately", maxPts: 10, scopes: ALL, critical: true, instruction: "Clean spills at once to keep hygiene and prevent pests." },
    ],
  },
  {
    id: "cat_fifo",
    title: "FIFO rotation & expiry sweep",
    items: [
      { id: "product_expiry", text: "Product expiry verified (dates, batch numbers, spirals swept)", maxPts: 10, scopes: WEEKLY_UP, critical: true, instruction: "No product expired or within 48 hours of expiry." },
      { id: "fifo_rotation", text: "FIFO rotation followed (older stock in front, fresh at back)", maxPts: 10, scopes: ALL, instruction: "Strict first-in-first-out restocking." },
      { id: "consumables_handling", text: "Hygienic handling of products during restocking", maxPts: 10, scopes: ALL, instruction: "No dropped cartons or surface contamination." },
    ],
  },
  {
    id: "cat_branding",
    title: "Branding, UPI QR & complaint QR",
    items: [
      { id: "vinyl_condition", text: "Branding vinyl properly stuck and in good condition", maxPts: 10, scopes: WEEKLY_UP, instruction: "Check side wraps & front decals for peeling or tears." },
      { id: "qr_placed", text: "Payment / UPI QR sticker placed correctly & clearly legible", maxPts: 10, scopes: ALL, critical: true, instruction: "QR sticker on scanner panel is clean and undamaged." },
      { id: "complaint_qr_working", text: "Customer complaint QR code in place, scannable & working", maxPts: 10, scopes: ALL, critical: true, instruction: "Scan it with a phone; it must open the Snackit helpdesk." },
    ],
  },
];

const SOP = [
  ["Machine cleanliness", "Spotless exterior, fingerprint-free glass, sanitised keypad and clear surroundings."],
  ["Spill cleanup", "Clean tray and chute spills immediately with a food-grade sponge."],
  ["Safe power handling", "Switch OFF safely during deep coil or tray maintenance."],
  ["Escalate faults", "Report motor noise, water leaks or broken locks to your supervisor at once."],
];

const EXPIRY_REASONS = [
  "Expired on spiral (past best before)",
  "Near expiry (<48h shelf life remaining)",
  "Package damaged / leaking seal",
  "Crushed / dispense jammed",
];

const MAX_PHOTOS = 4;

function formatDate(value, withTime = false) {
  if (!value) return "-";
  return new Date(value).toLocaleString("en-IN", withTime
    ? { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }
    : { day: "2-digit", month: "short", year: "numeric" });
}

function gradeFor(percentage, criticalBreach) {
  if (criticalBreach) return { label: "Critical SOP breach - Fail", tone: "bad" };
  if (percentage >= 90) return { label: "Grade A - Excellent", tone: "good" };
  if (percentage >= 75) return { label: "Grade B - Acceptable", tone: "warn" };
  return { label: "Grade C - Defective", tone: "bad" };
}

function scoreItems(items) {
  let earned = 0;
  let total = 0;
  let criticalBreach = false;
  items.forEach((item) => {
    if (item.score === -1) return;
    earned += item.score;
    total += item.maxPts;
    if (item.critical && item.score === 0) criticalBreach = true;
  });
  return { earned, total, percentage: total ? Math.round((earned / total) * 100) : 100, criticalBreach };
}

const digits = (phone) => String(phone || "").replace(/\D/g, "");

function compressImage(file, maxDim = 900) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.75));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

// Minimal CSV parser: handles quoted fields, escaped quotes and commas/newlines inside quotes.

// Accepts both the old standalone tool's export and this dashboard's own export.
const IMPORT_COLUMNS = {
  ref: ["audit id"], date: ["date"], location: ["location"], machine: ["machine id", "machine"],
  refiller: ["refiller"], phone: ["phone"], auditor: ["auditor"], scope: ["scope"],
  percentage: ["score %"], earned: ["earned points", "earned"], total: ["total points", "total"],
  critical: ["critical breach"], expiredCount: ["expired items count", "expired items"],
};

function auditRowsFromCsv(text) {
  const [header, ...lines] = parseCsv(text.replace(/^\uFEFF/, ""));
  if (!header) throw new Error("The file is empty.");
  const names = header.map((h) => h.trim().toLowerCase());
  const index = Object.fromEntries(Object.entries(IMPORT_COLUMNS).map(([key, aliases]) => [key, names.findIndex((n) => aliases.includes(n))]));
  const missing = ["ref", "date", "location", "scope", "percentage", "earned", "total"].filter((key) => index[key] === -1);
  if (missing.length) throw new Error(`This doesn't look like an audit export. Missing columns: ${missing.join(", ")}.`);
  return lines.map((cells) => Object.fromEntries(Object.entries(index).map(([key, i]) => [key, i === -1 ? "" : (cells[i] ?? "").trim()])));
}

function ContactButtons({ phone }) {
  if (!phone) return null;
  return (
    <div className="audit-contact-buttons">
      <a className="audit-btn audit-btn-primary" href={`tel:+${digits(phone)}`}>Call {phone}</a>
      <a className="audit-btn" href={`https://wa.me/${digits(phone)}`} target="_blank" rel="noreferrer">WhatsApp</a>
    </div>
  );
}

/* =========================================================================
   CONDUCT AUDIT
========================================================================= */
function ConductAudit({ headers, refillers, locations, currentUserName, prefill, onSaved }) {
  const [scope, setScope] = useState("weekly");
  const [locationName, setLocationName] = useState("");
  const [machineCode, setMachineCode] = useState("");
  const [refillerName, setRefillerName] = useState("");
  const [auditor, setAuditor] = useState(currentUserName || "");
  const [scores, setScores] = useState({});
  const [customItems, setCustomItems] = useState([]);
  const [customDraft, setCustomDraft] = useState(null);
  const [expiryItems, setExpiryItems] = useState([]);
  const [expiryDraft, setExpiryDraft] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showSop, setShowSop] = useState(false);
  const [sendToRefiller, setSendToRefiller] = useState(true);

  const applyLocation = useCallback((name) => {
    setLocationName(name);
    const match = locations.find((loc) => loc.name.toLowerCase() === name.trim().toLowerCase());
    if (match) {
      if (match.refiller) setRefillerName(match.refiller);
      setMachineCode(match.machine_code || `SNK-${match.name.toUpperCase().replace(/[^A-Z0-9]/g, "-").slice(0, 10)}-01`);
    }
  }, [locations]);

  // Apply "Audit site" / "Conduct audit" shortcuts from other tabs once per request
  const [appliedPrefill, setAppliedPrefill] = useState(null);
  if (prefill && prefill !== appliedPrefill) {
    setAppliedPrefill(prefill);
    if (prefill.location) applyLocation(prefill.location);
    else setLocationName("");
    if (prefill.refiller) setRefillerName(prefill.refiller);
  }

  const groups = useMemo(() => {
    const master = MASTER_CHECKLIST.map((group) => ({ ...group, items: group.items.filter((item) => item.scopes.includes(scope)) }));
    if (customItems.length) master.push({ id: "cat_custom", title: "Custom checks", items: customItems });
    return master
      .filter((group) => group.items.length)
      .map((group) => ({
        ...group,
        items: group.items.map((item) => ({
          ...item,
          category: group.title,
          score: scores[item.id]?.score ?? item.maxPts,
          notes: scores[item.id]?.notes || "",
        })),
      }));
  }, [scope, customItems, scores]);

  const allItems = groups.flatMap((group) => group.items);
  const result = scoreItems(allItems);
  const grade = gradeFor(result.percentage, result.criticalBreach);
  const refiller = refillers.find((r) => r.name === refillerName);

  const setScore = (id, score) => setScores((prev) => ({ ...prev, [id]: { ...prev[id], score } }));
  const setNote = (id, notes) => setScores((prev) => ({ ...prev, [id]: { ...prev[id], notes } }));
  const fullPointsAll = () => setScores((prev) => {
    const next = { ...prev };
    allItems.forEach((item) => { next[item.id] = { ...next[item.id], score: item.maxPts }; });
    return next;
  });

  const addCustom = (event) => {
    event.preventDefault();
    const text = customDraft.text.trim();
    const maxPts = Math.max(1, Math.round(Number(customDraft.maxPts) || 10));
    if (!text) return;
    setCustomItems((items) => [...items, { id: `custom_${Date.now()}`, text, maxPts, critical: customDraft.critical, instruction: "Custom site check." }]);
    setCustomDraft(null);
  };

  const addExpiry = (event) => {
    event.preventDefault();
    const draft = expiryDraft;
    if (!draft.prodName.trim() || !draft.slot.trim() || !draft.date) {
      setError("Enter the product, slot and printed expiry date.");
      return;
    }
    const qty = Math.max(1, Number(draft.qty) || 1);
    setExpiryItems((items) => [...items, { ...draft, prodName: draft.prodName.trim(), slot: draft.slot.trim(), batch: draft.batch.trim() || "N/A", qty, id: Date.now() }]);
    // A logged expired item fails the expiry check when it is part of this audit
    if (allItems.some((item) => item.id === "product_expiry")) {
      setScores((prev) => ({ ...prev, product_expiry: { score: 0, notes: `${qty}x ${draft.prodName.trim()} discarded at ${draft.slot.trim()}` } }));
    }
    setExpiryDraft(null);
    setError("");
  };

  const addPhotos = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    const room = MAX_PHOTOS - photos.length;
    if (!files.length) return;
    if (room <= 0) { setError(`You can attach up to ${MAX_PHOTOS} photos.`); return; }
    setPhotoBusy(true);
    try {
      const compressed = await Promise.all(files.slice(0, room).map((file) => compressImage(file)));
      setPhotos((prev) => [...prev, ...compressed].slice(0, MAX_PHOTOS));
      if (files.length > room) setError(`Only ${MAX_PHOTOS} photos are allowed; extra photos were skipped.`);
    } catch {
      setError("Could not read that photo. Please try another one.");
    } finally {
      setPhotoBusy(false);
    }
  };

  const reset = () => {
    setLocationName("");
    setMachineCode("");
    setScores({});
    setCustomItems([]);
    setExpiryItems([]);
    setPhotos([]);
    setError("");
  };

  const submit = async () => {
    if (!locationName.trim()) { setError("Choose the client location first."); return; }
    if (!refillerName) { setError("Choose the assigned refiller."); return; }
    setSaving(true);
    setError("");
    try {
      const response = await API.post("/audits", {
        location: locationName.trim(),
        machineCode: machineCode.trim(),
        refiller: refillerName,
        refillerPhone: refiller?.phone || "",
        auditor: auditor.trim(),
        scope,
        checklist: allItems.map(({ id, category, text, maxPts, critical, score, notes }) => ({ id, category, text, maxPts, critical: Boolean(critical), score, notes })),
        expiryItems: expiryItems.map(({ prodName, slot, batch, date, qty, reason }) => ({ prodName, slot, batch, date, qty, reason })),
        photos,
        sendToRefiller,
      }, { headers });
      reset();
      onSaved(response.data);
    } catch (err) {
      setError(err.response?.data?.error || "Could not save the audit. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="audit-stack">
      <section className="audit-card audit-sop">
        <button type="button" className="audit-sop-toggle" onClick={() => setShowSop((v) => !v)}>
          <span><b>Refill quality SOP</b> · 4 directives</span>
          <span>{showSop ? "Hide" : "Show"}</span>
        </button>
        {showSop && (
          <div className="audit-sop-grid">
            {SOP.map(([title, text], index) => <div key={title}><b>{index + 1}. {title}</b><span>{text}</span></div>)}
          </div>
        )}
      </section>

      <section className="audit-card">
        <div className="audit-card-head">
          <div>
            <h3>Refill quality check</h3>
            <p>Score each point, log expired stock and attach proof photos.</p>
          </div>
          <select value={scope} onChange={(e) => setScope(e.target.value)} aria-label="Audit scope">
            {Object.entries(SCOPES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        <div className="audit-form-grid">
          <label>Client location *
            <input list="audit-locations" value={locationName} onChange={(e) => applyLocation(e.target.value)} placeholder={`Search ${locations.length} sites`} />
            <datalist id="audit-locations">
              {locations.map((loc) => <option key={loc.id} value={loc.name}>{loc.refiller || "Unassigned"}</option>)}
            </datalist>
          </label>
          <label>Machine asset ID
            <input value={machineCode} onChange={(e) => setMachineCode(e.target.value)} placeholder="Filled from location" />
          </label>
          <label>Assigned refiller *
            <select value={refillerName} onChange={(e) => setRefillerName(e.target.value)}>
              <option value="">Select refiller</option>
              {refillers.map((r) => <option key={r.id} value={r.name}>{r.name} ({r.site_count} sites)</option>)}
            </select>
          </label>
          <label>Auditor name
            <input value={auditor} onChange={(e) => setAuditor(e.target.value)} placeholder="Your name" />
          </label>
        </div>
        {refiller && (
          <div className="audit-refiller-strip">
            <div className="audit-avatar">{refiller.name.charAt(0)}</div>
            <div className="audit-refiller-strip-text">
              <b>{refiller.name}</b>
              <span>{refiller.site_count} sites · {refiller.shift || "Shift not set"}{refiller.support ? ` · Support: ${refiller.support}` : ""}</span>
            </div>
            <ContactButtons phone={refiller.phone} />
          </div>
        )}
      </section>

      <section className={`audit-card audit-score audit-tone-${grade.tone}`}>
        <div className="audit-score-main">
          <div className="audit-score-dial"><strong>{result.percentage}%</strong><span>Score</span></div>
          <div>
            <div className="audit-score-line"><b>{result.earned} / {result.total} pts</b><span className={`audit-pill audit-pill-${grade.tone}`}>{grade.label}</span></div>
            <p>{result.criticalBreach ? "A critical point (leak, spill, expiry or QR) is marked as a defect." : "No critical safety violations."}</p>
          </div>
        </div>
        <div className="audit-score-actions">
          <button type="button" className="audit-btn" onClick={fullPointsAll}>Mark all full points</button>
          <button type="button" className="audit-btn" onClick={() => setCustomDraft({ text: "", maxPts: 10, critical: false })}>Add custom check</button>
        </div>
        <div className="audit-category-bars">
          {groups.map((group) => {
            const r = scoreItems(group.items);
            return (
              <div key={group.id}>
                <div><span>{group.title}</span><b>{r.earned}/{r.total}</b></div>
                <i><em style={{ width: `${r.percentage}%` }} className={r.percentage >= 90 ? "good" : r.percentage >= 70 ? "warn" : "bad"} /></i>
              </div>
            );
          })}
        </div>
        {customDraft && (
          <form className="audit-inline-form" onSubmit={addCustom}>
            <input autoFocus value={customDraft.text} onChange={(e) => setCustomDraft((d) => ({ ...d, text: e.target.value }))} placeholder="What should be checked?" />
            <input type="number" min="1" value={customDraft.maxPts} onChange={(e) => setCustomDraft((d) => ({ ...d, maxPts: e.target.value }))} aria-label="Max points" />
            <label className="audit-check"><input type="checkbox" checked={customDraft.critical} onChange={(e) => setCustomDraft((d) => ({ ...d, critical: e.target.checked }))} /> Critical</label>
            <button type="submit" className="audit-btn audit-btn-primary">Add</button>
            <button type="button" className="audit-btn" onClick={() => setCustomDraft(null)}>Cancel</button>
          </form>
        )}
      </section>

      {groups.map((group) => {
        const r = scoreItems(group.items);
        return (
          <section className="audit-card" key={group.id}>
            <div className="audit-card-head"><h3>{group.title}</h3><b className="audit-mono">{r.earned}/{r.total} pts</b></div>
            <div className="audit-checklist">
              {group.items.map((item) => {
                const half = Math.floor(item.maxPts / 2);
                const options = [["full", `Full ${item.maxPts}`, item.maxPts], ["partial", `Partial ${half}`, half], ["defect", "Defect 0", 0], ["na", "N/A", -1]];
                return (
                  <div className={`audit-check-item ${item.score === 0 ? "is-defect" : ""}`} key={item.id}>
                    <div className="audit-check-text">
                      <b>{item.text}</b>
                      {item.critical && <span className="audit-pill audit-pill-bad">Critical</span>}
                      <p>{item.instruction}</p>
                    </div>
                    <div className="audit-segment" role="group" aria-label={item.text}>
                      {options.map(([key, label, value]) => (
                        <button type="button" key={key} className={`seg-${key} ${item.score === value ? "active" : ""}`} onClick={() => setScore(item.id, value)}>{label}</button>
                      ))}
                    </div>
                    <input className="audit-note" value={item.notes} onChange={(e) => setNote(item.id, e.target.value)} placeholder="Notes or defect details (optional)" />
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      <section className="audit-card">
        <div className="audit-card-head">
          <div><h3>Expired & damaged products</h3><p>Log every item removed from the spirals.</p></div>
          {!expiryDraft && <button type="button" className="audit-btn audit-btn-danger" onClick={() => setExpiryDraft({ prodName: "", slot: "", batch: "", date: "", qty: 1, reason: EXPIRY_REASONS[0] })}>Log expired product</button>}
        </div>
        {expiryDraft && (
          <form className="audit-expiry-form" onSubmit={addExpiry}>
            <input autoFocus value={expiryDraft.prodName} onChange={(e) => setExpiryDraft((d) => ({ ...d, prodName: e.target.value }))} placeholder="Product name & SKU *" />
            <input value={expiryDraft.slot} onChange={(e) => setExpiryDraft((d) => ({ ...d, slot: e.target.value }))} placeholder="Spiral slot * (e.g. Tray 2 - Slot 14)" />
            <input value={expiryDraft.batch} onChange={(e) => setExpiryDraft((d) => ({ ...d, batch: e.target.value }))} placeholder="Batch / lot #" />
            <label>Printed expiry *<input type="date" value={expiryDraft.date} onChange={(e) => setExpiryDraft((d) => ({ ...d, date: e.target.value }))} /></label>
            <label>Quantity *<input type="number" min="1" value={expiryDraft.qty} onChange={(e) => setExpiryDraft((d) => ({ ...d, qty: e.target.value }))} /></label>
            <select value={expiryDraft.reason} onChange={(e) => setExpiryDraft((d) => ({ ...d, reason: e.target.value }))}>
              {EXPIRY_REASONS.map((reason) => <option key={reason}>{reason}</option>)}
            </select>
            <div className="audit-form-actions">
              <button type="button" className="audit-btn" onClick={() => setExpiryDraft(null)}>Cancel</button>
              <button type="submit" className="audit-btn audit-btn-danger">Save item</button>
            </div>
          </form>
        )}
        {expiryItems.length ? (
          <div className="audit-list">
            {expiryItems.map((item) => (
              <div className="audit-list-row" key={item.id}>
                <div><b>{item.qty}× {item.prodName}</b><span>{item.slot} · Batch {item.batch} · Expiry {item.date}</span><span>{item.reason}</span></div>
                <button type="button" className="audit-link-danger" onClick={() => setExpiryItems((items) => items.filter((i) => i.id !== item.id))}>Remove</button>
              </div>
            ))}
          </div>
        ) : !expiryDraft && <p className="audit-empty">No expired or damaged products logged.</p>}
      </section>

      <section className="audit-card">
        <div className="audit-card-head">
          <div><h3>Proof photos</h3><p>Machine front, spirals, QR stickers and dispenser flap.</p></div>
          <span className="audit-pill">{photos.length} / {MAX_PHOTOS}</span>
        </div>
        <div className="audit-photo-actions">
          <label className="audit-btn audit-btn-primary">Take photo<input type="file" accept="image/*" capture="environment" onChange={addPhotos} hidden /></label>
          <label className="audit-btn">From gallery<input type="file" accept="image/*" multiple onChange={addPhotos} hidden /></label>
          {photoBusy && <span className="audit-muted">Compressing…</span>}
        </div>
        {photos.length > 0 && (
          <div className="audit-photo-grid">
            {photos.map((src, index) => (
              <div key={index} className="audit-photo">
                <img src={src} alt={`Audit proof ${index + 1}`} />
                <button type="button" aria-label="Remove photo" onClick={() => setPhotos((prev) => prev.filter((_, i) => i !== index))}>×</button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="audit-card audit-submit">
        <div className="audit-signoff">
          <div><span>Auditor</span><b>{auditor || "—"}</b></div>
          <div><span>Refiller</span><b>{refillerName || "—"}</b>{refiller?.phone && <small>{refiller.phone}</small>}</div>
        </div>
        <label className="audit-check audit-send-toggle">
          <input type="checkbox" checked={sendToRefiller} onChange={(e) => setSendToRefiller(e.target.checked)} />
          Send failed points to {refillerName || "the refiller"} on WhatsApp as CAPA tasks (they reply Yes / No)
        </label>
        {error && <div className="audit-error">{error}</div>}
        <div className="audit-form-actions">
          <button type="button" className="audit-btn" onClick={reset} disabled={saving}>Reset</button>
          <button type="button" className="audit-btn audit-btn-primary audit-btn-lg" onClick={submit} disabled={saving || photoBusy}>
            {saving ? "Saving…" : "Complete & save audit"}
          </button>
        </div>
      </section>
    </div>
  );
}

/* =========================================================================
   AUDIT REPORT (printable)
========================================================================= */
function AuditReport({ audit, onClose }) {
  const grade = gradeFor(audit.percentage, audit.critical_breach);
  const checklist = audit.checklist || [];
  const issues = checklist.filter((item) => item.score !== -1 && item.score < item.maxPts);
  return (
    <div className="audit-modal-backdrop" onClick={onClose}>
      <div className="audit-modal audit-report" onClick={(e) => e.stopPropagation()}>
        <div className="audit-modal-actions no-print">
          <button type="button" className="audit-btn audit-btn-primary" onClick={() => window.print()}>Print</button>
          <button type="button" className="audit-btn" onClick={onClose}>Close</button>
        </div>
        <div className="audit-report-head">
          <div>
            <span className="audit-eyebrow">Snackit refill quality audit</span>
            <h2>{audit.location}</h2>
            <p>{audit.ref} · {formatDate(audit.created_at, true)} · {SCOPES[audit.scope] || audit.scope}</p>
          </div>
          <div className="audit-report-score"><strong>{audit.percentage}%</strong><span>{audit.earned_points}/{audit.total_points} pts</span><span className={`audit-pill audit-pill-${grade.tone}`}>{grade.label}</span></div>
        </div>
        <div className="audit-report-meta">
          <div><span>Machine</span><b>{audit.machine_code || "—"}</b></div>
          <div><span>Refiller</span><b>{audit.refiller || "—"}</b><small>{audit.refiller_phone}</small></div>
          <div><span>Auditor</span><b>{audit.auditor || "—"}</b></div>
          <div><span>Saved by</span><b>{audit.created_by || "—"}</b></div>
        </div>
        {audit.imported ? (
          <p className="audit-muted audit-imported-note">Imported from a CSV export. Only the totals were recorded, so checklist details, photos and expired-item details aren't available{audit.imported_expired_count ? ` (${audit.imported_expired_count} expired items were logged)` : ""}.</p>
        ) : <>
        <h4>Points not at full score ({issues.length})</h4>
        {issues.length ? (
          <div className="audit-list">
            {issues.map((item) => (
              <div className="audit-list-row" key={item.id}>
                <div><b>{item.text}</b><span>{item.category}{item.notes ? ` · ${item.notes}` : ""}</span></div>
                <span className={`audit-pill audit-pill-${item.score === 0 ? "bad" : "warn"}`}>{item.score}/{item.maxPts}</span>
              </div>
            ))}
          </div>
        ) : <p className="audit-empty">Every checked point scored full marks.</p>}
        </>}
        {audit.expiry_items?.length > 0 && <>
          <h4>Expired & damaged products ({audit.expiry_items.length})</h4>
          <div className="audit-list">
            {audit.expiry_items.map((item, index) => (
              <div className="audit-list-row" key={index}><div><b>{item.qty}× {item.prodName}</b><span>{item.slot} · Batch {item.batch} · Expiry {item.date} · {item.reason}</span></div></div>
            ))}
          </div>
        </>}
        {audit.photos?.length > 0 && <>
          <h4>Photos</h4>
          <div className="audit-photo-grid">
            {audit.photos.map((src) => <a key={src} className="audit-photo" href={src} target="_blank" rel="noreferrer"><img src={src} alt="Audit proof" /></a>)}
          </div>
        </>}
        <div className="audit-signoff">
          <div><span>Verified by auditor</span><b>{audit.auditor}</b></div>
          <div><span>Acknowledged by refiller</span><b>{audit.refiller}</b><small>{audit.refiller_phone}</small></div>
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   RECORDS
========================================================================= */
// Month key in local time, e.g. "2026-09".
function monthKey(value) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key) {
  const [year, month] = key.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

// Composite merit score weights for Operator of the Month.
const MERIT_WEIGHTS = [
  ["quality", "Audit quality", 0.4],
  ["route", "Route capacity & workload", 0.25],
  ["breaches", "Zero critical breaches", 0.2],
  ["expiry", "Expiry vigilance", 0.15],
];

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// Ranks refillers for a period. Route capacity compares each refiller's sites
// with the biggest route; expiry vigilance is the share of audits whose expiry
// check scored full marks (audits without that check don't count against them).
function rankOperators(audits, refillers, month, minAudits) {
  const roster = new Map(refillers.map((r) => [r.name.trim().toLowerCase(), r]));
  const maxSites = Math.max(1, ...refillers.map((r) => r.site_count || 0));
  const byName = new Map();
  for (const audit of audits) {
    if (!audit.refiller || (month !== "all" && monthKey(audit.created_at) !== month)) continue;
    const row = byName.get(audit.refiller) || { name: audit.refiller, audits: [], total: 0, critical: 0, expiryChecks: 0, expiryPassed: 0, expiredUnits: 0 };
    row.audits.push(audit);
    row.total += audit.percentage;
    row.critical += audit.critical_breach ? 1 : 0;
    const expiryItem = (audit.checklist || []).find((item) => item.id === "product_expiry" && item.score !== -1);
    if (expiryItem) {
      row.expiryChecks += 1;
      row.expiryPassed += expiryItem.score >= expiryItem.maxPts ? 1 : 0;
    }
    row.expiredUnits += (audit.imported_expired_count || 0) + (audit.expiry_items || []).reduce((s, i) => s + (Number(i.qty) || 1), 0);
    byName.set(audit.refiller, row);
  }
  return [...byName.values()]
    .filter((row) => row.audits.length >= minAudits)
    .map((row) => {
      const profile = roster.get(row.name.trim().toLowerCase()) || {};
      const count = row.audits.length;
      const sites = profile.site_count || 0;
      const parts = {
        quality: row.total / count,
        route: Math.min(100, (sites / maxSites) * 100),
        breaches: 100 * (1 - row.critical / count),
        expiry: row.expiryChecks ? (100 * row.expiryPassed) / row.expiryChecks : 100,
      };
      const score = MERIT_WEIGHTS.reduce((sum, [key, , weight]) => sum + parts[key] * weight, 0);
      return {
        ...row, count, parts, score, sites, maxSites,
        average: parts.quality,
        phone: profile.phone || row.audits.find((a) => a.refiller_phone)?.refiller_phone || "",
        workload: profile.workload || "",
        siteNames: profile.sites || [],
        best: Math.max(...row.audits.map((a) => a.percentage)),
        worst: Math.min(...row.audits.map((a) => a.percentage)),
      };
    })
    .sort((a, b) => b.score - a.score || b.average - a.average || b.count - a.count || a.name.localeCompare(b.name));
}

function certificateHtml(winner, periodLabel, certNo, logo) {
  const issued = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
  return `<!doctype html><html><head><meta charset="utf-8"><title>Certificate of Excellence - ${escapeHtml(winner.name)}</title>
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;800&family=Great+Vibes&family=Inter:wght@400;600;800&display=swap" rel="stylesheet">
<style>
@page { size: A4 landscape; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.page { width: 297mm; height: 210mm; padding: 10mm; }
.frame { position: relative; height: 100%; padding: 6mm; border: 3mm solid #0b1220; background: #0b1220; }
.inner { position: relative; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: space-between; padding: 12mm 18mm 10mm; border: 1.2mm solid #d4a017; outline: .4mm solid #d4a017; outline-offset: -3mm; background: radial-gradient(circle at 50% 0%, #fffaf0, #fff 60%); text-align: center; font-family: Inter, Arial, sans-serif; color: #1f2937; }
.corner { position: absolute; width: 22mm; height: 22mm; border: 1mm solid #d4a017; }
.tl { top: 5mm; left: 5mm; border-right: 0; border-bottom: 0; } .tr { top: 5mm; right: 5mm; border-left: 0; border-bottom: 0; }
.bl { bottom: 5mm; left: 5mm; border-right: 0; border-top: 0; } .br { bottom: 5mm; right: 5mm; border-left: 0; border-top: 0; }
.brand { display: flex; align-items: center; gap: 4mm; }
.brand img { width: 16mm; height: 16mm; border-radius: 3mm; }
.brand b { font-family: Cinzel, serif; font-size: 20pt; letter-spacing: 2pt; color: #0b1220; }
h1 { margin: 2mm 0 0; font-family: Cinzel, serif; font-size: 34pt; font-weight: 800; letter-spacing: 3pt; color: #0b1220; }
.sub { margin-top: 1mm; font-size: 11pt; font-weight: 800; letter-spacing: 4pt; text-transform: uppercase; color: #b8860b; }
.presented { margin-top: 4mm; font-size: 11pt; color: #6b7280; }
.name { margin: 1mm 0 0; font-family: "Great Vibes", cursive; font-size: 50pt; line-height: 1.1; color: #0b1220; }
.rule { width: 120mm; height: .5mm; margin: 1mm auto 3mm; background: linear-gradient(90deg, transparent, #d4a017, transparent); }
.text { max-width: 200mm; margin: 0 auto; font-size: 11.5pt; line-height: 1.6; }
.stats { display: flex; justify-content: center; gap: 5mm; margin-top: 4mm; }
.stats div { min-width: 34mm; padding: 2.5mm 4mm; border: .4mm solid #ecd9a0; border-radius: 2mm; background: #fffbeb; }
.stats b { display: block; font-size: 15pt; color: #0b1220; } .stats span { font-size: 7.5pt; font-weight: 800; letter-spacing: .6pt; text-transform: uppercase; color: #92400e; }
.foot { display: flex; align-items: flex-end; justify-content: space-between; width: 100%; }
.sign { width: 60mm; border-top: .4mm solid #374151; padding-top: 2mm; font-size: 9pt; font-weight: 600; color: #374151; }
.seal { display: grid; place-items: center; width: 30mm; height: 30mm; border-radius: 50%; background: radial-gradient(circle, #f5c542, #b8860b); color: #0b1220; font-family: Cinzel, serif; font-size: 8pt; font-weight: 800; line-height: 1.25; box-shadow: 0 0 0 1.2mm #fff, 0 0 0 1.8mm #d4a017; }
.seal big { display: block; font-size: 18pt; }
.meta { margin-top: 2mm; font-size: 8pt; color: #9ca3af; }
</style></head><body><div class="page"><div class="frame"><div class="inner">
<i class="corner tl"></i><i class="corner tr"></i><i class="corner bl"></i><i class="corner br"></i>
<div>
  <div class="brand"><img src="${logo}" alt=""><b>SNACKIT</b></div>
</div>
<div>
  <h1>Certificate of Excellence</h1>
  <div class="sub">Operator of the Month · ${escapeHtml(periodLabel)}</div>
  <div class="presented">This certificate is proudly presented to</div>
  <div class="name">${escapeHtml(winner.name)}</div>
  <div class="rule"></div>
  <p class="text">In recognition of outstanding refill quality, hygiene and operational discipline across Snackit vending machines,
  ranking <b>#1 among all refillers</b> with a composite merit score of <b>${winner.score.toFixed(1)}</b>.</p>
  <div class="stats">
    <div><b>${winner.average.toFixed(1)}%</b><span>Avg audit quality</span></div>
    <div><b>${winner.count}</b><span>Audits</span></div>
    <div><b>${winner.sites}</b><span>Sites managed</span></div>
    <div><b>${winner.critical}</b><span>Critical breaches</span></div>
  </div>
</div>
<div class="foot">
  <div class="sign">Operations Head<br><span style="font-weight:400;color:#6b7280">Snackit</span></div>
  <div><div class="seal"><div><big>#1</big>OPERATOR<br>OF THE MONTH</div></div><div class="meta">${escapeHtml(certNo)} · Issued ${escapeHtml(issued)}</div></div>
  <div class="sign">Quality Auditor<br><span style="font-weight:400;color:#6b7280">Snackit Quality Team</span></div>
</div>
</div></div></div>
<script>window.onload = () => setTimeout(() => window.print(), 600);</script>
</body></html>`;
}

function openCertificate(winner, periodLabel, certNo) {
  const win = window.open("", "_blank");
  if (!win) {
    window.alert("Allow pop-ups for this site to print the certificate.");
    return;
  }
  // The logo is embedded so it shows in the blank print window on every browser.
  const write = (logo) => {
    win.document.open();
    win.document.write(certificateHtml(winner, periodLabel, certNo, logo));
    win.document.close();
  };
  fetch("/app-icon-512.png")
    .then((response) => response.blob())
    .then((blob) => new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    }))
    .then(write, () => write(`${window.location.origin}/app-icon-512.png`));
}

function OperatorProfile({ operator, periodLabel, onClose }) {
  return (
    <div className="audit-modal-backdrop" onClick={onClose}>
      <div className="audit-modal" onClick={(e) => e.stopPropagation()}>
        <div className="audit-modal-actions">
          <button type="button" className="audit-btn" onClick={onClose}>Close</button>
        </div>
        <span className="audit-eyebrow">Audit analytics · {periodLabel}</span>
        <h2 className="ootm-profile-name">{operator.name}</h2>
        <p className="audit-muted">{[operator.phone, operator.workload, `${operator.sites} site${operator.sites === 1 ? "" : "s"}`].filter(Boolean).join(" · ")}</p>
        <div className="ootm-bars">
          {MERIT_WEIGHTS.map(([key, label, weight]) => (
            <div key={key}>
              <div><span>{label} <small>({Math.round(weight * 100)}%)</small></span><b>{operator.parts[key].toFixed(0)}</b></div>
              <i><em style={{ width: `${operator.parts[key]}%` }} /></i>
            </div>
          ))}
        </div>
        <div className="audit-stats ootm-profile-stats">
          <div><span>Merit score</span><b className="warn">{operator.score.toFixed(1)}</b></div>
          <div><span>Audits</span><b>{operator.count}</b><small>best {operator.best}% · lowest {operator.worst}%</small></div>
          <div><span>Critical breaches</span><b className={operator.critical ? "bad" : "good"}>{operator.critical}</b></div>
          <div><span>Expired units found</span><b>{operator.expiredUnits}</b></div>
        </div>
        {operator.siteNames.length > 0 && <><h4>Assigned sites</h4><p className="audit-muted">{operator.siteNames.join(", ")}</p></>}
        <h4>Audits in this period</h4>
        <div className="audit-list">
          {operator.audits.map((a) => (
            <div className="audit-list-row" key={a.id}>
              <div><b>{a.location}</b><span>{a.ref} · {formatDate(a.created_at)} · {a.scope}{a.critical_breach ? " · critical breach" : ""}</span></div>
              <span className={`audit-pill audit-pill-${gradeFor(a.percentage, a.critical_breach).tone}`}>{a.percentage}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PodiumCard({ operator, place, onProfile }) {
  const badges = { 1: ["🏆", "#1 Gold winner"], 2: ["🥈", "#2 Silver runner-up"], 3: ["🥉", "#3 Bronze"] };
  const [icon, label] = badges[place];
  return (
    <div className={`ootm-podium-card ootm-place-${place}`}>
      <div className="ootm-podium-top">
        <span className="ootm-badge">{icon} {label}</span>
        <span className="ootm-sites">{operator.sites} site{operator.sites === 1 ? "" : "s"}</span>
      </div>
      <div className="ootm-person">
        <span className="ootm-avatar">{operator.name.charAt(0).toUpperCase()}</span>
        <div>
          <b>{operator.name}</b>
          {operator.phone && <span>{operator.phone}</span>}
          {operator.workload && <em>{operator.workload}</em>}
        </div>
      </div>
      <dl className="ootm-facts">
        <div><dt>Avg audit quality</dt><dd>{operator.average.toFixed(1)}%</dd></div>
        <div><dt>Route capacity</dt><dd>{operator.sites}/{operator.maxSites} sites</dd></div>
        <div><dt>Critical breaches</dt><dd className={operator.critical ? "bad" : "good"}>{operator.critical}</dd></div>
      </dl>
      <div className="ootm-merit"><span>Composite merit score</span><strong>{operator.score.toFixed(1)}</strong></div>
      <button type="button" className="ootm-dark-btn" onClick={() => onProfile(operator)}>View audit analytics</button>
    </div>
  );
}

// Operator of the Month: weighted ranking of refillers with a certificate for the winner.
function OperatorOfMonth({ audits, refillers }) {
  const months = [...new Set(audits.map((a) => monthKey(a.created_at)))].sort().reverse();
  const current = monthKey(new Date());
  const [month, setMonth] = useState(months.includes(current) ? current : months[0] || "all");
  const [minAudits, setMinAudits] = useState(1);
  const [profile, setProfile] = useState(null);

  const ranked = useMemo(() => rankOperators(audits, refillers, month, minAudits), [audits, refillers, month, minAudits]);
  const periodLabel = month === "all" ? "All time" : monthLabel(month);
  const winner = ranked[0];
  const certNo = `SNK-OOTM-${month === "all" ? "ALL" : month}`;
  const podium = [[ranked[1], 2], [ranked[0], 1], [ranked[2], 3]].filter(([operator]) => operator);

  const shareWhatsApp = () => {
    const lines = [
      `🏆 *Snackit Operator of the Month — ${periodLabel}*`,
      "",
      `Congratulations *${winner.name}*! Composite merit score ${winner.score.toFixed(1)} with ${winner.average.toFixed(1)}% average audit quality across ${winner.count} audit${winner.count === 1 ? "" : "s"}.`,
      "",
      ...ranked.slice(0, 3).map((row, index) => `${["🥇", "🥈", "🥉"][index]} ${row.name} — ${row.score.toFixed(1)}`),
      "",
      "Thank you for keeping every machine clean, stocked and fresh! 👏",
    ];
    window.open(`https://wa.me/?text=${encodeURIComponent(lines.join("\n"))}`, "_blank", "noopener");
  };

  const exportRanking = () => downloadCsv(`Snackit_Operator_Rankings_${month}.csv`, [
    ["Rank", "Refiller", "Phone", "Composite score", "Average audit %", "Audits", "Sites", "Critical breaches", "Expiry vigilance %", "Expired units found", "Period"],
    ...ranked.map((row, index) => [index + 1, row.name, row.phone, row.score.toFixed(1), row.average.toFixed(1), row.count, row.sites, row.critical, row.parts.expiry.toFixed(0), row.expiredUnits, periodLabel]),
  ]);

  return (
    <div className="audit-stack">
      <section className="ootm-hero">
        <div>
          <span className="ootm-eyebrow">🏆 Operational excellence recognition</span>
          <h2>Operator of the Month</h2>
          <p>Weighted score: <b>audit quality (40%)</b>, <b>route capacity & workload (25%)</b>, <b>zero critical breaches (20%)</b> and <b>expiry vigilance (15%)</b>.</p>
        </div>
        <div className="ootm-hero-actions">
          <button type="button" className="ootm-gold-btn" onClick={() => openCertificate(winner, periodLabel, certNo)} disabled={!winner}>🎖️ Print award certificate</button>
          <button type="button" className="ootm-ghost-btn" onClick={shareWhatsApp} disabled={!winner}>Share on WhatsApp</button>
        </div>
      </section>

      <div className="audit-leader-controls ootm-controls">
        <select value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Period">
          {months.map((key) => <option key={key} value={key}>{monthLabel(key)}</option>)}
          <option value="all">All time</option>
        </select>
        <select value={minAudits} onChange={(e) => setMinAudits(Number(e.target.value))} aria-label="Minimum audits">
          {[1, 2, 3, 5].map((n) => <option key={n} value={n}>{n === 1 ? "Any number of audits" : `At least ${n} audits`}</option>)}
        </select>
        <button type="button" className="audit-btn" onClick={exportRanking} disabled={!ranked.length}>Export ranking</button>
      </div>

      {ranked.length ? <>
        <div className="ootm-podium">
          {podium.map(([operator, place]) => <PodiumCard key={operator.name} operator={operator} place={place} onProfile={setProfile} />)}
        </div>

        <section className="audit-card">
          <div className="audit-card-head">
            <div><h3>Complete operator merit rankings</h3><p>{ranked.length} refiller{ranked.length === 1 ? "" : "s"} ranked by composite score · {periodLabel}</p></div>
          </div>
          <div className="ootm-table-wrap">
            <table className="ootm-table">
              <thead>
                <tr><th>Rank</th><th>Refiller</th><th>Route</th><th>Avg audit quality</th><th>Audits</th><th>Critical breaches</th><th>Composite score</th><th /></tr>
              </thead>
              <tbody>
                {ranked.map((row, index) => (
                  <tr key={row.name} className={index === 0 ? "is-winner" : ""}>
                    <td data-label="Rank"><span className={`ootm-rank ootm-rank-${index + 1}`}>{index + 1}</span></td>
                    <td data-label="Refiller"><b>{row.name}</b><small>{row.phone}</small></td>
                    <td data-label="Route">{row.sites} site{row.sites === 1 ? "" : "s"}<small>{row.workload}</small></td>
                    <td data-label="Avg audit quality"><span className={`audit-pill audit-pill-${row.average >= 90 ? "good" : row.average >= 75 ? "warn" : "bad"}`}>{row.average.toFixed(1)}%</span></td>
                    <td data-label="Audits">{row.count}</td>
                    <td data-label="Critical breaches"><span className={`audit-pill audit-pill-${row.critical ? "bad" : "good"}`}>{row.critical}</span></td>
                    <td data-label="Composite score"><strong className="ootm-score">{row.score.toFixed(1)}</strong></td>
                    <td><button type="button" className="audit-btn" onClick={() => setProfile(row)}>Profile</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </> : <section className="audit-card"><p className="audit-empty">{minAudits > 1 ? `No refiller has ${minAudits}+ audits in this period.` : "No audits in this period yet."}</p></section>}

      {profile && <OperatorProfile operator={profile} periodLabel={periodLabel} onClose={() => setProfile(null)} />}
    </div>
  );
}

function Records({ headers, audits, capa, isAdmin, onDelete, onChanged, notify }) {
  const [search, setSearch] = useState("");
  const [viewing, setViewing] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const query = search.trim().toLowerCase();
  const filtered = audits.filter((a) => !query || [a.ref, a.location, a.refiller, a.auditor].some((v) => String(v || "").toLowerCase().includes(query)));
  const average = audits.length ? Math.round(audits.reduce((sum, a) => sum + a.percentage, 0) / audits.length) : null;
  const expiredUnits = audits.reduce((sum, a) => sum + (a.imported_expired_count || 0) + (a.expiry_items || []).reduce((s, i) => s + (Number(i.qty) || 1), 0), 0);

  const importCsv = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    try {
      const rows = auditRowsFromCsv(await file.text());
      if (!rows.length) throw new Error("The file has no audit rows.");
      const response = await API.post("/audits/import", { rows }, { headers });
      setImportResult(response.data);
      notify(`Imported ${response.data.inserted} audits`);
      onChanged();
    } catch (err) {
      setImportResult({ inserted: 0, skipped: 0, errors: [err.response?.data?.error || err.message || "Import failed"] });
    } finally {
      setImporting(false);
    }
  };

  const exportCsv = () => downloadCsv(`Snackit_Audits_${new Date().toISOString().slice(0, 10)}.csv`, [
    ["Audit ID", "Date", "Location", "Machine", "Refiller", "Phone", "Auditor", "Scope", "Score %", "Earned", "Total", "Critical breach", "Expired items", "Photos"],
    ...filtered.map((a) => [a.ref, a.created_at, a.location, a.machine_code, a.refiller, a.refiller_phone, a.auditor, a.scope, a.percentage, a.earned_points, a.total_points, a.critical_breach ? "YES" : "NO", (a.expiry_items || []).length, (a.photos || []).length]),
  ]);

  return (
    <div className="audit-stack">
      <div className="audit-stats">
        <div><span>Audits completed</span><b>{audits.length}</b></div>
        <div><span>Average score</span><b className={average === null ? "" : average >= 90 ? "good" : average >= 75 ? "warn" : "bad"}>{average === null ? "--" : `${average}%`}</b><small>Target ≥ 90%</small></div>
        <div><span>Open CAPA</span><b className="bad">{capa.filter((c) => c.status === "OPEN").length}</b></div>
        <div><span>Expired units removed</span><b className="warn">{expiredUnits}</b></div>
      </div>
      <section className="audit-card">
        <div className="audit-toolbar">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by audit ID, location, refiller or auditor" />
          <button type="button" className="audit-btn" onClick={exportCsv} disabled={!filtered.length}>Export CSV</button>
          {isAdmin && (
            <label className={`audit-btn ${importing ? "is-busy" : ""}`}>
              {importing ? "Importing…" : "Import CSV"}
              <input type="file" accept=".csv,text/csv" onChange={importCsv} disabled={importing} hidden />
            </label>
          )}
        </div>
        {importResult && (
          <div className={importResult.errors.length ? "audit-error audit-import-result" : "audit-import-result audit-import-ok"}>
            <b>Import finished:</b> {importResult.inserted} added, {importResult.skipped} already existed (skipped){importResult.errors.length ? `, ${importResult.errors.length} not imported:` : "."}
            {importResult.errors.length > 0 && <ul>{importResult.errors.slice(0, 20).map((e) => <li key={e}>{e}</li>)}</ul>}
            <button type="button" className="audit-link-danger" onClick={() => setImportResult(null)}>Dismiss</button>
          </div>
        )}
        {filtered.length ? (
          <div className="audit-list">
            {filtered.map((a) => {
              const grade = gradeFor(a.percentage, a.critical_breach);
              return (
                <div className="audit-list-row audit-record" key={a.id}>
                  <div>
                    <b>{a.location}</b>
                    <span>{a.ref} · {formatDate(a.created_at, true)} · {a.scope}</span>
                    <span>{a.refiller || "—"} · by {a.auditor || "—"} · {a.imported ? `${a.imported_expired_count || 0} expired · imported` : `${(a.expiry_items || []).length} expired · ${(a.photos || []).length} photos`}</span>
                  </div>
                  <div className="audit-record-side">
                    {a.imported && <span className="audit-pill">Imported</span>}
                    <span className={`audit-pill audit-pill-${grade.tone}`}>{a.percentage}%</span>
                    <button type="button" className="audit-btn" onClick={() => setViewing(a)}>View</button>
                    {isAdmin && <button type="button" className="audit-link-danger" onClick={() => onDelete(a)}>Delete</button>}
                  </div>
                </div>
              );
            })}
          </div>
        ) : <p className="audit-empty">{audits.length ? "No audits match your search." : "No audits yet. Use Conduct audit to record the first one."}</p>}
      </section>
      {viewing && <AuditReport audit={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

/* =========================================================================
   REFILLERS
========================================================================= */
function Refillers({ headers, refillers, isAdmin, onChanged, onAudit, notify }) {
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState(null);
  const query = search.trim().toLowerCase();
  const filtered = refillers.filter((r) => !query || r.name.toLowerCase().includes(query) || (r.sites || []).some((s) => s.toLowerCase().includes(query)));

  const save = async (event) => {
    event.preventDefault();
    const { id, name, phone, shift, workload, support } = draft;
    try {
      if (id) await API.patch(`/audit/refillers/${id}`, { name, phone, shift, workload, support }, { headers });
      else await API.post("/audit/refillers", { name, phone, shift, workload, support }, { headers });
      setDraft(null);
      notify(id ? "Refiller updated" : "Refiller added");
      onChanged();
    } catch (err) {
      notify(err.response?.data?.error || "Could not save refiller", true);
    }
  };

  const remove = async (refiller) => {
    if (!window.confirm(`Delete ${refiller.name}? Their ${refiller.site_count} sites will become unassigned.`)) return;
    try {
      await API.delete(`/audit/refillers/${refiller.id}`, { headers });
      notify("Refiller deleted");
      onChanged();
    } catch (err) {
      notify(err.response?.data?.error || "Could not delete refiller", true);
    }
  };

  return (
    <div className="audit-stack">
      <section className="audit-card">
        <div className="audit-toolbar">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search refiller or site" />
          <button type="button" className="audit-btn audit-btn-primary" onClick={() => setDraft({ name: "", phone: "", shift: "Morning Shift", workload: "", support: "" })}>Add refiller</button>
        </div>
        {draft && (
          <form className="audit-edit-form" onSubmit={save}>
            <input autoFocus value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="Name *" required />
            <input value={draft.phone || ""} onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))} placeholder="Phone (e.g. +91 9000000000)" />
            <input value={draft.shift || ""} onChange={(e) => setDraft((d) => ({ ...d, shift: e.target.value }))} placeholder="Shift" />
            <input value={draft.workload || ""} onChange={(e) => setDraft((d) => ({ ...d, workload: e.target.value }))} placeholder="Workload / role" />
            <input value={draft.support || ""} onChange={(e) => setDraft((d) => ({ ...d, support: e.target.value }))} placeholder="Support team" />
            <div className="audit-form-actions">
              <button type="button" className="audit-btn" onClick={() => setDraft(null)}>Cancel</button>
              <button type="submit" className="audit-btn audit-btn-primary">{draft.id ? "Save changes" : "Add refiller"}</button>
            </div>
          </form>
        )}
      </section>
      <div className="audit-card-grid">
        {filtered.map((r) => (
          <section className="audit-card audit-refiller" key={r.id}>
            <div className="audit-refiller-head">
              <div className="audit-avatar">{r.name.charAt(0)}</div>
              <div><b>{r.name}</b><span>{r.shift || "Shift not set"}{r.workload ? ` · ${r.workload}` : ""}</span></div>
              <span className="audit-pill">{r.site_count} sites</span>
            </div>
            {r.support && r.support !== "Independent" && <p className="audit-muted">Support: {r.support}</p>}
            <div className="audit-chips">{(r.sites || []).map((site) => <span key={site}>{site}</span>)}</div>
            <ContactButtons phone={r.phone} />
            <div className="audit-form-actions">
              <button type="button" className="audit-btn audit-btn-primary" onClick={() => onAudit(r.sites?.[0] || "", r.name)}>Conduct audit</button>
              <button type="button" className="audit-btn" onClick={() => setDraft({ ...r })}>Edit</button>
              {isAdmin && <button type="button" className="audit-link-danger" onClick={() => remove(r)}>Delete</button>}
            </div>
          </section>
        ))}
      </div>
      {!filtered.length && <p className="audit-empty">No refillers match your search.</p>}
    </div>
  );
}

/* =========================================================================
   LOCATIONS
========================================================================= */
function Locations({ headers, locations, refillers, isAdmin, onChanged, onAudit, notify }) {
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState(null);
  const query = search.trim().toLowerCase();
  const filtered = locations.filter((l) => !query || [l.name, l.refiller, l.support].some((v) => String(v || "").toLowerCase().includes(query)));

  const save = async (event) => {
    event.preventDefault();
    const payload = { name: draft.name, refiller_id: draft.refiller_id || null, support: draft.support || null, machine_code: draft.machine_code || null };
    try {
      if (draft.id) await API.patch(`/audit/locations/${draft.id}`, payload, { headers });
      else await API.post("/audit/locations", payload, { headers });
      setDraft(null);
      notify(draft.id ? "Location updated" : "Location added");
      onChanged();
    } catch (err) {
      notify(err.response?.data?.error || "Could not save location", true);
    }
  };

  const remove = async (location) => {
    if (!window.confirm(`Delete ${location.name}? Past audits for this site are kept.`)) return;
    try {
      await API.delete(`/audit/locations/${location.id}`, { headers });
      notify("Location deleted");
      onChanged();
    } catch (err) {
      notify(err.response?.data?.error || "Could not delete location", true);
    }
  };

  return (
    <div className="audit-stack">
      <section className="audit-card">
        <div className="audit-toolbar">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${locations.length} sites or refillers`} />
          <button type="button" className="audit-btn audit-btn-primary" onClick={() => setDraft({ name: "", refiller_id: "", support: "", machine_code: "" })}>Add location</button>
        </div>
        {draft && (
          <form className="audit-edit-form" onSubmit={save}>
            <input autoFocus value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="Location name *" required />
            <select value={draft.refiller_id || ""} onChange={(e) => setDraft((d) => ({ ...d, refiller_id: e.target.value }))}>
              <option value="">No refiller assigned</option>
              {refillers.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <input value={draft.machine_code || ""} onChange={(e) => setDraft((d) => ({ ...d, machine_code: e.target.value }))} placeholder="Machine asset ID (optional)" />
            <input value={draft.support || ""} onChange={(e) => setDraft((d) => ({ ...d, support: e.target.value }))} placeholder="Co-refillers / support" />
            <div className="audit-form-actions">
              <button type="button" className="audit-btn" onClick={() => setDraft(null)}>Cancel</button>
              <button type="submit" className="audit-btn audit-btn-primary">{draft.id ? "Save changes" : "Add location"}</button>
            </div>
          </form>
        )}
        {filtered.length ? (
          <div className="audit-list">
            {filtered.map((l) => (
              <div className="audit-list-row" key={l.id}>
                <div>
                  <b>{l.name}</b>
                  <span>{l.refiller || "Unassigned"}{l.refiller_phone ? ` · ${l.refiller_phone}` : ""}</span>
                  {l.support && <span>Support: {l.support}</span>}
                </div>
                <div className="audit-record-side">
                  <button type="button" className="audit-btn audit-btn-primary" onClick={() => onAudit(l.name, l.refiller)}>Audit site</button>
                  <button type="button" className="audit-btn" onClick={() => setDraft({ ...l, refiller_id: l.refiller_id || "" })}>Edit</button>
                  {isAdmin && <button type="button" className="audit-link-danger" onClick={() => remove(l)}>Delete</button>}
                </div>
              </div>
            ))}
          </div>
        ) : <p className="audit-empty">No locations match your search.</p>}
      </section>
    </div>
  );
}

/* =========================================================================
   CAPA
========================================================================= */
// What happened on WhatsApp for this task: delivery, then the refiller's Yes / No.
function CapaWhatsApp({ ticket: c }) {
  if (c.refiller_reply === "RESOLVED") return <span className="audit-wa audit-wa-good">✅ {c.refiller || "Refiller"} replied Yes, resolved · {formatDate(c.refiller_replied_at, true)}</span>;
  if (c.refiller_reply === "NOT_RESOLVED" && c.status === "OPEN") return <span className="audit-wa audit-wa-bad">⏳ {c.refiller || "Refiller"} replied Not yet · {formatDate(c.refiller_replied_at, true)}</span>;
  if (c.whatsapp_status === "SENT" && c.status === "OPEN") return <span className="audit-wa">📤 Sent on WhatsApp · {formatDate(c.whatsapp_sent_at, true)} · waiting for reply</span>;
  if (c.whatsapp_status === "FAILED" && c.status === "OPEN") return <span className="audit-wa audit-wa-bad">⚠️ Not sent on WhatsApp: {c.whatsapp_error}</span>;
  return null;
}

function Capa({ headers, capa, onChanged, notify }) {
  const [filter, setFilter] = useState("OPEN");
  const filtered = capa.filter((c) => filter === "ALL" || c.status === filter);

  const [sendingId, setSendingId] = useState(null);
  const sendToRefiller = async (ticket) => {
    setSendingId(ticket.id);
    try {
      await API.post(`/audit/capa/${ticket.id}/send`, {}, { headers });
      notify(`${ticket.ref} sent to ${ticket.refiller || "refiller"} on WhatsApp`);
    } catch (err) {
      notify(err.response?.data?.error || "Could not send on WhatsApp", true);
    } finally {
      setSendingId(null);
      onChanged();
    }
  };

  const setStatus = async (ticket, status) => {
    try {
      await API.patch(`/audit/capa/${ticket.id}`, { status }, { headers });
      notify(status === "RESOLVED" ? `${ticket.ref} resolved` : `${ticket.ref} reopened`);
      onChanged();
    } catch (err) {
      notify(err.response?.data?.error || "Could not update ticket", true);
    }
  };

  return (
    <div className="audit-stack">
      <section className="audit-card">
        <div className="audit-card-head">
          <div><h3>Corrective & preventive actions</h3><p>Created automatically for every failed audit point.</p></div>
          <div className="audit-filter">
            {[["OPEN", "Open"], ["RESOLVED", "Resolved"], ["ALL", "All"]].map(([value, label]) => (
              <button type="button" key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>
                {label} ({value === "ALL" ? capa.length : capa.filter((c) => c.status === value).length})
              </button>
            ))}
          </div>
        </div>
        {filtered.length ? (
          <div className="audit-list">
            {filtered.map((c) => (
              <div className={`audit-list-row audit-capa ${c.status === "OPEN" ? "is-open" : ""}`} key={c.id}>
                <div>
                  <div className="audit-capa-top">
                    <b>{c.ref}</b>
                    <span className={`audit-pill audit-pill-${c.severity?.startsWith("P1") ? "bad" : "warn"}`}>{c.severity}</span>
                  </div>
                  <span className="audit-capa-defect">{c.defect}</span>
                  <span>{c.location} · {c.refiller || "—"} · {c.audit_ref || "—"} · {formatDate(c.created_at)}</span>
                  {c.status === "RESOLVED" && <span>Resolved by {c.resolved_by} on {formatDate(c.resolved_at, true)}</span>}
                  <CapaWhatsApp ticket={c} />
                </div>
                <div className="audit-record-side">
                  {c.status === "OPEN" && (
                    <button type="button" className={`audit-btn ${sendingId === c.id ? "is-busy" : ""}`} onClick={() => sendToRefiller(c)} disabled={sendingId === c.id}>
                      {sendingId === c.id ? "Sending…" : c.whatsapp_status === "SENT" ? "Resend on WhatsApp" : "Send on WhatsApp"}
                    </button>
                  )}
                  {c.status === "OPEN"
                    ? <button type="button" className="audit-btn audit-btn-primary" onClick={() => setStatus(c, "RESOLVED")}>Mark resolved</button>
                    : <button type="button" className="audit-btn" onClick={() => setStatus(c, "OPEN")}>Reopen</button>}
                </div>
              </div>
            ))}
          </div>
        ) : <p className="audit-empty">{filter === "OPEN" ? "No open CAPA tickets. All audited machines are compliant." : "Nothing to show."}</p>}
      </section>
    </div>
  );
}

/* =========================================================================
   WORKSPACE
========================================================================= */
export default function AuditWorkspace({ token, currentUserName, isAdmin }) {
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);
  const [tab, setTab] = useState("conduct");
  const [refillers, setRefillers] = useState([]);
  const [locations, setLocations] = useState([]);
  const [audits, setAudits] = useState([]);
  const [capa, setCapa] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);
  const [prefill, setPrefill] = useState(null);

  const notify = useCallback((message, isError = false) => {
    setToast({ message, isError });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const load = useCallback(async () => {
    try {
      const [r, l, a, c] = await Promise.all([
        API.get("/audit/refillers", { headers }),
        API.get("/audit/locations", { headers }),
        API.get("/audits", { headers }),
        API.get("/audit/capa", { headers }),
      ]);
      setRefillers(r.data || []);
      setLocations(l.data || []);
      setAudits(a.data || []);
      setCapa(c.data || []);
      setError("");
    } catch (err) {
      setError(err.response?.data?.error || "Could not load audit data");
    } finally {
      setLoading(false);
    }
  }, [headers]);

  useEffect(() => { load(); }, [load]);

  const startAudit = (location, refiller) => {
    setPrefill({ location, refiller, at: Date.now() });
    setTab("conduct");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const onSaved = (audit) => {
    const { sent = 0, failed = 0, error: sendError } = audit.whatsapp || {};
    if (failed) notify(`${audit.ref} saved · ${failed} CAPA task${failed === 1 ? "" : "s"} not sent on WhatsApp: ${sendError}`, true);
    else if (sent) notify(`${audit.ref} saved · ${sent} CAPA task${sent === 1 ? "" : "s"} sent to ${audit.refiller} on WhatsApp`);
    else notify(`${audit.ref} saved · ${audit.percentage}%`);
    setTab(failed || sent ? "capa" : "records");
    window.scrollTo({ top: 0, behavior: "smooth" });
    load();
  };

  const deleteAudit = async (audit) => {
    if (!window.confirm(`Delete ${audit.ref} for ${audit.location}? Its CAPA tickets are deleted too.`)) return;
    try {
      await API.delete(`/audits/${audit.id}`, { headers });
      notify(`${audit.ref} deleted`);
      load();
    } catch (err) {
      notify(err.response?.data?.error || "Could not delete audit", true);
    }
  };

  const openCapa = capa.filter((c) => c.status === "OPEN").length;
  const tabs = [
    ["conduct", "Conduct audit"],
    ["records", `Records (${audits.length})`],
    ["ootm", "🏆 Operator of the Month"],
    ["capa", `CAPA${openCapa ? ` (${openCapa})` : ""}`],
    ["refillers", `Refillers (${refillers.length})`],
    ["locations", `Locations (${locations.length})`],
  ];

  return (
    <div className="audit-workspace">
      <div className="audit-tabs" role="tablist">
        {tabs.map(([key, label]) => (
          <button type="button" role="tab" key={key} aria-selected={tab === key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>
      {toast && <div className={`audit-toast ${toast.isError ? "is-error" : ""}`}>{toast.message}</div>}
      {loading ? <div className="audit-card audit-empty">Loading audit data…</div>
        : error ? <div className="audit-card audit-error">{error} <button type="button" className="audit-btn" onClick={load}>Retry</button></div>
        : <>
          {/* Kept mounted so a half-finished audit survives switching tabs */}
          <div hidden={tab !== "conduct"}>
            <ConductAudit headers={headers} refillers={refillers} locations={locations} currentUserName={currentUserName} prefill={prefill} onSaved={onSaved} />
          </div>
          {tab === "records" && <Records headers={headers} audits={audits} capa={capa} isAdmin={isAdmin} onDelete={deleteAudit} onChanged={load} notify={notify} />}
          {tab === "ootm" && <OperatorOfMonth audits={audits} refillers={refillers} />}
          {tab === "capa" && <Capa headers={headers} capa={capa} onChanged={load} notify={notify} />}
          {tab === "refillers" && <Refillers headers={headers} refillers={refillers} isAdmin={isAdmin} onChanged={load} onAudit={startAudit} notify={notify} />}
          {tab === "locations" && <Locations headers={headers} locations={locations} refillers={refillers} isAdmin={isAdmin} onChanged={load} onAudit={startAudit} notify={notify} />}
        </>}
    </div>
  );
}
