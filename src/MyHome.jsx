/* My Home: the first page an employee sees. Everything that is theirs in one simple list
   (tasks they are tagged in, Call Log tasks, Internal Audit actions), unread messages, and big
   buttons for the pages they can open. Tapping anything takes them inside (myHome.js). */
import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";

const API = axios.create({ baseURL: "https://whatsapp-bot-backend-b3nb.onrender.com" });

const TYPES = {
  task: { label: "Chat task", icon: "💬" },
  call: { label: "Call Log", icon: "📞" },
  audit: { label: "Audit action", icon: "📋" },
};
const FILTERS = [["all", "All"], ["task", "Chat tasks"], ["call", "Calls"], ["audit", "Audit"]];

const greeting = () => {
  const hour = Number(new Date().toLocaleString("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }));
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
};
const dayMs = 24 * 60 * 60 * 1000;
// "Overdue 2 days" / "Due today 5:00 pm" / "Due tomorrow" / "Due 18 Oct"
function dueText(item, now) {
  if (!item.due) return null;
  const dateOnly = item.due.length === 10;
  const due = new Date(dateOnly ? `${item.due}T23:59:00+05:30` : item.due);
  const day = (date) => date.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const days = Math.round((new Date(day(due)) - new Date(day(new Date(now)))) / dayMs);
  const time = dateOnly ? "" : ` ${due.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })}`;
  if (item.overdue) return days < 0 ? `Overdue ${-days} day${days === -1 ? "" : "s"}` : `Overdue since${time}`;
  if (days === 0) return `Due today${time}`;
  if (days === 1) return `Due tomorrow${time}`;
  return `Due ${due.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })}`;
}
const ago = (iso, now) => {
  const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 24 * 60) return `${Math.round(minutes / 60)}h`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
};

export default function MyHome({ token, name, department, pages, onOpen, onView, version }) {
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [showAll, setShowAll] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      setData((await API.get("/me/home", { headers })).data);
      setError("");
    } catch (err) {
      setError(err.response?.data?.error || "Could not load your tasks. Pull down or tap Refresh.");
    } finally {
      setNow(Date.now());
    }
  }, [headers]);
  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load, version]);
  // Fresh every minute while on screen, and when coming back to the app.
  useEffect(() => {
    const tick = () => { if (document.visibilityState === "visible" && document.body.dataset.view === "home") load(); };
    const timer = setInterval(tick, 60000);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", tick); };
  }, [load]);

  const work = data?.work || [];
  const shown = work.filter((item) => filter === "all" || item.type === filter);
  const list = showAll ? shown : shown.slice(0, 8);
  const counts = data?.counts || {};
  const firstName = String(name || "").split(" ")[0] || "there";
  const summary = !data ? "Loading your day…"
    : !counts.open ? "Nothing pending. You're all caught up 🎉"
    : `You have ${counts.open} thing${counts.open === 1 ? "" : "s"} to do${counts.overdue ? `, ${counts.overdue} overdue` : ""}.`;

  return (
    <div className="mh-page">
      <section className="mh-hello">
        <div>
          <span className="mh-date">{new Date(now).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" })}</span>
          <h2>{greeting()}, {firstName}</h2>
          <p>{summary}</p>
        </div>
        <button type="button" className="mh-refresh" onClick={load} aria-label="Refresh">↻</button>
      </section>

      <div className="mh-stats">
        <button type="button" className={counts.overdue ? "is-bad" : ""} onClick={() => setFilter("all")}><b>{counts.overdue ?? "–"}</b><span>Overdue</span></button>
        <button type="button" onClick={() => setFilter("all")}><b>{counts.open ?? "–"}</b><span>To do</span></button>
        <button type="button" className={counts.unread ? "is-blue" : ""} onClick={() => document.getElementById("mh-messages")?.scrollIntoView({ behavior: "smooth" })}><b>{counts.unread ?? "–"}</b><span>Unread</span></button>
        <button type="button" className="is-good" disabled><b>{counts.done_week ?? "–"}</b><span>Done this week</span></button>
      </div>

      {error && <div className="mh-error">{error}</div>}

      <section className="mh-card">
        <div className="mh-card-head">
          <h3>My work</h3>
          <div className="mh-filters" role="tablist">
            {FILTERS.map(([key, label]) => {
              const count = key === "all" ? work.length : work.filter((item) => item.type === key).length;
              if (key !== "all" && !count) return null;
              return <button key={key} type="button" role="tab" aria-selected={filter === key} className={filter === key ? "is-on" : ""} onClick={() => { setFilter(key); setShowAll(false); }}>{label} <small>{count}</small></button>;
            })}
          </div>
        </div>
        {!data && !error && <div className="mh-empty">Loading…</div>}
        {data && !shown.length && <div className="mh-empty"><b>🎉 Nothing pending</b><span>New tasks, calls and audit actions given to you will show here.</span></div>}
        <ul className="mh-list">
          {list.map((item) => {
            const due = dueText(item, now);
            return (
              <li key={`${item.type}-${item.id}`}>
                <button type="button" className={`mh-item mh-${item.type} ${item.overdue ? "is-overdue" : ""}`} onClick={() => onOpen(item.open)}>
                  <span className="mh-body">
                    <span className="mh-top">
                      <span className="mh-kind"><span aria-hidden="true">{TYPES[item.type].icon}</span> {TYPES[item.type].label}{item.ref ? ` · ${item.ref}` : ""}{item.urgent ? <em>{item.type === "audit" ? item.risk : "Urgent"}</em> : null}</span>
                      {due && <span className={`mh-due ${item.overdue ? "is-bad" : item.due_soon ? "is-warn" : ""}`}>{due}</span>}
                    </span>
                    <b>{item.title}</b>
                    {item.type === "audit" && item.action && <span className="mh-sub mh-details">{item.action}</span>}
                    {item.files > 0 && <span className="mh-meta"><span>📎 {item.files} file{item.files === 1 ? "" : "s"}</span></span>}
                    <span className="mh-meta">
                      <span className="mh-status">{item.status}</span>
                      {item.from && <span>From {item.from}</span>}
                      {item.where && <span>{item.where}</span>}
                    </span>
                  </span>
                  <span className="mh-chev" aria-hidden="true">›</span>
                </button>
              </li>
            );
          })}
        </ul>
        {shown.length > list.length && <button type="button" className="mh-more" onClick={() => setShowAll(true)}>Show all {shown.length}</button>}
      </section>

      {pages.some((page) => page.view === "internal-chat") && <section className="mh-card" id="mh-messages">
        <div className="mh-card-head">
          <h3>Unread messages</h3>
          <button type="button" className="mh-link" onClick={() => onView("internal-chat")}>All chats ›</button>
        </div>
        {data && !data.chats.length && <div className="mh-empty"><span>No unread messages.</span></div>}
        <ul className="mh-list">
          {(data?.chats || []).map((chat) => (
            <li key={chat.id}>
              <button type="button" className="mh-item mh-chat" onClick={() => onOpen({ view: "internal-chat", chatId: chat.id, department: chat.department })}>
                <span className="mh-avatar" aria-hidden="true">{chat.direct ? chat.title.slice(0, 1).toUpperCase() : "#"}</span>
                <span className="mh-body">
                  <b>{chat.title}</b>
                  {chat.last && <span className="mh-sub">{chat.last.sender ? `${chat.last.sender}: ` : ""}{chat.last.text}</span>}
                </span>
                <span className="mh-right">
                  {chat.last && <small>{ago(chat.last.at, now)}</small>}
                  <span className="mh-badge">{chat.unread}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>}

      {pages.length > 0 && (
        <section className="mh-card">
          <div className="mh-card-head"><h3>Open a page</h3>{department && <span className="mh-dept">{department}</span>}</div>
          <div className="mh-tiles">
            {pages.map((page) => (
              <button key={page.view} type="button" onClick={() => onView(page.view)}>
                <span className="mh-tile-icon" aria-hidden="true">{page.icon}</span>
                <b>{page.label}</b>
                {page.hint && <small>{page.hint}</small>}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
