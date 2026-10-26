/* Office Leads: enquiries the office bot collected on the director's office WhatsApp number
   (list a product, rent / buy a machine, direct supply). Each moves New → Contacted → Quoted →
   Won / Lost, with notes. Server side: officeBot.js. */
import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";

const API = axios.create({ baseURL: "https://whatsapp-bot-backend-b3nb.onrender.com" });
const STATUSES = ["New", "Contacted", "Quoted", "Won", "Lost"];
const TONE = { New: "blue", Contacted: "warn", Quoted: "purple", Won: "good", Lost: "bad" };
const KIND_ICON = { "List a product": "🛒", "Rent a machine": "🏢", "Buy a machine": "🤝", "Direct supply": "🍎" };
const when = (value) => new Date(value).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export default function OfficeLeads({ token }) {
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("open");
  const [search, setSearch] = useState("");
  const [notes, setNotes] = useState({});
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
      <input className="ol-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, company, city, phone, email…" />
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
