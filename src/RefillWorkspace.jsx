import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";

/* Refill Schedule: sites get refill days/times, refillers get WhatsApp reminders,
   and prove each refill with a photo; supervisors verify them here. */

const API = axios.create({ baseURL: "https://whatsapp-bot-backend-b3nb.onrender.com" });
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const STATUS = {
  scheduled: { label: "Scheduled", tone: "grey" },
  done: { label: "Photo sent · verify", tone: "blue" },
  verified: { label: "Verified", tone: "green" },
  rejected: { label: "Rejected · redo", tone: "red" },
  missed: { label: "Missed", tone: "amber" },
};
const REJECT_REASONS = ["Photo is blurry", "Machine not fully stocked", "Wrong site / machine", "Old or reused photo", "Spirals not visible"];

function prettyTime(time) {
  if (!time) return "";
  const [hh, mm] = time.split(":").map(Number);
  return `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, "0")} ${hh < 12 ? "AM" : "PM"}`;
}
function prettyDate(dateStr, withYear = false) {
  const date = new Date(`${dateStr}T00:00:00`);
  return date.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}) });
}
function shiftDate(dateStr, days) {
  const date = new Date(`${dateStr}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
function clock(value) {
  return value ? new Date(value).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }) : "";
}
function lateLabel(task, grace) {
  if (task.unscheduled) return { text: "Extra visit", tone: "grey" };
  const late = Number(task.minutes_late);
  if (!Number.isFinite(late)) return null;
  if (late <= 0) return { text: late < -60 ? `${Math.round(-late / 60)} h early` : "On time", tone: "green" };
  if (late <= grace) return { text: `${late} min after · in window`, tone: "green" };
  return { text: late >= 120 ? `${Math.floor(late / 60)} h ${late % 60} min late` : `${late} min late`, tone: "red" };
}
function scheduleSummary(schedule) {
  if (!schedule) return null;
  const when = schedule.mode === "interval"
    ? `Every ${schedule.interval_days} day${schedule.interval_days === 1 ? "" : "s"}`
    : schedule.days.length === 7 ? "Every day" : WEEK_ORDER.filter((day) => schedule.days.includes(day)).map((day) => DAY_NAMES[day]).join(", ");
  return `${when} · ${schedule.times.map(prettyTime).join(", ")}`;
}

function Chip({ tone, children }) {
  return <span className={`rf-chip rf-${tone}`}>{children}</span>;
}

function Lightbox({ photos, index, onClose, onIndex }) {
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight") onIndex((i) => Math.min(photos.length - 1, i + 1));
      if (event.key === "ArrowLeft") onIndex((i) => Math.max(0, i - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [photos.length, onClose, onIndex]);
  const photo = photos[index];
  if (!photo) return null;
  return (
    <div className="tc-lightbox" onClick={onClose}>
      <div className="tc-lightbox-bar" onClick={(event) => event.stopPropagation()}>
        <span>Received {new Date(photo.at).toLocaleString("en-IN")} · {index + 1} / {photos.length}</span>
        <a href={photo.url} target="_blank" rel="noreferrer">Open original</a>
        <button type="button" onClick={onClose} aria-label="Close">✕</button>
      </div>
      {index > 0 && <button type="button" className="tc-lightbox-nav is-prev" onClick={(event) => { event.stopPropagation(); onIndex(index - 1); }}>‹</button>}
      <img src={photo.url} alt="" onClick={(event) => event.stopPropagation()} />
      {index < photos.length - 1 && <button type="button" className="tc-lightbox-nav is-next" onClick={(event) => { event.stopPropagation(); onIndex(index + 1); }}>›</button>}
    </div>
  );
}

/* ---------- Today board ---------- */

function TaskRow({ task, grace, onAction, onPhotos, busy }) {
  const status = STATUS[task.status] || STATUS.scheduled;
  const late = ["done", "verified"].includes(task.status) ? lateLabel(task, grace) : null;
  const photos = task.photos || [];
  return (
    <div className={`rf-task rf-task-${task.status}`}>
      <div className="rf-task-time"><b>{prettyTime(task.due_time)}</b>{task.unscheduled && <small>extra</small>}</div>
      <div className="rf-task-main">
        <b>{task.location_name}</b>
        <span>
          {task.machine_code ? `${task.machine_code} · ` : ""}
          {task.completed_at ? `Photo at ${clock(task.completed_at)}` : task.hour_before_sent_at ? `Reminded ${clock(task.hour_before_sent_at)}` : task.day_before_sent_at ? "Reminded the day before" : "Not reminded yet"}
          {task.notes ? ` · ${task.notes}` : ""}
        </span>
        {task.reminder_error && <span className="rf-error-line">Reminder failed: {task.reminder_error}</span>}
        {task.status === "rejected" && task.reject_reason && <span className="rf-error-line">Rejected: {task.reject_reason}</span>}
      </div>
      {photos.length > 0 && (
        <button type="button" className="rf-thumb" onClick={() => onPhotos(photos, 0)}>
          <img src={photos[0].url} alt="" loading="lazy" />
          {photos.length > 1 && <i>+{photos.length - 1}</i>}
        </button>
      )}
      <div className="rf-task-side">
        <Chip tone={status.tone}>{status.label}</Chip>
        {late && <Chip tone={late.tone}>{late.text}</Chip>}
        <div className="rf-task-actions">
          {task.status === "done" && <button type="button" className="rf-ok" disabled={busy} onClick={() => onAction(task, "verify")}>Verify</button>}
          {["scheduled", "missed", "rejected"].includes(task.status) && <button type="button" disabled={busy} onClick={() => onAction(task, "remind")}>Remind</button>}
          {task.status === "scheduled" && <button type="button" className="rf-muted" disabled={busy} onClick={() => onAction(task, "cancel")}>Cancel</button>}
          {["verified", "missed"].includes(task.status) && <button type="button" className="rf-muted" disabled={busy} onClick={() => onAction(task, "reopen")}>Reopen</button>}
        </div>
      </div>
    </div>
  );
}

function OneOffForm({ locations, date, onSave, onClose }) {
  const [draft, setDraft] = useState({ location_id: "", due_date: date, due_time: "10:00", notes: "" });
  const [error, setError] = useState("");
  const submit = async (event) => {
    event.preventDefault();
    if (!draft.location_id) return setError("Choose a site");
    try {
      await onSave(draft);
    } catch (err) {
      setError(err.response?.data?.error || "Could not add the visit");
    }
  };
  const byRefiller = useMemo(() => {
    const groups = new Map();
    locations.forEach((site) => groups.set(site.refiller_name || "No refiller", [...(groups.get(site.refiller_name || "No refiller") || []), site]));
    return [...groups];
  }, [locations]);
  return (
    <div className="upi-scan-backdrop" onClick={onClose}>
      <form className="rf-modal" onClick={(event) => event.stopPropagation()} onSubmit={submit}>
        <div className="upi-scan-head"><div><h3>One-off refill visit</h3><p>For an extra visit outside the regular schedule</p></div><button type="button" className="upi-scan-close" onClick={onClose}>✕</button></div>
        <div className="rf-modal-body">
          <label>Site<select value={draft.location_id} onChange={(event) => setDraft({ ...draft, location_id: event.target.value })}>
            <option value="">Choose a site…</option>
            {byRefiller.map(([refiller, sites]) => <optgroup key={refiller} label={refiller}>{sites.map((site) => <option key={site.id} value={site.id}>{site.name}{site.machine_code ? ` (${site.machine_code})` : ""}</option>)}</optgroup>)}
          </select></label>
          <div className="rf-two">
            <label>Date<input type="date" value={draft.due_date} onChange={(event) => setDraft({ ...draft, due_date: event.target.value })} /></label>
            <label>Time<input type="time" value={draft.due_time} onChange={(event) => setDraft({ ...draft, due_time: event.target.value })} /></label>
          </div>
          <label>Note for the refiller (optional)<input value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} placeholder="e.g. Restock chips and cold drinks" /></label>
          <p className="rf-hint">The site's refiller gets reminders like any scheduled visit.</p>
          {error && <div className="ea-error">{error}</div>}
        </div>
        <div className="rf-modal-foot"><button type="button" onClick={onClose}>Cancel</button><button type="submit" className="primary">Add visit</button></div>
      </form>
    </div>
  );
}

function TodayBoard({ data, date, setDate, onAction, onPhotos, busy, onAddVisit }) {
  const grace = Number(data.settings.grace_minutes) || 120;
  const tasks = data.tasks;
  const count = (status) => tasks.filter((task) => task.status === status).length;
  const due = tasks.filter((task) => !task.unscheduled && (new Date(task.due_at) <= new Date() || ["done", "verified"].includes(task.status)));
  const completedDue = due.filter((task) => ["done", "verified"].includes(task.status));
  const onTime = completedDue.filter((task) => Number(task.minutes_late) <= grace).length;
  const groups = useMemo(() => {
    const map = new Map();
    tasks.forEach((task) => map.set(task.refiller_name || "No refiller assigned", [...(map.get(task.refiller_name || "No refiller assigned") || []), task]));
    return [...map].sort(([a], [b]) => a.localeCompare(b));
  }, [tasks]);
  const noPhone = data.refillers.filter((refiller) => !String(refiller.phone || "").replace(/\D/g, "") && tasks.some((task) => task.refiller_name === refiller.name));

  return (
    <div className="audit-stack">
      <div className="rf-daybar">
        <button type="button" onClick={() => setDate(shiftDate(date, -1))} aria-label="Previous day">‹</button>
        <div><b>{date === data.today ? "Today" : date === shiftDate(data.today, 1) ? "Tomorrow" : date === shiftDate(data.today, -1) ? "Yesterday" : prettyDate(date)}</b><span>{prettyDate(date, true)}</span></div>
        <button type="button" onClick={() => setDate(shiftDate(date, 1))} aria-label="Next day">›</button>
        <input type="date" value={date} onChange={(event) => event.target.value && setDate(event.target.value)} aria-label="Pick a date" />
        {date !== data.today && <button type="button" className="rf-link" onClick={() => setDate(data.today)}>Back to today</button>}
        <button type="button" className="rf-primary" onClick={onAddVisit}>+ One-off visit</button>
      </div>

      <div className="rf-kpis">
        <div><span>Visits</span><b>{tasks.length}</b><small>{count("scheduled")} still to do</small></div>
        <div className="is-blue"><span>To verify</span><b>{count("done")}</b><small>photo received</small></div>
        <div className="is-green"><span>Verified</span><b>{count("verified")}</b></div>
        <div className="is-amber"><span>Missed</span><b>{count("missed")}</b><small>no photo in time</small></div>
        <div><span>On time</span><b>{completedDue.length ? `${Math.round((onTime / completedDue.length) * 100)}%` : "—"}</b><small>{due.length ? `${completedDue.length}/${due.length} due visits done` : "nothing due yet"}</small></div>
      </div>

      {noPhone.length > 0 && <div className="ea-error">No WhatsApp number saved for {noPhone.map((refiller) => refiller.name).join(", ")}, so they won't get reminders. Add it under Refill Audit → Refillers.</div>}

      {groups.length ? groups.map(([refiller, list]) => {
        const done = list.filter((task) => ["done", "verified"].includes(task.status)).length;
        return (
          <section key={refiller} className="audit-card rf-group">
            <div className="rf-group-head">
              <span className="ea-avatar">{refiller.slice(0, 1)}</span>
              <div><h3>{refiller}</h3><p>{list.length} visit{list.length === 1 ? "" : "s"} · {done} done</p></div>
              <div className="rf-progress"><i style={{ width: `${list.length ? (done / list.length) * 100 : 0}%` }} /></div>
            </div>
            {list.map((task) => <TaskRow key={task.id} task={task} grace={grace} onAction={onAction} onPhotos={onPhotos} busy={busy} />)}
          </section>
        );
      }) : (
        <section className="audit-card rf-empty">
          <b>No refill visits on this day.</b>
          <span>{data.locations.some((site) => site.schedule) ? "No site is scheduled for this day." : "Set refill days and times for each site in the Schedules tab to get started."}</span>
        </section>
      )}
    </div>
  );
}

/* ---------- Verify ---------- */

function VerifyCard({ task, grace, onDecide, onPhotos }) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const late = lateLabel(task, grace);
  const photos = task.photos || [];
  const decide = async (action) => {
    setBusy(true);
    try {
      await onDecide(task, action, reason);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={`rf-verify-card rf-task-${task.status}`}>
      <div className="rf-verify-photos">
        {photos.map((photo, index) => (
          <button type="button" key={photo.url} onClick={() => onPhotos(photos, index)}><img src={photo.url} alt="" loading="lazy" /></button>
        ))}
      </div>
      <div className="rf-verify-info">
        <div className="rf-verify-title">
          <b>{task.location_name}</b>
          {task.machine_code && <span>{task.machine_code}</span>}
        </div>
        <dl>
          <div><dt>Refiller</dt><dd>{task.refiller_name || "—"}</dd></div>
          <div><dt>Scheduled</dt><dd>{task.unscheduled ? "Not scheduled (extra visit)" : `${prettyDate(task.due_date)} · ${prettyTime(task.due_time)}`}</dd></div>
          <div><dt>Photo received</dt><dd>{task.completed_at ? new Date(task.completed_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "—"}</dd></div>
          <div><dt>Timing</dt><dd>{late ? <Chip tone={late.tone}>{late.text}</Chip> : "—"}</dd></div>
          {task.rejected_count > 0 && <div><dt>Earlier</dt><dd>Rejected {task.rejected_count}× before</dd></div>}
          {task.status !== "done" && <div><dt>Decision</dt><dd>{task.status === "verified" ? "✅ Verified" : `❌ ${task.reject_reason || "Rejected"}`} by {task.verified_by} · {clock(task.verified_at)}</dd></div>}
        </dl>
        {task.status === "done" && (rejecting ? (
          <div className="rf-reject">
            <div className="rf-reasons">{REJECT_REASONS.map((text) => <button type="button" key={text} className={reason === text ? "on" : ""} onClick={() => setReason(text)}>{text}</button>)}</div>
            <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason sent to the refiller on WhatsApp" autoFocus />
            <div className="rf-verify-actions">
              <button type="button" onClick={() => { setRejecting(false); setReason(""); }}>Back</button>
              <button type="button" className="rf-danger" disabled={busy || !reason.trim()} onClick={() => decide("reject")}>Reject & tell refiller</button>
            </div>
          </div>
        ) : (
          <div className="rf-verify-actions">
            <button type="button" className="rf-danger-ghost" onClick={() => setRejecting(true)}>Reject</button>
            <button type="button" className="rf-ok" disabled={busy} onClick={() => decide("verify")}>✓ Verify refill</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function VerifyTab({ headers, grace, onPhotos, onChanged, notify }) {
  const [filter, setFilter] = useState("done");
  const [tasks, setTasks] = useState(null);
  const [error, setError] = useState("");
  const authorization = headers.Authorization;

  const load = useCallback(async () => {
    try {
      const response = await API.get("/refills/verify", { headers: { Authorization: authorization }, params: { status: filter } });
      setTasks(response.data || []);
      setError("");
    } catch (err) {
      setError(err.response?.data?.error || "Could not load refills");
    }
  }, [authorization, filter]);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    const refresh = setInterval(load, 30000);
    return () => { clearTimeout(timer); clearInterval(refresh); };
  }, [load]);

  const decide = async (task, action, reason) => {
    try {
      await API.patch(`/refills/tasks/${task.id}`, { action, reason }, { headers: { Authorization: authorization } });
      notify(action === "verify" ? `Verified ${task.location_name}` : `Rejected. ${task.refiller_name || "The refiller"} was told on WhatsApp.`);
      setTasks((list) => list.filter((item) => item.id !== task.id));
      onChanged();
    } catch (err) {
      notify(err.response?.data?.error || "Could not save", true);
    }
  };

  const verifyAll = async () => {
    if (!window.confirm(`Verify all ${tasks.length} refills shown? Check the photos first.`)) return;
    const response = await API.post("/refills/tasks/verify-many", { ids: tasks.map((task) => task.id) }, { headers: { Authorization: authorization } });
    notify(`Verified ${response.data.verified} refills`);
    load();
    onChanged();
  };

  return (
    <div className="audit-stack">
      <div className="rf-toolbar">
        <div className="ea-filters">
          {[["done", "Waiting for check"], ["verified", "Verified (14 days)"], ["rejected", "Rejected (14 days)"]].map(([key, label]) => (
            <button type="button" key={key} className={filter === key ? "active" : ""} onClick={() => setFilter(key)}>{label}</button>
          ))}
        </div>
        {filter === "done" && tasks?.length > 1 && <button type="button" className="rf-ghost" onClick={verifyAll}>Verify all {tasks.length}</button>}
      </div>
      {error && <div className="ea-error">{error}</div>}
      {!tasks ? <div className="ea-loading">Loading…</div> : tasks.length ? (
        <div className="rf-verify-list">{tasks.map((task) => <VerifyCard key={task.id} task={task} grace={grace} onDecide={decide} onPhotos={onPhotos} />)}</div>
      ) : (
        <section className="audit-card rf-empty"><b>{filter === "done" ? "All caught up 🎉" : "Nothing here yet"}</b><span>{filter === "done" ? "New refill photos from WhatsApp will appear here." : "Decisions from the last 14 days show here."}</span></section>
      )}
    </div>
  );
}

/* ---------- Schedules ---------- */

function ScheduleEditor({ sites, refillers, onSave, onRemove, onClose }) {
  const first = sites[0];
  const existing = sites.length === 1 ? first.schedule : null;
  const [draft, setDraft] = useState(() => ({
    mode: existing?.mode || "weekly",
    days: existing?.days || [1, 2, 3, 4, 5, 6],
    interval_days: existing?.interval_days || 2,
    start_date: existing?.start_date || new Date().toISOString().slice(0, 10),
    times: existing?.times?.length ? existing.times : ["10:00"],
    refiller_id: existing?.refiller_id || "",
    notes: existing?.notes || "",
    active: existing ? existing.active : true,
  }));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const toggleDay = (day) => setDraft((current) => ({ ...current, days: current.days.includes(day) ? current.days.filter((d) => d !== day) : [...current.days, day] }));
  const setTime = (index, value) => setDraft((current) => ({ ...current, times: current.times.map((time, i) => (i === index ? value : time)) }));

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await onSave({ ...draft, refiller_id: draft.refiller_id || null, times: draft.times.filter(Boolean) });
    } catch (err) {
      setError(err.response?.data?.error || "Could not save");
      setSaving(false);
    }
  };

  return (
    <div className="upi-scan-backdrop" onClick={onClose}>
      <form className="rf-modal" onClick={(event) => event.stopPropagation()} onSubmit={submit}>
        <div className="upi-scan-head">
          <div><h3>{sites.length === 1 ? first.name : `Schedule for ${sites.length} sites`}</h3><p>{sites.length === 1 ? `${first.refiller_name || "No refiller"}${first.machine_code ? ` · ${first.machine_code}` : ""}` : sites.map((site) => site.name).join(", ").slice(0, 120)}</p></div>
          <button type="button" className="upi-scan-close" onClick={onClose}>✕</button>
        </div>
        <div className="rf-modal-body">
          <div className="rf-segment">
            <button type="button" className={draft.mode === "weekly" ? "on" : ""} onClick={() => setDraft({ ...draft, mode: "weekly" })}>On set days</button>
            <button type="button" className={draft.mode === "interval" ? "on" : ""} onClick={() => setDraft({ ...draft, mode: "interval" })}>Every few days</button>
          </div>
          {draft.mode === "weekly" ? (
            <div>
              <div className="rf-label">Days</div>
              <div className="rf-days">
                {WEEK_ORDER.map((day) => <button type="button" key={day} className={draft.days.includes(day) ? "on" : ""} onClick={() => toggleDay(day)}>{DAY_NAMES[day]}</button>)}
              </div>
              <div className="rf-quick">
                <button type="button" onClick={() => setDraft({ ...draft, days: [0, 1, 2, 3, 4, 5, 6] })}>Every day</button>
                <button type="button" onClick={() => setDraft({ ...draft, days: [1, 2, 3, 4, 5] })}>Mon–Fri</button>
                <button type="button" onClick={() => setDraft({ ...draft, days: [1, 2, 3, 4, 5, 6] })}>Mon–Sat</button>
                <button type="button" onClick={() => setDraft({ ...draft, days: [1, 3, 5] })}>Mon, Wed, Fri</button>
              </div>
            </div>
          ) : (
            <div className="rf-two">
              <label>Every<select value={draft.interval_days} onChange={(event) => setDraft({ ...draft, interval_days: Number(event.target.value) })}>{[1, 2, 3, 4, 5, 6, 7, 10, 14].map((n) => <option key={n} value={n}>{n} day{n === 1 ? "" : "s"}</option>)}</select></label>
              <label>Starting<input type="date" value={draft.start_date} onChange={(event) => setDraft({ ...draft, start_date: event.target.value })} /></label>
            </div>
          )}
          <div>
            <div className="rf-label">Refill time{draft.times.length > 1 ? "s" : ""} <small>(India time)</small></div>
            <div className="rf-times">
              {draft.times.map((time, index) => (
                <span key={index}>
                  <input type="time" value={time} onChange={(event) => setTime(index, event.target.value)} />
                  {draft.times.length > 1 && <button type="button" onClick={() => setDraft({ ...draft, times: draft.times.filter((_, i) => i !== index) })} aria-label="Remove time">✕</button>}
                </span>
              ))}
              {draft.times.length < 4 && <button type="button" className="rf-add-time" onClick={() => setDraft({ ...draft, times: [...draft.times, "17:00"] })}>+ Another time</button>}
            </div>
          </div>
          {sites.length === 1 && (
            <label>Refiller for this site<select value={draft.refiller_id} onChange={(event) => setDraft({ ...draft, refiller_id: event.target.value })}>
              <option value="">{first.refiller_name ? `${first.refiller_name} (site's refiller)` : "Site's refiller"}</option>
              {refillers.filter((refiller) => refiller.id !== first.refiller_id).map((refiller) => <option key={refiller.id} value={refiller.id}>{refiller.name} (cover)</option>)}
            </select></label>
          )}
          <label>Note shown to supervisors (optional)<input value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} placeholder="e.g. Office closed on Sundays" /></label>
          <label className="rf-switch"><input type="checkbox" checked={draft.active} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} /> Schedule is active {draft.active ? "" : "(paused: no visits or reminders)"}</label>
          {error && <div className="ea-error">{error}</div>}
        </div>
        <div className="rf-modal-foot">
          {existing && onRemove && <button type="button" className="rf-danger-ghost" onClick={onRemove}>Remove schedule</button>}
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" className="primary" disabled={saving}>{saving ? "Saving…" : "Save schedule"}</button>
        </div>
      </form>
    </div>
  );
}

function SchedulesTab({ data, headers, onChanged, notify }) {
  const [refillerFilter, setRefillerFilter] = useState("all");
  const [onlyUnscheduled, setOnlyUnscheduled] = useState(false);
  const [selected, setSelected] = useState([]);
  const [editing, setEditing] = useState(null);
  const config = { headers };

  const sites = data.locations.filter((site) => (refillerFilter === "all" || (site.refiller_name || "none") === refillerFilter) && (!onlyUnscheduled || !site.schedule));
  const groups = useMemo(() => {
    const map = new Map();
    sites.forEach((site) => map.set(site.refiller_name || "No refiller", [...(map.get(site.refiller_name || "No refiller") || []), site]));
    return [...map];
  }, [sites]);
  const scheduledCount = data.locations.filter((site) => site.schedule?.active).length;
  const toggle = (id) => setSelected((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));

  const save = async (draft) => {
    const targets = editing;
    if (targets.length === 1) await API.put(`/refills/schedules/${targets[0].id}`, draft, config);
    else await API.post("/refills/schedules/bulk", { ...draft, location_ids: targets.map((site) => site.id) }, config);
    notify(targets.length === 1 ? `Schedule saved for ${targets[0].name}` : `Schedule saved for ${targets.length} sites`);
    setEditing(null);
    setSelected([]);
    onChanged();
  };

  const remove = async () => {
    const site = editing[0];
    if (!window.confirm(`Remove the refill schedule of ${site.name}? Upcoming visits are cancelled.`)) return;
    await API.delete(`/refills/schedules/${site.id}`, config);
    notify(`Schedule removed for ${site.name}`);
    setEditing(null);
    onChanged();
  };

  return (
    <div className="audit-stack">
      <div className="rf-toolbar">
        <select value={refillerFilter} onChange={(event) => setRefillerFilter(event.target.value)} aria-label="Refiller">
          <option value="all">All refillers ({data.locations.length} sites)</option>
          {data.refillers.map((refiller) => <option key={refiller.id} value={refiller.name}>{refiller.name}</option>)}
          <option value="none">No refiller</option>
        </select>
        <label className="rf-switch"><input type="checkbox" checked={onlyUnscheduled} onChange={(event) => setOnlyUnscheduled(event.target.checked)} /> Only sites without a schedule</label>
        <span className="rf-count">{scheduledCount} of {data.locations.length} sites scheduled</span>
        {selected.length > 0 && <button type="button" className="rf-primary" onClick={() => setEditing(data.locations.filter((site) => selected.includes(site.id)))}>Set schedule for {selected.length} selected</button>}
      </div>

      {groups.map(([refiller, list]) => {
        const allSelected = list.every((site) => selected.includes(site.id));
        return (
          <section key={refiller} className="audit-card rf-group">
            <div className="rf-group-head">
              <label className="rf-check"><input type="checkbox" checked={allSelected} onChange={() => setSelected((current) => (allSelected ? current.filter((id) => !list.some((site) => site.id === id)) : [...new Set([...current, ...list.map((site) => site.id)])]))} /></label>
              <div><h3>{refiller}</h3><p>{list.length} site{list.length === 1 ? "" : "s"} · {list.filter((site) => site.schedule?.active).length} scheduled</p></div>
            </div>
            <div className="rf-sites">
              {list.map((site) => (
                <div key={site.id} className={`rf-site ${selected.includes(site.id) ? "is-selected" : ""}`}>
                  <label className="rf-check"><input type="checkbox" checked={selected.includes(site.id)} onChange={() => toggle(site.id)} /></label>
                  <div className="rf-site-main">
                    <b>{site.name}</b>
                    {site.schedule ? (
                      <span className={site.schedule.active ? "" : "is-paused"}>{site.schedule.active ? "🗓 " : "⏸ Paused · "}{scheduleSummary(site.schedule)}{site.schedule.refiller_id ? ` · covered by ${data.refillers.find((refiller) => refiller.id === site.schedule.refiller_id)?.name || "another refiller"}` : ""}</span>
                    ) : <span className="is-none">No schedule yet</span>}
                  </div>
                  <button type="button" onClick={() => setEditing([site])}>{site.schedule ? "Edit" : "Set schedule"}</button>
                </div>
              ))}
            </div>
          </section>
        );
      })}

      {editing && <ScheduleEditor sites={editing} refillers={data.refillers} onSave={save} onRemove={editing.length === 1 ? remove : null} onClose={() => setEditing(null)} />}
    </div>
  );
}

/* ---------- Performance ---------- */

function PerformanceTab({ headers, today }) {
  const [month, setMonth] = useState(today.slice(0, 7));
  const [stats, setStats] = useState(null);
  const authorization = headers.Authorization;
  useEffect(() => {
    let alive = true;
    API.get("/refills/stats", { headers: { Authorization: authorization }, params: { month } })
      .then((response) => { if (alive) setStats(response.data); })
      .catch(() => { if (alive) setStats({ rows: [] }); });
    return () => { alive = false; };
  }, [authorization, month]);

  const rows = (stats?.rows || []).map((row) => ({
    ...row,
    completion: row.due ? Math.round((row.completed / row.due) * 100) : null,
    punctual: row.completed ? Math.round((row.on_time / row.completed) * 100) : null,
  })).sort((a, b) => (b.completion ?? -1) - (a.completion ?? -1) || (b.punctual ?? -1) - (a.punctual ?? -1));
  const pct = (value) => (value === null ? "—" : `${value}%`);
  const tone = (value) => (value === null ? "" : value >= 90 ? "good" : value >= 70 ? "warn" : "bad");

  return (
    <div className="audit-stack">
      <div className="rf-toolbar">
        <input type="month" value={month} onChange={(event) => event.target.value && setMonth(event.target.value)} aria-label="Month" />
        <span className="rf-count">Completion = refills with a photo ÷ visits due. On time = photo within {stats?.grace ?? 120} min of the scheduled time.</span>
      </div>
      {!stats ? <div className="ea-loading">Loading…</div> : rows.length ? (
        <section className="audit-card">
          <div className="ootm-table-wrap">
            <table className="ootm-table rf-perf">
              <thead><tr><th>Refiller</th><th>Visits due</th><th>Completion</th><th>On time</th><th>Missed</th><th>Rejected</th><th>Extra visits</th><th>Avg. delay</th></tr></thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.refiller_name}>
                    <td data-label="Refiller"><b>{row.refiller_name}</b><small>{row.refiller_phone}</small></td>
                    <td data-label="Visits due">{row.due}</td>
                    <td data-label="Completion"><div className="rf-bar"><i className={tone(row.completion)} style={{ width: `${(row.completion || 0) * 0.7}px` }} /><span>{pct(row.completion)}</span></div></td>
                    <td data-label="On time"><div className="rf-bar"><i className={tone(row.punctual)} style={{ width: `${(row.punctual || 0) * 0.7}px` }} /><span>{pct(row.punctual)}</span></div></td>
                    <td data-label="Missed"><span className={`audit-pill audit-pill-${row.missed ? "bad" : "good"}`}>{row.missed}</span></td>
                    <td data-label="Rejected">{row.rejected}</td>
                    <td data-label="Extra visits">{row.extra}</td>
                    <td data-label="Avg. delay">{row.avg_late ? `${row.avg_late} min` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : <section className="audit-card rf-empty"><b>No refill visits in this month.</b></section>}
    </div>
  );
}

/* ---------- Settings ---------- */

function SettingsTab({ data, headers, onChanged, notify }) {
  const [draft, setDraft] = useState(() => ({ ...data.settings, reminders_enabled: data.settings.reminders_enabled !== "false" }));
  const [sendTo, setSendTo] = useState("");
  const [showHelp, setShowHelp] = useState(false);
  const config = { headers };

  const save = async () => {
    try {
      await API.put("/refills/settings", draft, config);
      notify("Reminder settings saved");
      onChanged();
    } catch (err) {
      notify(err.response?.data?.error || "Could not save", true);
    }
  };

  const sendTomorrow = async () => {
    try {
      const response = await API.post("/refills/send-tomorrow", { refiller_phone: sendTo || null }, config);
      notify(response.data.sent ? `Sent tomorrow's list (${response.data.sent} visit${response.data.sent === 1 ? "" : "s"})` : "Nothing new to send: tomorrow's lists were already sent, or no visits are scheduled.");
      onChanged();
    } catch (err) {
      notify(err.response?.data?.error || "Could not send", true);
    }
  };

  return (
    <div className="audit-stack">
      <section className="audit-card rf-settings">
        <h3>WhatsApp reminders</h3>
        <label className="rf-switch"><input type="checkbox" checked={draft.reminders_enabled} onChange={(event) => setDraft({ ...draft, reminders_enabled: event.target.checked })} /> Send reminders to refillers</label>
        <div className="rf-settings-grid">
          <label>Evening-before list at<input type="time" value={draft.day_before_time} onChange={(event) => setDraft({ ...draft, day_before_time: event.target.value })} /><small>Each refiller gets all of tomorrow's visits in one message.</small></label>
          <label>Nudge before each visit<select value={draft.hour_before_minutes} onChange={(event) => setDraft({ ...draft, hour_before_minutes: event.target.value })}>{[30, 45, 60, 90, 120].map((n) => <option key={n} value={n}>{n >= 60 ? `${n / 60} hour${n === 60 ? "" : "s"}` : `${n} min`} before</option>)}</select></label>
          <label>Missed after<select value={draft.grace_minutes} onChange={(event) => setDraft({ ...draft, grace_minutes: event.target.value })}>{[30, 60, 90, 120, 180, 240, 360].map((n) => <option key={n} value={n}>{n >= 60 ? `${n / 60} h` : `${n} min`} past the time</option>)}</select><small>No photo by then → marked missed and admins are alerted. A late photo still counts (shown as late).</small></label>
        </div>
        <div className="rf-modal-foot"><button type="button" className="primary" onClick={save}>Save settings</button></div>
      </section>

      <section className="audit-card rf-settings">
        <h3>Send tomorrow's list now</h3>
        <p className="rf-hint">Useful to test a refiller's phone, or after adding visits late in the evening. Only visits not already sent are included.</p>
        <div className="rf-toolbar">
          <select value={sendTo} onChange={(event) => setSendTo(event.target.value)}>
            <option value="">All refillers</option>
            {data.refillers.filter((refiller) => refiller.phone).map((refiller) => <option key={refiller.id} value={refiller.phone}>{refiller.name}</option>)}
          </select>
          <button type="button" className="rf-primary" onClick={sendTomorrow}>Send now</button>
        </div>
      </section>

      <section className="audit-card rf-settings">
        <h3>Reminders when a refiller hasn't messaged in 24 hours</h3>
        <p className="rf-hint">WhatsApp only lets us send normal messages within 24 hours of a person's last message. After that, reminders go out using the approved Meta template <b>{data.template}</b>. Without it, those reminders fail and show "Reminder failed" on the board.</p>
        <button type="button" className="rf-link" onClick={() => setShowHelp((value) => !value)}>{showHelp ? "Hide" : "How to create the template in Meta"}</button>
        {showHelp && (
          <ol className="rf-steps">
            <li>Open <b>business.facebook.com</b> → WhatsApp Manager → <b>Message templates</b> → <b>Create template</b>.</li>
            <li>Category <b>Utility</b>, name <code>{data.template}</code>, language <b>English</b>.</li>
            <li>Body: <code>Hi {"{{1}}"}, you have {"{{2}}"} Snackit refill visit(s) {"{{3}}"}: {"{{4}}"}. After refilling, send a photo of the machine here and choose the site.</code></li>
            <li>Sample values: <code>Promod</code>, <code>2</code>, <code>tomorrow (Sat 27 Sep)</code>, <code>10:00 AM Amagi; 2:00 PM Fortis</code>. Submit; approval usually takes minutes.</li>
          </ol>
        )}
      </section>
    </div>
  );
}

/* ---------- Page ---------- */

export default function RefillWorkspace({ token }) {
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);
  const [tab, setTab] = useState("today");
  const [date, setDate] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const [lightbox, setLightbox] = useState(null);
  const [addingVisit, setAddingVisit] = useState(false);

  const notify = useCallback((message, isError = false) => {
    setToast({ message, isError });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const load = useCallback(async () => {
    try {
      const response = await API.get("/refills/overview", { headers, params: date ? { date } : {} });
      setData(response.data);
      setError("");
    } catch (err) {
      setError(err.response?.data?.error || "Could not load the refill schedule");
    }
  }, [headers, date]);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    const refresh = setInterval(load, 60000);
    return () => { clearTimeout(timer); clearInterval(refresh); };
  }, [load]);

  const act = async (task, action) => {
    if (action === "cancel" && !window.confirm(`Cancel the ${task.due_time} visit at ${task.location_name}?`)) return;
    setBusy(true);
    try {
      if (action === "remind") {
        await API.post(`/refills/tasks/${task.id}/remind`, {}, { headers });
        notify(`Reminder sent to ${task.refiller_name}`);
      } else {
        await API.patch(`/refills/tasks/${task.id}`, { action }, { headers });
        notify({ verify: "Refill verified", cancel: "Visit cancelled", reopen: "Visit reopened" }[action]);
      }
      await load();
    } catch (err) {
      notify(err.response?.data?.error || "Something went wrong", true);
    } finally {
      setBusy(false);
    }
  };

  const addVisit = async (draft) => {
    await API.post("/refills/tasks", draft, { headers });
    notify("Visit added");
    setAddingVisit(false);
    if (draft.due_date !== (date || data.today)) setDate(draft.due_date);
    else load();
  };

  const tabs = [
    ["today", "Day board"],
    ["verify", `Verify${data?.awaitingVerification ? ` (${data.awaitingVerification})` : ""}`],
    ["schedules", "Schedules"],
    ["performance", "Performance"],
    ["settings", "Settings"],
  ];
  const grace = Number(data?.settings?.grace_minutes) || 120;

  return (
    <div className="audit-workspace">
      <div className="audit-tabs" role="tablist">
        {tabs.map(([key, label]) => (
          <button type="button" role="tab" key={key} aria-selected={tab === key} className={`${tab === key ? "active" : ""} ${key === "verify" && data?.awaitingVerification ? "rf-tab-alert" : ""}`} onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>
      {toast && <div className={`audit-toast ${toast.isError ? "is-error" : ""}`}>{toast.message}</div>}
      {error ? <div className="audit-card audit-error">{error} <button type="button" className="audit-btn" onClick={load}>Retry</button></div>
        : !data ? <div className="audit-card audit-empty">Loading refill schedule…</div>
        : <>
          {tab === "today" && <TodayBoard data={data} date={date || data.today} setDate={setDate} onAction={act} onPhotos={(photos, index) => setLightbox({ photos, index })} busy={busy} onAddVisit={() => setAddingVisit(true)} />}
          {tab === "verify" && <VerifyTab headers={headers} grace={grace} onPhotos={(photos, index) => setLightbox({ photos, index })} onChanged={load} notify={notify} />}
          {tab === "schedules" && <SchedulesTab data={data} headers={headers} onChanged={load} notify={notify} />}
          {tab === "performance" && <PerformanceTab headers={headers} today={data.today} />}
          {tab === "settings" && <SettingsTab key={JSON.stringify(data.settings)} data={data} headers={headers} onChanged={load} notify={notify} />}
        </>}
      {addingVisit && data && <OneOffForm locations={data.locations} date={date || data.today} onSave={addVisit} onClose={() => setAddingVisit(false)} />}
      {lightbox && <Lightbox photos={lightbox.photos} index={lightbox.index} onIndex={(index) => setLightbox((current) => ({ ...current, index: typeof index === "function" ? index(current.index) : index }))} onClose={() => setLightbox(null)} />}
    </div>
  );
}
