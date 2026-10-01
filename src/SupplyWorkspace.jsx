import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Box } from "./SupplyFrame.jsx";
import { DeliveryTab, Accounts, SellerSettings } from "./SupplyBilling.jsx";
import SupplyReports from "./SupplyReports.jsx";

/* Direct Supply: one page of always-open boxes. The top half is the delivery date you pick
   (orders → master sheet → buying → delivery & billing); the bottom half is the business
   across all dates (accounts, companies, vendors, items, prices, reports, settings).
   See directSupply.js on the server. */

const API = axios.create({ baseURL: "https://whatsapp-bot-backend-b3nb.onrender.com" });
const STATUSES = ["Collecting", "Sent to buyer", "Bought", "Delivered"];
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

/* The five simple pages of Direct Supply, each with two "how to use" points and an example. */
const PAGES = [
  { key: "orders", num: "1", label: "Orders", how: ["Pick the delivery date.", "Paste a company's WhatsApp message, press Read order, then Add."], example: "AERO sends “Apple 6 kg, Banana 7 kg”: paste it and it's saved as AERO's order. Orders sent to the Snackit WhatsApp number or through an order link appear here by themselves." },
  { key: "buy", num: "2", label: "Buy", how: ["Check the total list and press Send to buyer.", "After buying, press Bought next to each item."], example: "AERO wants 6 kg apples and CRED 12 kg: the list shows Apple 18 kg." },
  { key: "deliver", num: "3", label: "Deliver", how: ["Tap Packed → Out for delivery → Delivered for each company.", "When it's delivered, press Create invoice."], example: "Only 5 of the 6 kg apples went? Change it to 5 before making the invoice." },
  { key: "money", num: "4", label: "Money", how: ["See who owes money and what is overdue.", "Click an invoice to add a payment or print it."], example: "Every Monday, check Overdue and call those companies." },
  { key: "setup", num: "⚙", label: "Setup", how: ["Add your companies (with the admin's WhatsApp number) and vendors once.", "Set selling prices and Snackit's invoice details."], example: "Save AERO's admin number and every list they WhatsApp becomes an order." },
];

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

function AddOrder({ headers, round, companies, units, onAddCompany, onSaved, onMoveToDate, initialText = "" }) {
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

  const reset = () => { setGroups(null); setText(""); setFile(null); setFound(null); setError(""); };

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

  // Moved here from another date: read straight away.
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
      reset();
      setBusy("");
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

  const foot = <>
    {(groups || text || file) && <button type="button" className="audit-btn" onClick={reset}>Clear</button>}
    {!groups
      ? <button type="button" className="audit-btn audit-btn-primary" disabled={busy === "read" || (mode === "paste" ? !text.trim() : !file)} onClick={() => read()}>{busy === "read" ? "Reading…" : "Read order"}</button>
      : <button type="button" className="audit-btn audit-btn-primary" disabled={busy === "save" || !itemCount || !ready} onClick={save}>{busy === "save" ? "Saving…" : several ? `Add ${groups.filter((group) => kept(group).length).length} companies' orders` : `Add ${itemCount} items to ${round.ref}`}</button>}
  </>;

  return (
    <Box id="ds-add" icon="📥" tone="green" title="Add orders" sub={`To ${round.ref} · delivery ${dayLabel(round.delivery_date)}`} foot={foot} className="ds-span-7">
      {!groups && <>
        <div className="ds-mode">
          <button type="button" className={mode === "paste" ? "active" : ""} onClick={() => setMode("paste")}>Paste from WhatsApp</button>
          <button type="button" className={mode === "file" ? "active" : ""} onClick={() => setMode("file")}>Upload Excel / CSV</button>
        </div>
        {mode === "paste" ? (
          <textarea className="ds-paste" rows={7} value={text} onChange={(event) => setText(event.target.value)} aria-label="The order message" placeholder={"AERO\n- Apple - 6 kg\n- Banana - 7 kg\n\nCRED One\n- Apple - 12 kg\n\n(or one company's list: Lays Classic 52g - 20 …)"} />
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
          </div>
          {found?.date && found.date !== round.delivery_date && (
            <div className="ds-note">
              📅 The message says <b>{dayLabel(found.date)}</b>, but you're adding to <b>{dayLabel(round.delivery_date)}</b>.
              {mode === "paste" && <button type="button" className="audit-btn" onClick={() => onMoveToDate(found.date, found.title, text)}>Add to {dayLabel(found.date)} instead</button>}
            </div>
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
              <div className="ds-table-wrap"><LinesTable lines={group.lines} units={units} onChange={(lines) => setGroup(index, { lines })} /></div>
            </div>
          ))}
          {groups.some((group) => kept(group).some((line) => !(Number(line.qty) > 0))) && <p className="fnd-hint">Rows in red have no quantity. Fill it in, or remove the row.</p>}
        </div>
      )}
      {error && <div className="audit-error">{error}</div>}
    </Box>
  );
}

/* ---------- Companies ---------- */
// A company's order link: copy it, send it on WhatsApp (opens WhatsApp on this device), replace or switch off.
function OrderLink({ company, headers, base }) {
  const [link, setLink] = useState(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const call = async (action) => {
    setError("");
    try {
      const response = await API.post(`/supply/companies/${company.id}/order-link`, { action }, { headers });
      setLink(response.data);
    } catch (err) {
      setError(err.response?.data?.error || "Could not make the link");
    }
  };
  useEffect(() => { const timer = setTimeout(() => call("get"), 0); return () => clearTimeout(timer); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (error) return <div className="audit-error">{error}</div>;
  if (!link) return <p className="audit-empty">Making the link…</p>;
  const url = `${base.replace(/\/$/, "")}/?order=${link.token}`;
  const phone = String(company.contact_phone || "").split(/[,;/\n]+/)[0].replace(/\D/g, "");
  const waPhone = phone.length === 10 ? `91${phone}` : phone;
  const message = `Hi${company.contact_name ? ` ${company.contact_name}` : ""}, this is your Snackit order link for ${company.name}. Open it any time to place or change your order for the next delivery:\n${url}`;
  return (
    <div className="ds-link">
      {link.on ? <>
        <code>{url}</code>
        <div className="ds-link-actions">
          <button type="button" className="audit-btn" onClick={() => { navigator.clipboard?.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? "Copied ✓" : "Copy link"}</button>
          <a className="audit-btn" href={`https://wa.me/${waPhone}?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer">Send on WhatsApp</a>
          <a className="audit-btn" href={url} target="_blank" rel="noreferrer">Open</a>
          <button type="button" className="audit-btn" onClick={() => window.confirm("Make a new link? The old one will stop working.") && call("new")}>New link</button>
          <button type="button" className="audit-link-danger" onClick={() => call("off")}>Switch off</button>
        </div>
        {!waPhone && <small className="na">Add the admin's WhatsApp number to send it directly.</small>}
      </> : <>
        <span className="na">The order link is switched off.</span>
        <button type="button" className="audit-btn" onClick={() => call("on")}>Switch on</button>
      </>}
    </div>
  );
}

function Companies({ companies, onAdd, onUpdate, headers, className }) {
  const [draft, setDraft] = useState({ name: "", contact_name: "", contact_phone: "", location: "" });
  const [billing, setBilling] = useState(null);
  const [linkFor, setLinkFor] = useState(null);
  const [base, setBase] = useState(window.location.origin);
  useEffect(() => {
    let alive = true;
    API.get("/supply/seller", { headers }).then((response) => { if (alive && response.data.public_url) setBase(response.data.public_url); }).catch(() => {});
    return () => { alive = false; };
  }, [headers]);
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
  const live = companies.filter((company) => company.active).length;
  return (
    <Box id="ds-companies" icon="🏢" tone="blue" title="Companies you supply" sub={`${live} companies`} className={className}>
      <form className="ds-company-form" onSubmit={add}>
        <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Company name *" required />
        <input value={draft.contact_name} onChange={(event) => setDraft({ ...draft, contact_name: event.target.value })} placeholder="Admin's name" />
        <input value={draft.contact_phone} onChange={(event) => setDraft({ ...draft, contact_phone: event.target.value })} placeholder="Admin's WhatsApp (commas for more)" inputMode="tel" />
        <input value={draft.location} onChange={(event) => setDraft({ ...draft, location: event.target.value })} placeholder="Location" />
        <button type="submit" className="audit-btn audit-btn-primary">Add</button>
      </form>
      {error && <div className="audit-error">{error}</div>}
      <ul className="ds-companies">
        {companies.map((company) => (
          <li key={company.id} className={`${company.active ? "" : "is-off"} ${billing === company.id ? "is-open" : ""}`}>
            <div>
              <b>{company.name}</b>
              {company.contact_phone && <span className="ds-chip is-known" title="Messages from this number become orders">💬 WhatsApp orders</span>}
              {company.gstin && <span className="ds-chip is-new">GST</span>}
              <small>{[company.contact_name, company.contact_phone, company.location].filter(Boolean).join(" · ") || "No contact details"}{company.payment_days != null ? ` · pays in ${company.payment_days} days` : ""}</small>
            </div>
            <div className="ds-company-actions">
              <button type="button" className="audit-btn" onClick={() => setLinkFor(linkFor === company.id ? null : company.id)}>🔗 Order link</button>
              <button type="button" className="audit-btn" onClick={() => setBilling(billing === company.id ? null : company.id)}>Billing</button>
              <button type="button" className="audit-btn" onClick={() => onUpdate(company, { active: !company.active })}>{company.active ? "Hide" : "Show again"}</button>
            </div>
            {linkFor === company.id && <OrderLink company={company} headers={headers} base={base} />}
            {billing === company.id && (
              <div className="ds-billing">
                <label>Name on invoice<input defaultValue={company.billing_name || ""} placeholder={company.name} onBlur={(event) => event.target.value !== (company.billing_name || "") && onUpdate(company, { billing_name: event.target.value })} /></label>
                <label>GSTIN<input defaultValue={company.gstin || ""} onBlur={(event) => event.target.value !== (company.gstin || "") && onUpdate(company, { gstin: event.target.value })} /></label>
                <label>Admin's WhatsApp<input defaultValue={company.contact_phone || ""} placeholder="98xxxxxxxx, 99xxxxxxxx" onBlur={(event) => event.target.value !== (company.contact_phone || "") && onUpdate(company, { contact_phone: event.target.value })} /></label>
                <label>Admin's name<input defaultValue={company.contact_name || ""} onBlur={(event) => event.target.value !== (company.contact_name || "") && onUpdate(company, { contact_name: event.target.value })} /></label>
                <label>Pays within (days)<input type="number" min="0" defaultValue={company.payment_days ?? ""} placeholder="7" onBlur={(event) => String(event.target.value) !== String(company.payment_days ?? "") && onUpdate(company, { payment_days: event.target.value })} /></label>
                <label className="ds-billing-wide">Billing address<textarea rows={2} defaultValue={company.address || ""} onBlur={(event) => event.target.value !== (company.address || "") && onUpdate(company, { address: event.target.value })} /></label>
              </div>
            )}
          </li>
        ))}
        {!companies.length && <p className="audit-empty">No companies yet. Add the first one above.</p>}
      </ul>
    </Box>
  );
}

/* ---------- Items (names the master sheet uses) ---------- */
function Items({ products, units, onUpdate, onMerge }) {
  const [query, setQuery] = useState("");
  const [merging, setMerging] = useState(null);
  const q = query.trim().toLowerCase();
  const shown = products.filter((product) => !q || `${product.name} ${(product.aliases || []).join(" ")} ${product.category || ""}`.toLowerCase().includes(q));
  const noPrice = products.filter((product) => product.sell_price == null).length;
  return (
    <Box id="ds-items" icon="🏷️" tone="slate" title="Items" sub={`${products.length} items${noPrice ? ` · ${noPrice} without a selling price` : ""}`}
      actions={<input className="ds-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search items" />}>
      <div className="ds-table-wrap is-tall">
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
      </div>
      {!shown.length && <p className="audit-empty">No items yet. They appear as orders are added.</p>}
    </Box>
  );
}

/* ---------- Vendors, rates, purchases, selling prices ---------- */
const money = (value) => (value == null ? "—" : `₹${Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`);
const when = (value) => (value ? new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "");

function Vendors({ vendors, onAdd, onUpdate, className }) {
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
    <Box id="ds-vendors" icon="🧺" tone="purple" title="Vendors" sub="Where you buy stock and fruit" className={className}>
      <form className="ds-company-form ds-vendor-form" onSubmit={add}>
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
    </Box>
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
function SellingPrices({ headers, companies, onChanged, version }) {
  const [data, setData] = useState(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const load = useCallback(() => API.get("/supply/selling-prices", { headers }).then((response) => setData(response.data)).catch(() => setError("Could not load prices")), [headers]);
  useEffect(() => { const timer = setTimeout(load, 0); return () => clearTimeout(timer); }, [load, version]);
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
    <Box id="ds-selling" icon="💲" tone="green" title="Selling prices" sub={data ? `${data.items.length} items · ${data.company_prices.length} company price${data.company_prices.length === 1 ? "" : "s"}` : "Price per unit charged to companies"}
      actions={<input className="ds-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search items" />}>
      {error && <div className="audit-error">{error}</div>}
      {!data ? <p className="audit-empty">Loading…</p> : (
        <div className="ds-table-wrap is-tall">
          <table className="ds-table ds-prices">
            <thead><tr><th>Item</th><th>Unit</th><th>Default (₹)</th>{active.map((company) => <th key={company.id}>{company.name}</th>)}</tr></thead>
            <tbody>
              {data.items.filter((item) => !q || item.name.toLowerCase().includes(q)).map((item) => (
                <tr key={`${item.id}-${item.sell_price}`}>
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
          {!data.items.length && <p className="audit-empty">No items yet.</p>}
        </div>
      )}
    </Box>
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
      <div className="ds-table-wrap is-tall">
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
export default function SupplyWorkspace({ token, isAdmin, internalUsers, version = 0 }) {
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);
  const [overview, setOverview] = useState(null);
  const [roundId, setRoundId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [toast, setToast] = useState(null);
  const [newDate, setNewDate] = useState(tomorrow);
  const [newTitle, setNewTitle] = useState("");
  const [orderText, setOrderText] = useState("");
  const [orderKey, setOrderKey] = useState(0);
  const [buyerId, setBuyerId] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState("");
  const [buyForm, setBuyForm] = useState(null);
  const [billingVersion, setBillingVersion] = useState(0);
  const [deliverySummary, setDeliverySummary] = useState(null);
  const [accountsSummary, setAccountsSummary] = useState(null);
  const [page, setPageState] = useState(() => { try { return localStorage.getItem("supplyPage") || "orders"; } catch { return "orders"; } });
  const [newOpen, setNewOpen] = useState(false);
  const setPage = (key) => { setPageState(key); try { localStorage.setItem("supplyPage", key); } catch { /* private browsing */ } window.scrollTo({ top: 0 }); };

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
      API.get("/supply/accounts", { headers }).then((accounts) => setAccountsSummary(accounts.data.totals)).catch(() => {});
    } catch (err) {
      notify(err.response?.data?.error || "Could not load Direct Supply", true);
    }
  }, [headers, notify]);

  const loadRound = useCallback(async (id) => {
    if (!id) { setDetail(null); return; }
    try {
      const response = await API.get(`/supply/rounds/${id}`, { headers });
      setDetail(response.data);
      API.get(`/supply/rounds/${id}/delivery`, { headers }).then((delivery) => {
        const list = delivery.data.companies;
        setDeliverySummary({ roundId: id, total: list.length, delivered: list.filter((entry) => entry.delivery.status === "Delivered").length, invoiced: list.filter((entry) => entry.invoice).length, billed: list.reduce((sum, entry) => sum + (entry.invoice?.total || 0), 0), received: list.reduce((sum, entry) => sum + (entry.invoice?.paid || 0), 0) });
      }).catch(() => {});
    } catch (err) {
      notify(err.response?.data?.error || "Could not load this round", true);
    }
  }, [headers, notify]);

  useEffect(() => { const timer = setTimeout(loadOverview, 0); return () => clearTimeout(timer); }, [loadOverview]);
  useEffect(() => { const timer = setTimeout(() => loadRound(roundId), 0); return () => clearTimeout(timer); }, [loadRound, roundId, version]);
  useEffect(() => { if (!version) return undefined; const timer = setTimeout(loadOverview, 0); return () => clearTimeout(timer); }, [loadOverview, version]);

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

  const startRound = async (date, title) => {
    const response = await API.post("/supply/rounds", { delivery_date: date, title }, { headers });
    return response.data;
  };

  const createRound = () => call("round", async () => {
    const created = await startRound(newDate, newTitle);
    setRoundId(created.id);
    setNewTitle("");
    setNewOpen(false);
    return created;
  }, (round) => `${round.ref} started for ${dayLabel(round.delivery_date)}`);

  // "Add to <date> instead": that date's open delivery (or a new one), with the message read again there.
  const moveToDate = (date, title, text) => call("round", async () => {
    const existing = (overview?.rounds || []).find((item) => item.delivery_date === date && item.status !== "Delivered");
    const target = existing || await startRound(date, title || "");
    setRoundId(target.id);
    setOrderText(text);
    setOrderKey((key) => key + 1);
    return target;
  }, (round) => `Now adding to ${round.ref} · ${dayLabel(round.delivery_date)}`);

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

  const round = detail?.round || null;

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

  const onDeliverySummary = useCallback((summary) => setDeliverySummary(summary), []);
  const onAccountsSummary = useCallback((summary) => setAccountsSummary(summary), []);
  const billingChanged = useCallback(() => setBillingVersion((value) => value + 1), []);

  const companies = overview?.companies || [];
  const units = overview?.units || ["pcs", "kg", "box", "pkt"];
  const buyers = (internalUsers || []).filter((user) => user.phone);
  const q = search.trim().toLowerCase();
  const master = (detail?.master || []).filter((row) => !q || `${row.name} ${row.spellings.join(" ")}`.toLowerCase().includes(q));
  const checks = round ? detail.checks || [] : [];

  if (!overview) return <div className="audit-workspace"><p className="audit-empty">Loading Direct Supply…</p></div>;

  const ordered = new Set((round ? detail.orders : []).map((order) => order.company_id));
  const waiting = companies.filter((company) => company.active && !ordered.has(company.id));
  const totals = round ? detail.buying?.totals : null;
  const delivery = deliverySummary?.roundId === round?.id ? deliverySummary : null;
  const statusIndex = round ? STATUSES.indexOf(round.status) : -1;
  const activeCount = companies.filter((company) => company.active).length;
  const info = PAGES.find((item) => item.key === page) || PAGES[0];
  // A short live number under each step.
  const badge = {
    orders: round ? `${detail.orders.length} of ${activeCount} companies` : "",
    buy: totals && detail.master.length ? (totals.short_items ? `${totals.short_items} to buy` : "All bought ✓") : "",
    deliver: delivery?.total ? (delivery.delivered === delivery.total ? "All delivered ✓" : `${delivery.delivered} of ${delivery.total} delivered`) : "",
    money: accountsSummary ? (accountsSummary.outstanding > 0 ? `${money(accountsSummary.outstanding)} due` : "Nothing due ✓") : "",
    setup: `${activeCount} companies`,
  };
  const needsDate = ["orders", "buy", "deliver"].includes(page);

  const dateBar = (
    <section className="audit-card ds-datebar">
      <label htmlFor="ds-date">Delivery date</label>
      {overview.rounds.length ? (
        <select id="ds-date" value={roundId ?? ""} onChange={(event) => setRoundId(Number(event.target.value))}>
          {overview.rounds.map((item) => (
            <option key={item.id} value={item.id}>{dayLabel(item.delivery_date)}{item.title ? ` · ${item.title}` : ""} · {item.company_count} compan{item.company_count === 1 ? "y" : "ies"} · {item.status}</option>
          ))}
        </select>
      ) : <span className="na">No dates yet</span>}
      <button type="button" className="audit-btn" onClick={() => setNewOpen((open) => !open)}>{newOpen ? "Cancel" : "＋ New date"}</button>
      {newOpen && (
        <div className="ds-newdate">
          <input type="date" value={newDate} onChange={(event) => setNewDate(event.target.value)} aria-label="New delivery date" />
          <input value={newTitle} onChange={(event) => setNewTitle(event.target.value)} placeholder="Name (optional), e.g. Fruits" aria-label="Name" />
          <button type="button" className="audit-btn audit-btn-primary" disabled={!newDate || busy === "round"} onClick={createRound}>Start</button>
        </div>
      )}
    </section>
  );

  const noDate = (
    <div className="audit-empty fnd-empty">
      <b>No delivery date yet</b>
      <span>Press “＋ New date” above, pick the date and press Start.</span>
    </div>
  );

  return (
    <div className="audit-workspace ds-workspace ds-simple">
      {toast && <div className={`audit-toast ${toast.isError ? "is-error" : ""}`}>{toast.message}</div>}

      <nav className="ds-steps-nav" aria-label="Direct Supply">
        {PAGES.map((item) => (
          <button type="button" key={item.key} className={`${page === item.key ? "active" : ""} ${item.key === "setup" ? "is-setup" : ""}`} onClick={() => setPage(item.key)}>
            <span className="ds-step-num">{item.num}</span>
            <span className="ds-step-text"><b>{item.label}</b>{badge[item.key] && <small>{badge[item.key]}</small>}</span>
          </button>
        ))}
      </nav>

      <div className="ds-help">
        <div><b>How to use</b><ol>{info.how.map((point) => <li key={point}>{point}</li>)}</ol></div>
        <div><b>Example</b><p>{info.example}</p></div>
      </div>

      {needsDate && dateBar}

      {/* ---- 1 · Orders ---- */}
      {page === "orders" && (!round ? noDate : (
        <div className="ds-grid">
          <AddOrder
            key={`${round.id}-${orderKey}`}
            headers={headers}
            round={{ ...round, orderCompanyIds: detail.orders.map((order) => order.company_id) }}
            companies={companies}
            units={units}
            onAddCompany={addCompany}
            initialText={orderText}
            onMoveToDate={moveToDate}
            onSaved={async (count) => { setOrderText(""); notify(count > 1 ? `${count} companies' orders added` : "Order added"); await refresh(); }}
          />
          <Box id="ds-waiting" icon="⏳" tone={waiting.length ? "amber" : "green"} title="Not ordered yet" sub={waiting.length ? `${waiting.length} compan${waiting.length === 1 ? "y" : "ies"} still to order` : "Every company has ordered ✓"} className="ds-span-5">
            {waiting.length ? <div className="ds-waiting-list">{waiting.map((company) => <span key={company.id}>{company.name}</span>)}</div> : <p className="ds-ok">Nothing to chase.</p>}
          </Box>

          {checks.length > 0 && (
            <Box id="ds-checks" icon="🔎" tone="amber" title={`Same item? (${checks.length})`} sub="These names look like an item you already have. Answer once, it remembers." className="ds-span-12 ds-checks">
              {checks.map((line) => (
                <div key={line.id} className="ds-check">
                  <div><b>"{line.raw_name}"</b><small>{line.company_name} · {qty(line.qty)} {line.unit}</small></div>
                  <div className="ds-check-actions">
                    {line.suggestion_id && <button type="button" className="audit-btn audit-btn-primary" onClick={() => call("resolve", () => API.post(`/supply/lines/${line.id}/resolve`, { product_id: line.suggestion_id }, { headers }), `Combined with ${line.suggestion_name}`)}>Same as {line.suggestion_name}</button>}
                    <select defaultValue="" onChange={(event) => event.target.value && call("resolve", () => API.post(`/supply/lines/${line.id}/resolve`, { product_id: Number(event.target.value) }, { headers }), "Combined")} aria-label="Same as another item">
                      <option value="">Same as another item…</option>
                      {overview.products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
                    </select>
                    <button type="button" className="audit-btn" onClick={() => call("resolve", () => API.post(`/supply/lines/${line.id}/resolve`, { new: true }, { headers }), "Kept as a new item")}>Different item</button>
                  </div>
                </div>
              ))}
            </Box>
          )}
          {(detail.problems || []).length > 0 && (
            <div className="audit-error ds-problems ds-span-12">⚠ No quantity for: {detail.problems.map((line) => `${line.raw_name} (${line.company_name})`).join(", ")}. Fix it below.</div>
          )}

          <Box id="ds-orders" icon="🧾" tone="blue" title={`Orders received (${detail.orders.length})`} sub="Change a quantity here if a company asks" className="ds-span-12">
            <div className="ds-orders is-grid">
              {detail.orders.map((order) => (
                <div key={order.id} className="ds-order">
                  <div className="ds-order-head">
                    <b>{order.company_name}</b>
                    <span className="ds-chip is-new">{order.source === "link" ? "🔗 link" : order.source === "whatsapp" ? "💬 WhatsApp" : order.file_name ? "📄 Excel" : "📋 pasted"}</span>
                    <button type="button" className="audit-link-danger" onClick={() => window.confirm(`Remove ${order.company_name}'s order?`) && call("order", () => API.delete(`/supply/orders/${order.id}`, { headers }), "Order removed")}>Remove</button>
                  </div>
                  <div className="ds-table-wrap"><table className="ds-table">
                    <tbody>
                      {order.lines.map((line) => (
                        <tr key={line.id} className={Number(line.qty) > 0 ? "" : "is-problem"}>
                          <td>{line.raw_name}</td>
                          <td><input type="number" min="0" step="any" defaultValue={qty(line.qty)} className="ds-qty" onBlur={(event) => Number(event.target.value) !== Number(line.qty) && call("line", () => API.patch(`/supply/lines/${line.id}`, { qty: event.target.value }, { headers }))} aria-label={`${line.raw_name} quantity`} /></td>
                          <td><select value={line.unit} onChange={(event) => call("line", () => API.patch(`/supply/lines/${line.id}`, { unit: event.target.value }, { headers }))} aria-label={`${line.raw_name} unit`}>{units.map((unit) => <option key={unit}>{unit}</option>)}</select></td>
                          <td><button type="button" className="ds-x" onClick={() => call("line", () => API.delete(`/supply/lines/${line.id}`, { headers }))} aria-label="Remove line">✕</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table></div>
                </div>
              ))}
            </div>
            {!detail.orders.length && <p className="audit-empty">No orders yet for this date.</p>}
          </Box>
          {detail.orders.length > 0 && (
            <div className="ds-next ds-span-12"><span>All orders in?</span><button type="button" className="audit-btn audit-btn-primary" onClick={() => setPage("buy")}>Next: 2 · Buy →</button></div>
          )}
        </div>
      ))}

      {/* ---- 2 · Buy ---- */}
      {page === "buy" && (!round ? noDate : (
        <div className="ds-grid">
          <Box id="ds-control" icon="📲" tone="amber" title="Send the list to the buyer" sub={round.sent_at ? `Sent to ${round.sent_to} on ${new Date(round.sent_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}` : "Not sent yet"} className="ds-span-12">
            <div className="ds-send">
              <select value={buyerId} onChange={(event) => { setBuyerId(event.target.value); if (event.target.value) API.put("/supply/buyer", { buyer_id: event.target.value }, { headers }).catch(() => {}); }} aria-label="Stock buyer">
                <option value="">Choose the stock buyer…</option>
                {buyers.map((user) => <option key={user.id} value={String(user.id)}>{user.name}</option>)}
              </select>
              <button type="button" className="audit-btn audit-btn-primary" disabled={!buyerId || !detail.master.length || busy === "send"} onClick={() => call("send", () => API.post(`/supply/rounds/${round.id}/send`, { buyer_id: buyerId }, { headers }), (response) => (response.data.file_sent ? "Sent on WhatsApp with the Excel file" : "Summary sent on WhatsApp (the Excel file didn't go: download and share it)"))}>{busy === "send" ? "Sending…" : round.sent_at ? "Send again" : "Send to buyer"}</button>
              <button type="button" className="audit-btn" onClick={downloadExcel} disabled={!detail.master.length}>⬇ Excel</button>
            </div>
            {!buyers.length && <p className="fnd-hint">To send on WhatsApp, add the buyer's WhatsApp number in Employees & Access.</p>}
          </Box>

          <Box id="ds-master" icon="📋" tone="green" title={`Total list (${detail.master.length} items)`} sub="Same items from all companies added together" className="ds-span-12"
            actions={detail.master.length > 8 ? <input className="ds-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search items" /> : null}>
            {detail.master.length ? (
              <div className="ds-table-wrap is-tall">
                <table className="ds-table ds-master">
                  <thead>
                    <tr><th>Item</th><th className="is-total">Total</th>{detail.companies.map((company) => <th key={company.id}>{company.name}</th>)}</tr>
                  </thead>
                  <tbody>
                    {master.map((row) => (
                      <tr key={row.key}>
                        <td>{row.name}</td>
                        <td className="is-total">{qty(row.total)} {row.unit}</td>
                        {detail.companies.map((company) => <td key={company.id}>{row.by_company[company.id] ? qty(row.by_company[company.id]) : ""}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="audit-empty">No orders yet. Add them on page 1 · Orders.</p>}
          </Box>

          <Box id="ds-buying" icon="🛒" tone="purple" title="Buying" sub="Add vendor rates, then mark what was bought" className="ds-span-12">
            {detail.master.length ? (
              <BuyingTab
                buying={detail.buying}
                onRate={(row) => setBuyForm({ kind: "rate", row })}
                onBuy={(row) => setBuyForm({ kind: "purchase", row })}
                onRemovePurchase={(item) => window.confirm(`Remove this purchase (${qty(item.qty)} at ${money(item.price)})?`) && call("purchase", () => API.delete(`/supply/purchases/${item.id}`, { headers }), "Purchase removed")}
              />
            ) : <p className="audit-empty">Nothing to buy yet.</p>}
          </Box>
          {detail.master.length > 0 && (
            <div className="ds-next ds-span-12"><span>Everything bought?</span><button type="button" className="audit-btn audit-btn-primary" onClick={() => setPage("deliver")}>Next: 3 · Deliver →</button></div>
          )}
        </div>
      ))}

      {/* ---- 3 · Deliver ---- */}
      {page === "deliver" && (!round ? noDate : (
        <div className="ds-grid">
          <Box id="ds-delivery" icon="📦" tone="green" title="Deliver and bill" sub="One card per company" className="ds-span-12">
            <DeliveryTab key={`${round.id}-${detail.orders.length}`} round={round} headers={headers} isAdmin={isAdmin} notify={notify} version={billingVersion + version} onSummary={onDeliverySummary} onChanged={billingChanged} />
          </Box>
          <Box id="ds-status" icon="🚚" tone="slate" title="Status of this date" sub="Optional: helps everyone see where this date is" className="ds-span-12">
            <div className="ds-status-steps">
              {STATUSES.map((status, index) => (
                <button type="button" key={status} className={`${index <= statusIndex ? "done" : ""} ${index === statusIndex ? "current" : ""}`} disabled={busy === "status"} onClick={() => index !== statusIndex && call("status", () => API.patch(`/supply/rounds/${round.id}`, { status }, { headers }), `${round.ref}: ${status}`)}>
                  {index < statusIndex ? "✓ " : ""}{status}
                </button>
              ))}
            </div>
            {isAdmin && <button type="button" className="audit-link-danger ds-delete" onClick={() => window.confirm(`Delete ${round.ref} and all its orders?`) && call("delete", async () => { await API.delete(`/supply/rounds/${round.id}`, { headers }); setRoundId(null); }, `${round.ref} deleted`)}>Delete this delivery date</button>}
          </Box>
        </div>
      ))}

      {/* ---- 4 · Money ---- */}
      {page === "money" && (
        <div className="ds-grid">
          <Box id="ds-accounts" icon="💰" tone="amber" title="Who owes money" sub="All invoices, all dates" className="ds-span-12">
            <Accounts headers={headers} isAdmin={isAdmin} version={billingVersion + version} onSummary={onAccountsSummary} onChanged={billingChanged} />
          </Box>
          <Box id="ds-reports" icon="📊" tone="blue" title="Profit report" sub="Sales, cost and profit for a period" className="ds-span-12">
            <SupplyReports headers={headers} products={overview.products} version={billingVersion + version} />
          </Box>
        </div>
      )}

      {/* ---- Setup ---- */}
      {page === "setup" && (
        <div className="ds-grid">
          <Companies headers={headers} companies={companies} onAdd={addCompany} onUpdate={(company, patch) => call("company", () => API.patch(`/supply/companies/${company.id}`, patch, { headers }))} className="ds-span-7" />
          <Vendors vendors={overview.vendors || []} onAdd={addVendor} onUpdate={(vendor, patch) => call("vendor", () => API.patch(`/supply/vendors/${vendor.id}`, patch, { headers }))} className="ds-span-5" />
          <SellingPrices headers={headers} companies={companies} version={overview} onChanged={() => loadRound(roundId)} />
          <Items
            products={overview.products}
            units={units}
            onUpdate={(product, patch) => call("item", () => API.patch(`/supply/products/${product.id}`, patch, { headers }))}
            onMerge={(product, intoId) => window.confirm(`Merge "${product.name}" into "${overview.products.find((item) => item.id === intoId)?.name}"? Their quantities will be added together from now on.`) && call("merge", () => API.post("/supply/products/merge", { from_id: product.id, into_id: intoId }, { headers }), "Items merged")}
          />
          <Box id="ds-settings" icon="🧾" tone="slate" title="Invoice details" sub="Snackit's details printed on every invoice" className="ds-span-12">
            <SellerSettings headers={headers} notify={notify} />
          </Box>
        </div>
      )}

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
    </div>
  );
}
