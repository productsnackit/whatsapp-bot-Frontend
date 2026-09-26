import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";

/* Team tasks: every Internal Chat message that @tags someone is a task.
   Board (Open / In progress / Done), due dates with reminders, and a weekly
   "done per person" view. */

const API = axios.create({ baseURL: "https://whatsapp-bot-backend-b3nb.onrender.com" });
const COLUMNS = [
  ["open", "Open", "⏳"],
  ["in-progress", "In progress", "🔄"],
  ["resolved", "Done", "✅"],
];
const PRIORITY = { urgent: ["Urgent", "red"], medium: ["Medium", "amber"], low: ["Low", "green"] };

function dueLabel(task) {
  if (!task.dueAt) return null;
  const due = new Date(task.dueAt);
  const now = new Date();
  const time = due.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  let text;
  if (due.toDateString() === now.toDateString()) text = `Today ${time}`;
  else if (due.toDateString() === tomorrow.toDateString()) text = `Tomorrow ${time}`;
  else text = due.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  if (task.status === "resolved") return { text: `Due ${text}`, tone: "grey" };
  if (task.overdue) {
    const hours = Math.round((now - due) / 3600000);
    return { text: `Overdue ${hours < 1 ? "just now" : hours < 48 ? `${hours} h` : `${Math.round(hours / 24)} days`}`, tone: "red" };
  }
  return { text: `Due ${text}`, tone: task.dueSoon ? "amber" : "blue" };
}

function ago(iso) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 60) return `${Math.max(1, minutes)} min ago`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)} h ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

// Value for <input type="datetime-local"> in the viewer's time.
function localInput(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function quickDue(kind) {
  const date = new Date();
  if (kind === "2h") date.setHours(date.getHours() + 2);
  if (kind === "today") date.setHours(18, 0, 0, 0);
  if (kind === "tomorrow") { date.setDate(date.getDate() + 1); date.setHours(12, 0, 0, 0); }
  if (kind === "week") { date.setDate(date.getDate() + ((5 - date.getDay() + 7) % 7 || 7)); date.setHours(18, 0, 0, 0); }
  return date.toISOString();
}

function DueEditor({ task, onSave, onClose }) {
  const [value, setValue] = useState(localInput(task.dueAt));
  return (
    <div className="tk-due-editor" onClick={(event) => event.stopPropagation()}>
      <div className="tk-due-quick">
        {[["2h", "In 2 hours"], ["today", "Today 6 PM"], ["tomorrow", "Tomorrow noon"], ["week", "Friday 6 PM"]].map(([key, label]) => (
          <button type="button" key={key} onClick={() => onSave(quickDue(key))}>{label}</button>
        ))}
      </div>
      <input type="datetime-local" value={value} onChange={(event) => setValue(event.target.value)} />
      <div className="tk-due-actions">
        {task.dueAt && <button type="button" className="tk-link-danger" onClick={() => onSave(null)}>Remove due date</button>}
        <button type="button" onClick={onClose}>Cancel</button>
        <button type="button" className="primary" disabled={!value} onClick={() => onSave(new Date(value).toISOString())}>Save</button>
      </div>
    </div>
  );
}

function TaskCard({ task, me, isAdmin, onStatus, onDue, onOpenChat, busy }) {
  const [editingDue, setEditingDue] = useState(false);
  const due = dueLabel(task);
  const tagged = task.assignees.some((person) => person.key === me);
  const canDue = tagged || task.createdByKey === me || isAdmin;
  const [priorityLabel, priorityTone] = PRIORITY[task.priority] || PRIORITY.medium;
  return (
    <article className={`tk-card ${task.overdue ? "is-overdue" : ""} tk-status-${task.status}`} draggable={tagged} onDragStart={(event) => event.dataTransfer.setData("text/plain", task.id)}>
      <div className="tk-card-top">
        <span className={`rf-chip rf-${priorityTone}`}>{priorityLabel}</span>
        <span className="tk-dept">{task.chatTitle}</span>
        <span className="tk-ago" title={new Date(task.createdAt).toLocaleString("en-IN")}>{ago(task.createdAt)}</span>
      </div>
      <p className="tk-text">{task.text}</p>
      <div className="tk-people">
        <span className="tk-from">From <b>{task.createdBy}</b></span>
        <span className="tk-arrow">→</span>
        {task.assignees.map((person) => <span key={person.key} className={`tk-assignee ${person.key === me ? "is-me" : ""}`}>{person.key === me ? "You" : person.name}</span>)}
      </div>
      <div className="tk-meta">
        {due ? <button type="button" className={`rf-chip rf-${due.tone} tk-due`} onClick={() => canDue && setEditingDue(true)} disabled={!canDue}>📅 {due.text}</button>
          : canDue && task.status !== "resolved" ? <button type="button" className="tk-add-due" onClick={() => setEditingDue(true)}>+ Due date</button> : null}
        {task.attachments > 0 && <span className="tk-attach">📎 {task.attachments}</span>}
        {task.status !== "open" && task.statusUpdatedBy && <span className="tk-by">{task.status === "resolved" ? "Done" : "Started"} by {task.statusUpdatedBy} · {ago(task.statusUpdatedAt)}</span>}
      </div>
      {editingDue && <DueEditor task={task} onClose={() => setEditingDue(false)} onSave={async (value) => { await onDue(task, value); setEditingDue(false); }} />}
      <div className="tk-actions">
        <button type="button" className="tk-link" onClick={() => onOpenChat(task)}>Open in chat</button>
        {tagged && task.status === "open" && <button type="button" disabled={busy} onClick={() => onStatus(task, "in-progress")}>Start</button>}
        {tagged && task.status !== "resolved" && <button type="button" className="rf-ok" disabled={busy} onClick={() => onStatus(task, "resolved")}>Done ✓</button>}
        {tagged && task.status === "resolved" && <button type="button" disabled={busy} onClick={() => onStatus(task, "open")}>Reopen</button>}
      </div>
    </article>
  );
}

function TeamView({ headers }) {
  const [days, setDays] = useState(7);
  const [stats, setStats] = useState(null);
  const authorization = headers.Authorization;
  useEffect(() => {
    let alive = true;
    API.get("/internal/tasks/stats", { headers: { Authorization: authorization }, params: { days } })
      .then((response) => { if (alive) setStats(response.data.rows || []); })
      .catch(() => { if (alive) setStats([]); });
    return () => { alive = false; };
  }, [authorization, days]);
  const max = Math.max(1, ...(stats || []).map((row) => row.done));
  return (
    <div className="audit-stack">
      <div className="rf-toolbar">
        <div className="ea-filters">
          {[[7, "This week"], [30, "Last 30 days"], [90, "Last 90 days"]].map(([value, label]) => <button type="button" key={value} className={days === value ? "active" : ""} onClick={() => setDays(value)}>{label}</button>)}
        </div>
        <span className="rf-count">Done = tasks the person marked done. On time = done before the due date.</span>
      </div>
      {!stats ? <div className="ea-loading">Loading…</div> : stats.length ? (
        <section className="audit-card">
          <div className="ootm-table-wrap">
            <table className="ootm-table tk-team">
              <thead><tr><th>Person</th><th>Done</th><th>On time</th><th>Open now</th><th>Overdue now</th><th>Avg. time to finish</th><th>New tasks</th></tr></thead>
              <tbody>
                {stats.map((row) => (
                  <tr key={row.key}>
                    <td data-label="Person"><b>{row.name}</b><small>{row.department}</small></td>
                    <td data-label="Done"><div className="rf-bar"><i className="good" style={{ width: `${(row.done / max) * 80}px` }} /><span>{row.done}</span></div></td>
                    <td data-label="On time">{row.onTimeRate === null ? "—" : <span className={`audit-pill audit-pill-${row.onTimeRate >= 90 ? "good" : row.onTimeRate >= 70 ? "warn" : "bad"}`}>{row.onTimeRate}%</span>}</td>
                    <td data-label="Open now">{row.open}</td>
                    <td data-label="Overdue now">{row.overdue ? <span className="audit-pill audit-pill-bad">{row.overdue}</span> : "0"}</td>
                    <td data-label="Avg. time to finish">{row.avgHours === null ? "—" : row.avgHours < 1 ? `${Math.round(row.avgHours * 60)} min` : row.avgHours < 48 ? `${row.avgHours} h` : `${Math.round(row.avgHours / 24)} days`}</td>
                    <td data-label="New tasks">{row.assigned}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : <section className="audit-card rf-empty"><b>No tasks yet.</b><span>Tag someone with @ in a department chat to create one.</span></section>}
    </div>
  );
}

export default function TasksWorkspace({ token, isAdmin, onOpenChat }) {
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);
  const [tab, setTab] = useState("board");
  const [scope, setScope] = useState("mine");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("");
  const [person, setPerson] = useState("");
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const [dragOver, setDragOver] = useState(null);

  const notify = (message, isError = false) => {
    setToast({ message, isError });
    setTimeout(() => setToast(null), 3000);
  };

  const load = useCallback(async () => {
    try {
      const response = await API.get("/internal/tasks", { headers, params: { scope } });
      setData(response.data);
      setError("");
    } catch (err) {
      setError(err.response?.data?.error || "Could not load tasks");
    }
  }, [headers, scope]);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    const refresh = setInterval(load, 30000);
    return () => { clearTimeout(timer); clearInterval(refresh); };
  }, [load]);

  const update = async (task, body, message) => {
    setBusy(true);
    try {
      await API.patch(`/internal/tasks/${task.chatId}/${task.messageId}`, body, { headers });
      notify(message);
      await load();
    } catch (err) {
      notify(err.response?.data?.error || "Could not update the task", true);
    } finally {
      setBusy(false);
    }
  };
  const setStatus = (task, status) => update(task, { status }, { "in-progress": "Started", resolved: "Marked done ✓", open: "Reopened" }[status]);
  const setDue = (task, dueAt) => update(task, { dueAt }, dueAt ? "Due date saved" : "Due date removed");

  const tasks = data?.tasks || [];
  const me = data?.me;
  const departments = [...new Set(tasks.map((task) => task.department))].sort();
  const people = [...new Map(tasks.flatMap((task) => task.assignees).map((p) => [p.key, p])).values()].sort((a, b) => a.name.localeCompare(b.name));
  const q = query.trim().toLowerCase();
  const shown = tasks.filter((task) => (!department || task.department === department)
    && (!person || task.assignees.some((p) => p.key === person))
    && (!onlyOverdue || task.overdue)
    && (!q || `${task.text} ${task.createdBy} ${task.assignees.map((p) => p.name).join(" ")}`.toLowerCase().includes(q)));
  const overdueCount = tasks.filter((task) => task.overdue).length;
  const openCount = tasks.filter((task) => task.status !== "resolved").length;

  const onDrop = (event, status) => {
    event.preventDefault();
    setDragOver(null);
    const task = tasks.find((item) => item.id === event.dataTransfer.getData("text/plain"));
    if (task && task.status !== status) setStatus(task, status);
  };

  return (
    <div className="audit-workspace">
      <div className="audit-tabs" role="tablist">
        {[["board", "Task board"], ["team", "Team progress"]].map(([key, label]) => (
          <button type="button" role="tab" key={key} aria-selected={tab === key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>
      {toast && <div className={`audit-toast ${toast.isError ? "is-error" : ""}`}>{toast.message}</div>}

      {tab === "team" ? <TeamView headers={headers} /> : (
        <div className="audit-stack">
          <div className="tk-summary">
            <div className="ea-filters">
              {[["mine", "My tasks"], ["created", "I asked for"], ["all", "Everyone"]].map(([key, label]) => (
                <button type="button" key={key} className={scope === key ? "active" : ""} onClick={() => setScope(key)}>{label}</button>
              ))}
            </div>
            {data && <span className="tk-counts"><b>{openCount}</b> open{overdueCount ? <> · <b className="tk-red">{overdueCount} overdue</b></> : null}</span>}
          </div>
          <div className="rf-toolbar">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tasks or people" />
            {departments.length > 1 && <select value={department} onChange={(event) => setDepartment(event.target.value)}><option value="">All departments</option>{departments.map((name) => <option key={name}>{name}</option>)}</select>}
            {scope !== "mine" && people.length > 1 && <select value={person} onChange={(event) => setPerson(event.target.value)}><option value="">Everyone</option>{people.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}</select>}
            <label className="rf-switch"><input type="checkbox" checked={onlyOverdue} onChange={(event) => setOnlyOverdue(event.target.checked)} /> Overdue only</label>
          </div>
          {error && <div className="ea-error">{error}</div>}
          {!data ? <div className="ea-loading">Loading tasks…</div> : (
            <div className="tk-board">
              {COLUMNS.map(([status, label, icon]) => {
                const list = shown.filter((task) => task.status === status);
                return (
                  <section key={status} className={`tk-column ${dragOver === status ? "is-drop" : ""}`}
                    onDragOver={(event) => { event.preventDefault(); setDragOver(status); }}
                    onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setDragOver(null); }}
                    onDrop={(event) => onDrop(event, status)}>
                    <header><span>{icon} {label}</span><b>{list.length}</b></header>
                    <div className="tk-column-body">
                      {list.map((task) => <TaskCard key={task.id} task={task} me={me} isAdmin={isAdmin} onStatus={setStatus} onDue={setDue} onOpenChat={onOpenChat} busy={busy} />)}
                      {!list.length && <p className="tk-empty">{status === "resolved" ? "Tasks done in the last 14 days show here." : scope === "mine" ? "Nothing here 🎉" : "No tasks"}</p>}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
          <p className="rf-hint">A task is any department-chat message that @tags someone. Only the tagged people can start or finish it (drag cards or use the buttons). Reminders go out 2 hours before the due date and every day while it's overdue.</p>
        </div>
      )}
    </div>
  );
}
