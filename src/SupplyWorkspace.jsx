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
  { key: "orders", label: "📋 Orders", how: ["Each row is one delivery date: who ordered, how much, what the buyer has done, and the margin.", "Click a row to see every item, what was bought and where, and each company's order."], example: "Admins send orders on WhatsApp → a row appears for that date → the buyer gets the list → you watch his progress and the margin here." },
  { key: "money", label: "💰 Money", how: ["See who owes money and what is overdue.", "Click an invoice to add a payment or print it."], example: "Every Monday, check Overdue and call those companies." },
  { key: "setup", label: "⚙ Setup", how: ["Add your companies (with the admin's WhatsApp number) and vendors once.", "Set selling prices and Snackit's invoice details."], example: "Save AERO's admin number and every list they WhatsApp becomes an order." },
];
const STEP_TONE = { Received: "blue", Processing: "warn", Ordered: "purple", "Goods received": "good", Sent: "good" };
const STATUS_TONE_ROUND = { Collecting: "warn", "Sent to buyer": "blue", Bought: "purple", Delivered: "good" };

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
                <label className="ds-billing-wide">Billing address (Bill To)<textarea rows={2} defaultValue={company.address || ""} onBlur={(event) => event.target.value !== (company.address || "") && onUpdate(company, { address: event.target.value })} /></label>
                <label>Contact no. (on DC)<input defaultValue={company.contact_no || ""} placeholder="e.g. 6364831771" inputMode="tel" onBlur={(event) => event.target.value !== (company.contact_no || "") && onUpdate(company, { contact_no: event.target.value })} /></label>
                <label>State<input defaultValue={company.state || ""} placeholder="29-Karnataka" onBlur={(event) => event.target.value !== (company.state || "") && onUpdate(company, { state: event.target.value })} /></label>
                <label>Ship to (delivery location)<input defaultValue={company.ship_to || ""} placeholder="e.g. Prestige TechPark" onBlur={(event) => event.target.value !== (company.ship_to || "") && onUpdate(company, { ship_to: event.target.value })} /></label>
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
          <thead><tr><th>Item</th><th>Unit</th><th>Category</th><th title="Printed on the delivery challan">HSN</th><th title="So '2 box' adds to pieces">Pcs per box</th><th>Sell price (₹)</th><th>Other spellings</th><th /></tr></thead>
          <tbody>
            {shown.map((product) => (
              <tr key={product.id}>
                <td><input defaultValue={product.name} onBlur={(event) => event.target.value.trim() !== product.name && onUpdate(product, { name: event.target.value })} /></td>
                <td><select value={product.unit} onChange={(event) => onUpdate(product, { unit: event.target.value })}>{units.map((unit) => <option key={unit}>{unit}</option>)}</select></td>
                <td><input defaultValue={product.category || ""} placeholder="e.g. Chips, Fruit" onBlur={(event) => event.target.value !== (product.category || "") && onUpdate(product, { category: event.target.value })} /></td>
                <td><input className="ds-qty" defaultValue={product.hsn || ""} placeholder="—" onBlur={(event) => event.target.value.trim() !== (product.hsn || "") && onUpdate(product, { hsn: event.target.value.trim() })} aria-label={`${product.name} HSN`} /></td>
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
const rupees = (value) => `₹${Math.round(Number(value)).toLocaleString("en-IN")}`;
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

export default function SupplyWorkspace({ token, isAdmin, version = 0 }) {
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);
  const [overview, setOverview] = useState(null);
  const [list, setList] = useState(null);
  const [roundId, setRoundId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [toast, setToast] = useState(null);
  const [newDate, setNewDate] = useState(tomorrow);
  const [newTitle, setNewTitle] = useState("");
  const [orderText, setOrderText] = useState("");
  const [orderKey, setOrderKey] = useState(0);
  const [buyerInfo, setBuyerInfo] = useState(null);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState("");
  const [buyForm, setBuyForm] = useState(null);
  const [billingVersion, setBillingVersion] = useState(0);
  const [page, setPageState] = useState(() => { try { const saved = localStorage.getItem("supplyPage"); return ["orders", "money", "setup"].includes(saved) ? saved : "orders"; } catch { return "orders"; } });
  const [newOpen, setNewOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [challans, setChallans] = useState([]);
  const setPage = (key) => { setPageState(key); setRoundId(null); try { localStorage.setItem("supplyPage", key); } catch { /* private browsing */ } window.scrollTo({ top: 0 }); };
  const openRound = (id) => { setRoundId(id); setAddOpen(false); window.scrollTo({ top: 0 }); };

  const notify = useCallback((message, isError = false) => {
    setToast({ message, isError });
    setTimeout(() => setToast(null), 4500);
  }, []);

  const loadOverview = useCallback(async () => {
    try {
      const [response, orders] = await Promise.all([API.get("/supply/overview", { headers }), API.get("/supply/orders-list", { headers })]);
      setOverview(response.data);
      setList(orders.data);
      API.get("/supply/buyer-info", { headers }).then((info) => setBuyerInfo(info.data)).catch(() => {});
    } catch (err) {
      notify(err.response?.data?.error || "Could not load Direct Supply", true);
    }
  }, [headers, notify]);

  const loadRound = useCallback(async (id) => {
    if (!id) { setDetail(null); return; }
    try {
      const response = await API.get(`/supply/rounds/${id}`, { headers });
      setDetail(response.data);
      API.get(`/supply/rounds/${id}/challans`, { headers }).then((result) => setChallans(result.data)).catch(() => setChallans([]));
    } catch (err) {
      notify(err.response?.data?.error || "Could not load this date", true);
    }
  }, [headers, notify]);

  useEffect(() => { const timer = setTimeout(loadOverview, 0); return () => clearTimeout(timer); }, [loadOverview, version, billingVersion]);
  useEffect(() => { const timer = setTimeout(() => loadRound(roundId), 0); return () => clearTimeout(timer); }, [loadRound, roundId, version]);

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
    setNewTitle("");
    setNewOpen(false);
    openRound(created.id);
    setAddOpen(true);
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

  const round = roundId && detail?.round?.id === roundId ? detail.round : null;

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

  const billingChanged = useCallback(() => setBillingVersion((value) => value + 1), []);

  if (!overview || !list) return <div className="audit-workspace"><p className="audit-empty">Loading Direct Supply…</p></div>;

  const companies = overview.companies || [];
  const units = overview.units || ["pcs", "kg", "box", "pkt"];
  const activeCount = companies.filter((company) => company.active).length;
  const info = PAGES.find((item) => item.key === page) || PAGES[0];
  const today = isoDay(new Date());
  const q = search.trim().toLowerCase();
  const rows = list.rounds.filter((row) => {
    if (filter === "open" && (row.status === "Delivered" || row.delivery_date < today)) return false;
    if (filter === "done" && !(row.status === "Delivered" || row.delivery_date < today)) return false;
    return !q || `${row.ref} ${row.title || ""} ${row.companies.join(" ")} ${dayLabel(row.delivery_date)}`.toLowerCase().includes(q);
  });

  /* ---------- One delivery date, opened from the list ---------- */
  const detailView = () => {
    if (!round) return <p className="audit-empty">Loading…</p>;
    const summary = list.rounds.find((row) => row.id === round.id);
    const totals = detail.buying?.totals || {};
    const checks = detail.checks || [];
    const ordered = new Set(detail.orders.map((order) => order.company_id));
    const waiting = companies.filter((company) => company.active && !ordered.has(company.id));
    const statusIndex = STATUSES.indexOf(round.status);
    const steps = buyerInfo?.steps || list.steps || [];
    const stepIndex = steps.indexOf(round.buyer_status);
    const companyName = new Map(detail.companies.map((company) => [String(company.id), company.name]));
    return <>
      <div className="ds-detail-head">
        <button type="button" className="audit-btn" onClick={() => setRoundId(null)}>← All orders</button>
        <h2>{dayLabel(round.delivery_date)}<span>{round.ref}{round.title ? ` · ${round.title}` : ""}</span></h2>
        <span className={`audit-pill fnd-tone-${STATUS_TONE_ROUND[round.status] || "muted"}`}>{round.status}</span>
      </div>

      <div className="fnd-kpis ds-kpis ds-detail-kpis">
        <div className="fnd-kpi-blue"><span>Companies</span><b>{detail.orders.length} / {activeCount}</b><small>{waiting.length ? `Not ordered: ${waiting.map((company) => company.name).join(", ")}` : "Everyone ordered ✓"}</small></div>
        <div><span>Items</span><b>{detail.master.filter((row) => row.total > 0).length}</b><small>{summary?.amounts.join(" · ") || "—"}</small></div>
        <div className="fnd-kpi-purple"><span>Spent by buyer</span><b>{money(totals.spent || 0)}</b><small>{totals.short_items ? `${totals.short_items} item${totals.short_items === 1 ? "" : "s"} still to buy` : detail.master.length ? "Everything bought ✓" : "—"}</small></div>
        <div className="fnd-kpi-warn"><span>Selling value</span><b>{totals.priced_items ? money(totals.selling) : "—"}</b><small>{totals.missing_prices ? `${totals.missing_prices} without a price` : "All priced"}</small></div>
        <div className={totals.margin >= 0 ? "fnd-kpi-good" : "fnd-kpi-bad"}><span>Margin</span><b>{totals.margin_selling ? money(totals.margin) : "—"}</b><small>{totals.margin_percent != null ? `${totals.margin_percent}% of selling value` : "Needs prices"}</small></div>
      </div>

      <div className="ds-grid">
        {/* Buyer */}
        <Box id="ds-control" icon="🛒" tone="amber" title={buyerInfo?.name ? `Buyer: ${buyerInfo.name}` : "Buyer"} sub={round.sent_at ? `List sent ${new Date(round.sent_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}` : buyerInfo?.has_phone && buyerInfo.auto ? `List goes by itself when all ${activeCount} companies have ordered, or at ${buyerInfo.cutoff} the day before` : "List not sent yet"} className="ds-span-12">
          {buyerInfo && !buyerInfo.has_phone && <p className="fnd-hint">Add the buyer's name and WhatsApp number in <b>Admin Settings → Direct Supply buyer</b>.</p>}
          <div className="ds-buyer-steps">
            {steps.map((step, index) => {
              const at = round.buyer_steps?.[step];
              return <div key={step} className={stepIndex >= index ? "done" : ""}><span>{stepIndex >= index ? "✓" : index + 1}</span><b>{step}</b><small>{at ? new Date(at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "—"}</small></div>;
            })}
          </div>
          <div className="ds-send">
            <button type="button" className="audit-btn audit-btn-primary" disabled={!buyerInfo?.has_phone || !detail.master.length || busy === "send"} onClick={() => call("send", () => API.post(`/supply/rounds/${round.id}/send`, {}, { headers }), (response) => (response.data.via_template ? "Sent with the WhatsApp template and the Excel file" : "Sent on WhatsApp with the Excel file"))}>{busy === "send" ? "Sending…" : round.sent_at ? "Send list again" : "Send list now"}</button>
            <button type="button" className="audit-btn" onClick={downloadExcel} disabled={!detail.master.length}>⬇ Excel</button>
            <button type="button" className="audit-btn" disabled={!detail.master.length} onClick={async () => { try { const response = await API.get(`/supply/rounds/${round.id}/buyer-link`, { headers }); window.open(`${window.location.origin}/?buy=${response.data.token}`, "_blank", "noopener"); } catch { notify("Could not open the buyer's page", true); } }}>Open buyer's page</button>
          </div>
        </Box>

        {/* Delivery challans */}
        <Box id="ds-challans" icon="📄" tone="blue" title={`Delivery challans${challans.length ? ` (${challans.length})` : ""}`} sub={challans.length ? `Made ${new Date(challans[0].made_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}` : "Made and sent to the buyer by themselves when he taps Goods received"} className="ds-span-12"
          actions={<button type="button" className="audit-btn audit-btn-primary" disabled={!detail.orders.length || busy === "dc"} onClick={() => call("dc", async () => { const response = await API.post(`/supply/rounds/${round.id}/challans`, {}, { headers }); setChallans((await API.get(`/supply/rounds/${round.id}/challans`, { headers })).data); return response.data; }, (result) => result.error ? `${result.made} DC(s) made. ${result.error}` : `${result.made} DC(s) made and sent to the buyer`)}>{busy === "dc" ? "Making…" : challans.length ? "Make again & send" : "Make & send DCs"}</button>}>
          {challans.length ? (
            <div className="ds-table-wrap">
              <table className="ds-table">
                <thead><tr><th>Company</th><th>DC no.</th><th>Quantity</th><th>Sent to buyer</th><th /></tr></thead>
                <tbody>
                  {challans.map((challan) => (
                    <tr key={challan.id}>
                      <td><b>{challan.company_name}</b></td>
                      <td>{challan.ref}</td>
                      <td>{qty(challan.total_qty)}</td>
                      <td>{challan.sent_at ? new Date(challan.sent_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : <span className="na">Not sent</span>}</td>
                      <td><a className="audit-btn" href={challan.pdf_url} target="_blank" rel="noreferrer">📄 Open / print</a></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="audit-empty">No DCs yet. Bill To / Ship To come from Setup → Companies → Billing, HSN from Setup → Items, DC number and logo from Setup → Invoice details.</p>}
        </Box>

        {/* Items: ordered, bought, prices, margin */}
        <Box id="ds-items-detail" icon="📦" tone="green" title={`Items (${detail.master.filter((row) => row.total > 0).length})`} sub="What was ordered, what the buyer bought, and the margin on each" className="ds-span-12">
          {checks.length > 0 && (
            <div className="ds-checks-inline">
              <b>🔎 Same item? Answer once, it remembers:</b>
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
            </div>
          )}
          {detail.buying?.rows.length ? (
            <div className="ds-table-wrap is-tall">
              <table className="ds-table ds-items-table">
                <thead><tr><th>Item</th><th>Ordered</th><th>Bought</th><th>Where</th><th>Buy price</th><th>Sell value</th><th>Margin</th><th /></tr></thead>
                <tbody>
                  {detail.buying.rows.filter((row) => row.need > 0).map((row) => {
                    const sheet = detail.master.find((item) => item.key === row.key);
                    const places = [...new Set(row.bought.map((item) => item.vendor_name).filter(Boolean))];
                    const avg = row.bought_qty ? row.spent / row.bought_qty : null;
                    return (
                      <tr key={row.key} className={row.short > 0 && row.bought_qty > 0 ? "is-check" : ""}>
                        <td><b>{row.name}</b><small className="ds-sub">{Object.entries(sheet?.by_company || {}).map(([id, amount]) => `${companyName.get(id) || ""} ${qty(amount)}`).join(" · ")}</small></td>
                        <td><b>{qty(row.need)}</b> {row.unit}</td>
                        <td>{row.bought_qty ? <><b>{qty(row.bought_qty)}</b> {row.unit}{row.short > 0 && <small className="ds-sub ds-short">short {qty(row.short)}</small>}</> : <span className="na">Not yet</span>}</td>
                        <td>{places.length ? places.join(", ") : row.best ? <small className="na">last: {row.best.vendor_name}</small> : <span className="na">—</span>}</td>
                        <td>{avg != null ? `${money(Math.round(avg * 100) / 100)}/${row.unit}` : row.best ? <small className="na">est. {money(row.best.price)}</small> : <span className="na">—</span>}</td>
                        <td>{money(row.selling)}</td>
                        <td className={row.margin == null ? "" : row.margin >= 0 ? "ds-plus" : "ds-minus"}>{money(row.margin)}{row.margin != null && row.selling ? <small className="ds-sub">{Math.round((row.margin / row.selling) * 1000) / 10}%</small> : null}</td>
                        <td className="ds-row-actions">{row.product_id ? <button type="button" className="audit-btn" title="Record a purchase yourself" onClick={() => setBuyForm({ kind: "purchase", row })}>+ Bought</button> : <small className="na">check name</small>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : <p className="audit-empty">No orders yet for this date.</p>}
        </Box>

        {/* Companies' orders */}
        <Box id="ds-orders" icon="🧾" tone="blue" title={`Orders from companies (${detail.orders.length})`} sub="Change a quantity here if a company asks" className="ds-span-12"
          actions={<button type="button" className={`audit-btn ${addOpen ? "" : "audit-btn-primary"}`} onClick={() => setAddOpen((open) => !open)}>{addOpen ? "Close" : "＋ Add order"}</button>}>
          {waiting.length > 0 && <div className="ds-waiting"><b>Not ordered yet:</b>{waiting.map((company) => <span key={company.id} className="ds-chip is-check">{company.name}</span>)}</div>}
          {(detail.problems || []).length > 0 && <div className="audit-error ds-problems">⚠ No quantity for: {detail.problems.map((line) => `${line.raw_name} (${line.company_name})`).join(", ")}.</div>}
          {addOpen && (
            <AddOrder
              key={`${round.id}-${orderKey}`}
              headers={headers}
              round={{ ...round, orderCompanyIds: detail.orders.map((order) => order.company_id) }}
              companies={companies}
              units={units}
              onAddCompany={addCompany}
              initialText={orderText}
              onMoveToDate={moveToDate}
              onSaved={async (count) => { setOrderText(""); setAddOpen(false); notify(count > 1 ? `${count} companies' orders added` : "Order added"); await refresh(); }}
            />
          )}
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
          {!detail.orders.length && !addOpen && <p className="audit-empty">No orders yet. Orders sent on WhatsApp appear here by themselves, or press “＋ Add order”.</p>}
        </Box>

        {/* Delivery & bills */}
        <Box id="ds-delivery" icon="🚚" tone="green" title="Delivery & bills" sub="One card per company: delivery steps, packing list, invoice" className="ds-span-12">
          {detail.orders.length
            ? <DeliveryTab key={`${round.id}-${detail.orders.length}`} round={round} headers={headers} isAdmin={isAdmin} notify={notify} version={billingVersion + version} onChanged={billingChanged} />
            : <p className="audit-empty">Nothing to deliver yet.</p>}
        </Box>

        <Box id="ds-status" icon="📌" tone="slate" title="Status of this date" className="ds-span-12">
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
    </>;
  };

  /* ---------- All delivery dates, like the Tickets list ---------- */
  const listView = () => (
    <section className="audit-card ds-list">
      <div className="ds-list-tools">
        <div className="ds-filter-chips">
          {[["all", "All"], ["open", "Upcoming"], ["done", "Done"]].map(([key, label]) => <button type="button" key={key} className={filter === key ? "active" : ""} onClick={() => setFilter(key)}>{label}</button>)}
        </div>
        <input className="ds-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search date, company…" aria-label="Search orders" />
        <button type="button" className="audit-btn audit-btn-primary" onClick={() => setNewOpen((open) => !open)}>{newOpen ? "Cancel" : "＋ New date"}</button>
      </div>
      {newOpen && (
        <div className="ds-newdate">
          <input type="date" value={newDate} onChange={(event) => setNewDate(event.target.value)} aria-label="New delivery date" />
          <input value={newTitle} onChange={(event) => setNewTitle(event.target.value)} placeholder="Name (optional), e.g. Fruits" aria-label="Name" />
          <button type="button" className="audit-btn audit-btn-primary" disabled={!newDate || busy === "round"} onClick={createRound}>Start</button>
        </div>
      )}
      <div className="table-wrapper ds-orders-table">
        <table>
          <thead>
            <tr><th>Delivery date</th><th>Companies</th><th>Items</th><th>Buyer</th><th>Spent</th><th>Selling</th><th>Margin</th><th>Delivery & payment</th></tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              return (
                <tr key={row.id} className="ds-order-row" onClick={() => openRound(row.id)} tabIndex={0} onKeyDown={(event) => event.key === "Enter" && openRound(row.id)}>
                  <td data-label="Date"><b>{dayLabel(row.delivery_date)}</b><small className="ds-sub">{row.ref}{row.title ? ` · ${row.title}` : ""}</small></td>
                  <td data-label="Companies"><b>{row.companies.length}</b> / {row.companies_total}<small className="ds-sub ds-ellipsis" title={row.companies.join(", ")}>{row.companies.join(", ") || "None yet"}</small></td>
                  <td data-label="Items"><b>{row.items}</b><small className="ds-sub">{row.amounts.join(" · ") || "—"}</small>{row.to_check > 0 && <span className="ds-chip is-check">{row.to_check} to check</span>}</td>
                  <td data-label="Buyer">{row.buyer_status ? <span className={`audit-pill fnd-tone-${STEP_TONE[row.buyer_status] || "muted"}`}>{row.buyer_status}</span> : row.sent_at ? <span className="audit-pill fnd-tone-blue">List sent</span> : <span className="na">Not sent</span>}{row.short_items > 0 && row.spent > 0 && <small className="ds-sub ds-short">{row.short_items} short</small>}</td>
                  <td data-label="Spent">{row.spent ? rupees(row.spent) : <span className="na">—</span>}</td>
                  <td data-label="Selling">{row.selling != null ? rupees(row.selling) : <span className="na">—</span>}</td>
                  <td data-label="Margin" className={row.margin == null ? "" : row.margin >= 0 ? "ds-plus" : "ds-minus"}>{row.margin != null ? <>{rupees(row.margin)}<small className="ds-sub">{row.margin_percent}%</small></> : <span className="na">—</span>}</td>
                  <td data-label="Delivery & payment">{row.companies.length ? <><b>{row.delivered} / {row.companies.length}</b> delivered</> : <span className="na">—</span>}<small className="ds-sub">{row.billed ? `${rupees(row.paid)} paid of ${rupees(row.billed)}` : "Not billed"}</small></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && <p className="audit-empty">{list.rounds.length ? "Nothing matches." : "No orders yet. When company admins send their orders on WhatsApp, a row appears here for that delivery date."}</p>}
      </div>
    </section>
  );

  return (
    <div className="audit-workspace ds-workspace ds-simple">
      {toast && <div className={`audit-toast ${toast.isError ? "is-error" : ""}`}>{toast.message}</div>}

      <nav className="ds-tabs-nav" aria-label="Direct Supply">
        {PAGES.map((item) => <button type="button" key={item.key} className={page === item.key ? "active" : ""} onClick={() => setPage(item.key)}>{item.label}</button>)}
      </nav>

      {!(page === "orders" && roundId) && (
        <div className="ds-help">
          <div><b>How to use</b><ol>{info.how.map((point) => <li key={point}>{point}</li>)}</ol></div>
          <div><b>Example</b><p>{info.example}</p></div>
        </div>
      )}

      {page === "orders" && (roundId ? detailView() : listView())}

      {page === "money" && (
        <div className="ds-grid">
          <Box id="ds-accounts" icon="💰" tone="amber" title="Who owes money" sub="All invoices, all dates" className="ds-span-12">
            <Accounts headers={headers} isAdmin={isAdmin} version={billingVersion + version} onChanged={billingChanged} />
          </Box>
          <Box id="ds-reports" icon="📊" tone="blue" title="Profit report" sub="Sales, cost and profit for a period" className="ds-span-12">
            <SupplyReports headers={headers} products={overview.products} version={billingVersion + version} />
          </Box>
        </div>
      )}

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
