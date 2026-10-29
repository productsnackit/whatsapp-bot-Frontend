import { useEffect, useState } from "react";
import axios from "axios";

/* Everything about one location in one place (tap a location name anywhere): its refiller,
   managers and helpers with call / WhatsApp, open Internal Audit tasks, Refill Audit problems,
   recent refills and sales. Server side: locationTeams.js. */

const API = axios.create({ baseURL: "https://whatsapp-bot-backend-b3nb.onrender.com" });
const rupees = (value) => `₹${Math.round(Number(value) || 0).toLocaleString("en-IN")}`;
const day = (value) => (value ? new Date(String(value).length === 10 ? `${value}T00:00:00` : value).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "");
const phoneOf = (phone) => { const digits = String(phone || "").replace(/\D/g, ""); return digits.length === 10 ? `91${digits}` : digits; };
const REFILL_LABEL = { scheduled: "⏳ Due", done: "📸 Sent", verified: "✅ Done", rejected: "❌ Redo", missed: "⚠️ Missed" };

function Person({ role, name, phone, note }) {
  const number = phoneOf(phone);
  return (
    <div className="lc-person">
      <span className="lc-avatar">{String(name || "?").slice(0, 1).toUpperCase()}</span>
      <div><small>{role}</small><b>{name || "—"}</b>{note && <em>{note}</em>}</div>
      {number && <a href={`tel:+${number}`} aria-label={`Call ${name}`}>📞</a>}
      {number && <a href={`https://wa.me/${number}`} target="_blank" rel="noreferrer" aria-label={`WhatsApp ${name}`}>💬</a>}
    </div>
  );
}

export default function LocationCard({ token, locationId, locationName, onClose, onOpenFinding, onNewTask }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    const headers = { Authorization: `Bearer ${token}` };
    const load = async () => {
      try {
        let id = locationId;
        if (!id && locationName) {
          const list = (await API.get("/location-teams", { headers })).data.locations;
          const wanted = String(locationName).toLowerCase().replace(/[^a-z0-9]/g, "");
          id = list.find((item) => item.name.toLowerCase().replace(/[^a-z0-9]/g, "") === wanted)?.id;
          if (!id) throw new Error(`${locationName} isn't in Locations & teams yet.`);
        }
        const response = await API.get(`/location-teams/${id}`, { headers });
        if (alive) setData(response.data);
      } catch (err) {
        if (alive) setError(err.response?.data?.error || err.message || "Could not open the location");
      }
    };
    load();
    const onKey = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { alive = false; window.removeEventListener("keydown", onKey); };
  }, [token, locationId, locationName, onClose]);

  const change = data?.sales_prev_30d ? Math.round(((data.sales_30d - data.sales_prev_30d) / data.sales_prev_30d) * 100) : null;
  return (
    <div className="lc-back" onClick={onClose}>
      <aside className="lc" role="dialog" aria-label="Location" onClick={(event) => event.stopPropagation()}>
        <div className="lc-head">
          <div><small>📍 Location</small><h3>{data?.name || locationName || "Location"}</h3>{data?.machine_code && <span>{data.machine_code}</span>}</div>
          <button type="button" className="lc-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {error ? <p className="lc-msg">{error}</p> : !data ? <p className="lc-msg">Loading…</p> : (
          <div className="lc-body">
            <section className="lc-team">
              <Person role="Refiller" name={data.refiller?.name || "Not set"} phone={data.refiller?.phone} />
              {data.managers.map((manager, index) => (
                <Person key={manager.name} role={index === 0 ? "Area manager" : "Also manages"} name={manager.acting} phone={manager.phone} note={manager.covered_by ? `Covering for ${manager.name} until ${day(manager.until)}` : manager.user_id ? null : "Not in Employees & access"} />
              ))}
              {!data.managers.length && <p className="lc-muted">No manager set. Add one in Locations & teams.</p>}
              {data.helpers && <p className="lc-helpers"><b>Helpers:</b> {data.helpers}</p>}
            </section>

            <section className="lc-stats">
              <div className={data.overdue_tasks ? "is-bad" : ""}><b>{data.open_tasks}</b><small>Open tasks{data.overdue_tasks ? ` · ${data.overdue_tasks} overdue` : ""}</small></div>
              <div className={data.open_problems ? "is-warn" : ""}><b>{data.open_problems}</b><small>Refill problems</small></div>
              <div className={data.missed_refills ? "is-bad" : ""}><b>{data.missed_refills}</b><small>Missed refills · 14 days</small></div>
              <div><b>{data.refills_done}</b><small>Refills done · 14 days</small></div>
              <div className="lc-wide"><b>{data.sales_30d == null ? "—" : rupees(data.sales_30d)}</b><small>Sales · last 30 days{change != null ? ` · ${change >= 0 ? "▲" : "▼"} ${Math.abs(change)}%` : ""}</small></div>
            </section>

            {onNewTask && <button type="button" className="lc-new" onClick={() => onNewTask(data.name)}>＋ Give a task for {data.name}</button>}

            <section>
              <h4>Open tasks ({data.findings.length})</h4>
              {!data.findings.length && <p className="lc-muted">No open Internal Audit tasks.</p>}
              <ul className="lc-list">
                {data.findings.map((item) => (
                  <li key={item.id}>
                    <button type="button" onClick={() => onOpenFinding?.(item.id)} disabled={!onOpenFinding}>
                      <span><b>{item.title}</b><small>{item.ref} · {item.status} · {item.assignee_name || item.owner_department || "—"}</small></span>
                      <em className={item.due_date && item.due_date < new Date().toISOString().slice(0, 10) ? "is-bad" : ""}>Due {day(item.due_date)}</em>
                    </button>
                  </li>
                ))}
              </ul>
            </section>

            {data.problems.length > 0 && (
              <section>
                <h4>Refill Audit problems ({data.problems.length})</h4>
                <ul className="lc-list">
                  {data.problems.map((item) => <li key={item.id}><span className="lc-row"><span><b>{item.defect}</b><small>{item.ref} · {item.refiller || "—"}{item.escalated_at ? " · sent to the office" : ""}</small></span><em>{day(item.created_at)}</em></span></li>)}
                </ul>
              </section>
            )}

            <section>
              <h4>Recent refills</h4>
              {!data.refills.length && <p className="lc-muted">No refills scheduled here yet.</p>}
              <ul className="lc-list">
                {data.refills.map((item) => <li key={item.id}><span className="lc-row"><span><b>{day(item.due_date)}</b><small>{item.refiller_name || "—"}</small></span><em className={item.status === "missed" || item.status === "rejected" ? "is-bad" : ""}>{REFILL_LABEL[item.status] || item.status}</em></span></li>)}
              </ul>
            </section>

            {data.top_products.length > 0 && (
              <section>
                <h4>Best sellers · 30 days</h4>
                <ul className="lc-list">{data.top_products.map((item) => <li key={item.product}><span className="lc-row"><span><b>{item.product}</b></span><em>{item.units} sold</em></span></li>)}</ul>
              </section>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
