import { useCallback, useEffect, useState } from "react";

/* Who changed what and when: refunds, takeovers, audits, deletions,
   employee changes and logins, newest first. */

const SECTIONS = ["Tickets", "Refill Audit", "Internal Audit", "Expiry Tracking", "Operations", "Employees", "Settings", "Account", "Internal Chat", "Other"];
const SECTION_ICONS = { Tickets: "🎫", "Refill Audit": "🛡️", "Internal Audit": "📋", "Expiry Tracking": "📅", Operations: "📦", Employees: "👥", Settings: "⚙️", Account: "🔑", "Internal Chat": "💬", Other: "•" };
const PAGE_SIZE = 100;

function dayLabel(date) {
  const today = new Date();
  const yesterday = new Date(Date.now() - 86400000);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function Details({ details }) {
  if (!details || typeof details !== "object") return null;
  const entries = Object.entries(details).filter(([, value]) => value !== null && value !== "");
  if (!entries.length) return null;
  return (
    <dl className="al-details">
      {entries.map(([key, value]) => (
        <div key={key}><dt>{key.replace(/_/g, " ")}</dt><dd>{Array.isArray(value) ? value.join(", ") : String(value)}</dd></div>
      ))}
    </dl>
  );
}

export default function ActivityLog({ api, headers }) {
  const [rows, setRows] = useState([]);
  const [people, setPeople] = useState([]);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState({ actor: "", section: "", from: "", to: "", q: "" });
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(null);
  const authorization = headers.Authorization;

  const load = useCallback(async (offset = 0) => {
    setLoading(true);
    try {
      const params = Object.fromEntries(Object.entries({ ...filters, limit: PAGE_SIZE, offset }).filter(([, value]) => value !== ""));
      const response = await api.get("/activity", { headers: { Authorization: authorization }, params });
      setRows((current) => (offset ? [...current, ...response.data.rows] : response.data.rows));
      setPeople(response.data.people || []);
      setTotal(response.data.total || 0);
      setError("");
    } catch (err) {
      setError(err.response?.data?.error || "Could not load the activity log");
    } finally {
      setLoading(false);
    }
  }, [api, authorization, filters]);

  useEffect(() => {
    const timer = setTimeout(() => load(0), 0);
    return () => clearTimeout(timer);
  }, [load]);

  // Search waits until typing pauses.
  useEffect(() => {
    const timer = setTimeout(() => setFilters((current) => (current.q === query ? current : { ...current, q: query })), 400);
    return () => clearTimeout(timer);
  }, [query]);

  const setFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value }));
  const hasFilters = Object.values(filters).some(Boolean);

  const exportCsv = () => {
    const lines = [["Date", "Time", "Person", "Role", "Section", "What happened", "IP"]]
      .concat(rows.map((row) => {
        const date = new Date(row.created_at);
        return [date.toLocaleDateString("en-IN"), date.toLocaleTimeString("en-IN"), row.actor_name, row.actor_role, row.section, row.action, row.ip];
      }))
      .map((line) => line.map(csvCell).join(","));
    const blob = new Blob([`\uFEFF${lines.join("\n")}`], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Snackit_Activity_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const dayBreaks = rows.map((row, index) => {
    const day = dayLabel(new Date(row.created_at));
    return index === 0 || day !== dayLabel(new Date(rows[index - 1].created_at)) ? day : null;
  });

  return (
    <section className="al">
      <div className="al-toolbar">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search what happened or who did it" />
        <select value={filters.actor} onChange={(event) => setFilter("actor", event.target.value)} aria-label="Person">
          <option value="">Everyone</option>
          {people.map((person) => <option key={person.actor_key} value={person.actor_key}>{person.actor_name} ({person.count})</option>)}
        </select>
        <select value={filters.section} onChange={(event) => setFilter("section", event.target.value)} aria-label="Section">
          <option value="">All sections</option>
          {SECTIONS.map((section) => <option key={section}>{section}</option>)}
        </select>
        <label>From<input type="date" value={filters.from} onChange={(event) => setFilter("from", event.target.value)} /></label>
        <label>To<input type="date" value={filters.to} onChange={(event) => setFilter("to", event.target.value)} /></label>
        {hasFilters && <button type="button" className="al-clear" onClick={() => { setQuery(""); setFilters({ actor: "", section: "", from: "", to: "", q: "" }); }}>Clear</button>}
        <button type="button" className="al-export" onClick={exportCsv} disabled={!rows.length}>Export CSV</button>
      </div>

      <p className="al-count">{loading && !rows.length ? "Loading…" : `${total} change${total === 1 ? "" : "s"}${hasFilters ? " match" : " recorded"}`}</p>
      {error && <div className="ea-error">{error}</div>}

      <div className="al-list">
        {rows.map((row, index) => {
          const date = new Date(row.created_at);
          const failed = row.action.startsWith("Failed login");
          return (
            <div key={row.id}>
              {dayBreaks[index] && <div className="al-day">{dayBreaks[index]}</div>}
              <button type="button" className={`al-row ${open === row.id ? "open" : ""} ${failed ? "is-failed" : ""}`} onClick={() => setOpen(open === row.id ? null : row.id)}>
                <span className="al-time">{date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                <span className="al-icon" title={row.section}>{SECTION_ICONS[row.section] || "•"}</span>
                <span className="al-text">
                  <b>{row.actor_name || "Unknown"}</b>{row.actor_role && <small>{row.actor_role}</small>}
                  <span>{row.action}</span>
                </span>
                <span className="al-section">{row.section}</span>
              </button>
              {open === row.id && (
                <div className="al-more">
                  <span>{date.toLocaleString("en-IN")}{row.ip ? ` · IP ${row.ip}` : ""}</span>
                  <Details details={row.details} />
                </div>
              )}
            </div>
          );
        })}
        {!loading && !rows.length && !error && <p className="ea-empty">{hasFilters ? "Nothing matches these filters." : "No changes recorded yet. Changes from now on will appear here."}</p>}
      </div>
      {rows.length < total && <button type="button" className="al-more-btn" onClick={() => load(rows.length)} disabled={loading}>{loading ? "Loading…" : `Show more (${total - rows.length} left)`}</button>}
    </section>
  );
}
