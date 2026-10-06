import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";

/* Location stock (Live Stock tabs): how much of each product is at each client location.
   Stock = last warehouse count + DCs since − Wendor sales since. See locationStock.js. */

const API = axios.create({ baseURL: "https://whatsapp-bot-backend-b3nb.onrender.com" });
const num = (value) => (value == null ? "—" : Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 }));
const dayText = (value) => (value ? new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—");
const whenText = (value) => (value ? new Date(value).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "—");
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
      </div>
      <div className="fnd-kpis ds-kpis ls-kpis">
        <div className="fnd-kpi-blue"><span>In stock now</span><b>{num(t.units)}</b><small>{t.items} item{t.items === 1 ? "" : "s"}</small></div>
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
            <thead><tr><th>Item</th><th>In stock</th><th>Last count</th><th>DC in</th><th>Sold</th><th>Per day</th><th>Days left</th><th /><th /></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.item_id}>
                  <td><b>{row.name}</b>{row.short > 0 && <small className="ds-sub ds-short">sold {num(row.short)} more than was there — a DC or count is missing</small>}{row.adjust !== 0 && <small className="ds-sub">corrected {row.adjust > 0 ? "+" : ""}{num(row.adjust)}</small>}</td>
                  <td><b>{num(row.available)}</b></td>
                  <td>{row.counted ? <>{num(row.counted.qty)}<small className="ds-sub">{dayText(row.counted.at)}</small></> : <span className="na">—</span>}</td>
                  <td>{row.dc_in ? `+${num(row.dc_in)}` : "—"}</td>
                  <td>{row.sold ? `−${num(row.sold)}` : "—"}</td>
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
        <div className="audit-card-head"><div><h3>DCs for {data.name}</h3><p>Latest 30</p></div></div>
        <div className="ds-table-wrap">
          <table className="ds-table">
            <thead><tr><th>DC</th><th>Date</th><th>Items</th><th>Units</th><th>From</th><th /></tr></thead>
            <tbody>
              {data.dcs.map((dc) => (
                <tr key={dc.id}><td><b>{dc.ref || `#${dc.id}`}</b></td><td>{dayText(dc.dc_date || dc.created_at)}</td><td>{dc.items}</td><td>{num(dc.units)}</td><td>{dc.source}</td><td>{dc.file_url && <a href={dc.file_url} target="_blank" rel="noreferrer">File</a>}</td></tr>
              ))}
            </tbody>
          </table>
          {!data.dcs.length && <p className="audit-empty">No DCs yet.</p>}
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
        <div><span>Units at locations</span><b>{num(sum("units"))}</b><small>{num(sum("items"))} item lines in stock</small></div>
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
            <thead><tr><th>Location</th><th>In stock</th><th>Out / low</th><th>Sold per day</th><th>DCs</th><th>Last count</th><th>Sales up to</th></tr></thead>
            <tbody>
              {list.map((location) => (
                <tr key={location.id} className="ds-order-row" onClick={() => setLocationId(location.id)} tabIndex={0} onKeyDown={(event) => event.key === "Enter" && setLocationId(location.id)}>
                  <td data-label="Location"><b>{location.name}</b><small className="ds-sub">{location.machines.length ? location.machines.join(", ") : "no machine linked"}</small></td>
                  <td data-label="In stock">{tracked(location) ? <><b>{num(location.totals.units)}</b><small className="ds-sub">{location.totals.items} item{location.totals.items === 1 ? "" : "s"}</small></> : <span className="na">No data yet</span>}</td>
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

/* ---------- Items: one list for warehouse, DC and Wendor names ---------- */
export function ItemsTab({ headers, notify, onChanged, version }) {
  const [data, setData] = useState(null);
  const [query, setQuery] = useState("");
  const load = useCallback(() => API.get("/locstock/items", { headers }).then((response) => setData(response.data)).catch(() => notify("Could not load the items", true)), [headers, notify]);
  useEffect(() => { const timer = setTimeout(load, 0); return () => clearTimeout(timer); }, [load, version]);
  if (!data) return <p className="audit-empty">Loading items…</p>;

  const merge = async (from, into) => {
    if (!window.confirm(`Merge "${from.name}" into "${into.name}"? They become one item everywhere.`)) return;
    try { await API.post("/locstock/items/merge", { from_id: from.id, into_id: into.id }, { headers }); notify(`Merged into ${into.name}`); await load(); onChanged(); } catch (err) { notify(err.response?.data?.error || "Could not merge", true); }
  };
  const list = data.items.filter((item) => !query.trim() || `${item.name} ${(item.aliases || []).join(" ")}`.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div className="ls">
      {data.similar.length > 0 && (
        <section className="audit-card">
          <div className="audit-card-head"><div><h3>Probably the same product ({data.similar.length})</h3><p>The warehouse, DCs and Wendor spell names differently. Merge two names that are one product, so its stock adds up. Merged spellings are remembered.</p></div></div>
          <div className="ds-table-wrap">
            <table className="ds-table">
              <thead><tr><th>Name</th><th>Name</th><th>Alike</th><th /></tr></thead>
              <tbody>
                {data.similar.map((pair) => (
                  <tr key={`${pair.a.id}-${pair.b.id}`}>
                    <td>{pair.a.name}</td><td>{pair.b.name}</td><td>{pair.score}%</td>
                    <td className="ls-merge"><button type="button" className="audit-btn" onClick={() => merge(pair.b, pair.a)}>Keep “{pair.a.name}”</button><button type="button" className="audit-btn" onClick={() => merge(pair.a, pair.b)}>Keep “{pair.b.name}”</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <section className="audit-card">
        <div className="ls-tools">
          <b>Items ({data.items.length})</b>
          <input className="ds-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search item" aria-label="Search items" />
        </div>
        <div className="ds-table-wrap is-tall">
          <table className="ds-table">
            <thead><tr><th>Item</th><th>Other spellings</th><th>Unit</th></tr></thead>
            <tbody>{list.map((item) => <tr key={item.id}><td><b>{item.name}</b></td><td className="ls-top">{(item.aliases || []).join(" · ") || "—"}</td><td>{item.unit || "—"}</td></tr>)}</tbody>
          </table>
          {!list.length && <p className="audit-empty">No items yet. They appear from warehouse stock, DCs and Wendor reports.</p>}
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
        <div className="audit-card-head"><div><h3>Warehouse stock Excel</h3><p>One row per location and item, with columns like <b>Location</b>, <b>Item</b>, <b>Quantity</b> (or Closing / Stock / Balance). If there is no location column, each sheet's name is taken as the location. Location names are matched to the Refill Audit locations; ones that don't match are listed after the upload.</p></div></div>
      </section>
    </div>
  );
}
