import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { LocationsTab, DcsTab, SettingsTab } from "./LocationStock.jsx";

/* Live Stock: how much of each product is at each client location (warehouse stock + DCs −
   Wendor sales, see locationStock.js / LocationStock.jsx), and what is in each vending machine
   (Wendor sales and each machine's fixed refill time, see machineStock.js). */

const API = axios.create({ baseURL: "https://whatsapp-bot-backend-b3nb.onrender.com" });
const STATUS = { empty: ["Empty", "bad"], low: ["Low", "warn"], ok: ["OK", "good"], unknown: ["No refill yet", "muted"] };
const dayText = (value) => (value ? new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—");
const whenText = (value) => (value ? new Date(value).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "—");
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const time12 = (time) => { if (!time) return ""; const [h, m] = time.split(":").map(Number); return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`; };
// "Mon–Sat 9:00 am", "Daily 9:00 am", "Mon, Wed, Fri 10:30 am"
function refillText(days, time) {
  if (!days?.length || !time) return null;
  const sorted = [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  const label = sorted.length === 7 ? "Daily" : sorted.join() === "1,2,3,4,5,6" ? "Mon–Sat" : sorted.join() === "1,2,3,4,5" ? "Mon–Fri" : sorted.map((day) => DAYS[day]).join(", ");
  return `${label} ${time12(time)}`;
}
const yesterdayIst = () => new Date(Date.now() + 5.5 * 3600000 - 86400000).toISOString().slice(0, 10);
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

function RefillTime({ machine, onSave }) {
  const [days, setDays] = useState(machine.refill_days || [1, 2, 3, 4, 5, 6]);
  const [time, setTime] = useState(machine.refill_time || "09:00");
  const [open, setOpen] = useState(!machine.refill_days);
  const text = refillText(machine.refill_days, machine.refill_time);
  if (!open) {
    return (
      <div className="ls-refill">
        <span>🔄 Refilled <b>{text}</b>{machine.next_refill ? <> · next {whenText(machine.next_refill)}</> : null}</span>
        <button type="button" className="audit-btn" onClick={() => setOpen(true)}>Change</button>
      </div>
    );
  }
  return (
    <div className="ls-refill is-edit">
      <b>{text ? "Change refill time" : "⚠ Set when this machine is refilled"}</b>
      <div className="ls-days">
        {[1, 2, 3, 4, 5, 6, 0].map((day) => (
          <button type="button" key={day} className={days.includes(day) ? "on" : ""} aria-pressed={days.includes(day)} onClick={() => setDays((list) => (list.includes(day) ? list.filter((item) => item !== day) : [...list, day]))}>{DAYS[day]}</button>
        ))}
      </div>
      <label>at <input type="time" value={time} onChange={(event) => setTime(event.target.value)} aria-label="Refill time" /></label>
      <button type="button" className="audit-btn audit-btn-primary" disabled={!days.length || !time} onClick={async () => { if (await onSave(days, time)) setOpen(false); }}>Save</button>
      {text && <button type="button" className="audit-btn" onClick={() => setOpen(false)}>Cancel</button>}
      <small className="na">The machine counts as full at this time on these days.</small>
    </div>
  );
}

/* ---------- One machine ---------- */
function MachineView({ id, headers, onBack, notify, onChanged }) {
  const [data, setData] = useState(null);
  const [query, setQuery] = useState("");
  const [counting, setCounting] = useState(null);
  const [countValue, setCountValue] = useState("");
  const [filter, setFilter] = useState("all");
  const load = useCallback(() => API.get(`/stock/machines/${id}`, { headers }).then((response) => setData(response.data)).catch(() => notify("Could not load the machine", true)), [id, headers, notify]);
  useEffect(() => { const timer = setTimeout(load, 0); return () => clearTimeout(timer); }, [load]);
  const [skipDay, setSkipDay] = useState(() => new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10));
  const act = async (request, message) => {
    try { await request(); if (message) notify(message); await load(); onChanged(); return true; } catch (err) { notify(err.response?.data?.error || "Could not save", true); return false; }
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
        <h2>{data.name}<span>{data.vendor === "vendvitor" ? "VendVitor" : "Wendor"} {data.wendor_id}{data.location_name ? ` · ${data.location_name}` : ""}</span></h2>
      </div>

      <RefillTime key={`${data.refill_days}-${data.refill_time}`} machine={data} onSave={(days, time) => act(() => API.put(`/stock/machines/${id}/refill-time`, { days, time }, { headers }), "Refill time saved")} />
      {data.refill_days && (
        <div className="ls-skip">
          <span>Refill didn't happen one day?</span>
          <input type="date" value={skipDay} onChange={(event) => setSkipDay(event.target.value)} aria-label="Day the refill didn't happen" />
          <button type="button" className="audit-btn" onClick={() => window.confirm(`Mark that ${data.name} was NOT refilled on ${dayText(skipDay)}?`) && act(() => API.post(`/stock/machines/${id}/marks`, { kind: "skip", day: skipDay }, { headers }), `No refill on ${dayText(skipDay)}`)}>Skip that refill</button>
          {data.skips.length > 0 && <small className="na">Skipped: {data.skips.map((skip) => dayText(skip.day)).join(", ")}</small>}
        </div>
      )}
      {data.data_to && data.data_to < yesterdayIst() && <div className="ls-warn">⚠ Sales are uploaded only up to {dayText(data.data_to)}. Upload the Wendor reports for the days after that, or the stock shown is higher than what's really left.</div>}
      {data.missing_days.length > 0 && <div className="ls-warn">⚠ No sales uploaded for {data.missing_days.map(dayText).join(", ")} since the last refill: stock below looks higher than it really is until those reports are uploaded.</div>}
      {t.estimated_sizes > 0 && <div className="ls-note">ℹ {t.estimated_sizes} slot size{t.estimated_sizes === 1 ? " is" : "s are"} estimated from sales (marked ~). Type the real number in “Fits” for exact stock.</div>}

      <div className="fnd-kpis ds-kpis ls-kpis">
        <div className="fnd-kpi-blue"><span>In machine now</span><b>{num(t.in_machine)}</b><small>of {num(t.capacity)} it holds · as of {data.data_until ? `${dayText(data.data_until)} ${data.data_until.slice(11)}` : "—"}</small></div>
        <div className={t.empty ? "fnd-kpi-bad" : "fnd-kpi-good"}><span>Empty slots</span><b>{t.empty}</b><small>{t.low} more running low</small></div>
        <div className="fnd-kpi-purple"><span>Sells per day</span><b>{num(t.per_day)}</b><small>{num(t.sold_yesterday)} on {dayText(data.data_to)}</small></div>
        <div className="fnd-kpi-warn"><span>To bring</span><b>{num(t.bring)}</b><small>to fill every slot</small></div>
        <div><span>Last refill</span><b className="ls-small-b">{data.last_refill ? whenText(data.last_refill.at) : "—"}</b><small>{data.last_refill ? (data.last_refill.source === "schedule" ? "refill time" : `extra refill · ${data.last_refill.by || ""}`) : "Set the refill time"}</small></div>
      </div>

      <section className="audit-card">
        <div className="ls-tools">
          <div className="ds-filter-chips">
            {[["all", `All slots (${data.slots.length})`], ["attention", `Empty & low (${t.empty + t.low})`], ["estimated", `Size to set (${t.estimated_sizes})`]].map(([key, label]) => <button type="button" key={key} className={filter === key ? "active" : ""} onClick={() => setFilter(key)}>{label}</button>)}
          </div>
          <input className="ds-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search slot or product" aria-label="Search slots" />
          <button type="button" className="audit-btn" onClick={() => window.confirm(`Mark ${data.name} as refilled now (every slot full)? Use this for an extra refill outside its usual time.`) && act(() => API.post(`/stock/machines/${id}/marks`, { kind: "refill" }, { headers }), "Marked as refilled")}>Extra refill now</button>
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
function MachinesTab({ headers, notify, version }) {
  const [data, setData] = useState(null);
  const [machineId, setMachineId] = useState(null);
  const [query, setQuery] = useState("");
  const load = useCallback(() => API.get("/stock/overview", { headers }).then((response) => setData(response.data)).catch((err) => notify(err.response?.data?.error || "Could not load the machines", true)), [headers, notify]);
  useEffect(() => { const timer = setTimeout(load, 0); return () => clearTimeout(timer); }, [load, version]);

  if (!data) return <p className="audit-empty">Loading machines…</p>;
  const machines = data.machines.filter((machine) => !query.trim() || `${machine.name} ${machine.location_name || ""}`.toLowerCase().includes(query.trim().toLowerCase()));
  const sum = (key) => data.machines.reduce((total, machine) => total + (machine.totals[key] || 0), 0);

  return (
    <div className="ls">
      {machineId ? (
        <MachineView key={machineId} id={machineId} headers={headers} notify={notify} onChanged={load} onBack={() => setMachineId(null)} />
      ) : <>
        <div className="fnd-kpis ds-kpis ls-kpis">
          <div className="fnd-kpi-blue"><span>Machines</span><b>{data.machines.length}</b><small>{data.machines.filter((machine) => !machine.refill_days).length} without a refill time</small></div>
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
                    <td data-label="Machine"><b>{machine.name}</b><small className="ds-sub">{refillText(machine.refill_days, machine.refill_time) ? `🔄 ${refillText(machine.refill_days, machine.refill_time)}` : "⚠ Set refill time"}</small></td>
                    <td data-label="Stock now">{machine.last_refill ? <><b>{num(machine.totals.in_machine)}</b> / {num(machine.totals.capacity)}<Fill value={machine.totals.in_machine} max={machine.totals.capacity} /></> : <span className="na">Set refill time</span>}</td>
                    <td data-label="Empty / low">{machine.totals.empty ? <b className="ds-minus">{machine.totals.empty} empty</b> : <span className="na">0 empty</span>}<small className="ds-sub">{machine.totals.low} low</small></td>
                    <td data-label="Sold per day">{num(machine.totals.per_day)}<small className="ds-sub">{num(machine.totals.sold_yesterday)} on {dayText(machine.data_to)}</small></td>
                    <td data-label="Bring">{num(machine.totals.bring)}</td>
                    <td data-label="Last refill">{machine.last_refill ? whenText(machine.last_refill.at) : "—"}<small className="ds-sub">{machine.next_refill ? `next ${whenText(machine.next_refill)}` : ""}</small></td>
                    <td data-label="Sales up to">{machine.data_until ? `${dayText(machine.data_until)} ${machine.data_until.slice(11)}` : "—"}{machine.data_to && machine.data_to < yesterdayIst() && <small className="ds-sub ds-short">upload reports since then</small>}{machine.missing_days.length > 0 && <small className="ds-sub ds-short">{machine.missing_days.length} day{machine.missing_days.length === 1 ? "" : "s"} missing</small>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!machines.length && <p className="audit-empty">{data.machines.length ? "No machines match." : "No machines yet. Upload a Wendor transactions report to start."}</p>}
          </div>
        </section>
        <p className="ls-foot">Stock in a slot = how many fit (at the machine's last refill time) or the last count, minus completed vends since then. Products in a slot change, so the product shown is the last one sold from it. Stock is as of the last uploaded sale.</p>
      </>}
    </div>
  );
}

/* ---------- The page: client locations (default), DCs, machines, settings (products: ProductList.jsx) ---------- */
const TABS = [["locations", "Locations"], ["dcs", "DCs"], ["machines", "Machines"], ["settings", "Settings"]];

export default function LiveStock({ token }) {
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);
  const [tab, setTab] = useState("locations");
  const [toast, setToast] = useState(null);
  const [version, setVersion] = useState(0);
  const [overview, setOverview] = useState(null);
  const [busy, setBusy] = useState("");
  const [pending, setPending] = useState(null); // closing stock whose location isn't in the file
  const notify = useCallback((message, isError = false) => { setToast({ message, isError }); setTimeout(() => setToast(null), 5000); }, []);
  const refresh = useCallback(() => setVersion((value) => value + 1), []);
  useEffect(() => {
    let alive = true;
    API.get("/locstock/overview", { headers }).then((response) => alive && setOverview(response.data)).catch((err) => notify(err.response?.data?.error || "Could not load Live Stock", true));
    return () => { alive = false; };
  }, [headers, notify, version]);

  // One upload box for the three kinds of file.
  const upload = async (kind, files) => {
    if (!files?.length) return;
    setBusy(kind);
    try {
      for (const file of files) {
        const body = { file: { ...(await readFile(file)), type: file.type } };
        if (kind === "wendor") {
          const result = (await API.post("/stock/upload", body, { headers })).data;
          const range = `${dayText(result.day_from)}${result.day_to !== result.day_from ? ` – ${dayText(result.day_to)}` : ""}`;
          notify(result.sold ? `${result.vendor === "vendvitor" ? `VendVitor ${(result.machines || []).join(", ")} · ` : ""}${range}: added ${num(result.sold)} sold${result.already ? ` · ${num(result.already)} sales were already saved` : ""}` : `${range}: nothing new, every sale was already saved`);
        } else if (kind === "warehouse") {
          // Asks the closing stock's date (and the location if needed) before reading it.
          setPending({ body, name: file.name, location_id: "", date: "", max: overview?.today });
          return;
        } else {
          const dc = (await API.post("/locstock/dcs", body, { headers })).data;
          notify(dc.status === "added" ? `DC ${dc.ref || ""} added: ${dc.lines.length} items, ${num(dc.units)} units${dc.replaced ? " (replaced the earlier one)" : ""}` : `DC ${dc.ref || ""}: ${dc.problem}. See the DCs tab.`, dc.status !== "added");
          if (dc.status !== "added") setTab("dcs");
        }
      }
    } catch (err) {
      notify(err.response?.data?.error || err.message || "Could not read the file", true);
    } finally {
      setBusy("");
      refresh();
    }
  };
  const notifyStock = (result) => notify(`Closing stock${result.location_names?.length ? ` for ${result.location_names.join(", ")}` : ""} on ${dayText(result.date)}${result.time && result.time !== "23:59" ? ` at ${result.time}` : ""}: ${result.saved} items, ${num(result.units)} units${result.expired ? ` (${num(result.expired)} expired not counted)` : ""}${result.unmatched.length ? ` · locations not matched: ${result.unmatched.join(", ")}` : ""}`, result.unmatched.length > 0 || !result.saved);
  const uploadPending = async () => {
    setBusy("warehouse");
    try {
      notifyStock((await API.post("/locstock/warehouse", { ...pending.body, location_id: pending.location_id, date: pending.date, time: pending.time || "" }, { headers })).data);
      setPending(null);
    } catch (err) {
      if (err.response?.data?.need_location) setPending((current) => ({ ...current, need_location: true }));
      notify(err.response?.data?.error || "Could not read the file", true);
    } finally {
      setBusy("");
      refresh();
    }
  };
  const lastUpload = overview?.uploads?.[0];
  const uploadButton = (kind, label, accept) => (
    <label className={`audit-btn ${kind === "wendor" ? "audit-btn-primary" : ""} ls-upload-btn ${busy ? "is-busy" : ""}`}>
      {busy === kind ? "Reading…" : label}
      <input type="file" accept={accept} multiple hidden disabled={Boolean(busy)} onChange={(event) => { const files = [...(event.target.files || [])]; event.target.value = ""; upload(kind, files); }} />
    </label>
  );

  return (
    <div className="audit-workspace ls-page">
      {toast && <div className={`audit-toast ${toast.isError ? "is-error" : ""}`}>{toast.message}</div>}
      <section className="audit-card ls-upload">
        <div>
          <h3>Upload</h3>
          <p><b>Closing stock</b> (Excel: product and quantity, for one location or with a Location column) sets what is at a location; expired units aren't counted. <b>DCs</b> (PDF or photo) add to it; they can also be sent on WhatsApp from the DC numbers in Settings. <b>Sales reports</b> take away what the machines sold: the Wendor transactions Excel, or the VendVitor CSV (keep its file name, e.g. vv00017_2026-09-01_To_2026-09-30.csv; it has no product names, so its sales come off the location's totals only). Sales are kept for good: a report only adds the sales not saved yet, so overlapping dates are fine. The same DC again replaces it.</p>
          {lastUpload && <small className="na">Last sales upload: {lastUpload.file_name || "report"} · {dayText(lastUpload.day_from)}{lastUpload.day_to !== lastUpload.day_from ? ` – ${dayText(lastUpload.day_to)}` : ""} · {num(lastUpload.sold)} sold · {whenText(lastUpload.uploaded_at)} by {lastUpload.uploaded_by}</small>}
        </div>
        <div className="ls-upload-btns">
          {uploadButton("wendor", "⬆ Sales report (Wendor / VendVitor)", ".xlsx,.xls,.csv")}
          {uploadButton("warehouse", "⬆ Closing stock", ".xlsx,.xls,.csv")}
          {uploadButton("dc", "⬆ DC (PDF / photo)", ".pdf,image/*")}
        </div>
        {pending && (
          <div className="ls-warn ls-pending">
            <b>{pending.name}</b>
            <label>Closing stock taken on <input type="date" value={pending.date} max={pending.max} onChange={(event) => setPending({ ...pending, date: event.target.value })} /></label>
            <label>at <input type="time" value={pending.time || ""} onChange={(event) => setPending({ ...pending, time: event.target.value })} aria-label="Time counted" /> <small>(blank = end of day)</small></label>
            <select value={pending.location_id} onChange={(event) => setPending({ ...pending, location_id: event.target.value })} aria-label="Location" className={pending.need_location ? "ls-unlinked" : ""}>
              <option value="">{pending.need_location ? "Choose the location…" : "Location: from the file name"}</option>
              {(overview?.locations || []).map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
            </select>
            <button type="button" className="audit-btn audit-btn-primary" disabled={!pending.date || (pending.need_location && !pending.location_id) || Boolean(busy)} onClick={uploadPending}>{busy === "warehouse" ? "Reading…" : "Upload"}</button>
            <button type="button" className="audit-btn" onClick={() => setPending(null)}>Cancel</button>
          </div>
        )}
      </section>

      <nav className="ds-tabs" aria-label="Live Stock">
        {TABS.map(([key, label]) => (
          <button key={key} type="button" className={tab === key ? "active" : ""} onClick={() => setTab(key)}>
            {label}{key === "dcs" && overview?.inbox ? <span className="ls-badge">{overview.inbox}</span> : null}
          </button>
        ))}
      </nav>

      {tab === "locations" && <LocationsTab headers={headers} notify={notify} overview={overview} onChanged={refresh} version={version} />}
      {tab === "dcs" && <DcsTab headers={headers} notify={notify} overview={overview} onChanged={refresh} version={version} />}
      {tab === "machines" && <MachinesTab headers={headers} notify={notify} version={version} />}
      {tab === "settings" && <SettingsTab headers={headers} notify={notify} overview={overview} onChanged={refresh} />}
    </div>
  );
}
