import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";

/* Live Stock: what is in each vending machine today, from the Wendor sales report the office
   uploads each day and the refill photos refillers already send. See machineStock.js. */

const API = axios.create({ baseURL: "https://whatsapp-bot-backend-b3nb.onrender.com" });
const STATUS = { empty: ["Empty", "bad"], low: ["Low", "warn"], ok: ["OK", "good"], unknown: ["No refill yet", "muted"] };
const dayText = (value) => (value ? new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—");
const whenText = (value) => (value ? new Date(value).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "—");
const num = (value) => (value == null ? "—" : Number(value).toLocaleString("en-IN"));
const readFile = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve({ name: file.name, data: reader.result });
  reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
  reader.readAsDataURL(file);
});

function Fill({ value, max }) {
  const share = max ? Math.max(0, Math.min(1, value / max)) : 0;
  const tone = share <= 0.15 ? "bad" : share <= 0.35 ? "warn" : "good";
  return <span className={`ls-fill is-${tone}`} title={`${num(value)} of ${num(max)}`}><i style={{ width: `${share * 100}%` }} /></span>;
}

function Pill({ status }) {
  const [label, tone] = STATUS[status] || STATUS.unknown;
  return <span className={`audit-pill fnd-tone-${tone}`}>{label}</span>;
}

/* ---------- One machine ---------- */
function MachineView({ id, headers, locations, onBack, notify, onChanged }) {
  const [data, setData] = useState(null);
  const [query, setQuery] = useState("");
  const [counting, setCounting] = useState(null);
  const [countValue, setCountValue] = useState("");
  const [filter, setFilter] = useState("all");
  const load = useCallback(() => API.get(`/stock/machines/${id}`, { headers }).then((response) => setData(response.data)).catch(() => notify("Could not load the machine", true)), [id, headers, notify]);
  useEffect(() => { const timer = setTimeout(load, 0); return () => clearTimeout(timer); }, [load]);
  const act = async (request, message) => {
    try { await request(); if (message) notify(message); await load(); onChanged(); } catch (err) { notify(err.response?.data?.error || "Could not save", true); }
  };
  if (!data) return <p className="audit-empty">Loading…</p>;
  const q = query.trim().toLowerCase();
  const slots = data.slots.filter((slot) => (filter === "all" || (filter === "attention" ? ["empty", "low"].includes(slot.status) : slot.capacity_estimated)) && (!q || `${slot.position} ${slot.product || ""} ${slot.products.join(" ")}`.toLowerCase().includes(q)));
  const t = data.totals;
  const bringList = data.slots.filter((slot) => slot.bring > 0).map((slot) => `Slot ${slot.position} · ${slot.product || "?"}: ${slot.bring}`).join("\n");

  return (
    <div className="ls">
      <div className="ds-detail-head">
        <button type="button" className="audit-btn" onClick={onBack}>← All machines</button>
        <h2>{data.name}<span>Wendor {data.wendor_id}{data.location_name ? ` · ${data.location_name}` : ""}</span></h2>
      </div>

      {!data.location_id && (
        <div className="ls-warn">
          ⚠ Not linked to a Refill Schedule location, so its refill photos can't count as refills.
          <select defaultValue="" onChange={(event) => event.target.value && act(() => API.patch(`/stock/machines/${id}`, { location_id: event.target.value }, { headers }), "Linked")} aria-label="Refill Schedule location">
            <option value="">Link to location…</option>
            {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
          </select>
        </div>
      )}
      {data.missing_days.length > 0 && <div className="ls-warn">⚠ No sales uploaded for {data.missing_days.map(dayText).join(", ")} since the last refill: stock below looks higher than it really is until those reports are uploaded.</div>}
      {t.estimated_sizes > 0 && <div className="ls-note">ℹ {t.estimated_sizes} slot size{t.estimated_sizes === 1 ? " is" : "s are"} estimated from sales (marked ~). Type the real number in “Fits” for exact stock.</div>}

      <div className="fnd-kpis ds-kpis ls-kpis">
        <div className="fnd-kpi-blue"><span>In machine now</span><b>{num(t.in_machine)}</b><small>of {num(t.capacity)} it holds · as of {data.data_until ? `${dayText(data.data_until)} ${data.data_until.slice(11)}` : "—"}</small></div>
        <div className={t.empty ? "fnd-kpi-bad" : "fnd-kpi-good"}><span>Empty slots</span><b>{t.empty}</b><small>{t.low} more running low</small></div>
        <div className="fnd-kpi-purple"><span>Sells per day</span><b>{num(t.per_day)}</b><small>{num(t.sold_yesterday)} on {dayText(data.data_to)}</small></div>
        <div className="fnd-kpi-warn"><span>To bring</span><b>{num(t.bring)}</b><small>to fill every slot</small></div>
        <div><span>Last refill</span><b className="ls-small-b">{data.last_refill ? whenText(data.last_refill.at) : "—"}</b><small>{data.last_refill ? (data.last_refill.source === "photo" ? `photo${data.last_refill.by ? ` · ${data.last_refill.by}` : ""}` : `by hand · ${data.last_refill.by || ""}`) : "No refill recorded"}</small></div>
      </div>

      <section className="audit-card">
        <div className="ls-tools">
          <div className="ds-filter-chips">
            {[["all", `All slots (${data.slots.length})`], ["attention", `Empty & low (${t.empty + t.low})`], ["estimated", `Size to set (${t.estimated_sizes})`]].map(([key, label]) => <button type="button" key={key} className={filter === key ? "active" : ""} onClick={() => setFilter(key)}>{label}</button>)}
          </div>
          <input className="ds-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search slot or product" aria-label="Search slots" />
          <button type="button" className="audit-btn" onClick={() => window.confirm(`Mark ${data.name} as refilled now (every slot full)? Use this only for a refill with no photo.`) && act(() => API.post(`/stock/machines/${id}/marks`, { kind: "refill" }, { headers }), "Marked as refilled")}>Refilled now (no photo)</button>
          <button type="button" className="audit-btn" disabled={!bringList} onClick={() => { navigator.clipboard?.writeText(`${data.name} · what to bring\n${bringList}`); notify("What to bring copied"); }}>Copy what to bring</button>
        </div>
        <div className="ds-table-wrap">
          <table className="ds-table ls-table">
            <thead><tr><th>Slot</th><th>Product (last sold)</th><th>Fits</th><th>In machine</th><th>Sold since refill</th><th>Per day</th><th>Days left</th><th>Bring</th><th>Status</th><th /></tr></thead>
            <tbody>
              {slots.map((slot) => (
                <tr key={slot.position} className={slot.status === "empty" ? "is-problem" : slot.status === "low" ? "is-check" : ""}>
                  <td><b>{slot.position}</b></td>
                  <td title={slot.products.length > 1 ? `Also sold from this slot this week: ${slot.products.join(", ")}` : ""}>{slot.product || <span className="na">—</span>}{slot.products.length > 1 && <small className="ds-sub">+{slot.products.length - 1} other product{slot.products.length > 2 ? "s" : ""} this week</small>}{slot.oversold > 0 && <small className="ds-sub ds-short">Sold {slot.oversold} more than it fits: raise “Fits”?</small>}</td>
                  <td>
                    <input className="ds-qty ls-fits" type="number" min="0" defaultValue={slot.capacity_set ? slot.capacity : ""} placeholder={slot.capacity != null ? `~${slot.capacity}` : "?"} aria-label={`Slot ${slot.position} fits`}
                      onBlur={(event) => { const value = event.target.value; if (String(value) !== String(slot.capacity_set ? slot.capacity : "")) act(() => API.put(`/stock/machines/${id}/slots/${encodeURIComponent(slot.position)}`, { capacity: value }, { headers })); }} />
                  </td>
                  <td>{slot.in_machine == null ? <span className="na">—</span> : <span className="ls-cell-stock"><b>{slot.in_machine}</b><Fill value={slot.in_machine} max={slot.capacity} /></span>}<small className="ds-sub">{slot.start ? `from ${slot.start.from} · ${whenText(slot.start.at)}` : ""}</small></td>
                  <td>{num(slot.sold_since)}</td>
                  <td>{num(slot.per_day)}</td>
                  <td>{slot.days_left == null ? "—" : slot.days_left < 1 ? <b className="ds-short">&lt; 1</b> : slot.days_left}</td>
                  <td>{slot.bring ? <b>{slot.bring}</b> : "—"}</td>
                  <td><Pill status={slot.status} /></td>
                  <td>
                    {counting === slot.position ? (
                      <span className="ls-count">
                        <input type="number" min="0" autoFocus value={countValue} onChange={(event) => setCountValue(event.target.value)} placeholder="Now" aria-label={`Count for slot ${slot.position}`} />
                        <button type="button" className="audit-btn audit-btn-primary" disabled={countValue === ""} onClick={() => { act(() => API.post(`/stock/machines/${id}/marks`, { kind: "count", position: slot.position, qty: countValue }, { headers }), `Slot ${slot.position} set to ${countValue}`); setCounting(null); }}>Save</button>
                        <button type="button" className="ds-x" onClick={() => setCounting(null)} aria-label="Cancel">✕</button>
                      </span>
                    ) : <button type="button" className="audit-btn" title="Type the real number in this slot now (a spot check)" onClick={() => { setCounting(slot.position); setCountValue(""); }}>Count</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!slots.length && <p className="audit-empty">No slots match.</p>}
        </div>
      </section>

      <section className="audit-card">
        <div className="audit-card-head"><div><h3>Day by day</h3><p>Sold, sales value and refills each day (last 30 days with sales)</p></div></div>
        <div className="ds-table-wrap">
          <table className="ds-table">
            <thead><tr><th>Day</th><th>Sold</th><th>Value</th><th>Refills</th><th>Top products</th></tr></thead>
            <tbody>
              {data.history.map((day) => (
                <tr key={day.day}><td><b>{dayText(day.day)}</b></td><td>{num(day.sold)}</td><td>₹{num(day.value)}</td><td>{day.refills ? `🔄 ${day.refills}` : "—"}</td><td className="ls-top">{day.top.map(([name, qty]) => `${name} (${qty})`).join(" · ")}</td></tr>
              ))}
            </tbody>
          </table>
          {!data.history.length && <p className="audit-empty">No sales uploaded yet.</p>}
        </div>
      </section>
    </div>
  );
}

/* ---------- All machines ---------- */
export default function LiveStock({ token }) {
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);
  const [data, setData] = useState(null);
  const [machineId, setMachineId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const [query, setQuery] = useState("");
  const notify = useCallback((message, isError = false) => { setToast({ message, isError }); setTimeout(() => setToast(null), 4500); }, []);
  const load = useCallback(() => API.get("/stock/overview", { headers }).then((response) => setData(response.data)).catch((err) => notify(err.response?.data?.error || "Could not load Live Stock", true)), [headers, notify]);
  useEffect(() => { const timer = setTimeout(load, 0); return () => clearTimeout(timer); }, [load]);

  const upload = async (files) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const file of files) {
        const response = await API.post("/stock/upload", { file: await readFile(file) }, { headers });
        const result = response.data;
        notify(`${file.name}: ${num(result.sold)} sold · ${dayText(result.day_from)}${result.day_to !== result.day_from ? ` – ${dayText(result.day_to)}` : ""}`);
      }
      await load();
    } catch (err) {
      notify(err.response?.data?.error || err.message || "Could not read the report", true);
    } finally {
      setBusy(false);
    }
  };

  if (!data) return <div className="audit-workspace"><p className="audit-empty">Loading Live Stock…</p></div>;
  const machines = data.machines.filter((machine) => !query.trim() || `${machine.name} ${machine.location_name || ""}`.toLowerCase().includes(query.trim().toLowerCase()));
  const sum = (key) => data.machines.reduce((total, machine) => total + (machine.totals[key] || 0), 0);
  const lastUpload = data.uploads[0];

  return (
    <div className="audit-workspace ls-page">
      {toast && <div className={`audit-toast ${toast.isError ? "is-error" : ""}`}>{toast.message}</div>}

      <section className="audit-card ls-upload">
        <div>
          <h3>Upload yesterday's Wendor report</h3>
          <p>Wendor → Transactions → download for the day (or several days) → upload here. Uploading a day again replaces it, so nothing is counted twice. Only completed vends count.</p>
          {lastUpload && <small className="na">Last upload: {lastUpload.file_name || "report"} · {dayText(lastUpload.day_from)}{lastUpload.day_to !== lastUpload.day_from ? ` – ${dayText(lastUpload.day_to)}` : ""} · {num(lastUpload.sold)} sold · {whenText(lastUpload.uploaded_at)} by {lastUpload.uploaded_by}</small>}
        </div>
        <label className={`audit-btn audit-btn-primary ls-upload-btn ${busy ? "is-busy" : ""}`}>
          {busy ? "Reading…" : "⬆ Upload Wendor report"}
          <input type="file" accept=".xlsx,.xls,.csv" multiple hidden disabled={busy} onChange={(event) => { const files = [...(event.target.files || [])]; event.target.value = ""; upload(files); }} />
        </label>
      </section>

      {machineId ? (
        <MachineView key={machineId} id={machineId} headers={headers} locations={data.locations} notify={notify} onChanged={load} onBack={() => setMachineId(null)} />
      ) : <>
        <div className="fnd-kpis ds-kpis ls-kpis">
          <div className="fnd-kpi-blue"><span>Machines</span><b>{data.machines.length}</b><small>{data.machines.filter((machine) => !machine.location_id).length} not linked to a location</small></div>
          <div><span>Items in machines</span><b>{num(sum("in_machine"))}</b><small>of {num(sum("capacity"))} they hold</small></div>
          <div className={sum("empty") ? "fnd-kpi-bad" : "fnd-kpi-good"}><span>Empty slots</span><b>{sum("empty")}</b><small>{sum("low")} more running low</small></div>
          <div className="fnd-kpi-purple"><span>Sold per day</span><b>{num(Math.round(sum("per_day")))}</b><small>all machines</small></div>
          <div className="fnd-kpi-warn"><span>To bring</span><b>{num(sum("bring"))}</b><small>to fill every machine</small></div>
        </div>

        {data.alerts.length > 0 && (
          <section className="audit-card ls-alerts">
            <div className="audit-card-head"><div><h3>⚠ Running out ({data.alerts.length})</h3><p>Empty slots and slots with less than a day left, across machines</p></div></div>
            <div className="ds-table-wrap is-tall">
              <table className="ds-table">
                <thead><tr><th>Machine</th><th>Slot</th><th>Product</th><th>In machine</th><th>Per day</th><th>Bring</th><th /></tr></thead>
                <tbody>
                  {data.alerts.map((alert) => (
                    <tr key={`${alert.machine_id}-${alert.position}`} className="ds-click" onClick={() => setMachineId(alert.machine_id)}>
                      <td><b>{alert.machine}</b>{alert.location && alert.location !== alert.machine && <small className="ds-sub">{alert.location}</small>}</td>
                      <td>{alert.position}</td><td>{alert.product || "—"}</td><td><b>{alert.in_machine}</b></td><td>{alert.per_day}</td><td>{alert.bring ?? "—"}</td><td><Pill status={alert.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <section className="audit-card">
          <div className="ls-tools">
            <b>Machines</b>
            <input className="ds-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search machine or location" aria-label="Search machines" />
          </div>
          <div className="table-wrapper ds-orders-table">
            <table>
              <thead><tr><th>Machine</th><th>Stock now</th><th>Empty / low</th><th>Sold per day</th><th>Bring</th><th>Last refill</th><th>Sales up to</th></tr></thead>
              <tbody>
                {machines.map((machine) => (
                  <tr key={machine.id} className="ds-order-row" onClick={() => setMachineId(machine.id)} tabIndex={0} onKeyDown={(event) => event.key === "Enter" && setMachineId(machine.id)}>
                    <td data-label="Machine"><b>{machine.name}</b><small className="ds-sub">{machine.location_name ? `📍 ${machine.location_name}` : "⚠ Not linked to a location"}</small></td>
                    <td data-label="Stock now">{machine.last_refill ? <><b>{num(machine.totals.in_machine)}</b> / {num(machine.totals.capacity)}<Fill value={machine.totals.in_machine} max={machine.totals.capacity} /></> : <span className="na">No refill recorded</span>}</td>
                    <td data-label="Empty / low">{machine.totals.empty ? <b className="ds-minus">{machine.totals.empty} empty</b> : <span className="na">0 empty</span>}<small className="ds-sub">{machine.totals.low} low</small></td>
                    <td data-label="Sold per day">{num(machine.totals.per_day)}<small className="ds-sub">{num(machine.totals.sold_yesterday)} on {dayText(machine.data_to)}</small></td>
                    <td data-label="Bring">{num(machine.totals.bring)}</td>
                    <td data-label="Last refill">{machine.last_refill ? whenText(machine.last_refill.at) : "—"}<small className="ds-sub">{machine.last_refill ? (machine.last_refill.source === "photo" ? "refill photo" : "by hand") : ""}</small></td>
                    <td data-label="Sales up to">{machine.data_until ? `${dayText(machine.data_until)} ${machine.data_until.slice(11)}` : "—"}{machine.missing_days.length > 0 && <small className="ds-sub ds-short">{machine.missing_days.length} day{machine.missing_days.length === 1 ? "" : "s"} missing</small>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!machines.length && <p className="audit-empty">{data.machines.length ? "No machines match." : "No machines yet. Upload a Wendor transactions report to start."}</p>}
          </div>
        </section>
        <p className="ls-foot">Stock in a slot = how many fit (at the last refill photo) or the last count, minus completed vends since then. Products in a slot change, so the product shown is the last one sold from it. Stock is as of the last uploaded sale.</p>
      </>}
    </div>
  );
}
