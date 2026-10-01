import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";

/* Direct Supply (phase 1): each company's order for a delivery date is pasted or uploaded,
   and the master sheet adds the same items up across companies for the stock buyer.
   See directSupply.js on the server. */

const API = axios.create({ baseURL: "https://whatsapp-bot-backend-b3nb.onrender.com" });
const STATUSES = ["Collecting", "Sent to buyer", "Bought", "Delivered"];
const STATUS_TONE = { Collecting: "warn", "Sent to buyer": "blue", Bought: "purple", Delivered: "good" };
const pad = (n) => String(n).padStart(2, "0");
const isoDay = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const tomorrow = () => { const date = new Date(); date.setDate(date.getDate() + 1); return isoDay(date); };
const dayLabel = (value) => (value ? new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }) : "");
const qty = (value) => String(Math.round(Number(value) * 1000) / 1000);
const readFile = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve({ name: file.name, data: reader.result });
  reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
  reader.readAsDataURL(file);
});

/* ---------- Add orders: one company's, or a message with several companies ---------- */
function LinesTable({ lines, units, onChange }) {
  const update = (index, patch) => onChange(lines.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  return (
    <table className="ds-table">
      <thead><tr><th>Item</th><th>Qty</th><th>Unit</th><th>Matches</th><th /></tr></thead>
      <tbody>
        {lines.map((line, index) => line.removed ? null : (
          <tr key={index} className={Number(line.qty) > 0 ? "" : "is-problem"}>
            <td><input value={line.name} onChange={(event) => update(index, { name: event.target.value })} /></td>
            <td><input type="number" min="0" step="any" value={line.qty} onChange={(event) => update(index, { qty: event.target.value })} className="ds-qty" /></td>
            <td><select value={line.unit} onChange={(event) => update(index, { unit: event.target.value })}>{units.map((unit) => <option key={unit}>{unit}</option>)}</select></td>
            <td>{line.product_id ? <span className="ds-chip is-known">✓ {line.product_name}</span>
              : line.suggestion_id ? <span className="ds-chip is-check" title="You'll confirm this in Check names">? Same as {line.suggestion_name}?</span>
                : <span className="ds-chip is-new">✚ New item</span>}</td>
            <td><button type="button" className="ds-x" onClick={() => update(index, { removed: true })} aria-label="Remove">✕</button></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function AddOrder({ headers, round, companies, units, onAddCompany, onSaved, onClose, initialText = "" }) {
  const [mode, setMode] = useState("paste");
  const [text, setText] = useState(initialText);
  const [file, setFile] = useState(null);
  // groups: [{ heading, company: id | "new" | "", newName, lines }]; one group without a heading = one company's order.
  const [groups, setGroups] = useState(null);
  const [found, setFound] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const active = companies.filter((company) => company.active);
  const already = new Set(round.orderCompanyIds || []);

  const read = async (source = text) => {
    setBusy("read");
    setError("");
    try {
      const payload = mode === "file" ? { file: await readFile(file) } : { text: source };
      const response = await API.post("/supply/parse", payload, { headers });
      setFound({ date: response.data.date, title: response.data.title });
      setGroups(response.data.groups.map((group) => ({
        heading: group.heading,
        company: group.company_id ? String(group.company_id) : group.heading ? "new" : "",
        newName: group.heading || "",
        lines: group.lines,
      })));
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Could not read the order");
    } finally {
      setBusy("");
    }
  };

  // Pasted from "New delivery date": read straight away.
  const [autoRead] = useState(Boolean(initialText));
  useEffect(() => {
    if (!autoRead) return undefined;
    const timer = setTimeout(() => read(initialText), 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRead]);

  const setGroup = (index, patch) => setGroups((list) => list.map((group, i) => (i === index ? { ...group, ...patch } : group)));
  const kept = (group) => group.lines.filter((line) => !line.removed);
  const ready = groups && groups.every((group) => !kept(group).length || (group.company && (group.company !== "new" || group.newName.trim())));
  const itemCount = groups ? groups.reduce((sum, group) => sum + kept(group).length, 0) : 0;
  const several = groups && (groups.length > 1 || groups[0]?.heading);

  const save = async () => {
    setBusy("save");
    setError("");
    try {
      let saved = 0;
      for (const group of groups) {
        const lines = kept(group);
        if (!lines.length) continue;
        let companyId = group.company;
        if (companyId === "new") {
          const existing = companies.find((company) => company.name.toLowerCase() === group.newName.trim().toLowerCase());
          companyId = existing ? existing.id : (await onAddCompany({ name: group.newName.trim() })).id;
        }
        await API.post(`/supply/rounds/${round.id}/orders`, {
          company_id: companyId,
          source: mode === "file" ? "file" : "text",
          raw_text: mode === "file" ? "" : text,
          file_name: mode === "file" ? file?.name : null,
          lines: lines.map(({ name, qty: amount, unit }) => ({ name, qty: amount, unit })),
        }, { headers });
        saved += 1;
      }
      onSaved(saved);
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Could not save");
      setBusy("");
    }
  };

  const companyPicker = (group, index) => (
    <div className="ds-group-company">
      <select value={group.company} onChange={(event) => setGroup(index, { company: event.target.value })} aria-label="Company">
        <option value="">Choose company</option>
        {active.map((company) => <option key={company.id} value={company.id}>{company.name}{already.has(company.id) ? " (already has an order)" : ""}</option>)}
        <option value="new">➕ New company…</option>
      </select>
      {group.company === "new" && <input value={group.newName} onChange={(event) => setGroup(index, { newName: event.target.value })} placeholder="New company name" />}
    </div>
  );

  return (
    <div className="fnd-backdrop" onClick={onClose}>
      <div className="fnd-modal ds-modal" onClick={(event) => event.stopPropagation()}>
        <div className="fnd-modal-head">
          <div><h3>Add orders</h3><p className="fnd-sub">{round.ref} · delivery {dayLabel(round.delivery_date)} · paste one company's order, or a message with several companies</p></div>
          <button type="button" className="fnd-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="fnd-modal-body">
          {!groups && <>
            <div className="ds-mode">
              <button type="button" className={mode === "paste" ? "active" : ""} onClick={() => setMode("paste")}>Paste from WhatsApp</button>
              <button type="button" className={mode === "file" ? "active" : ""} onClick={() => setMode("file")}>Upload Excel / CSV</button>
            </div>
            {mode === "paste" ? (
              <label>The order message
                <textarea rows={12} value={text} onChange={(event) => setText(event.target.value)} placeholder={"AERO\n- Apple - 6 kg\n- Banana - 7 kg\n\nCRED One\n- Apple - 12 kg\n\n(or one company's list: Lays Classic 52g - 20 …)"} />
              </label>
            ) : (
              <label className="ds-file">{file ? `📄 ${file.name}` : "Choose the Excel or CSV file the admin sent"}
                <input type="file" accept=".xlsx,.xls,.csv" onChange={(event) => setFile(event.target.files?.[0] || null)} />
              </label>
            )}
          </>}
          {groups && (
            <div className="ds-preview">
              <div className="ds-preview-head">
                <b>{itemCount} item{itemCount === 1 ? "" : "s"}{several ? ` from ${groups.length} compan${groups.length === 1 ? "y" : "ies"}` : ""}</b>
                <button type="button" className="audit-link-danger" onClick={() => setGroups(null)}>Read again</button>
              </div>
              {found?.date && found.date !== round.delivery_date && (
                <div className="ds-note">📅 The message says <b>{dayLabel(found.date)}</b>, but this delivery date is <b>{dayLabel(round.delivery_date)}</b>. Check you're adding it to the right date.</div>
              )}
              {groups.map((group, index) => (
                <div key={index} className={several ? "ds-group" : ""}>
                  {several ? (
                    <div className="ds-group-head">
                      <b>{group.heading || "Company"}</b>
                      {group.company && group.company !== "new" ? <span className="ds-chip is-known">✓ saved company</span> : group.company === "new" ? <span className="ds-chip is-new">✚ new company</span> : null}
                      {companyPicker(group, index)}
                    </div>
                  ) : (
                    <label className="ds-single-company">Company *{companyPicker(group, index)}</label>
                  )}
                  <LinesTable lines={group.lines} units={units} onChange={(lines) => setGroup(index, { lines })} />
                </div>
              ))}
              {groups.some((group) => kept(group).some((line) => !(Number(line.qty) > 0))) && <p className="fnd-hint">Rows in red have no quantity. Fill it in, or remove the row.</p>}
            </div>
          )}
          {error && <div className="audit-error">{error}</div>}
        </div>
        <div className="fnd-modal-foot">
          <button type="button" className="audit-btn" onClick={onClose}>Cancel</button>
          {!groups
            ? <button type="button" className="audit-btn audit-btn-primary" disabled={busy === "read" || (mode === "paste" ? !text.trim() : !file)} onClick={() => read()}>{busy === "read" ? "Reading…" : "Read order"}</button>
            : <button type="button" className="audit-btn audit-btn-primary" disabled={busy === "save" || !itemCount || !ready} onClick={save}>{busy === "save" ? "Saving…" : several ? `Add ${groups.filter((group) => kept(group).length).length} companies' orders` : `Add ${itemCount} items to ${round.ref}`}</button>}
        </div>
      </div>
    </div>
  );
}

/* ---------- Companies ---------- */
function Companies({ companies, onAdd, onUpdate, onClose }) {
  const [draft, setDraft] = useState({ name: "", contact_name: "", contact_phone: "", location: "" });
  const [error, setError] = useState("");
  const add = async (event) => {
    event.preventDefault();
    setError("");
    try {
      await onAdd(draft);
      setDraft({ name: "", contact_name: "", contact_phone: "", location: "" });
    } catch (err) {
      setError(err.response?.data?.error || "Could not add");
    }
  };
  return (
    <div className="fnd-backdrop" onClick={onClose}>
      <div className="fnd-modal" onClick={(event) => event.stopPropagation()}>
        <div className="fnd-modal-head"><h3>Companies you supply</h3><button type="button" className="fnd-close" onClick={onClose} aria-label="Close">×</button></div>
        <div className="fnd-modal-body">
          <form className="ds-company-form" onSubmit={add}>
            <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Company name *" required />
            <input value={draft.contact_name} onChange={(event) => setDraft({ ...draft, contact_name: event.target.value })} placeholder="Admin's name" />
            <input value={draft.contact_phone} onChange={(event) => setDraft({ ...draft, contact_phone: event.target.value })} placeholder="Admin's WhatsApp" inputMode="tel" />
            <input value={draft.location} onChange={(event) => setDraft({ ...draft, location: event.target.value })} placeholder="Location" />
            <button type="submit" className="audit-btn audit-btn-primary">Add</button>
          </form>
          {error && <div className="audit-error">{error}</div>}
          <ul className="ds-companies">
            {companies.map((company) => (
              <li key={company.id} className={company.active ? "" : "is-off"}>
                <div><b>{company.name}</b><small>{[company.contact_name, company.contact_phone, company.location].filter(Boolean).join(" · ") || "No contact details"}</small></div>
                <button type="button" className="audit-btn" onClick={() => onUpdate(company, { active: !company.active })}>{company.active ? "Hide" : "Show again"}</button>
              </li>
            ))}
            {!companies.length && <p className="audit-empty">No companies yet. Add the first one above.</p>}
          </ul>
        </div>
      </div>
    </div>
  );
}

/* ---------- Items (names the master sheet uses) ---------- */
function Items({ products, units, onUpdate, onMerge, onClose }) {
  const [query, setQuery] = useState("");
  const [merging, setMerging] = useState(null);
  const q = query.trim().toLowerCase();
  const shown = products.filter((product) => !q || `${product.name} ${(product.aliases || []).join(" ")} ${product.category || ""}`.toLowerCase().includes(q));
  return (
    <div className="fnd-backdrop" onClick={onClose}>
      <div className="fnd-modal ds-modal" onClick={(event) => event.stopPropagation()}>
        <div className="fnd-modal-head"><div><h3>Items</h3><p className="fnd-sub">Every item ever ordered. Rename, set a category, or merge two that are the same.</p></div><button type="button" className="fnd-close" onClick={onClose} aria-label="Close">×</button></div>
        <div className="fnd-modal-body">
          <input className="ds-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search items" />
          <table className="ds-table">
            <thead><tr><th>Item</th><th>Unit</th><th>Category</th><th title="So '2 box' adds to pieces">Pcs per box</th><th>Sell price (₹)</th><th>Other spellings</th><th /></tr></thead>
            <tbody>
              {shown.map((product) => (
                <tr key={product.id}>
                  <td><input defaultValue={product.name} onBlur={(event) => event.target.value.trim() !== product.name && onUpdate(product, { name: event.target.value })} /></td>
                  <td><select value={product.unit} onChange={(event) => onUpdate(product, { unit: event.target.value })}>{units.map((unit) => <option key={unit}>{unit}</option>)}</select></td>
                  <td><input defaultValue={product.category || ""} placeholder="e.g. Chips, Fruit" onBlur={(event) => event.target.value !== (product.category || "") && onUpdate(product, { category: event.target.value })} /></td>
                  <td><input type="number" min="0" step="1" className="ds-qty" defaultValue={product.pack_size ?? ""} placeholder="—" onBlur={(event) => String(event.target.value) !== String(product.pack_size ?? "") && onUpdate(product, { pack_size: event.target.value })} /></td>
                  <td><input type="number" min="0" step="any" className="ds-qty" defaultValue={product.sell_price ?? ""} placeholder={`per ${product.unit}`} onBlur={(event) => String(event.target.value) !== String(product.sell_price ?? "") && onUpdate(product, { sell_price: event.target.value })} /></td>
                  <td><small>{(product.aliases || []).join(", ") || "—"}</small></td>
                  <td>
                    {merging === product.id ? (
                      <select autoFocus onChange={(event) => { if (event.target.value) onMerge(product, Number(event.target.value)); setMerging(null); }} onBlur={() => setMerging(null)}>
                        <option value="">Same as…</option>
                        {products.filter((other) => other.id !== product.id).map((other) => <option key={other.id} value={other.id}>{other.name}</option>)}
                      </select>
                    ) : <button type="button" className="audit-btn" onClick={() => setMerging(product.id)}>Merge</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!shown.length && <p className="audit-empty">No items yet. They appear as orders are added.</p>}
        </div>
      </div>
    </div>
  );
}

/* ---------- Phase 2: vendors, rates, purchases, selling prices ---------- */
const money = (value) => (value == null ? "—" : `₹${Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`);
const when = (value) => (value ? new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "");

function Vendors({ vendors, onAdd, onUpdate, onClose }) {
  const [draft, setDraft] = useState({ name: "", contact_name: "", phone: "", location: "" });
  const [error, setError] = useState("");
  const add = async (event) => {
    event.preventDefault();
    setError("");
    try {
      await onAdd(draft);
      setDraft({ name: "", contact_name: "", phone: "", location: "" });
    } catch (err) {
      setError(err.response?.data?.error || "Could not add");
    }
  };
  return (
    <div className="fnd-backdrop" onClick={onClose}>
      <div className="fnd-modal" onClick={(event) => event.stopPropagation()}>
        <div className="fnd-modal-head"><div><h3>Vendors</h3><p className="fnd-sub">Where stock and fruit are bought</p></div><button type="button" className="fnd-close" onClick={onClose} aria-label="Close">×</button></div>
        <div className="fnd-modal-body">
          <form className="ds-company-form" onSubmit={add}>
            <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Vendor name *" required />
            <input value={draft.contact_name} onChange={(event) => setDraft({ ...draft, contact_name: event.target.value })} placeholder="Contact person" />
            <input value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} placeholder="Phone" inputMode="tel" />
            <input value={draft.location} onChange={(event) => setDraft({ ...draft, location: event.target.value })} placeholder="Market / area" />
            <button type="submit" className="audit-btn audit-btn-primary">Add</button>
          </form>
          {error && <div className="audit-error">{error}</div>}
          <ul className="ds-companies">
            {vendors.map((vendor) => (
              <li key={vendor.id} className={vendor.active ? "" : "is-off"}>
                <div><b>{vendor.name}</b><small>{[vendor.contact_name, vendor.phone, vendor.location].filter(Boolean).join(" · ") || "No contact details"}</small></div>
                <button type="button" className="audit-btn" onClick={() => onUpdate(vendor, { active: !vendor.active })}>{vendor.active ? "Hide" : "Show again"}</button>
              </li>
            ))}
            {!vendors.length && <p className="audit-empty">No vendors yet. Add the first one above.</p>}
          </ul>
        </div>
      </div>
    </div>
  );
}

// Choose a vendor, or type a new one (added on save).
function VendorPicker({ vendors, value, onChange, newName, onNewName }) {
  return (
    <div className="ds-group-company">
      <select value={value} onChange={(event) => onChange(event.target.value)} aria-label="Vendor">
        <option value="">Choose vendor</option>
        {vendors.filter((vendor) => vendor.active).map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}
        <option value="new">➕ New vendor…</option>
      </select>
      {value === "new" && <input value={newName} onChange={(event) => onNewName(event.target.value)} placeholder="Vendor name" autoFocus />}
    </div>
  );
}

/* Record a rate or a purchase for one item of the round. kind: "rate" | "purchase". */
function BuyForm({ kind, row, round, vendors, headers, onAddVendor, onSaved, onClose }) {
  const [vendor, setVendor] = useState(String(row.best?.vendor_id || ""));
  const [newVendor, setNewVendor] = useState("");
  const [price, setPrice] = useState(row.best ? String(row.best.price) : "");
  const [amount, setAmount] = useState(String(row.short > 0 ? row.short : row.need));
  const [notes, setNotes] = useState("");
  const [history, setHistory] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    if (row.product_id) API.get(`/supply/products/${row.product_id}/prices`, { headers }).then((response) => alive && setHistory(response.data.filter((item) => item.unit === row.unit))).catch(() => alive && setHistory([]));
    return () => { alive = false; };
  }, [row.product_id, row.unit, headers]);

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      let vendorId = vendor;
      if (vendor === "new") vendorId = (await onAddVendor({ name: newVendor })).id;
      if (!vendorId) throw new Error("Choose the vendor");
      if (kind === "rate") await API.post("/supply/prices", { product_id: row.product_id, vendor_id: vendorId, unit: row.unit, price, round_id: round.id }, { headers });
      else await API.post(`/supply/rounds/${round.id}/purchases`, { product_id: row.product_id, vendor_id: vendorId, unit: row.unit, qty: amount, price, notes }, { headers });
      onSaved(kind === "rate" ? "Rate saved" : `Bought ${amount} ${row.unit} of ${row.name}`);
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Could not save");
      setBusy(false);
    }
  };

  return (
    <div className="fnd-backdrop" onClick={onClose}>
      <div className="fnd-modal" onClick={(event) => event.stopPropagation()}>
        <div className="fnd-modal-head">
          <div><h3>{kind === "rate" ? "Add a vendor's rate" : "Record what was bought"}</h3><p className="fnd-sub">{row.name} · need {qty(row.need)} {row.unit}{row.bought_qty ? ` · bought ${qty(row.bought_qty)}` : ""}</p></div>
          <button type="button" className="fnd-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="fnd-modal-body">
          <label>Vendor *<VendorPicker vendors={vendors} value={vendor} onChange={setVendor} newName={newVendor} onNewName={setNewVendor} /></label>
          <div className="fnd-grid fnd-grid-3">
            {kind === "purchase" && <label>Quantity bought ({row.unit}) *<input type="number" min="0" step="any" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>}
            <label>{kind === "rate" ? "Rate" : "Price paid"} per {row.unit} (₹) *<input type="number" min="0" step="any" value={price} onChange={(event) => setPrice(event.target.value)} autoFocus /></label>
            {kind === "purchase" && <label>Total<input value={Number(amount) > 0 && price !== "" ? money(Number(amount) * Number(price)) : ""} readOnly /></label>}
          </div>
          {kind === "purchase" && <label>Note (optional)<input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="e.g. quality, bill number" /></label>}
          {kind === "purchase" && <p className="fnd-hint">The price paid is also saved as this vendor's latest rate.</p>}
          <h4 className="fnd-timeline-title">Rate history ({row.unit})</h4>
          {history === null ? <p className="audit-empty">Loading…</p> : history.length ? (
            <ul className="ds-history">
              {history.slice(0, 15).map((item) => <li key={item.id}><b>{money(item.price)}</b><span>{item.vendor_name}</span><small>{when(item.recorded_at)} · {item.recorded_by}</small></li>)}
            </ul>
          ) : <p className="audit-empty">No rates yet for this item.</p>}
          {error && <div className="audit-error">{error}</div>}
        </div>
        <div className="fnd-modal-foot">
          <button type="button" className="audit-btn" onClick={onClose}>Cancel</button>
          <button type="button" className="audit-btn audit-btn-primary" disabled={busy || price === "" || !vendor || (vendor === "new" && !newVendor.trim()) || (kind === "purchase" && !(Number(amount) > 0))} onClick={save}>{busy ? "Saving…" : kind === "rate" ? "Save rate" : "Save purchase"}</button>
        </div>
      </div>
    </div>
  );
}

// Selling prices: a default per item, and any company that pays a different price.
function SellingPrices({ headers, companies, onClose, onChanged }) {
  const [data, setData] = useState(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const load = useCallback(() => API.get("/supply/selling-prices", { headers }).then((response) => setData(response.data)).catch(() => setError("Could not load prices")), [headers]);
  useEffect(() => { const timer = setTimeout(load, 0); return () => clearTimeout(timer); }, [load]);
  const active = companies.filter((company) => company.active);
  const special = (companyId, item) => data.company_prices.find((price) => price.company_id === companyId && price.product_id === item.id && price.unit === item.unit)?.price;
  const save = async (request) => {
    try {
      await request();
      await load();
      onChanged();
    } catch (err) {
      setError(err.response?.data?.error || "Could not save");
    }
  };
  const q = query.trim().toLowerCase();
  return (
    <div className="fnd-backdrop" onClick={onClose}>
      <div className="fnd-modal ds-modal" onClick={(event) => event.stopPropagation()}>
        <div className="fnd-modal-head"><div><h3>Selling prices</h3><p className="fnd-sub">Price per unit charged to companies. Fill a company's box only if they pay differently from the default.</p></div><button type="button" className="fnd-close" onClick={onClose} aria-label="Close">×</button></div>
        <div className="fnd-modal-body">
          {error && <div className="audit-error">{error}</div>}
          <input className="ds-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search items" />
          {!data ? <p className="audit-empty">Loading…</p> : (
            <div className="ds-table-wrap">
              <table className="ds-table ds-prices">
                <thead><tr><th>Item</th><th>Unit</th><th>Default (₹)</th>{active.map((company) => <th key={company.id}>{company.name}</th>)}</tr></thead>
                <tbody>
                  {data.items.filter((item) => !q || item.name.toLowerCase().includes(q)).map((item) => (
                    <tr key={item.id}>
                      <td>{item.name}</td>
                      <td>{item.unit}</td>
                      <td><input type="number" min="0" step="any" className="ds-qty" defaultValue={item.sell_price ?? ""} onBlur={(event) => String(event.target.value) !== String(item.sell_price ?? "") && save(() => API.patch(`/supply/products/${item.id}`, { sell_price: event.target.value }, { headers }))} /></td>
                      {active.map((company) => (
                        <td key={company.id}><input type="number" min="0" step="any" className="ds-qty" placeholder={item.sell_price ?? ""} defaultValue={special(company.id, item) ?? ""} onBlur={(event) => String(event.target.value) !== String(special(company.id, item) ?? "") && save(() => API.put("/supply/company-prices", { company_id: company.id, product_id: item.id, unit: item.unit, price: event.target.value }, { headers }))} /></td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BuyingTab({ buying, onRate, onBuy, onRemovePurchase }) {
  const { rows, totals } = buying;
  return (
    <>
      <div className="fnd-kpis ds-kpis">
        <div className="fnd-kpi-blue"><span>Estimated cost</span><b>{money(totals.estimate)}</b><small>All items at the best rate</small></div>
        <div className="fnd-kpi-purple"><span>Spent so far</span><b>{money(totals.spent)}</b><small>{totals.short_items ? `${totals.short_items} item${totals.short_items === 1 ? "" : "s"} still to buy` : "Everything bought"}</small></div>
        <div className="fnd-kpi-warn"><span>Selling value</span><b>{money(totals.selling)}</b><small>{totals.missing_prices ? `${totals.missing_prices} item${totals.missing_prices === 1 ? " has" : "s have"} no selling price` : "All items priced"}</small></div>
        <div className={totals.margin >= 0 ? "fnd-kpi-good" : "fnd-kpi-bad"}><span>Margin</span><b>{money(totals.margin)}</b><small>{totals.margin_percent != null ? `${totals.margin_percent}% of selling value` : "Add rates and selling prices"}</small></div>
      </div>
      {totals.missing_rates > 0 && <p className="fnd-hint">{totals.missing_rates} item{totals.missing_rates === 1 ? " has" : "s have"} no vendor rate yet: tap "+ Rate" to add one.</p>}
      <div className="ds-table-wrap">
        <table className="ds-table ds-buying">
          <thead><tr><th>Item</th><th>Need</th><th>Best rate</th><th>Est. cost</th><th>Bought</th><th>Short</th><th>Selling</th><th>Margin</th><th /></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className={row.short > 0 && row.bought_qty > 0 ? "is-check" : ""}>
                <td>{row.name}</td>
                <td>{qty(row.need)} {row.unit}</td>
                <td>{row.best ? <><b>{money(row.best.price)}</b>/{row.unit}<small className="ds-sub">{row.best.vendor_name} · {when(row.best.recorded_at)}{row.rates.length > 1 ? ` · ${row.rates.length} vendors` : ""}</small></> : <span className="na">—</span>}</td>
                <td>{money(row.estimate)}</td>
                <td>
                  {row.bought.length ? row.bought.map((item) => (
                    <span key={item.id} className="ds-bought" title={`${item.bought_by} · ${when(item.bought_at)}${item.notes ? ` · ${item.notes}` : ""}`}>
                      {qty(item.qty)} @ {money(item.price)} · {item.vendor_name}
                      <button type="button" onClick={() => onRemovePurchase(item)} aria-label="Remove purchase">✕</button>
                    </span>
                  )) : <span className="na">—</span>}
                  {row.bought.length > 0 && <small className="ds-sub">Spent {money(row.spent)}</small>}
                </td>
                <td className={row.short > 0 ? "ds-short" : "ds-done"}>{row.short > 0 ? `${qty(row.short)} ${row.unit}` : "✓"}</td>
                <td>{money(row.selling)}</td>
                <td className={row.margin == null ? "" : row.margin >= 0 ? "ds-plus" : "ds-minus"}>{money(row.margin)}</td>
                <td className="ds-row-actions">
                  {row.product_id ? <>
                    <button type="button" className="audit-btn" onClick={() => onRate(row)}>+ Rate</button>
                    <button type="button" className="audit-btn audit-btn-primary" onClick={() => onBuy(row)}>Bought</button>
                  </> : <small className="na">Check name first</small>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="fnd-hint">Cost = what was spent, plus the best rate for anything still short. Margin = selling value − cost.</p>
    </>
  );
}

/* ---------- Page ---------- */
export default function SupplyWorkspace({ token, isAdmin, internalUsers }) {
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);
  const [overview, setOverview] = useState(null);
  const [roundId, setRoundId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [tab, setTab] = useState("master");
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState(null);
  const [newDate, setNewDate] = useState(tomorrow);
  const [newTitle, setNewTitle] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [orderText, setOrderText] = useState("");
  const [buyerId, setBuyerId] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState("");
  const [buyForm, setBuyForm] = useState(null);

  const notify = useCallback((message, isError = false) => {
    setToast({ message, isError });
    setTimeout(() => setToast(null), 4500);
  }, []);

  const loadOverview = useCallback(async () => {
    try {
      const response = await API.get("/supply/overview", { headers });
      setOverview(response.data);
      setRoundId((current) => current ?? response.data.rounds[0]?.id ?? null);
      setBuyerId((current) => current || response.data.buyer_id || "");
    } catch (err) {
      notify(err.response?.data?.error || "Could not load Direct Supply", true);
    }
  }, [headers, notify]);

  const loadRound = useCallback(async (id) => {
    if (!id) { setDetail(null); return; }
    try {
      const response = await API.get(`/supply/rounds/${id}`, { headers });
      setDetail(response.data);
    } catch (err) {
      notify(err.response?.data?.error || "Could not load this round", true);
    }
  }, [headers, notify]);

  useEffect(() => { const timer = setTimeout(loadOverview, 0); return () => clearTimeout(timer); }, [loadOverview]);
  useEffect(() => { const timer = setTimeout(() => loadRound(roundId), 0); return () => clearTimeout(timer); }, [loadRound, roundId]);

  const refresh = async () => { await Promise.all([loadOverview(), loadRound(roundId)]); };
  const call = async (label, action, success) => {
    setBusy(label);
    try {
      const result = await action();
      if (success) notify(typeof success === "function" ? success(result) : success);
      await refresh();
      return result;
    } catch (err) {
      notify(err.response?.data?.error || err.message || "Something went wrong", true);
      return null;
    } finally {
      setBusy("");
    }
  };

  const createRound = () => call("round", async () => {
    const response = await API.post("/supply/rounds", { delivery_date: newDate, title: newTitle }, { headers });
    setRoundId(response.data.id);
    setNewTitle("");
    // A pasted message goes straight into "Add orders" for the new date.
    if (newMessage.trim()) {
      setOrderText(newMessage);
      setNewMessage("");
      setModal("order");
    } else setModal(null);
    return response.data;
  }, (round) => `${round.ref} started for ${dayLabel(round.delivery_date)}`);

  // The date and title in a pasted message ("Fruits requirements for 1/10/26") fill the form.
  const readMessage = async (value) => {
    setNewMessage(value);
    if (!value.trim()) return;
    try {
      const response = await API.post("/supply/parse", { text: value }, { headers });
      if (response.data.date) setNewDate(response.data.date);
      if (response.data.title) setNewTitle((current) => current || response.data.title);
    } catch {
      // nothing readable yet: the form stays as it is
    }
  };

  const addVendor = async (draft) => {
    const response = await API.post("/supply/vendors", draft, { headers });
    await loadOverview();
    return response.data;
  };

  const addCompany = async (draft) => {
    const response = await API.post("/supply/companies", draft, { headers });
    await loadOverview();
    return response.data;
  };

  const downloadExcel = async () => {
    try {
      const response = await API.get(`/supply/rounds/${round.id}/master.xlsx`, { headers, responseType: "blob" });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Snackit-${round.ref}-master-${round.delivery_date}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      notify("Could not download the Excel file", true);
    }
  };

  const round = detail?.round;
  const companies = overview?.companies || [];
  const units = overview?.units || ["pcs", "kg", "box", "pkt"];
  const buyers = (internalUsers || []).filter((user) => user.phone);
  const q = search.trim().toLowerCase();
  const master = (detail?.master || []).filter((row) => !q || `${row.name} ${row.spellings.join(" ")}`.toLowerCase().includes(q));
  const checks = detail?.checks || [];

  if (!overview) return <div className="audit-workspace"><p className="audit-empty">Loading Direct Supply…</p></div>;

  return (
    <div className="audit-workspace ds-workspace">
      {toast && <div className={`audit-toast ${toast.isError ? "is-error" : ""}`}>{toast.message}</div>}

      <section className="audit-card ds-top">
        <div className="ds-rounds">
          {overview.rounds.map((item) => (
            <button type="button" key={item.id} className={`ds-round ${item.id === roundId ? "active" : ""}`} onClick={() => setRoundId(item.id)}>
              <b>{dayLabel(item.delivery_date)}</b>
              <small>{item.ref}{item.title ? ` · ${item.title}` : ""}</small>
              <small>{item.company_count} compan{item.company_count === 1 ? "y" : "ies"} · {item.status}</small>
            </button>
          ))}
          <button type="button" className="ds-round ds-round-new" onClick={() => setModal("round")}>＋ New delivery date</button>
        </div>
        <div className="ds-top-actions">
          <button type="button" className="audit-btn" onClick={() => setModal("companies")}>Companies ({companies.length})</button>
          <button type="button" className="audit-btn" onClick={() => setModal("items")}>Items ({overview.products.length})</button>
          <button type="button" className="audit-btn" onClick={() => setModal("vendors")}>Vendors ({(overview.vendors || []).length})</button>
          <button type="button" className="audit-btn" onClick={() => setModal("selling")}>Selling prices</button>
        </div>
      </section>

      {!round ? (
        <div className="audit-empty fnd-empty">
          <b>No supply rounds yet</b>
          <span>Start one for a delivery date, then add each company's order. The master sheet builds itself.</span>
          <button type="button" className="audit-btn audit-btn-primary" onClick={() => setModal("round")}>＋ New delivery date</button>
        </div>
      ) : <>
        <section className="audit-card">
          <div className="ds-round-head">
            <div>
              <h3>{round.ref} · Delivery {dayLabel(round.delivery_date)}{round.title ? ` · ${round.title}` : ""}</h3>
              <p>{detail.orders.length} order{detail.orders.length === 1 ? "" : "s"} from {detail.companies.length} compan{detail.companies.length === 1 ? "y" : "ies"} · {detail.master.length} items{round.sent_at ? ` · sent to ${round.sent_to} ${new Date(round.sent_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}` : ""}</p>
            </div>
            <select value={round.status} onChange={(event) => call("status", () => API.patch(`/supply/rounds/${round.id}`, { status: event.target.value }, { headers }))} className={`ds-status fnd-tone-${STATUS_TONE[round.status]}`}>
              {STATUSES.map((status) => <option key={status}>{status}</option>)}
            </select>
          </div>
          <div className="ds-actions">
            <button type="button" className="audit-btn audit-btn-primary" onClick={() => setModal("order")}>＋ Add company order</button>
            <button type="button" className="audit-btn" onClick={downloadExcel} disabled={!detail.master.length}>⬇ Excel</button>
            <div className="ds-send">
              <select value={buyerId} onChange={(event) => setBuyerId(event.target.value)} aria-label="Stock buyer">
                <option value="">Stock buyer…</option>
                {buyers.map((user) => <option key={user.id} value={String(user.id)}>{user.name}</option>)}
              </select>
              <button type="button" className="audit-btn" disabled={!buyerId || !detail.master.length || busy === "send"} onClick={() => call("send", () => API.post(`/supply/rounds/${round.id}/send`, { buyer_id: buyerId }, { headers }), (response) => (response.data.file_sent ? "Sent on WhatsApp with the Excel file" : "Summary sent on WhatsApp (the Excel file didn't go: download and share it)"))}>{busy === "send" ? "Sending…" : "📲 Send to buyer"}</button>
            </div>
            {isAdmin && <button type="button" className="audit-link-danger" onClick={() => window.confirm(`Delete ${round.ref} and all its orders?`) && call("delete", async () => { await API.delete(`/supply/rounds/${round.id}`, { headers }); setRoundId(null); }, `${round.ref} deleted`)}>Delete round</button>}
          </div>
          {!buyers.length && <p className="fnd-hint">To send the sheet on WhatsApp, give the stock buyer a WhatsApp number in Employees & Access.</p>}
        </section>

        {checks.length > 0 && (
          <section className="audit-card ds-checks">
            <div className="audit-card-head"><div><h3>🔎 Check names ({checks.length})</h3><p>These look like an item you already have. Confirm, so the master sheet adds them together (it remembers for next time).</p></div></div>
            {checks.map((line) => (
              <div key={line.id} className="ds-check">
                <div><b>"{line.raw_name}"</b><small>{line.company_name} · {qty(line.qty)} {line.unit}</small></div>
                <div className="ds-check-actions">
                  {line.suggestion_id && <button type="button" className="audit-btn audit-btn-primary" onClick={() => call("resolve", () => API.post(`/supply/lines/${line.id}/resolve`, { product_id: line.suggestion_id }, { headers }), `Combined with ${line.suggestion_name}`)}>Same as {line.suggestion_name}</button>}
                  <select defaultValue="" onChange={(event) => event.target.value && call("resolve", () => API.post(`/supply/lines/${line.id}/resolve`, { product_id: Number(event.target.value) }, { headers }), "Combined")}>
                    <option value="">Same as another item…</option>
                    {overview.products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
                  </select>
                  <button type="button" className="audit-btn" onClick={() => call("resolve", () => API.post(`/supply/lines/${line.id}/resolve`, { new: true }, { headers }), "Kept as a new item")}>Different item</button>
                </div>
              </div>
            ))}
          </section>
        )}
        {(detail.problems || []).length > 0 && (
          <div className="audit-error ds-problems">⚠ {detail.problems.length} line{detail.problems.length === 1 ? " has" : "s have"} no quantity: {detail.problems.map((line) => `${line.raw_name} (${line.company_name})`).join(", ")}. Fix them under Orders by company.</div>
        )}

        <section className="audit-card">
          <div className="ds-tabs">
            <button type="button" className={tab === "master" ? "active" : ""} onClick={() => setTab("master")}>Master sheet</button>
            <button type="button" className={tab === "orders" ? "active" : ""} onClick={() => setTab("orders")}>Orders by company ({detail.orders.length})</button>
            <button type="button" className={tab === "buying" ? "active" : ""} onClick={() => setTab("buying")}>Buying & margin</button>
            {tab === "master" && <input className="ds-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search items" />}
          </div>

          {tab === "buying" ? (
            detail.master.length ? (
              <BuyingTab
                buying={detail.buying}
                onRate={(row) => setBuyForm({ kind: "rate", row })}
                onBuy={(row) => setBuyForm({ kind: "purchase", row })}
                onRemovePurchase={(item) => window.confirm(`Remove this purchase (${qty(item.qty)} at ${money(item.price)})?`) && call("purchase", () => API.delete(`/supply/purchases/${item.id}`, { headers }), "Purchase removed")}
              />
            ) : <p className="audit-empty">Add orders first: buying works from the master sheet.</p>
          ) : tab === "master" ? (
            detail.master.length ? (
              <div className="ds-table-wrap">
                <table className="ds-table ds-master">
                  <thead>
                    <tr><th>Item</th><th>Unit</th><th className="is-total">Total</th>{detail.companies.map((company) => <th key={company.id}>{company.name}</th>)}</tr>
                  </thead>
                  <tbody>
                    {master.map((row) => (
                      <tr key={row.key} className={row.to_check ? "is-check" : ""}>
                        <td title={row.spellings.length > 1 ? `Written as: ${row.spellings.join(", ")}` : ""}>{row.name}{row.to_check && <span className="ds-chip is-check">check name</span>}{row.spellings.length > 1 && <small className="ds-spellings"> · {row.spellings.length} spellings combined</small>}{row.from_boxes > 0 && <small className="ds-spellings"> · incl. {qty(row.from_boxes)} box</small>}</td>
                        <td>{row.unit}</td>
                        <td className="is-total">{qty(row.total)}</td>
                        {detail.companies.map((company) => <td key={company.id}>{row.by_company[company.id] ? qty(row.by_company[company.id]) : ""}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="audit-empty">No orders yet. Add each company's order and the master sheet fills in here.</p>
          ) : (
            <div className="ds-orders">
              {detail.orders.map((order) => (
                <div key={order.id} className="ds-order">
                  <div className="ds-order-head">
                    <b>{order.company_name}</b>
                    <small>{order.lines.length} items · {order.file_name ? `📄 ${order.file_name}` : "pasted"} · by {order.created_by}</small>
                    <button type="button" className="audit-link-danger" onClick={() => window.confirm(`Remove ${order.company_name}'s order from ${round.ref}?`) && call("order", () => API.delete(`/supply/orders/${order.id}`, { headers }), "Order removed")}>Remove order</button>
                  </div>
                  <table className="ds-table">
                    <tbody>
                      {order.lines.map((line) => (
                        <tr key={line.id} className={Number(line.qty) > 0 ? "" : "is-problem"}>
                          <td>{line.raw_name}{!line.product_id && <span className="ds-chip is-check">check name</span>}</td>
                          <td><input type="number" min="0" step="any" defaultValue={qty(line.qty)} className="ds-qty" onBlur={(event) => Number(event.target.value) !== Number(line.qty) && call("line", () => API.patch(`/supply/lines/${line.id}`, { qty: event.target.value }, { headers }))} /></td>
                          <td><select value={line.unit} onChange={(event) => call("line", () => API.patch(`/supply/lines/${line.id}`, { unit: event.target.value }, { headers }))}>{units.map((unit) => <option key={unit}>{unit}</option>)}</select></td>
                          <td><button type="button" className="ds-x" onClick={() => call("line", () => API.delete(`/supply/lines/${line.id}`, { headers }))} aria-label="Remove line">✕</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
              {!detail.orders.length && <p className="audit-empty">No orders yet.</p>}
            </div>
          )}
        </section>
      </>}

      {modal === "round" && (
        <div className="fnd-backdrop" onClick={() => setModal(null)}>
          <div className="fnd-modal" onClick={(event) => event.stopPropagation()}>
            <div className="fnd-modal-head"><h3>New delivery date</h3><button type="button" className="fnd-close" onClick={() => setModal(null)} aria-label="Close">×</button></div>
            <div className="fnd-modal-body">
              <div className="fnd-grid fnd-grid-3">
                <label>Delivery date *<input type="date" value={newDate} onChange={(event) => setNewDate(event.target.value)} /></label>
                <label>Name (optional)<input value={newTitle} onChange={(event) => setNewTitle(event.target.value)} placeholder="e.g. Weekly order, Fruits" /></label>
              </div>
              <label>Or paste the order message (optional)
                <textarea rows={6} value={newMessage} onChange={(event) => setNewMessage(event.target.value)} onBlur={(event) => readMessage(event.target.value)} onPaste={(event) => { const value = event.clipboardData.getData("text"); setTimeout(() => readMessage(value), 0); }} placeholder={"Fruits requirements for\n1/10/26\n\nAERO\n- Apple - 6 kg …"} />
              </label>
              <p className="fnd-hint">All companies' orders for this delivery go into one master sheet. A pasted message fills in the date and name, and its orders are added next.</p>
            </div>
            <div className="fnd-modal-foot">
              <button type="button" className="audit-btn" onClick={() => setModal(null)}>Cancel</button>
              <button type="button" className="audit-btn audit-btn-primary" disabled={!newDate || busy === "round"} onClick={createRound}>Start</button>
            </div>
          </div>
        </div>
      )}
      {modal === "order" && round && (
        <AddOrder
          headers={headers}
          round={{ ...round, orderCompanyIds: detail.orders.map((order) => order.company_id) }}
          companies={companies}
          units={units}
          onAddCompany={addCompany}
          initialText={orderText}
          onSaved={async (count) => { setModal(null); setOrderText(""); notify(count > 1 ? `${count} companies' orders added to the master sheet` : "Order added to the master sheet"); await refresh(); }}
          onClose={() => { setModal(null); setOrderText(""); }}
        />
      )}
      {modal === "companies" && <Companies companies={companies} onAdd={addCompany} onUpdate={(company, patch) => call("company", () => API.patch(`/supply/companies/${company.id}`, patch, { headers }))} onClose={() => setModal(null)} />}
      {modal === "vendors" && <Vendors vendors={overview.vendors || []} onAdd={addVendor} onUpdate={(vendor, patch) => call("vendor", () => API.patch(`/supply/vendors/${vendor.id}`, patch, { headers }))} onClose={() => setModal(null)} />}
      {modal === "selling" && <SellingPrices headers={headers} companies={companies} onChanged={() => loadRound(roundId)} onClose={() => setModal(null)} />}
      {buyForm && round && (
        <BuyForm
          key={`${buyForm.kind}-${buyForm.row.key}`}
          kind={buyForm.kind}
          row={buyForm.row}
          round={round}
          vendors={overview.vendors || []}
          headers={headers}
          onAddVendor={addVendor}
          onSaved={async (message) => { setBuyForm(null); notify(message); await refresh(); }}
          onClose={() => setBuyForm(null)}
        />
      )}
      {modal === "items" && (
        <Items
          products={overview.products}
          units={units}
          onUpdate={(product, patch) => call("item", () => API.patch(`/supply/products/${product.id}`, patch, { headers }))}
          onMerge={(product, intoId) => window.confirm(`Merge "${product.name}" into "${overview.products.find((item) => item.id === intoId)?.name}"? Their quantities will be added together from now on.`) && call("merge", () => API.post("/supply/products/merge", { from_id: product.id, into_id: intoId }, { headers }), "Items merged")}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
