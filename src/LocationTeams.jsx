import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import LocationCard from "./LocationCard.jsx";

/* Locations & teams: who looks after every location (refiller, area managers, helpers), each
   manager's and refiller's workload, cover while a manager is on leave, the notes from the
   operators list to check, and every location ranked by what needs attention or by sales.
   Tap a location for its card. Server side: locationTeams.js. */

const API = axios.create({ baseURL: "https://whatsapp-bot-backend-b3nb.onrender.com" });
const rupees = (value) => (value == null ? "—" : `₹${Math.round(value).toLocaleString("en-IN")}`);
const change = (now, before) => (before ? Math.round(((now - before) / before) * 100) : null);
const attention = (row) => row.overdue_tasks * 3 + row.missed_refills * 2 + row.open_problems + row.open_tasks;
const today = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
const NOTE_TEXT = {
  refiller: (note) => `${note.location}: the list says refiller ${note.list}, the dashboard has ${note.now || "nobody"}.`,
  helpers: (note) => `${note.location}: the list says helpers ${note.list}, the dashboard has ${note.now || "none"}.`,
  missing: (note) => `${note.location} (${note.refiller}, ${note.managers.join(" + ")}) is in the list but not on the dashboard.`,
};

export default function LocationTeams({ token, employees = [], onOpenFinding, onNewTask }) {
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [query, setQuery] = useState("");
  const [manager, setManager] = useState("all");
  const [sort, setSort] = useState("attention");
  const [card, setCard] = useState(null);
  const [coverFor, setCoverFor] = useState(null); // { name, by, until }

  const load = useCallback(async () => {
    try {
      setData((await API.get("/location-teams", { headers })).data);
      setError("");
    } catch (err) {
      setError(err.response?.data?.error || "Could not load locations");
    }
  }, [headers]);
  useEffect(() => { const timer = setTimeout(load, 0); return () => clearTimeout(timer); }, [load]);
  const say = (text) => { setToast(text); setTimeout(() => setToast(""), 3000); };
  const run = async (action, done) => {
    try { await action(); await load(); if (done) say(done); } catch (err) { say(err.response?.data?.error || "Could not save"); }
  };

  const locations = useMemo(() => data?.locations || [], [data]);
  const managers = useMemo(() => {
    const map = new Map();
    for (const row of locations) {
      row.managers.forEach((person, index) => {
        const entry = map.get(person.name) || { name: person.name, main: 0, also: 0, open: 0, overdue: 0, missed: 0, problems: 0, sales: 0, user_id: person.user_id, cover: person.covered_by ? { by: person.covered_by, until: person.until } : null };
        if (index === 0) entry.main += 1; else entry.also += 1;
        entry.open += row.open_tasks; entry.overdue += row.overdue_tasks; entry.missed += row.missed_refills; entry.problems += row.open_problems; entry.sales += row.sales_30d || 0;
        map.set(person.name, entry);
      });
    }
    return [...map.values()].sort((a, b) => b.main + b.also - (a.main + a.also));
  }, [locations]);
  const refillers = useMemo(() => {
    const map = new Map();
    for (const row of locations) if (row.refiller) map.set(row.refiller.name, (map.get(row.refiller.name) || 0) + 1);
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [locations]);
  const peopleNames = useMemo(() => [...new Set([...employees.map((user) => user.name), ...managers.map((item) => item.name)].filter(Boolean))].sort(), [employees, managers]);

  const q = query.trim().toLowerCase();
  const shown = locations
    .filter((row) => (manager === "all" || (manager === "none" ? !row.managers.length : row.managers.some((person) => person.name === manager)))
      && (!q || `${row.name} ${row.refiller?.name || ""} ${row.managers.map((person) => person.name).join(" ")} ${row.helpers}`.toLowerCase().includes(q)))
    .sort((a, b) => (sort === "attention" ? attention(b) - attention(a) : sort === "sales_high" ? (b.sales_30d || 0) - (a.sales_30d || 0) : sort === "sales_low" ? (a.sales_30d ?? -1) - (b.sales_30d ?? -1) : 0) || a.name.localeCompare(b.name));
  const ranked = [...locations].filter((row) => row.sales_30d != null).sort((a, b) => b.sales_30d - a.sales_30d);
  const rankOf = new Map(ranked.map((row, index) => [row.id, index + 1]));

  if (error) return <div className="audit-error">{error} <button type="button" onClick={load}>Retry</button></div>;
  if (!data) return <p className="audit-empty">Loading locations…</p>;
  const canEdit = data.can_edit;

  return (
    <div className="lt">
      {toast && <div className="audit-toast">{toast}</div>}
      <section className="lt-hero">
        <div><small>Locations & teams</small><h2>{locations.length} locations · {managers.length} managers · {refillers.length} refillers</h2>
          <p>Who looks after each location. Internal Audit tasks, missed refills, Refill Audit problems and a refiller's "Can't fix" go to the location's managers.</p></div>
      </section>

      {canEdit && data.notes.length > 0 && (
        <section className="lt-box lt-notes">
          <h3>From the operators list · {data.notes.length} to check</h3>
          <ul>
            {data.notes.map((note, index) => (
              <li key={`${note.kind}-${note.location}-${index}`}>
                <span>{NOTE_TEXT[note.kind]?.(note) || note.location}</span>
                {note.kind !== "missing" && <button type="button" className="audit-btn" onClick={() => run(() => API.post(`/location-teams/notes/${index}`, { action: "apply" }, { headers }), "Updated from the list")}>Use the list</button>}
                <button type="button" className="lt-link" onClick={() => run(() => API.post(`/location-teams/notes/${index}`, { action: "dismiss" }, { headers }))}>{note.kind === "missing" ? "Dismiss" : "Keep dashboard"}</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="lt-box">
        <h3>Managers</h3>
        <div className="lt-managers">
          {managers.map((item) => (
            <article key={item.name} className={`lt-manager ${manager === item.name ? "is-on" : ""}`}>
              <button type="button" className="lt-manager-main" onClick={() => setManager(manager === item.name ? "all" : item.name)}>
                <span className="lt-avatar">{item.name.slice(0, 1)}</span>
                <span><b>{item.name}</b><small>{item.main} main{item.also ? ` · ${item.also} shared` : ""}{item.user_id ? "" : " · not an employee"}</small></span>
              </button>
              <div className="lt-manager-stats">
                <span className={item.overdue ? "is-bad" : ""}><b>{item.open}</b> tasks{item.overdue ? ` (${item.overdue} late)` : ""}</span>
                <span className={item.missed ? "is-bad" : ""}><b>{item.missed}</b> missed</span>
                <span><b>{item.problems}</b> problems</span>
                <span><b>{rupees(item.sales)}</b> sales</span>
              </div>
              {item.cover ? (
                <div className="lt-cover">🔁 {item.cover.by} covers until {new Date(`${item.cover.until}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}{canEdit && <button type="button" className="lt-link" onClick={() => run(() => API.put("/location-teams/cover", { name: item.name, by: "" }, { headers }), `${item.name} is back`)}>Back now</button>}</div>
              ) : canEdit && <button type="button" className="lt-link lt-cover-btn" onClick={() => setCoverFor({ name: item.name, by: "", until: today() })}>On leave? Set cover</button>}
              {coverFor?.name === item.name && (
                <form className="lt-cover-form" onSubmit={(event) => { event.preventDefault(); run(() => API.put("/location-teams/cover", coverFor, { headers }), `${coverFor.by} covers ${item.name}`); setCoverFor(null); }}>
                  <select value={coverFor.by} onChange={(event) => setCoverFor((current) => ({ ...current, by: event.target.value }))} required aria-label="Covered by">
                    <option value="">Covered by…</option>
                    {peopleNames.filter((name) => name !== item.name).map((name) => <option key={name}>{name}</option>)}
                  </select>
                  <input type="date" value={coverFor.until} min={today()} onChange={(event) => setCoverFor((current) => ({ ...current, until: event.target.value }))} required aria-label="Until" />
                  <button type="submit" className="audit-btn">Save</button>
                  <button type="button" className="lt-link" onClick={() => setCoverFor(null)}>Cancel</button>
                </form>
              )}
            </article>
          ))}
        </div>
        <div className="lt-refillers">{refillers.map(([name, count]) => <span key={name}>🧑‍🔧 {name} <b>{count}</b></span>)}</div>
      </section>

      <section className="lt-box">
        <div className="lt-tools">
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search location, refiller, manager…" />
          <select value={manager} onChange={(event) => setManager(event.target.value)} aria-label="Manager">
            <option value="all">All managers</option>
            {managers.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}
            <option value="none">No manager</option>
          </select>
          <select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort">
            <option value="attention">Needs attention first</option>
            <option value="sales_high">Sales: high to low</option>
            <option value="sales_low">Sales: low to high</option>
            <option value="name">Name</option>
          </select>
        </div>
        <div className="lt-table-wrap">
          <table className="lt-table">
            <thead><tr><th>Location</th><th>Refiller</th><th>Managers <small>(main first)</small></th><th>Helpers</th><th>Tasks</th><th>Problems</th><th>Missed</th><th>Sales · 30 days</th></tr></thead>
            <tbody>
              {shown.map((row) => {
                const pct = change(row.sales_30d, row.sales_prev_30d);
                return (
                  <tr key={row.id}>
                    <td><button type="button" className="lt-loc" onClick={() => setCard(row.id)}>📍 {row.name}</button></td>
                    <td>{canEdit ? (
                      <select value={row.refiller?.id || ""} onChange={(event) => run(() => API.patch(`/location-teams/${row.id}`, { refiller_id: event.target.value || null }, { headers }), "Refiller changed")} aria-label={`${row.name} refiller`}>
                        <option value="">—</option>
                        {data.refillers.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
                      </select>
                    ) : row.refiller?.name || "—"}</td>
                    <td>{canEdit ? (
                      <input key={row.managers.map((person) => person.name).join(",")} list="lt-people" defaultValue={row.managers.map((person) => person.name).join(", ")} placeholder="e.g. Kushith, Praharsha"
                        onBlur={(event) => { const next = event.target.value.split(",").map((name) => name.trim()).filter(Boolean); if (next.join(",") !== row.managers.map((person) => person.name).join(",")) run(() => API.patch(`/location-teams/${row.id}`, { managers: next }, { headers }), "Managers saved"); }} aria-label={`${row.name} managers`} />
                    ) : row.managers.map((person) => person.covered_by ? `${person.name} (→ ${person.covered_by})` : person.name).join(", ") || "—"}</td>
                    <td>{canEdit ? <input key={row.helpers} defaultValue={row.helpers} placeholder="—" onBlur={(event) => event.target.value.trim() !== row.helpers && run(() => API.patch(`/location-teams/${row.id}`, { helpers: event.target.value }, { headers }), "Helpers saved")} aria-label={`${row.name} helpers`} /> : row.helpers || "—"}</td>
                    <td className={row.overdue_tasks ? "is-bad" : ""}>{row.open_tasks}{row.overdue_tasks ? ` · ${row.overdue_tasks} late` : ""}</td>
                    <td className={row.open_problems ? "is-warn" : ""}>{row.open_problems}</td>
                    <td className={row.missed_refills ? "is-bad" : ""}>{row.missed_refills}</td>
                    <td>{rupees(row.sales_30d)}{pct != null && <small className={pct < 0 ? "is-bad" : "is-good"}> {pct >= 0 ? "▲" : "▼"}{Math.abs(pct)}%</small>}{rankOf.get(row.id) && <small className="lt-rank"> #{rankOf.get(row.id)}</small>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <datalist id="lt-people">{peopleNames.map((name) => <option key={name} value={name} />)}</datalist>
        </div>
        {!shown.length && <p className="audit-empty">No location matches.</p>}
      </section>

      {card && <LocationCard token={token} locationId={card} onClose={() => setCard(null)} onOpenFinding={onOpenFinding} onNewTask={onNewTask} />}
    </div>
  );
}
