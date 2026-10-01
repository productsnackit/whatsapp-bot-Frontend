import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import ImageViewer from "./ImageViewer.jsx";

/* Call Log: any task or concern, assigned to an employee and sent to their WhatsApp
   (Processing / Resolved / Forward buttons). Tracks who had it, for how long, and how long
   each person takes. See callLog.js on the server. */

const API = axios.create({ baseURL: "https://whatsapp-bot-backend-b3nb.onrender.com" });

const SOURCES = ["Phone call", "WhatsApp", "In person", "Email", "Internal"];
const PRIORITIES = ["Low", "Normal", "High", "Urgent"];
const STATUSES = ["Open", "In Progress", "Done", "Cancelled"];
const STATUS_TONE = { Open: "warn", "In Progress": "blue", Done: "good", Cancelled: "muted" };
// Shown with the same words as the WhatsApp buttons (Processing / Resolved / Forward).
const STATUS_LABEL = { Open: "Open", "In Progress": "Processing", Done: "Resolved", Cancelled: "Cancelled" };
const PRIORITY_TONE = { Low: "blue", Normal: "muted", High: "orange", Urgent: "bad" };
const ACTION_LABEL = { raised: "Raised", started: "Processing", done: "Resolved", forwarded: "Forwarded", reopened: "Re-opened", cancelled: "Cancelled", note: "Note", edited: "Edited" };

// "2h 15m", "3d 4h", "12m".
function duration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return "";
  const minutes = Math.max(1, Math.round(ms / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h${minutes % 60 ? ` ${minutes % 60}m` : ""}`;
  return `${Math.floor(hours / 24)}d${hours % 24 ? ` ${hours % 24}h` : ""}`;
}
const since = (value, now) => (value ? duration(now - new Date(value).getTime()) : "");
const between = (from, to) => (from && to ? duration(new Date(to) - new Date(from)) : "");
const when = (value) => (value ? new Date(value).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "—");
const isOpen = (task) => task.status === "Open" || task.status === "In Progress";
const isOverdue = (task, now) => isOpen(task) && task.due_at && new Date(task.due_at).getTime() < now;

// <input type="datetime-local"> works in local time: "2026-09-30T18:00".
const localInput = (date) => {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
const DUE_PRESETS = [
  ["In 1 hour", () => new Date(Date.now() + 60 * 60 * 1000)],
  ["Today 6 pm", () => { const d = new Date(); d.setHours(18, 0, 0, 0); return d; }],
  ["Tomorrow 11 am", () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(11, 0, 0, 0); return d; }],
];

// Files to attach: read in the browser and sent with the task (each up to 10 MB, 5 at a time).
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 5;
const readFile = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve({ name: file.name, type: file.type || "application/octet-stream", data: reader.result });
  reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
  reader.readAsDataURL(file);
});
const fileSize = (bytes) => (bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

// Picked files waiting to be sent (name, size, remove).
function FilePicker({ files, onChange, room = MAX_FILES }) {
  const [error, setError] = useState("");
  const add = (event) => {
    const picked = [...event.target.files];
    event.target.value = "";
    const tooBig = picked.filter((file) => file.size > MAX_FILE_BYTES);
    const ok = picked.filter((file) => file.size <= MAX_FILE_BYTES);
    const next = [...files, ...ok].slice(0, room);
    setError(tooBig.length ? `${tooBig.map((file) => file.name).join(", ")} ${tooBig.length === 1 ? "is" : "are"} over 10 MB` : files.length + ok.length > room ? `Up to ${room} files` : "");
    onChange(next);
  };
  return (
    <div className="cl-files">
      <label className="audit-btn cl-attach">📎 Attach photos or files<input type="file" multiple accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,video/*" onChange={add} hidden /></label>
      {files.map((file, index) => (
        <span key={`${file.name}-${index}`} className="cl-file-chip">
          {file.type?.startsWith("image/") ? "🖼" : "📄"} {file.name} <small>{fileSize(file.size)}</small>
          <button type="button" onClick={() => onChange(files.filter((_, i) => i !== index))} aria-label={`Remove ${file.name}`}>✕</button>
        </span>
      ))}
      {error && <small className="cl-file-error">{error}</small>}
    </div>
  );
}

// Files already on the task: photos as thumbnails (open full screen), others as links.
function Attachments({ task, onOpenPhoto }) {
  const files = task.attachments || [];
  if (!files.length) return null;
  return (
    <div className="cl-attachments">
      {files.map((file, index) => file.kind === "image" ? (
        <button type="button" key={`${file.url}-${index}`} className="cl-attach-photo" onClick={() => onOpenPhoto(file.url)} title={`${file.name} · ${file.by}`}><img src={file.url} alt={file.name} loading="lazy" /></button>
      ) : (
        <a key={`${file.url}-${index}`} className="cl-attach-file" href={file.url} target="_blank" rel="noreferrer" title={`Added by ${file.by}`}>📄 {file.name}</a>
      ))}
    </div>
  );
}

// What WhatsApp said about the message to the employee.
function deliveryOf(task) {
  if (task.whatsapp_status === "NO_PHONE") return { tone: "bad", label: "No WhatsApp number", title: task.whatsapp_error };
  if (task.whatsapp_status === "FAILED") return { tone: "bad", label: "⚠ Not delivered", title: task.whatsapp_error };
  if (task.whatsapp_delivery === "read") return { tone: "good", label: "✓✓ Read on WhatsApp" };
  if (task.whatsapp_delivery === "delivered") return { tone: "blue", label: "✓✓ Delivered" };
  if (task.whatsapp_status === "SENT") return { tone: "muted", label: "✓ Sent on WhatsApp" };
  return null;
}

function EmployeeSelect({ value, onChange, employees, departments, exclude, required }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} required={required}>
      <option value="">Choose an employee</option>
      {departments.map((department) => {
        const people = employees.filter((user) => user.department === department && String(user.id) !== String(exclude));
        return people.length ? (
          <optgroup key={department} label={department}>
            {people.map((user) => <option key={user.id} value={String(user.id)}>{user.name} · {user.role}{user.phone ? "" : " (no WhatsApp)"}</option>)}
          </optgroup>
        ) : null;
      })}
    </select>
  );
}

/* ---------- Raise a task ---------- */
function NewTask({ employees, departments, onSave, onClose }) {
  const [form, setForm] = useState({ title: "", details: "", source: "Phone call", caller_name: "", caller_phone: "", location: "", priority: "Normal", assignee_id: "", due: "" });
  const [files, setFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));
  const assignee = employees.find((user) => String(user.id) === form.assignee_id);

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const { due, ...rest } = form;
      await onSave({ ...rest, due_at: due ? new Date(due).toISOString() : null, files: await Promise.all(files.map(readFile)) });
    } catch (err) {
      setError(err.response?.data?.error || "Could not save. Check your connection and try again.");
      setSaving(false);
    }
  };

  return (
    <div className="fnd-backdrop" onClick={onClose}>
      <form className="fnd-modal" onClick={(event) => event.stopPropagation()} onSubmit={submit}>
        <div className="fnd-modal-head">
          <h3>Raise a task or concern</h3>
          <button type="button" className="fnd-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="fnd-modal-body">
          <label>What needs to be done? *
            <input value={form.title} onChange={set("title")} placeholder="e.g. Machine at Strides 2 not accepting UPI" required autoFocus />
          </label>
          <label>Details
            <textarea rows={3} value={form.details} onChange={set("details")} placeholder="What the caller said, what's been tried, anything they'll need" />
          </label>
          <div className="fnd-grid fnd-grid-3">
            <label>Came from
              <select value={form.source} onChange={set("source")}>{SOURCES.map((source) => <option key={source}>{source}</option>)}</select>
            </label>
            <label>Caller / contact name<input value={form.caller_name} onChange={set("caller_name")} placeholder="Optional" /></label>
            <label>Their phone<input value={form.caller_phone} onChange={set("caller_phone")} placeholder="Optional" inputMode="tel" /></label>
          </div>
          <div className="fnd-grid fnd-grid-3">
            <label>Location / site<input value={form.location} onChange={set("location")} placeholder="Optional" /></label>
            <label>Priority
              <select value={form.priority} onChange={set("priority")}>{PRIORITIES.map((priority) => <option key={priority}>{priority}</option>)}</select>
            </label>
            <label>Assign to *
              <EmployeeSelect value={form.assignee_id} onChange={(value) => setForm((prev) => ({ ...prev, assignee_id: value }))} employees={employees} departments={departments} required />
            </label>
          </div>
          <div>
            <div className="cl-label">Photos or files to point out the issue</div>
            <FilePicker files={files} onChange={setFiles} />
          </div>
          <label>Due by
            <input type="datetime-local" value={form.due} onChange={set("due")} />
          </label>
          <div className="cl-presets">
            {DUE_PRESETS.map(([label, make]) => <button type="button" key={label} className="audit-btn" onClick={() => setForm((prev) => ({ ...prev, due: localInput(make()) }))}>{label}</button>)}
            {form.due && <button type="button" className="audit-link-danger" onClick={() => setForm((prev) => ({ ...prev, due: "" }))}>No due time</button>}
          </div>
          <p className="fnd-hint">
            {!assignee ? "The task goes straight to their WhatsApp with Processing, Resolved and Forward buttons."
              : assignee.phone ? `${assignee.name} gets it on WhatsApp now, with Processing, Resolved and Forward buttons.`
                : `${assignee.name} has no WhatsApp number yet, so it will only show here. Add it in Employees & Access.`}
          </p>
          {error && <div className="audit-error">{error}</div>}
        </div>
        <div className="fnd-modal-foot">
          <button type="button" className="audit-btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="audit-btn audit-btn-primary" disabled={saving}>{saving ? "Sending…" : "Raise & send"}</button>
        </div>
      </form>
    </div>
  );
}

/* ---------- One task: timeline, forward, notes ---------- */
function TaskDetails({ task, employees, departments, canChange, isAdmin, onUpdate, onResend, onAttach, onDelete, onClose, now }) {
  const [moreFiles, setMoreFiles] = useState([]);
  const [forwardTo, setForwardTo] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [photo, setPhoto] = useState(null);
  const delivery = deliveryOf(task);
  const history = [...(task.history || [])].reverse();
  const photos = [
    ...(task.attachments || []).filter((file) => file.kind === "image").map((file) => ({ url: file.url, caption: `${task.ref} · ${file.name}` })),
    ...(task.notes || []).filter((item) => item.photo).map((item) => ({ url: item.photo, caption: `${task.ref} · ${item.by}` })),
  ];

  const run = async (label, action) => {
    setBusy(label);
    setError("");
    try {
      await action();
      setNote("");
      setForwardTo("");
    } catch (err) {
      setError(err.response?.data?.error || "Could not save");
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="fnd-backdrop" onClick={onClose}>
      <div className="fnd-modal" onClick={(event) => event.stopPropagation()}>
        <div className="fnd-modal-head">
          <div>
            <span className="fnd-ref">{task.ref}</span>
            <h3>{task.title}</h3>
            <p className="fnd-sub">Raised by {task.raised_by} · {when(task.created_at)}</p>
          </div>
          <button type="button" className="fnd-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="fnd-modal-body">
          <div className="fnd-snapshot">
            <div><span>With</span><b>{task.assignee_name || "—"}</b></div>
            <div><span>Status</span><b><span className={`audit-pill fnd-tone-${STATUS_TONE[task.status]}`}>{STATUS_LABEL[task.status]}</span></b></div>
            <div><span>Due</span><b className={isOverdue(task, now) ? "fnd-overdue-text" : ""}>{when(task.due_at)}{isOverdue(task, now) ? " · overdue" : ""}</b></div>
            <div><span>Time taken</span><b>{task.done_at ? between(task.created_at, task.done_at) : `${since(task.created_at, now)} so far`}</b></div>
            {task.details && <p><span>Details</span>{task.details}</p>}
            {(task.caller_name || task.caller_phone || task.location) && (
              <p><span>{task.source}</span>{[task.caller_name, task.caller_phone, task.location].filter(Boolean).join(" · ")}</p>
            )}
          </div>

          {delivery && (
            <div className={`cl-delivery fnd-tone-${delivery.tone}`}>
              <span>{delivery.label}{task.whatsapp_sent_at ? ` · ${when(task.whatsapp_sent_at)}` : ""}</span>
              {delivery.title && <small>{delivery.title}</small>}
              {canChange && isOpen(task) && <button type="button" className="audit-btn" disabled={busy === "resend"} onClick={() => run("resend", () => onResend(task))}>{busy === "resend" ? "Sending…" : "Send again"}</button>}
            </div>
          )}

          {canChange && (
            <div className="cl-actions">
              {isOpen(task) ? <>
                {task.status === "Open" && <button type="button" className="audit-btn" disabled={Boolean(busy)} onClick={() => run("start", () => onUpdate(task, { status: "In Progress", note }))}>Mark processing</button>}
                <button type="button" className="audit-btn fnd-btn-good" disabled={Boolean(busy)} onClick={() => run("done", () => onUpdate(task, { status: "Done", note }))}>{busy === "done" ? "Saving…" : "Mark resolved"}</button>
                <button type="button" className="audit-link-danger" disabled={Boolean(busy)} onClick={() => window.confirm(`Cancel ${task.ref}?`) && run("cancel", () => onUpdate(task, { status: "Cancelled", note }))}>Cancel task</button>
              </> : <button type="button" className="audit-btn" disabled={Boolean(busy)} onClick={() => run("reopen", () => onUpdate(task, { status: "Open", note }))}>Re-open & send again</button>}
              {isAdmin && <button type="button" className="audit-link-danger" onClick={() => onDelete(task)}>Delete</button>}
            </div>
          )}

          {canChange && (
            <div className="cl-forward">
              <label>Note (optional, saved with the next action)
                <textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} placeholder="e.g. Called the site, they need a technician" />
              </label>
              <div className="cl-forward-row">
                {isOpen(task) && <>
                  <EmployeeSelect value={forwardTo} onChange={setForwardTo} employees={employees} departments={departments} exclude={task.assignee_id} />
                  <button type="button" className="audit-btn audit-btn-primary" disabled={!forwardTo || Boolean(busy)} onClick={() => run("forward", () => onUpdate(task, { assignee_id: forwardTo, note }))}>{busy === "forward" ? "Forwarding…" : "Forward"}</button>
                </>}
                <button type="button" className="audit-btn" disabled={!note.trim() || Boolean(busy)} onClick={() => run("note", () => onUpdate(task, { note }))}>Add note</button>
              </div>
            </div>
          )}
          {error && <div className="audit-error">{error}</div>}

          {((task.attachments || []).length > 0 || canChange) && <>
            <h4 className="fnd-timeline-title">Attached files{(task.attachments || []).length ? ` (${task.attachments.length})` : ""}</h4>
            <Attachments task={task} onOpenPhoto={(url) => setPhoto(photos.findIndex((item) => item.url === url))} />
            {canChange && (task.attachments || []).length < 10 && (
              <div className="cl-attach-more">
                <FilePicker files={moreFiles} onChange={setMoreFiles} room={Math.min(MAX_FILES, 10 - (task.attachments || []).length)} />
                {moreFiles.length > 0 && <button type="button" className="audit-btn audit-btn-primary" disabled={Boolean(busy)} onClick={() => run("attach", async () => { await onAttach(task, await Promise.all(moreFiles.map(readFile))); setMoreFiles([]); })}>{busy === "attach" ? "Uploading…" : `Add ${moreFiles.length} file${moreFiles.length === 1 ? "" : "s"}`}</button>}
              </div>
            )}
          </>}

          {(task.notes || []).length > 0 && <>
            <h4 className="fnd-timeline-title">Notes from WhatsApp</h4>
            <ul className="cl-notes">
              {task.notes.map((item, index) => (
                <li key={`${item.at}-${index}`}>
                  <b>{item.by}</b> <small>{when(item.at)}</small>
                  {item.text && <p>{item.text}</p>}
                  {item.photo && <button type="button" className="cl-note-photo" onClick={() => setPhoto(photos.findIndex((p) => p.url === item.photo))}><img src={item.photo} alt="" loading="lazy" /></button>}
                </li>
              ))}
            </ul>
          </>}

          <h4 className="fnd-timeline-title">History</h4>
          <ol className="fnd-timeline">
            {history.map((step, index) => (
              <li key={`${step.at}-${index}`}>
                <div className="fnd-timeline-head">
                  <span className={`audit-pill fnd-tone-${{ done: "good", forwarded: "purple", started: "blue", cancelled: "muted", raised: "warn" }[step.action] || "muted"}`}>{ACTION_LABEL[step.action] || step.action}</span>
                  <b>{step.by}</b>
                  {step.to && <span>→ {step.to}</span>}
                  <span>{when(step.at)}</span>
                </div>
                {step.note && <p>{step.note}</p>}
              </li>
            ))}
          </ol>
        </div>
      </div>
      {photo !== null && photo >= 0 && <ImageViewer images={photos} index={photo} onIndex={setPhoto} onClose={() => setPhoto(null)} />}
    </div>
  );
}

/* ---------- Page ---------- */
export default function CallLogWorkspace({ token, isAdmin, currentUserId, currentUserName, internalUsers, departments, version }) {
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);
  const [tasks, setTasks] = useState([]);
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [toast, setToast] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("OPEN");
  const [personFilter, setPersonFilter] = useState("ALL");
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [onlyMine, setOnlyMine] = useState(false);
  const [raising, setRaising] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [now, setNow] = useState(() => Date.now());

  const notify = useCallback((message, isError = false) => {
    setToast({ message, isError });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const load = useCallback(async () => {
    try {
      const response = await API.get("/internal/call-log", { headers });
      setTasks(response.data.tasks || []);
      setPeople(response.data.people || []);
      setLoadError("");
    } catch (err) {
      setLoadError(err.response?.data?.error || "Could not load the call log.");
    } finally {
      setLoading(false);
      setNow(Date.now());
    }
  }, [headers]);

  // Reloads when the server says something changed (a button tapped on WhatsApp), and every minute for the timers.
  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load, version]);
  useEffect(() => {
    const timer = setInterval(() => { if (document.visibilityState === "visible") load(); }, 60000);
    return () => clearInterval(timer);
  }, [load]);

  const replace = (task) => setTasks((prev) => (prev.some((item) => item.id === task.id) ? prev.map((item) => (item.id === task.id ? { ...item, ...task } : item)) : [task, ...prev]));
  const me = String(currentUserId || "");
  const mine = (task) => String(task.assignee_id) === me || (isAdmin ? task.raised_by_key === "admin" : task.raised_by === currentUserName);
  const canChange = (task) => isAdmin || String(task.assignee_id) === me || task.raised_by === currentUserName;

  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const counts = useMemo(() => {
    const done = tasks.filter((task) => task.status === "Done");
    const recent = done.filter((task) => new Date(task.done_at).getTime() >= now - 30 * 24 * 60 * 60 * 1000);
    const avg = recent.length ? recent.reduce((sum, task) => sum + (new Date(task.done_at) - new Date(task.created_at)), 0) / recent.length : null;
    return {
      open: tasks.filter((task) => task.status === "Open").length,
      progress: tasks.filter((task) => task.status === "In Progress").length,
      overdue: tasks.filter((task) => isOverdue(task, now)).length,
      doneWeek: done.filter((task) => new Date(task.done_at).getTime() >= weekAgo).length,
      avg: avg == null ? "—" : duration(avg),
      notDelivered: tasks.filter((task) => isOpen(task) && ["FAILED", "NO_PHONE"].includes(task.whatsapp_status)).length,
    };
  }, [tasks, now, weekAgo]);

  const query = search.trim().toLowerCase();
  const filtered = tasks.filter((task) =>
    (!query || [task.ref, task.title, task.details, task.caller_name, task.caller_phone, task.location, task.assignee_name, task.raised_by].some((v) => String(v || "").toLowerCase().includes(query)))
    && (statusFilter === "ALL" || (statusFilter === "OPEN" ? isOpen(task) : task.status === statusFilter))
    && (personFilter === "ALL" || task.assignee_name === personFilter)
    && (!onlyOverdue || isOverdue(task, now))
    && (!onlyMine || mine(task))
  );
  const filtersOn = query || statusFilter !== "OPEN" || personFilter !== "ALL" || onlyOverdue || onlyMine;
  const clearFilters = () => { setSearch(""); setStatusFilter("OPEN"); setPersonFilter("ALL"); setOnlyOverdue(false); setOnlyMine(false); };

  const raise = async (payload) => {
    const response = await API.post("/internal/call-log", payload, { headers });
    replace(response.data);
    setRaising(false);
    const task = response.data;
    if (task.file_errors?.length) notify(`${task.ref} raised, but some files weren't attached: ${task.file_errors.join("; ")}`, true);
    else notify(task.whatsapp_status === "SENT" ? `${task.ref} sent to ${task.assignee_name} on WhatsApp` : `${task.ref} raised for ${task.assignee_name}${task.whatsapp_error ? ` · ${task.whatsapp_error}` : ""}`, task.whatsapp_status !== "SENT");
  };
  const attach = async (task, files) => {
    const response = await API.post(`/internal/call-log/${task.id}/attachments`, { files }, { headers });
    replace(response.data.task);
    notify(response.data.file_errors?.length ? `Some files weren't attached: ${response.data.file_errors.join("; ")}`
      : response.data.sent ? `Files added and sent to ${task.assignee_name} on WhatsApp` : `Files added. ${task.assignee_name} gets them on WhatsApp when they next tap a button or message us.`, Boolean(response.data.file_errors?.length));
  };
  const update = async (task, payload) => {
    const response = await API.patch(`/internal/call-log/${task.id}`, payload, { headers });
    replace(response.data);
    notify(payload.assignee_id ? `${task.ref} forwarded to ${response.data.assignee_name}` : payload.status ? `${task.ref} → ${STATUS_LABEL[payload.status]}` : "Note added");
    load();
  };
  const resend = async (task) => {
    const response = await API.post(`/internal/call-log/${task.id}/resend`, {}, { headers });
    replace(response.data.task);
    notify(response.data.ok ? `${task.ref} sent again` : response.data.task.whatsapp_error || "Could not send", !response.data.ok);
  };
  const remove = async (task) => {
    if (!window.confirm(`Delete ${task.ref} "${task.title}"? This can't be undone.`)) return;
    try {
      await API.delete(`/internal/call-log/${task.id}`, { headers });
      setTasks((prev) => prev.filter((item) => item.id !== task.id));
      setOpenId(null);
      notify(`${task.ref} deleted`);
    } catch (err) {
      notify(err.response?.data?.error || "Could not delete", true);
    }
  };

  const assignees = [...new Set(tasks.map((task) => task.assignee_name).filter(Boolean))].sort();
  const withoutPhone = internalUsers.filter((user) => !user.phone).length;
  const openTask = tasks.find((task) => task.id === openId);

  return (
    <div className="audit-workspace fnd-workspace cl-workspace">
      {toast && <div className={`audit-toast ${toast.isError ? "is-error" : ""}`}>{toast.message}</div>}

      <div className="fnd-kpis">
        <div className="fnd-kpi-warn"><span>Open</span><b>{counts.open}</b><small>Not picked up yet</small></div>
        <div className="fnd-kpi-blue"><span>Processing</span><b>{counts.progress}</b><small>Being worked on</small></div>
        <button type="button" className={`fnd-kpi-bad ${onlyOverdue ? "is-active" : ""}`} onClick={() => setOnlyOverdue((v) => !v)}>
          <span>Overdue</span><b>{counts.overdue}</b><small>{onlyOverdue ? "Showing overdue · tap to clear" : "Past due time · tap to show"}</small>
        </button>
        <div className="fnd-kpi-good"><span>Resolved this week</span><b>{counts.doneWeek}</b><small>Last 7 days</small></div>
        <div className="fnd-kpi-purple"><span>Avg. time to resolve</span><b>{counts.avg}</b><small>Raised → resolved, last 30 days</small></div>
        <div><span>Not delivered</span><b>{counts.notDelivered}</b><small>WhatsApp didn't reach them</small></div>
      </div>

      {isAdmin && withoutPhone > 0 && (
        <div className="cl-banner">📱 {withoutPhone} employee{withoutPhone === 1 ? " has" : "s have"} no WhatsApp number, so tasks can't reach them on WhatsApp. Add numbers in <b>Employees & Access</b>.</div>
      )}

      <section className="audit-card fnd-controls">
        <div className="audit-toolbar">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search task, caller, location, person or ref" />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Status">
            <option value="OPEN">Open & processing</option>
            <option value="ALL">All statuses</option>
            {STATUSES.map((status) => <option key={status} value={status}>{STATUS_LABEL[status]}</option>)}
          </select>
          <select value={personFilter} onChange={(e) => setPersonFilter(e.target.value)} aria-label="With">
            <option value="ALL">Everyone</option>
            {assignees.map((name) => <option key={name}>{name}</option>)}
          </select>
          <label className="audit-check fnd-mine"><input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} /> Mine</label>
          {filtersOn && <button type="button" className="audit-btn" onClick={clearFilters}>Clear</button>}
          <button type="button" className="audit-btn audit-btn-primary cl-raise" onClick={() => setRaising(true)}>+ Raise task</button>
        </div>
      </section>

      <section className="audit-card">
        <div className="audit-card-head">
          <div><h3>Tasks & concerns</h3><p>Showing {filtered.length} of {tasks.length}</p></div>
        </div>
        {loading ? <p className="audit-empty">Loading…</p>
          : loadError ? <div className="audit-error">{loadError} <button type="button" className="audit-btn" onClick={load}>Retry</button></div>
          : filtered.length ? (
            <div className="fnd-list">
              {filtered.map((task) => {
                const overdue = isOverdue(task, now);
                const delivery = deliveryOf(task);
                return (
                  <article key={task.id} className={`fnd-item cl-item ${overdue ? "is-overdue" : ""}`}>
                    <div className="fnd-item-main">
                      <div className="fnd-item-top">
                        <span className="fnd-ref">{task.ref}</span>
                        <span className={`audit-pill fnd-tone-${STATUS_TONE[task.status]}`}>{STATUS_LABEL[task.status]}</span>
                        {task.priority !== "Normal" && <span className={`audit-pill fnd-tone-${PRIORITY_TONE[task.priority]}`}>{task.priority}</span>}
                        {overdue && <span className="audit-pill fnd-tone-bad">Overdue</span>}
                        {task.forward_count > 0 && <span className="audit-pill fnd-tone-purple">↪ Forwarded {task.forward_count}×</span>}
                        {(task.attachments || []).length > 0 && <span className="audit-pill fnd-tone-muted" title="Attached files">📎 {task.attachments.length}</span>}
                        {delivery && <span className={`cl-wa fnd-tone-${delivery.tone}`} title={delivery.title || ""}>{delivery.label}</span>}
                      </div>
                      <button type="button" className="fnd-title" onClick={() => setOpenId(task.id)}>{task.title}</button>
                      {task.details && <p className="fnd-desc">{task.details}</p>}
                      <div className="fnd-meta">
                        <span>With <b>{task.assignee_name || "—"}</b></span>
                        <span>{task.source}{task.caller_name ? ` · ${task.caller_name}` : ""}</span>
                        {task.location && <span>📍 {task.location}</span>}
                        <span>Raised by {task.raised_by} · {since(task.created_at, now)} ago</span>
                        {task.due_at && <span className={overdue ? "fnd-overdue-text" : ""}>Due {when(task.due_at)}</span>}
                      </div>
                      <div className="cl-timing">
                        {task.status === "Done" ? <>✅ Resolved by {task.done_by} in <b>{between(task.created_at, task.done_at)}</b></>
                          : task.status === "Cancelled" ? "Cancelled"
                            : <>⏱ Open for <b>{since(task.created_at, now)}</b>{task.started_at ? ` · processing ${between(task.assigned_at, task.started_at)} after it reached ${task.assignee_name}` : task.assigned_at ? ` · with ${task.assignee_name} for ${since(task.assigned_at, now)}, not picked up` : ""}</>}
                      </div>
                    </div>
                    <div className="fnd-item-side">
                      <button type="button" className="audit-btn" onClick={() => setOpenId(task.id)}>Details{(task.notes || []).length ? ` · ${task.notes.length} note${task.notes.length === 1 ? "" : "s"}` : ""}</button>
                      {canChange(task) && isOpen(task) && <button type="button" className="audit-btn fnd-btn-good" onClick={() => update(task, { status: "Done" }).catch((err) => notify(err.response?.data?.error || "Could not update", true))}>Mark resolved</button>}
                      {canChange(task) && isOpen(task) && ["FAILED", "NO_PHONE"].includes(task.whatsapp_status) && <button type="button" className="audit-btn" onClick={() => resend(task).catch((err) => notify(err.response?.data?.error || "Could not send", true))}>Send again</button>}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="audit-empty fnd-empty">
              <b>{tasks.length ? "Nothing matches these filters" : "No tasks yet"}</b>
              <span>{tasks.length ? "Clear the filters, or look at all statuses." : "Raise the first task: it goes straight to the employee's WhatsApp."}</span>
              {tasks.length ? <button type="button" className="audit-btn" onClick={clearFilters}>Clear filters</button>
                : <button type="button" className="audit-btn audit-btn-primary" onClick={() => setRaising(true)}>+ Raise task</button>}
            </div>
          )}
      </section>

      {people.length > 0 && (
        <section className="audit-card">
          <div className="audit-card-head">
            <div><h3>Who's doing what</h3><p>Time is counted from when the task reached each person</p></div>
          </div>
          <div className="cl-people-wrap">
            <table className="cl-people">
              <thead>
                <tr><th>Employee</th><th>With them now</th><th>Overdue</th><th>Resolved</th><th>Avg. time to pick up</th><th>Avg. time to resolve</th><th>On time</th><th>Forwarded on</th></tr>
              </thead>
              <tbody>
                {people.map((person) => (
                  <tr key={person.name}>
                    <td><button type="button" className="cl-person" onClick={() => { setPersonFilter(person.name); setStatusFilter("ALL"); }}>{person.name}</button></td>
                    <td>{person.open}</td>
                    <td className={person.overdue ? "fnd-overdue-text" : ""}>{person.overdue}</td>
                    <td>{person.done}</td>
                    <td>{person.avg_start_ms == null ? "—" : duration(person.avg_start_ms)}</td>
                    <td>{person.avg_done_ms == null ? "—" : duration(person.avg_done_ms)}</td>
                    <td>{person.on_time_rate == null ? "—" : `${person.on_time_rate}%`}</td>
                    <td>{person.forwarded}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {raising && <NewTask employees={internalUsers} departments={departments} onSave={raise} onClose={() => setRaising(false)} />}
      {openTask && (
        <TaskDetails
          key={openTask.id}
          task={openTask}
          employees={internalUsers}
          departments={departments}
          canChange={canChange(openTask)}
          isAdmin={isAdmin}
          onUpdate={update}
          onResend={resend}
          onAttach={attach}
          onDelete={remove}
          onClose={() => setOpenId(null)}
          now={now}
        />
      )}
    </div>
  );
}
