import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";

/* Location stock (Live Stock tabs): how much of each product is at each client location.
   Stock = last warehouse count + DCs since − Wendor sales since. See locationStock.js. */

const API = axios.create({ baseURL: "https://whatsapp-bot-backend-b3nb.onrender.com" });
const num = (value) => (value == null ? "—" : Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 }));
const dayText = (value) => (value ? new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—");
const whenText = (value) => (value ? new Date(value).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "—");
const rupees = (value) => (value == null ? "—" : `₹${Math.round(Number(value)).toLocaleString("en-IN")}`);
const STATUS = { out: ["Out", "bad"], low: ["Low", "warn"], ok: ["OK", "good"] };
const tracked = (location) => location.totals.dcs > 0 || location.last_count_at || location.totals.units > 0;

function Pill({ status }) {
  const [label, tone] = STATUS[status] || STATUS.ok;
  return <span className={`audit-pill fnd-tone-${tone}`}>{label}</span>;
}

/* ---------- One location ---------- */
function LocationView({ id, headers, notify, onBack, onChanged }) {
  const [data, setData] = useState(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [editing, setEditing] = useState(null);
  const [value, setValue] = useState("");
  const [newItem, setNewItem] = useState({ name: "", qty: "" });
  const load = useCallback(() => API.get(`/locstock/locations/${id}`, { headers }).then((response) => setData(response.data)).catch(() => notify("Could not load the location", true)), [id, headers, notify]);
  useEffect(() => { const timer = setTimeout(load, 0); return () => clearTimeout(timer); }, [load]);

  const [busy, setBusy] = useState(false);
  const [stockFile, setStockFile] = useState(null); // { file, date } waiting for its date
  // This location's closing stock (Excel: product, quantity, expired) as on the day it was taken.
  const uploadStock = async () => {
    const { file, date, time } = stockFile;
    setBusy(true);
    try {
      const data64 = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
      const result = (await API.post("/locstock/warehouse", { file: { name: file.name, data: data64 }, location_id: id, date, time: time || "" }, { headers })).data;
      notify(`Closing stock on ${dayText(result.date)}: ${result.saved} items, ${num(result.units)} units${result.expired ? ` (${num(result.expired)} expired not counted)` : ""}`);
      setStockFile(null);
      await load();
      onChanged();
    } catch (err) {
      notify(err.response?.data?.error || "Could not read the file", true);
    } finally {
      setBusy(false);
    }
  };
  const save = async (body, message) => {
    try {
      await API.post(`/locstock/locations/${id}/moves`, body, { headers });
      notify(message);
      setEditing(null);
      setValue("");
      await load();
      onChanged();
    } catch (err) {
      notify(err.response?.data?.error || "Could not save", true);
    }
  };

  if (!data) return <p className="audit-empty">Loading…</p>;
  const rows = data.items.filter((row) => (filter === "all" || (filter === "attention" ? row.status !== "ok" || row.short : row.available > 0))
    && (!query.trim() || row.name.toLowerCase().includes(query.trim().toLowerCase())));
  const t = data.totals;

  return (
    <div className="ls">
      <div className="ls-tools">
        <button type="button" className="audit-btn" onClick={onBack}>← All locations</button>
        <h3 className="ls-title">{data.name}</h3>
        <small className="na">{data.machines.length ? `Machines: ${data.machines.join(", ")}` : "No Wendor machine linked (Settings) — sales aren't taken away yet"}</small>
        <label className={`audit-btn audit-btn-primary ls-upload-btn ls-push-right ${busy ? "is-busy" : ""}`}>
          {busy ? "Reading…" : `⬆ Closing stock for ${data.name}`}
          <input type="file" accept=".xlsx,.xls,.csv" hidden disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) setStockFile({ file, date: "", max: new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10) }); }} />
        </label>
      </div>
      {stockFile && (
        <div className="ls-warn">
          <b>{stockFile.file.name}</b>
          <label>Closing stock taken on <input type="date" value={stockFile.date} max={stockFile.max} onChange={(event) => setStockFile({ ...stockFile, date: event.target.value })} /></label>
          <label>at <input type="time" value={stockFile.time || ""} onChange={(event) => setStockFile({ ...stockFile, time: event.target.value })} aria-label="Time counted" /></label>
          <button type="button" className="audit-btn audit-btn-primary" disabled={!stockFile.date || busy} onClick={uploadStock}>{busy ? "Reading…" : "Upload"}</button>
          <button type="button" className="audit-btn" onClick={() => setStockFile(null)}>Cancel</button>
          <small>The stock at that moment (blank time = end of that day): DCs and sales after it are added and taken away.</small>
        </div>
      )}
      <div className="fnd-kpis ds-kpis ls-kpis">
        <div className="fnd-kpi-blue"><span>Stock value</span><b>{rupees(t.value)}</b><small>{num(t.units)} units · {t.items} item{t.items === 1 ? "" : "s"}{t.no_price ? ` · ${t.no_price} without a price` : ""}</small></div>
        <div className="fnd-kpi-good"><span>Sold (out) value</span><b>{rupees(t.sold_value)}</b><small>since the closing stock · DCs in {rupees(t.dc_value)}</small></div>
        <div className={t.out ? "fnd-kpi-bad" : "fnd-kpi-good"}><span>Out of stock</span><b>{t.out}</b><small>{t.low} running low (under 2 days)</small></div>
        <div className="fnd-kpi-purple"><span>Sold per day</span><b>{num(t.per_day)}</b><small>last 7 days with sales</small></div>
        <div className={t.short ? "fnd-kpi-warn" : ""}><span>Sold more than sent</span><b>{t.short}</b><small>items: a DC or count is missing</small></div>
        <div><span>DCs</span><b>{t.dcs}</b><small>last count {data.last_count_at ? whenText(data.last_count_at) : "—"}</small></div>
      </div>
      {data.sales_to && <p className="ls-note">Sales are taken away up to {dayText(data.sales_to)}. Upload the Wendor reports after that to see today's stock.</p>}

      <section className="audit-card">
        <div className="ls-tools">
          <div className="ds-tabs ls-mini-tabs">
            {[["all", "All items"], ["stock", "In stock"], ["attention", "Out / low / missing"]].map(([key, label]) => <button key={key} type="button" className={filter === key ? "active" : ""} onClick={() => setFilter(key)}>{label}</button>)}
          </div>
          <input className="ds-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search item" aria-label="Search items" />
        </div>
        <div className="ds-table-wrap is-tall">
          <table className="ds-table ls-table">
            <thead><tr><th>Item</th><th>In stock</th><th>Value</th><th>Last count</th><th>DC in</th><th>Sold</th><th>Sold ₹</th><th>Per day</th><th>Days left</th><th /><th /></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.item_id}>
                  <td><b>{row.name}</b>{row.short > 0 && <small className="ds-sub ds-short">sold {num(row.short)} more than was there — a DC or count is missing</small>}{row.adjust !== 0 && <small className="ds-sub">corrected {row.adjust > 0 ? "+" : ""}{num(row.adjust)}</small>}</td>
                  <td><b>{num(row.available)}</b></td>
                  <td>{row.value != null ? <>{rupees(row.value)}<small className="ds-sub">@ ₹{num(row.price)}{row.price_from === "sales" ? " (machine price)" : row.price_from === "page" ? " (set)" : row.price_from === "list" ? "" : " (MRP)"}</small></> : <span className="na">no price</span>}</td>
                  <td>{row.counted ? <>{num(row.counted.qty)}<small className="ds-sub">{dayText(row.counted.at)}</small></> : <span className="na">—</span>}</td>
                  <td>{row.dc_in ? `+${num(row.dc_in)}` : "—"}</td>
                  <td>{row.sold ? `−${num(row.sold)}` : "—"}</td>
                  <td>{row.sold_value ? rupees(row.sold_value) : "—"}</td>
                  <td>{row.per_day || "—"}</td>
                  <td>{row.days_left ?? "—"}</td>
                  <td><Pill status={row.status} /></td>
                  <td>
                    {editing === row.item_id ? (
                      <span className="ls-count">
                        <input type="number" min="0" value={value} autoFocus onChange={(event) => setValue(event.target.value)} placeholder="Real count" aria-label={`Real count of ${row.name}`} />
                        <button type="button" className="audit-btn audit-btn-primary" disabled={value === ""} onClick={() => save({ kind: "count", item_id: row.item_id, qty: value, note: "count on page" }, `${row.name} set to ${value}`)}>Save</button>
                        <button type="button" className="audit-btn" onClick={() => setEditing(null)}>✕</button>
                      </span>
                    ) : <button type="button" className="audit-btn" onClick={() => { setEditing(row.item_id); setValue(""); }}>Correct</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <p className="audit-empty">{data.items.length ? "No items match." : "No stock here yet. Upload warehouse stock or a DC for this location."}</p>}
        </div>
        <div className="ls-add">
          <b>Add a count</b>
          <input value={newItem.name} onChange={(event) => setNewItem({ ...newItem, name: event.target.value })} placeholder="Item name" aria-label="Item name" />
          <input type="number" min="0" value={newItem.qty} onChange={(event) => setNewItem({ ...newItem, qty: event.target.value })} placeholder="Qty" aria-label="Quantity" />
          <button type="button" className="audit-btn" disabled={!newItem.name.trim() || newItem.qty === ""} onClick={() => { save({ kind: "count", name: newItem.name, qty: newItem.qty, note: "count on page" }, `${newItem.name} set to ${newItem.qty}`); setNewItem({ name: "", qty: "" }); }}>Save</button>
          <small className="na">A count is the real quantity now; DCs and sales after it are added and taken away.</small>
        </div>
      </section>

      <section className="audit-card">
        <div className="audit-card-head"><div><h3>Closing stocks for {data.name}</h3><p>The latest one sets the stock; DCs and sales after it are added and taken away.</p></div></div>
        <div className="ds-table-wrap">
          <table className="ds-table">
            <thead><tr><th>Taken on</th><th>Items</th><th>Units</th><th>By</th><th /></tr></thead>
            <tbody>
              {(data.counts || []).map((count) => (
                <tr key={count.at}><td><b>{dayText(count.day)}</b></td><td>{count.items}</td><td>{num(count.units)}</td><td>{count.by || "—"}</td>
                  <td><button type="button" className="audit-btn" onClick={async () => { if (!window.confirm(`Remove the closing stock of ${dayText(count.day)}?`)) return; try { await API.delete(`/locstock/locations/${id}/counts`, { headers, params: { at: count.at } }); notify("Closing stock removed"); await load(); onChanged(); } catch { notify("Could not remove it", true); } }}>Remove</button></td></tr>
              ))}
            </tbody>
          </table>
          {!data.counts?.length && <p className="audit-empty">No closing stock uploaded yet.</p>}
        </div>
      </section>

      <section className="audit-card">
        <div className="audit-card-head"><div><h3>DCs for {data.name} ({data.dcs.length})</h3><p>Every DC delivered here, by its DC number. A DC from before the latest closing stock is already in that count, so it isn't added again.</p></div></div>
        <div className="ds-table-wrap">
          <table className="ds-table ls-dcs">
            <thead><tr><th>DC no.</th><th>Date</th><th>Items</th><th>Units</th><th>Stock</th><th /></tr></thead>
            <tbody>
              {data.dcs.map((dc) => (
                <tr key={dc.id}>
                  <td><b>{dc.ref || `#${dc.id}`}</b><small className="ds-sub">{dc.source}{dc.by ? ` · ${dc.by}` : ""}</small></td>
                  <td>{dc.dc_at ? whenText(dc.dc_at) : dayText(dc.dc_date || dc.created_at)}</td>
                  <td className="ls-dc-lines">{dc.lines.map((line, index) => (
                    <div key={index}><b>{num(line.qty)}{line.unit === "kg" ? " kg" : ""}</b> × {line.product || line.name}{line.product && line.product.toLowerCase() !== line.name.toLowerCase() ? <small className="na"> (DC: {line.name})</small> : null}</div>
                  ))}</td>
                  <td>{num(dc.units)}</td>
                  <td>{dc.in_count ? <span className="audit-pill fnd-tone-muted" title="Delivered before the latest closing stock, so it's already counted there">In closing stock</span> : <span className="audit-pill fnd-tone-good">Added</span>}</td>
                  <td>{dc.file_url ? <a href={dc.file_url} target="_blank" rel="noreferrer">Open DC</a> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data.dcs.length && <p className="audit-empty">No DCs yet. Upload one at the top, or send it on WhatsApp from a DC number.</p>}
        </div>
      </section>
    </div>
  );
}

/* ---------- All locations ---------- */
export function LocationsTab({ headers, notify, overview, onChanged }) {
  const [locationId, setLocationId] = useState(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("tracked");
  if (locationId) return <LocationView key={locationId} id={locationId} headers={headers} notify={notify} onChanged={onChanged} onBack={() => setLocationId(null)} />;
  if (!overview) return <p className="audit-empty">Loading locations…</p>;

  const all = overview.locations;
  const withStock = all.filter(tracked);
  const list = (filter === "tracked" ? withStock : filter === "attention" ? all.filter((location) => location.totals.out || location.totals.short) : filter === "none" ? all.filter((location) => !tracked(location)) : all)
    .filter((location) => !query.trim() || location.name.toLowerCase().includes(query.trim().toLowerCase()));
  const sum = (key) => all.reduce((total, location) => total + (location.totals[key] || 0), 0);

  return (
    <div className="ls">
      <div className="fnd-kpis ds-kpis ls-kpis">
        <div className="fnd-kpi-blue"><span>Locations with stock data</span><b>{withStock.length}</b><small>of {all.length} locations</small></div>
        <div><span>Stock value at locations</span><b>{rupees(sum("value"))}</b><small>{num(sum("units"))} units</small></div>
        <div className="fnd-kpi-good"><span>Sold (out) value</span><b>{rupees(sum("sold_value"))}</b><small>since each location's closing stock</small></div>
        <div className={sum("out") ? "fnd-kpi-bad" : "fnd-kpi-good"}><span>Items out</span><b>{sum("out")}</b><small>{sum("low")} running low</small></div>
        <div className="fnd-kpi-purple"><span>Sold per day</span><b>{num(Math.round(sum("per_day")))}</b><small>linked machines</small></div>
        <div className={overview.inbox ? "fnd-kpi-warn" : ""}><span>DCs to check</span><b>{overview.inbox}</b><small>location not clear / not read</small></div>
      </div>
      <section className="audit-card">
        <div className="ls-tools">
          <div className="ds-tabs ls-mini-tabs">
            {[["tracked", `With stock data (${withStock.length})`], ["attention", "Needs attention"], ["none", "No data yet"], ["all", `All (${all.length})`]].map(([key, label]) => <button key={key} type="button" className={filter === key ? "active" : ""} onClick={() => setFilter(key)}>{label}</button>)}
          </div>
          <input className="ds-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search location" aria-label="Search locations" />
        </div>
        <div className="table-wrapper ds-orders-table">
          <table>
            <thead><tr><th>Location</th><th>In stock</th><th>Stock value</th><th>Sold value</th><th>Out / low</th><th>Sold per day</th><th>DCs</th><th>Last count</th><th>Sales up to</th></tr></thead>
            <tbody>
              {list.map((location) => (
                <tr key={location.id} className="ds-order-row" onClick={() => setLocationId(location.id)} tabIndex={0} onKeyDown={(event) => event.key === "Enter" && setLocationId(location.id)}>
                  <td data-label="Location"><b>{location.name}</b><small className="ds-sub">{location.machines.length ? location.machines.join(", ") : "no machine linked"}</small></td>
                  <td data-label="In stock">{tracked(location) ? <><b>{num(location.totals.units)}</b><small className="ds-sub">{location.totals.items} item{location.totals.items === 1 ? "" : "s"}</small></> : <span className="na">No data yet</span>}</td>
                  <td data-label="Stock value">{tracked(location) ? <b>{rupees(location.totals.value)}</b> : "—"}{location.totals.no_price ? <small className="ds-sub">{location.totals.no_price} without a price</small> : null}</td>
                  <td data-label="Sold value">{location.totals.sold_value ? rupees(location.totals.sold_value) : "—"}</td>
                  <td data-label="Out / low">{location.totals.out ? <b className="ds-minus">{location.totals.out} out</b> : <span className="na">0 out</span>}<small className="ds-sub">{location.totals.low} low{location.totals.short ? ` · ${location.totals.short} missing DC` : ""}</small></td>
                  <td data-label="Sold per day">{location.totals.per_day ? num(location.totals.per_day) : "—"}</td>
                  <td data-label="DCs">{location.totals.dcs || "—"}</td>
                  <td data-label="Last count">{location.last_count_at ? whenText(location.last_count_at) : "—"}</td>
                  <td data-label="Sales up to">{location.sales_to ? dayText(location.sales_to) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!list.length && <p className="audit-empty">{filter === "tracked" && !withStock.length ? "No stock data yet. Upload warehouse stock or DCs above." : "No locations match."}</p>}
        </div>
      </section>
      <p className="ls-foot">Stock of an item at a location = the last warehouse count (or 0) + DCs after it − what that location's Wendor machines sold after it. Locations are the Refill Audit locations.</p>
    </div>
  );
}

/* ---------- DCs: the inbox (location not clear / not read) and all DCs ---------- */
function DcEditor({ dc, locations, headers, notify, onDone }) {
  const [locationId, setLocationId] = useState(dc.location_id || "");
  const [lines, setLines] = useState(() => (dc.lines?.length ? dc.lines : [{ name: "", qty: "", unit: "pcs" }]).map((line) => ({ name: line.name, qty: line.qty, unit: line.unit || "pcs" })));
  const [saving, setSaving] = useState(false);
  const setLine = (index, patch) => setLines((list) => list.map((line, at) => (at === index ? { ...line, ...patch } : line)));
  const save = async () => {
    setSaving(true);
    try {
      await API.patch(`/locstock/dcs/${dc.id}`, { location_id: locationId, lines }, { headers });
      notify(`DC ${dc.ref || ""} saved to ${locations.find((location) => location.id === Number(locationId))?.name || "the location"}`);
      onDone();
    } catch (err) {
      notify(err.response?.data?.error || "Could not save the DC", true);
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="ls-dc-edit">
      <label>Location
        <select value={locationId} onChange={(event) => setLocationId(event.target.value)}>
          <option value="">Choose…</option>
          {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
        </select>
      </label>
      <table className="ds-table ls-lines">
        <thead><tr><th>Item</th><th>Qty</th><th>Unit</th><th /></tr></thead>
        <tbody>
          {lines.map((line, index) => (
            <tr key={index}>
              <td><input value={line.name} onChange={(event) => setLine(index, { name: event.target.value })} aria-label="Item" /></td>
              <td><input type="number" min="0" value={line.qty} onChange={(event) => setLine(index, { qty: event.target.value })} aria-label="Quantity" /></td>
              <td><select value={line.unit} onChange={(event) => setLine(index, { unit: event.target.value })} aria-label="Unit"><option value="pcs">pcs</option><option value="kg">kg</option></select></td>
              <td><button type="button" className="audit-btn" onClick={() => setLines((list) => list.filter((_, at) => at !== index))} aria-label="Remove line">✕</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="ls-tools">
        <button type="button" className="audit-btn" onClick={() => setLines((list) => [...list, { name: "", qty: "", unit: "pcs" }])}>+ Line</button>
        <button type="button" className="audit-btn audit-btn-primary" disabled={saving || !locationId} onClick={save}>{saving ? "Saving…" : "Save & add to stock"}</button>
        <small className="na">The location is remembered for this party's next DCs.</small>
      </div>
    </div>
  );
}

export function DcsTab({ headers, notify, overview, onChanged, version }) {
  const [dcs, setDcs] = useState(null);
  const [open, setOpen] = useState(null);
  const [query, setQuery] = useState("");
  const load = useCallback(() => API.get("/locstock/dcs", { headers }).then((response) => setDcs(response.data)).catch(() => notify("Could not load the DCs", true)), [headers, notify]);
  useEffect(() => { const timer = setTimeout(load, 0); return () => clearTimeout(timer); }, [load, version]);
  const locations = useMemo(() => (overview?.locations || []).map(({ id, name }) => ({ id, name })), [overview]);
  if (!dcs) return <p className="audit-empty">Loading DCs…</p>;

  const remove = async (dc) => {
    if (!window.confirm(`Delete DC ${dc.ref || `#${dc.id}`}? Its items are taken out of ${dc.location_name || "the location"}'s stock.`)) return;
    try { await API.delete(`/locstock/dcs/${dc.id}`, { headers }); notify("DC deleted"); await load(); onChanged(); } catch { notify("Could not delete the DC", true); }
  };
  const inbox = dcs.filter((dc) => dc.status !== "added");
  const added = dcs.filter((dc) => dc.status === "added" && (!query.trim() || `${dc.ref} ${dc.location_name} ${dc.party}`.toLowerCase().includes(query.trim().toLowerCase())));
  const done = () => { setOpen(null); load(); onChanged(); };

  return (
    <div className="ls">
      <section className={`audit-card ${inbox.length ? "ls-alerts" : ""}`}>
        <div className="audit-card-head"><div><h3>{inbox.length ? `⚠ To check (${inbox.length})` : "✓ Nothing to check"}</h3><p>DCs whose location wasn't clear or whose items couldn't be read. Choose the location (and fix the items), then save.</p></div></div>
        {inbox.map((dc) => (
          <div key={dc.id} className="ls-dc">
            <div className="ls-dc-head">
              <b>{dc.ref || `DC #${dc.id}`}</b>
              <span>{dc.party || "party not read"}{dc.ship_to && dc.ship_to !== dc.party ? ` · ship to ${dc.ship_to}` : ""}</span>
              <span className="na">{dayText(dc.dc_date || dc.created_at)} · {dc.lines.length} items · {dc.source}{dc.from_phone ? ` · ${dc.from_phone}` : ""}</span>
              <span className="audit-pill fnd-tone-warn">{dc.problem || dc.status}</span>
              {dc.file_url && <a href={dc.file_url} target="_blank" rel="noreferrer">Open file</a>}
              <button type="button" className="audit-btn" onClick={() => remove(dc)}>Delete</button>
            </div>
            <DcEditor dc={dc} locations={locations} headers={headers} notify={notify} onDone={done} />
          </div>
        ))}
      </section>

      <section className="audit-card">
        <div className="ls-tools">
          <b>All DCs ({added.length})</b>
          <input className="ds-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search DC, location or party" aria-label="Search DCs" />
        </div>
        <div className="ds-table-wrap is-tall">
          <table className="ds-table">
            <thead><tr><th>DC</th><th>Date</th><th>Location</th><th>Items</th><th>Units</th><th>From</th><th /></tr></thead>
            <tbody>
              {added.map((dc) => [
                <tr key={dc.id} className="ds-click" onClick={() => setOpen(open === dc.id ? null : dc.id)}>
                  <td><b>{dc.ref || `#${dc.id}`}</b><small className="ds-sub">{dc.party}</small></td>
                  <td>{dayText(dc.dc_date || dc.created_at)}</td>
                  <td>{dc.location_name || "—"}</td>
                  <td>{dc.lines.length}</td>
                  <td>{num(dc.units)}</td>
                  <td>{dc.source}{dc.by ? <small className="ds-sub">{dc.by}</small> : null}</td>
                  <td onClick={(event) => event.stopPropagation()}>{dc.file_url && <a href={dc.file_url} target="_blank" rel="noreferrer">File</a>} <button type="button" className="audit-btn" onClick={() => remove(dc)}>Delete</button></td>
                </tr>,
                open === dc.id && <tr key={`${dc.id}-edit`}><td colSpan={7}><DcEditor dc={dc} locations={locations} headers={headers} notify={notify} onDone={done} /></td></tr>,
              ])}
            </tbody>
          </table>
          {!added.length && <p className="audit-empty">No DCs yet. Upload one above or send it on WhatsApp from a DC number (Settings).</p>}
        </div>
      </section>
    </div>
  );
}

/* ---------- Settings: DC numbers, machines → locations ---------- */
export function SettingsTab({ headers, notify, overview, onChanged }) {
  const [senders, setSenders] = useState(() => overview?.senders?.length ? overview.senders : [{ name: "", phone: "" }]);
  const [query, setQuery] = useState("");
  if (!overview) return <p className="audit-empty">Loading…</p>;
  const saveSenders = async () => {
    try {
      const response = await API.put("/locstock/senders", { senders }, { headers });
      setSenders(response.data.senders.length ? response.data.senders : [{ name: "", phone: "" }]);
      notify(`${response.data.senders.length} DC number${response.data.senders.length === 1 ? "" : "s"} saved`);
      onChanged();
    } catch (err) { notify(err.response?.data?.error || "Could not save", true); }
  };
  const link = async (machine, locationId) => {
    try { await API.patch(`/stock/machines/${machine.id}`, { location_id: locationId || null }, { headers }); notify(`${machine.name} linked`); onChanged(); } catch { notify("Could not link the machine", true); }
  };
  const machines = overview.machines.filter((machine) => !query.trim() || machine.name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div className="ls">
      <section className="audit-card">
        <div className="audit-card-head"><div><h3>DC numbers</h3><p>DC PDFs (or photos) sent to the Snackit WhatsApp number from these numbers are read and added to the location's stock. The sender gets a reply with what was added.</p></div></div>
        {senders.map((sender, index) => (
          <div key={index} className="ls-add">
            <input value={sender.name} onChange={(event) => setSenders((list) => list.map((item, at) => (at === index ? { ...item, name: event.target.value } : item)))} placeholder="Name (e.g. Warehouse)" aria-label="Name" />
            <input value={sender.phone} onChange={(event) => setSenders((list) => list.map((item, at) => (at === index ? { ...item, phone: event.target.value } : item)))} placeholder="WhatsApp number" aria-label="WhatsApp number" inputMode="tel" />
            <button type="button" className="audit-btn" onClick={() => setSenders((list) => list.filter((_, at) => at !== index))} aria-label="Remove number">✕</button>
          </div>
        ))}
        <div className="ls-tools">
          <button type="button" className="audit-btn" onClick={() => setSenders((list) => [...list, { name: "", phone: "" }])}>+ Number</button>
          <button type="button" className="audit-btn audit-btn-primary" onClick={saveSenders}>Save</button>
        </div>
      </section>

      <section className="audit-card">
        <div className="ls-tools">
          <div><b>Wendor machines → locations</b><small className="ds-sub">A machine's sales are taken away from its location's stock. New machines are linked by name when possible.</small></div>
          <input className="ds-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search machine" aria-label="Search machines" />
        </div>
        <div className="ds-table-wrap is-tall">
          <table className="ds-table">
            <thead><tr><th>Machine</th><th>Wendor ID</th><th>Location</th></tr></thead>
            <tbody>
              {machines.map((machine) => (
                <tr key={machine.id}>
                  <td><b>{machine.name}</b></td><td>{machine.wendor_id}</td>
                  <td><select value={machine.location_id || ""} onChange={(event) => link(machine, event.target.value)} aria-label={`Location of ${machine.name}`} className={machine.location_id ? "" : "ls-unlinked"}>
                    <option value="">Not linked</option>
                    {overview.locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
                  </select></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!machines.length && <p className="audit-empty">No machines yet. They appear when a Wendor report is uploaded.</p>}
        </div>
      </section>

      <section className="audit-card">
        <div className="audit-card-head"><div><h3>Warehouse stock Excel</h3><p>You're asked the date the closing stock was taken: it counts as the stock at the end of that day, and sales from the next day are taken away. A closing stock replaces earlier ones of that location for the same or a later date. Columns like <b>Product</b> (or Item) and <b>Quantity</b> (or Closing / Stock / Balance), and <b>Expired</b> if there is one: expired units aren't counted. For one location (like “Bitgo Closing Stock”), upload it from that location's page, or from the top: the location is taken from the file name, or you're asked. For many locations at once, add a <b>Location</b> column. The same product on two rows adds up. Blank quantity = none left.</p></div></div>
      </section>
    </div>
  );
}
