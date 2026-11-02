/* Office Leads: enquiries the office bot collected on the director's office WhatsApp number
   (list a product, rent / buy a machine, direct supply). Each moves New → Contacted → Quoted →
   Won / Lost, with notes. Server side: officeBot.js. */
import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";

const API = axios.create({ baseURL: "https://whatsapp-bot-backend-b3nb.onrender.com" });
const STATUSES = ["New", "Contacted", "Quoted", "Won", "Lost"];
const TONE = { New: "blue", Contacted: "warn", Quoted: "purple", Won: "good", Lost: "bad" };
const KIND_ICON = { "List a product": "🛒", "Rent a machine": "🏢", "Buy a machine": "🤝", "Direct supply": "🍎", "Talk to our team": "💬" };
const isoDay = (date) => new Date(date.getTime() + 330 * 60000).toISOString().slice(0, 10); // India date
const shift = (days) => isoDay(new Date(Date.now() + days * 86400000));
// Quick ranges for the Excel: [label, from, to] (India dates).
const RANGES = () => {
  const today = shift(0);
  const monday = (() => { const now = new Date(Date.now() + 330 * 60000); const back = (now.getUTCDay() + 6) % 7; return shift(-back); })();
  const monthStart = `${today.slice(0, 7)}-01`;
  const lastMonthEnd = isoDay(new Date(new Date(`${monthStart}T00:00:00+05:30`).getTime() - 86400000));
  return [["Today", today, today], ["Yesterday", shift(-1), shift(-1)], ["This week", monday, today], ["Last 7 days", shift(-6), today],
    ["This month", monthStart, today], ["Last month", `${lastMonthEnd.slice(0, 7)}-01`, lastMonthEnd], ["All", "", ""]];
};
const when = (value) => new Date(value).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export default function OfficeLeads({ token }) {
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("open");
  const [search, setSearch] = useState("");
  const [notes, setNotes] = useState({});
  const [excel, setExcel] = useState(null); // { from, to, status } while the download panel is open
  const [downloading, setDownloading] = useState(false);
  const download = async () => {
    setDownloading(true);
    setError("");
    try {
      const params = { ...(excel.from ? { from: excel.from } : {}), ...(excel.to ? { to: excel.to } : {}), ...(excel.status !== "all" ? { status: excel.status } : {}) };
      const response = await API.get("/office-leads/export.xlsx", { headers, params, responseType: "blob" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(response.data);
      link.download = `office-leads_${excel.from || "start"}_to_${excel.to || shift(0)}${excel.status !== "all" ? `_${excel.status.toLowerCase()}` : ""}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(link.href), 5000);
      setExcel(null);
    } catch (err) {
      let message = "Could not download the Excel";
      try { message = JSON.parse(await err.response.data.text()).error || message; } catch { /* not JSON */ }
      setError(message);
    } finally {
      setDownloading(false);
    }
  };
  const load = useCallback(async () => {
    try {
      setData((await API.get("/office-leads", { headers })).data);
      setError("");
    } catch (err) {
      setError(err.response?.data?.error || "Could not load the leads");
    }
  }, [headers]);
  useEffect(() => {
    const first = setTimeout(load, 0);
    const every = setInterval(() => { if (document.visibilityState === "visible" && document.body.dataset.view === "office-leads") load(); }, 60000);
    return () => { clearTimeout(first); clearInterval(every); };
  }, [load]);

  const update = async (lead, body) => {
    try {
      const response = await API.patch(`/office-leads/${lead.id}`, body, { headers });
      setData((current) => ({ ...current, leads: current.leads.map((item) => (item.id === lead.id ? response.data : item)) }));
      setNotes((current) => ({ ...current, [lead.id]: "" }));
    } catch (err) {
      setError(err.response?.data?.error || "Could not save");
    }
  };

  const leads = data?.leads || [];
  const query = search.trim().toLowerCase();
  const shown = leads.filter((lead) => (filter === "all" || (filter === "open" ? !["Won", "Lost"].includes(lead.status) : lead.status === filter))
    && (!query || [lead.ref, lead.name, lead.wa_name, lead.company, lead.city, lead.details, lead.phone, lead.kind, lead.email].some((value) => String(value || "").toLowerCase().includes(query))));
  const count = (status) => leads.filter((lead) => lead.status === status).length;

  return (
    <div className="audit-workspace ol-page">
      {error && <div className="audit-error">{error}</div>}
      {data && !data.connected && <div className="ls-warn">The office WhatsApp number isn't connected yet. An admin connects it in Admin Settings → Office WhatsApp number.</div>}
      <div className="ol-tabs">
        {[["open", `Open · ${leads.length - count("Won") - count("Lost")}`], ...STATUSES.map((status) => [status, `${status} · ${count(status)}`]), ["all", `All · ${leads.length}`]].map(([key, label]) => (
          <button type="button" key={key} className={filter === key ? "is-on" : ""} onClick={() => setFilter(key)}>{label}</button>
        ))}
      </div>
      <div className="ol-toolbar">
        <input className="ol-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, company, city, phone, email…" />
        <button type="button" className="ol-excel-btn" onClick={() => setExcel(excel ? null : { from: shift(-6), to: shift(0), status: "all" })}>⬇ Download Excel</button>
      </div>
      {excel && (
        <div className="ol-excel">
          <div className="ol-excel-head"><b>Download leads as Excel</b><small>By the date the lead came in (India time). Both dates are included.</small></div>
          <div className="ol-excel-quick">
            {RANGES().map(([label, from, to]) => (
              <button type="button" key={label} className={excel.from === from && excel.to === to ? "is-on" : ""} onClick={() => setExcel((current) => ({ ...current, from, to }))}>{label}</button>
            ))}
          </div>
          <div className="ol-excel-fields">
            <label>From<input type="date" value={excel.from} max={excel.to || undefined} onChange={(event) => setExcel((current) => ({ ...current, from: event.target.value }))} /></label>
            <label>To<input type="date" value={excel.to} min={excel.from || undefined} max={shift(0)} onChange={(event) => setExcel((current) => ({ ...current, to: event.target.value }))} /></label>
            <label>Status<select value={excel.status} onChange={(event) => setExcel((current) => ({ ...current, status: event.target.value }))}>
              <option value="all">All statuses</option>
              {STATUSES.map((name) => <option key={name}>{name}</option>)}
            </select></label>
          </div>
          <p className="ol-excel-count">{(() => {
            const n = leads.filter((lead) => { const d = isoDay(new Date(lead.created_at)); return (!excel.from || d >= excel.from) && (!excel.to || d <= excel.to) && (excel.status === "all" || lead.status === excel.status); }).length;
            return `${n} lead${n === 1 ? "" : "s"} in this range · sheets: Leads (all details and notes) and Summary (per day, type and status)`;
          })()}</p>
          <div className="ol-excel-actions">
            <button type="button" className="audit-btn" onClick={() => setExcel(null)}>Cancel</button>
            <button type="button" className="ol-excel-go" disabled={downloading || (excel.from && excel.to && excel.from > excel.to)} onClick={download}>{downloading ? "Preparing…" : "⬇ Download"}</button>
          </div>
        </div>
      )}
      {!data && !error && <p className="audit-empty">Loading…</p>}
      {data && !shown.length && <p className="audit-empty">{leads.length ? "No leads here." : "No leads yet. They appear here when people answer the office bot's questions."}</p>}
      <div className="ol-list">
        {shown.map((lead) => (
          <article key={lead.id} className={`ol-card ol-${TONE[lead.status]}`}>
            <div className="ol-top">
              <span className="ol-kind">{KIND_ICON[lead.kind] || "📩"} {lead.kind} · {lead.ref}</span>
              <span className={`audit-pill fnd-tone-${TONE[lead.status]}`}>{lead.status}</span>
            </div>
            <h3>{lead.name || lead.wa_name || `+${lead.phone}`}{lead.company ? <small> · {lead.company}</small> : null}</h3>
            {lead.details && <p className="ol-details">{lead.details}</p>}
            <div className="ol-meta">
              {lead.city && <span>📍 {lead.city}</span>}
              <a href={`https://wa.me/${lead.phone}`} target="_blank" rel="noreferrer">💬 +{lead.phone}</a>
              {lead.email && <a href={`mailto:${lead.email}`}>📧 {lead.email}</a>}
              <a href={`tel:+${lead.phone}`}>📞 Call</a>
              <span>{when(lead.created_at)}</span>
            </div>
            <div className="ol-actions">
              <select value={lead.status} onChange={(event) => update(lead, { status: event.target.value })} aria-label="Status">
                {STATUSES.map((status) => <option key={status}>{status}</option>)}
              </select>
              <input value={notes[lead.id] || ""} onChange={(event) => setNotes((current) => ({ ...current, [lead.id]: event.target.value }))} placeholder="Add a note (called, quote sent…)" onKeyDown={(event) => { if (event.key === "Enter" && notes[lead.id]?.trim()) update(lead, { note: notes[lead.id] }); }} />
              <button type="button" className="audit-btn" disabled={!notes[lead.id]?.trim()} onClick={() => update(lead, { note: notes[lead.id] })}>Add note</button>
            </div>
            {(lead.notes || []).length > 0 && (
              <ul className="ol-notes">
                {[...lead.notes].reverse().slice(0, 5).map((item, index) => (
                  <li key={index}><b>{item.by}</b> · {when(item.at)}{item.status ? ` · → ${item.status}` : ""}{item.note ? `: ${item.note}` : ""}</li>
                ))}
              </ul>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
