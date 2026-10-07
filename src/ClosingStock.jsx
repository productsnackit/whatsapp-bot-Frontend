import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";

/* Closing Stock: counting the stock at a client location (shelves and machines). Choose the
   location, the date and time of the count, add the products with their MRP, quantity and
   expired units, and save: it becomes that location's stock in Live Stock right away (DCs and
   Wendor sales after it are added and taken away). Past counts can be opened and exported.
   See locationStock.js → saveClosing. */

const API = axios.create({ baseURL: "https://whatsapp-bot-backend-b3nb.onrender.com" });
const num = (value) => (value == null || value === "" ? "—" : Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 }));
const rupees = (value) => (value == null ? "—" : `₹${Math.round(Number(value)).toLocaleString("en-IN")}`);
const whenText = (value) => new Date(value).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
const todayIst = () => new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
const draftKey = (locationId) => `closing-draft-${locationId}`;
const readDraft = (locationId) => { try { return JSON.parse(localStorage.getItem(draftKey(locationId)) || "null"); } catch { return null; } };
const writeDraft = (locationId, draft) => { try { if (draft) localStorage.setItem(draftKey(locationId), JSON.stringify(draft)); else localStorage.removeItem(draftKey(locationId)); } catch { /* storage off */ } };
const download = ({ name, data }) => {
  const bytes = Uint8Array.from(atob(data), (ch) => ch.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
};
const readFile = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve({ name: file.name, data: reader.result });
  reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
  reader.readAsDataURL(file);
});

export default function ClosingStock({ token, isAdmin = false }) {
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);
  const [locations, setLocations] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [history, setHistory] = useState([]);
  const [locationId, setLocationId] = useState("");
  const [expected, setExpected] = useState(new Map());
  const [date, setDate] = useState(todayIst());
  const [time, setTime] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState([]); // { item_id, name, mrp, qty, expired, expected }
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState("");
  const [toast, setToast] = useState(null);
  const [open, setOpen] = useState(null); // a past count, with its lines
  const notify = useCallback((message, isError = false) => { setToast({ message, isError }); setTimeout(() => setToast(null), 5000); }, []);

  const loadHistory = useCallback(() => API.get("/locstock/closings", { headers }).then((response) => setHistory(response.data)).catch(() => {}), [headers]);
  useEffect(() => {
    API.get("/locstock/overview", { headers }).then((response) => setLocations(response.data.locations.map(({ id, name }) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)))).catch(() => notify("Could not load the locations", true));
    API.get("/locstock/catalog", { headers }).then((response) => setCatalog(response.data)).catch(() => notify("Could not load the products", true));
    const timer = setTimeout(loadHistory, 0);
    return () => clearTimeout(timer);
  }, [headers, notify, loadHistory]);

  // A location chosen: what Live Stock expects there, and any unsaved count on this phone.
  const chooseLocation = async (id) => {
    setLocationId(id);
    setExpected(new Map());
    const draft = id ? readDraft(id) : null;
    setLines(draft?.lines || []);
    if (draft) { setDate(draft.date || todayIst()); setTime(draft.time || ""); setNote(draft.note || ""); }
    if (!id) return;
    try {
      const response = await API.get(`/locstock/locations/${id}`, { headers });
      setExpected(new Map(response.data.items.map((row) => [row.item_id, row.available])));
    } catch { /* still countable */ }
  };
  // Every change is kept on this phone until it's saved (a lost signal loses nothing).
  useEffect(() => { if (locationId) writeDraft(locationId, lines.length || note ? { lines, date, time, note } : null); }, [locationId, lines, date, time, note]);

  const inCount = useMemo(() => new Set(lines.map((line) => line.item_id)), [lines]);
  const suggestions = useMemo(() => {
    const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    return catalog.filter((product) => !inCount.has(product.id) && words.every((word) => `${product.name} ${product.brand || ""} ${(product.wendor_ids || []).join(" ")}`.toLowerCase().includes(word))).slice(0, 12);
  }, [search, catalog, inCount]);
  const addProduct = (product) => {
    setLines((list) => [{ item_id: product.id, name: product.name, mrp: product.price ?? "", qty: "", expired: "", expected: expected.get(product.id) ?? null }, ...list]);
    setSearch("");
  };
  const addExpected = () => {
    const have = new Set(lines.map((line) => line.item_id));
    const add = catalog.filter((product) => expected.has(product.id) && !have.has(product.id))
      .map((product) => ({ item_id: product.id, name: product.name, mrp: product.price ?? "", qty: "", expired: "", expected: expected.get(product.id) }));
    setLines((list) => [...list, ...add]);
    notify(add.length ? `Added ${add.length} products that Live Stock has at this location` : "All of them are already in the count");
  };
  const setLine = (index, patch) => setLines((list) => list.map((line, at) => (at === index ? { ...line, ...patch } : line)));

  const filled = lines.filter((line) => line.qty !== "" && !Number.isNaN(Number(line.qty)));
  const totals = filled.reduce((sum, line) => {
    const qty = Number(line.qty);
    const expiredQty = Math.min(Number(line.expired) || 0, qty);
    return { units: sum.units + qty - expiredQty, expired: sum.expired + expiredQty, value: sum.value + (qty - expiredQty) * (Number(line.mrp) || 0) };
  }, { units: 0, expired: 0, value: 0 });
  const location = locations.find((row) => String(row.id) === String(locationId));

  const save = async () => {
    const blank = lines.length - filled.length;
    if (!window.confirm(`Save the closing stock of ${location?.name} on ${date}${time ? ` at ${time}` : " (end of day)"}?\n\n${filled.length} products, ${num(totals.units)} units${totals.expired ? ` (+${num(totals.expired)} expired)` : ""}, ${rupees(totals.value)}.${blank ? `\n${blank} products without a quantity are left out.` : ""}\n\nIt replaces any closing stock of this location from that day on, and becomes its stock in Live Stock now.`)) return;
    setBusy("save");
    try {
      const response = await API.post("/locstock/closings", { location_id: Number(locationId), date, time, note, lines: filled.map((line) => ({ item_id: line.item_id, name: line.name, qty: line.qty, expired: line.expired, mrp: line.mrp })) }, { headers });
      notify(`Saved: ${response.data.location_name} — ${num(response.data.units)} units, ${rupees(response.data.value)}. Live Stock is updated.`);
      writeDraft(locationId, null);
      setLines([]);
      setNote("");
      loadHistory();
    } catch (err) {
      notify(err.response?.data?.error || "Could not save the closing stock", true);
    } finally {
      setBusy("");
    }
  };
  const exportOne = async (id, query = {}) => {
    setBusy(`export-${id}`);
    try { download((await API.get(`/locstock/closings/${id}/export`, { headers, params: query })).data); } catch (err) { notify(err.response?.data?.error || "Could not export", true); } finally { setBusy(""); }
  };
  const uploadSheet = async (file) => {
    setBusy("upload");
    try {
      const result = (await API.post("/locstock/warehouse", { file: await readFile(file), location_id: Number(locationId) || undefined, date, time }, { headers })).data;
      notify(`Closing stock uploaded${result.location_names?.length ? ` for ${result.location_names.join(", ")}` : ""}: ${result.saved} products, ${num(result.units)} units`);
      loadHistory();
    } catch (err) {
      notify(err.response?.data?.error || "Could not read the sheet", true);
    } finally {
      setBusy("");
    }
  };
  // Admin only: a wrong closing stock can be deleted (it leaves Live Stock; the one before counts again).
  const remove = async (row) => {
    if (!window.confirm(`Delete the closing stock of ${row.location_name} taken ${whenText(row.at)}?\n\nIts count leaves Live Stock: the closing stock before it (if any) counts again. This can't be undone.`)) return;
    setBusy(`delete-${row.id}`);
    try {
      await API.delete(`/locstock/closings/${row.id}`, { headers });
      notify(`Deleted the closing stock of ${row.location_name}`);
      if (open?.id === row.id) setOpen(null);
      loadHistory();
    } catch (err) {
      notify(err.response?.data?.error || "Could not delete it", true);
    } finally {
      setBusy("");
    }
  };
  const openPast = async (row) => {
    if (open?.id === row.id) return setOpen(null);
    try { setOpen((await API.get(`/locstock/closings/${row.id}`, { headers })).data); } catch { notify("Could not open it", true); }
  };

  return (
    <div className="audit-workspace ls-page">
      {toast && <div className={`audit-toast ${toast.isError ? "is-error" : ""}`}>{toast.message}</div>}

      <section className="audit-card">
        <div className="audit-card-head"><div><h3>New closing stock</h3><p>Count everything at the location (store room and machines). Products not counted are taken as none there.</p></div></div>
        <div className="cs-head">
          <label>Location
            <select value={locationId} onChange={(event) => chooseLocation(event.target.value)}>
              <option value="">Choose the location…</option>
              {locations.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
            </select>
          </label>
          <label>Date<input type="date" value={date} max={todayIst()} onChange={(event) => setDate(event.target.value)} /></label>
          <label>Time <small>(blank = end of day)</small><input type="time" value={time} onChange={(event) => setTime(event.target.value)} /></label>
          <label className="cs-note">Note<input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional, e.g. counted by Arun" /></label>
        </div>
        {locationId && (
          <div className="ls-tools cs-tools">
            <button type="button" className="audit-btn" onClick={addExpected} disabled={!expected.size}>+ Products Live Stock has here</button>
            <button type="button" className="audit-btn" disabled={Boolean(busy)} onClick={() => exportOne("sheet", { location_id: locationId })}>⬇ Sheet to fill (Excel)</button>
            <label className={`audit-btn ls-upload-btn ${busy === "upload" ? "is-busy" : ""}`}>
              {busy === "upload" ? "Reading…" : "⬆ Upload filled sheet"}
              <input type="file" accept=".xlsx,.xls,.csv" hidden disabled={Boolean(busy)} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) uploadSheet(file); }} />
            </label>
          </div>
        )}
      </section>

      {locationId && (
        <section className="audit-card">
          <div className="cs-search">
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search a product to add (name, brand or Wendor ID)" aria-label="Search product" autoComplete="off" />
            {suggestions.length > 0 && (
              <div className="cs-suggest" role="listbox">
                {suggestions.map((product) => (
                  <button type="button" key={product.id} onClick={() => addProduct(product)}>
                    <b>{product.name}</b><span>{product.price != null ? `₹${product.price}` : "no price"}{expected.has(product.id) ? ` · expected ${num(expected.get(product.id))}` : ""}{!product.in_list ? " · not in Product List" : ""}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="cs-lines">
            {lines.map((line, index) => (
              <div key={line.item_id} className={`cs-line ${line.qty === "" ? "is-blank" : ""}`}>
                <div className="cs-name"><b>{line.name}</b>{line.expected != null && <small>Live Stock expects {num(line.expected)}</small>}</div>
                <label>MRP ₹<input type="number" min="0" step="0.01" inputMode="decimal" value={line.mrp} onChange={(event) => setLine(index, { mrp: event.target.value })} /></label>
                <label>Quantity<input type="number" min="0" inputMode="numeric" value={line.qty} onChange={(event) => setLine(index, { qty: event.target.value })} autoFocus={index === 0 && line.qty === ""} /></label>
                <label>Expired<input type="number" min="0" inputMode="numeric" value={line.expired} onChange={(event) => setLine(index, { expired: event.target.value })} /></label>
                <button type="button" className="audit-btn" onClick={() => setLines((list) => list.filter((_, at) => at !== index))} aria-label={`Remove ${line.name}`}>✕</button>
              </div>
            ))}
            {!lines.length && <p className="audit-empty">Search a product above to start, or add the products Live Stock has here.</p>}
          </div>

          <div className="cs-foot">
            <div><b>{filled.length}</b> products · <b>{num(totals.units)}</b> units{totals.expired ? <> · {num(totals.expired)} expired</> : null} · <b>{rupees(totals.value)}</b>{lines.length > filled.length && <small className="ds-short"> · {lines.length - filled.length} without a quantity</small>}</div>
            <div className="cs-foot-actions">
              {lines.length > 0 && <button type="button" className="audit-btn" onClick={() => window.confirm("Clear this count?") && setLines([])}>Clear</button>}
              <button type="button" className="audit-btn audit-btn-primary" disabled={!filled.length || busy === "save"} onClick={save}>{busy === "save" ? "Saving…" : "Save closing stock"}</button>
            </div>
          </div>
        </section>
      )}

      <section className="audit-card">
        <div className="audit-card-head"><div><h3>Closing stocks taken ({history.length})</h3><p>Entered here or uploaded. Open one to see its products; export it as Excel.</p></div></div>
        <div className="table-wrapper ds-orders-table">
          <table>
            <thead><tr><th>Location</th><th>Taken</th><th>Products</th><th>Units</th><th>Value</th><th>By</th><th /></tr></thead>
            <tbody>
              {history.map((row) => [
                <tr key={row.id} className="ds-order-row" onClick={() => openPast(row)}>
                  <td data-label="Location"><b>{row.location_name}</b><small className="ds-sub">{row.source === "page" ? "entered here" : `uploaded${row.file_name ? ` · ${row.file_name}` : ""}`}</small></td>
                  <td data-label="Taken">{whenText(row.at)}</td>
                  <td data-label="Products">{row.products}</td>
                  <td data-label="Units">{num(row.units)}{Number(row.expired) ? <small className="ds-sub">+{num(row.expired)} expired</small> : null}</td>
                  <td data-label="Value">{rupees(row.value)}</td>
                  <td data-label="By">{row.by || "—"}{row.note ? <small className="ds-sub">{row.note}</small> : null}</td>
                  <td data-label="" onClick={(event) => event.stopPropagation()} className="cs-row-actions"><button type="button" className="audit-btn" disabled={Boolean(busy)} onClick={() => exportOne(row.id)}>⬇ Export</button>{isAdmin && <button type="button" className="audit-btn cs-delete" disabled={Boolean(busy)} onClick={() => remove(row)}>{busy === `delete-${row.id}` ? "Deleting…" : "Delete"}</button>}</td>
                </tr>,
                open?.id === row.id && (
                  <tr key={`${row.id}-lines`}><td colSpan={7}>
                    <table className="ds-table">
                      <thead><tr><th>Product</th><th>MRP</th><th>Quantity</th><th>Expired</th><th>Value</th></tr></thead>
                      <tbody>{(open.lines || []).map((line, index) => <tr key={index}><td>{line.name}</td><td>{line.mrp != null ? `₹${line.mrp}` : "—"}</td><td>{num(line.qty)}</td><td>{line.expired || "—"}</td><td>{line.mrp != null ? rupees((line.qty - Math.min(line.expired || 0, line.qty)) * line.mrp) : "—"}</td></tr>)}</tbody>
                    </table>
                  </td></tr>
                ),
              ])}
            </tbody>
          </table>
          {!history.length && <p className="audit-empty">No closing stock yet.</p>}
        </div>
      </section>
    </div>
  );
}
