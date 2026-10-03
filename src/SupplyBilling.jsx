import { useCallback, useEffect, useState } from "react";
import axios from "axios";

/* Direct Supply phase 3: packing lists, delivery tracking with photo proof, invoices,
   payments and what each company owes. See supplyBilling.js on the server. */

const API = axios.create({ baseURL: "https://whatsapp-bot-backend-b3nb.onrender.com" });
const STEPS = ["Pending", "Packed", "Out for delivery", "Delivered"];
const STEP_TONE = { Pending: "muted", Packed: "blue", "Out for delivery": "purple", Delivered: "good" };
const STATUS_TONE = { Unpaid: "warn", "Part paid": "orange", Paid: "good", Cancelled: "muted" };
const METHODS = ["UPI", "Bank transfer", "Cash", "Cheque", "Other"];
const qty = (value) => String(Math.round(Number(value) * 1000) / 1000);
const money = (value) => (value == null ? "—" : `₹${Number(value).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`);
const dateText = (value) => (value ? new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "");
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const escape = (text) => String(text ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const readFile = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve({ name: file.name, type: file.type, data: reader.result });
  reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
  reader.readAsDataURL(file);
});

// Opens a printable page (packing slip or invoice) and the print dialog.
function printPage(title, body) {
  const page = window.open("", "_blank");
  if (!page) { window.alert("Allow pop-ups for this site to print."); return; }
  page.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escape(title)}</title><style>
    body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111;margin:32px;font-size:13px}
    h1{font-size:20px;margin:0 0 4px} h2{font-size:14px;margin:18px 0 6px} .muted{color:#555}
    table{width:100%;border-collapse:collapse;margin-top:12px} th,td{border-bottom:1px solid #ddd;padding:7px 6px;text-align:left}
    th{background:#f3f4f6;font-size:11px;text-transform:uppercase;letter-spacing:.04em} td.num,th.num{text-align:right}
    .row{display:flex;justify-content:space-between;gap:24px;flex-wrap:wrap} .box{min-width:220px}
    .totals{margin-left:auto;width:280px;margin-top:10px} .totals div{display:flex;justify-content:space-between;padding:4px 0}
    .grand{font-weight:800;font-size:15px;border-top:2px solid #111;margin-top:4px;padding-top:6px} .sign{margin-top:48px}
    @media print{body{margin:12mm}}
  </style></head><body>${body}<script>window.onload=()=>{window.print()}</scr${"ipt"}></body></html>`);
  page.document.close();
}

function packingSlip(round, entry, seller) {
  const rows = entry.lines.map((line) => `<tr><td>${escape(line.name)}</td><td class="num">${qty(line.ordered)}</td><td class="num">${qty(line.delivered)}</td><td>${escape(line.unit)}</td><td></td></tr>`).join("");
  return `<div class="row"><div><h1>Packing slip</h1><div class="muted">${escape(seller.name || "Snackit")} · ${escape(round.ref)} · Delivery ${dateText(round.delivery_date)}</div></div>
    <div class="box"><b>${escape(entry.company.billing_name || entry.company.name)}</b><br>${escape(entry.company.address || entry.company.location || "")}<br>${escape(entry.company.contact_name || "")} ${escape(entry.company.contact_phone || "")}</div></div>
    <table><thead><tr><th>Item</th><th class="num">Ordered</th><th class="num">Packed</th><th>Unit</th><th>✓</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="row sign"><div>Packed by: ____________________</div><div>Received by: ____________________</div></div>`;
}

function invoicePage(invoice, payments, seller) {
  const rows = invoice.lines.map((line, index) => `<tr><td>${index + 1}</td><td>${escape(line.name)}</td><td class="num">${qty(line.qty)} ${escape(line.unit)}</td><td class="num">${money(line.price)}</td><td class="num">${money(line.amount)}</td></tr>`).join("");
  return `<div class="row"><div><h1>${escape(seller.name || "Snackit")}</h1><div class="muted">${escape(seller.address || "").replace(/\n/g, "<br>")}${seller.gstin ? `<br>GSTIN: ${escape(seller.gstin)}` : ""}${seller.phone ? `<br>${escape(seller.phone)}` : ""}${seller.email ? ` · ${escape(seller.email)}` : ""}</div></div>
    <div class="box"><h1>Invoice ${escape(invoice.ref)}</h1><div>Date: ${dateText(invoice.invoice_date)}</div><div>Due: ${dateText(invoice.due_date)}</div>${invoice.round_ref ? `<div class="muted">Delivery ${escape(invoice.round_ref)} · ${dateText(invoice.delivery_date)}</div>` : ""}</div></div>
    <h2>Bill to</h2><div><b>${escape(invoice.billing_name || invoice.company_name)}</b><br>${escape(invoice.address || "").replace(/\n/g, "<br>")}${invoice.gstin ? `<br>GSTIN: ${escape(invoice.gstin)}` : ""}</div>
    <table><thead><tr><th>#</th><th>Item</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="totals"><div><span>Subtotal</span><span>${money(invoice.subtotal)}</span></div>
      ${invoice.gst_percent ? `<div><span>GST ${invoice.gst_percent}%</span><span>${money(invoice.gst_amount)}</span></div>` : ""}
      <div class="grand"><span>Total</span><span>${money(invoice.total)}</span></div>
      ${invoice.paid ? `<div><span>Paid</span><span>${money(invoice.paid)}</span></div><div><b>Balance</b><b>${money(invoice.balance)}</b></div>` : ""}</div>
    ${payments.length ? `<h2>Payments received</h2>${payments.map((payment) => `<div>${dateText(payment.paid_on)} · ${money(payment.amount)} · ${escape(payment.method)}${payment.reference ? ` · ${escape(payment.reference)}` : ""}</div>`).join("")}` : ""}
    ${seller.upi || seller.bank ? `<h2>Pay to</h2><div>${seller.upi ? `UPI: <b>${escape(seller.upi)}</b><br>` : ""}${escape(seller.bank || "").replace(/\n/g, "<br>")}</div>` : ""}
    ${seller.terms ? `<h2>Terms</h2><div class="muted">${escape(seller.terms).replace(/\n/g, "<br>")}</div>` : ""}`;
}

/* ---------- Invoice: draft (prices, GST) ---------- */
function InvoiceDraft({ round, entry, headers, onCreated, onClose }) {
  const lines = entry.lines.filter((line) => line.delivered > 0);
  const [prices, setPrices] = useState({});
  const [gst, setGst] = useState("0");
  const [days, setDays] = useState(String(entry.company.payment_days ?? 7));
  const [savePrices, setSavePrices] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const priceOf = (line) => (prices[line.line_id] !== undefined ? prices[line.line_id] : line.price ?? "");
  const subtotal = lines.reduce((sum, line) => sum + line.delivered * (Number(priceOf(line)) || 0), 0);
  const gstAmount = (subtotal * (Number(gst) || 0)) / 100;
  const missing = lines.filter((line) => priceOf(line) === "" || priceOf(line) == null);

  const create = async () => {
    setBusy(true);
    setError("");
    try {
      const response = await API.post(`/supply/rounds/${round.id}/invoices`, { company_id: entry.company.id, prices, gst_percent: gst, payment_days: days, save_prices: savePrices }, { headers });
      onCreated(response.data);
    } catch (err) {
      setError(err.response?.data?.error || "Could not create the invoice");
      setBusy(false);
    }
  };

  return (
    <div className="fnd-backdrop" onClick={onClose}>
      <div className="fnd-modal ds-modal" onClick={(event) => event.stopPropagation()}>
        <div className="fnd-modal-head"><div><h3>Invoice for {entry.company.name}</h3><p className="fnd-sub">{round.ref} · from what was delivered</p></div><button type="button" className="fnd-close" onClick={onClose} aria-label="Close">×</button></div>
        <div className="fnd-modal-body">
          <table className="ds-table">
            <thead><tr><th>Item</th><th>Qty</th><th>Rate (₹)</th><th>Amount</th></tr></thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.line_id} className={priceOf(line) === "" ? "is-problem" : ""}>
                  <td>{line.name}</td>
                  <td>{qty(line.delivered)} {line.unit}</td>
                  <td><input type="number" min="0" step="any" className="ds-qty" value={priceOf(line)} placeholder="Price" onChange={(event) => setPrices((current) => ({ ...current, [line.line_id]: event.target.value }))} /></td>
                  <td>{money(line.delivered * (Number(priceOf(line)) || 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="fnd-grid fnd-grid-3">
            <label>GST
              <select value={gst} onChange={(event) => setGst(event.target.value)}>{["0", "5", "12", "18"].map((rate) => <option key={rate} value={rate}>{rate === "0" ? "No GST" : `${rate}%`}</option>)}</select>
            </label>
            <label>Payment due in (days)<input type="number" min="0" value={days} onChange={(event) => setDays(event.target.value)} /></label>
          </div>
          {Object.keys(prices).length > 0 && <label className="audit-check"><input type="checkbox" checked={savePrices} onChange={(event) => setSavePrices(event.target.checked)} /> Save the prices I typed as {entry.company.name}'s prices</label>}
          <div className="ds-invoice-total">
            <div><span>Subtotal</span><b>{money(subtotal)}</b></div>
            {Number(gst) > 0 && <div><span>GST {gst}%</span><b>{money(gstAmount)}</b></div>}
            <div className="is-grand"><span>Total</span><b>{money(subtotal + gstAmount)}</b></div>
          </div>
          {missing.length > 0 && <p className="fnd-hint">Add a rate for the rows in red.</p>}
          {error && <div className="audit-error">{error}</div>}
        </div>
        <div className="fnd-modal-foot">
          <button type="button" className="audit-btn" onClick={onClose}>Cancel</button>
          <button type="button" className="audit-btn audit-btn-primary" disabled={busy || missing.length > 0} onClick={create}>{busy ? "Creating…" : "Create invoice"}</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Invoice: view, print, payments ---------- */
export function InvoiceView({ invoiceId, headers, isAdmin, onChanged, onClose }) {
  const [data, setData] = useState(null);
  const [payment, setPayment] = useState({ amount: "", method: "UPI", paid_on: todayIso(), reference: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const response = await API.get(`/supply/invoices/${invoiceId}`, { headers });
    setData(response.data);
    setPayment((current) => ({ ...current, amount: response.data.invoice.balance > 0 ? String(response.data.invoice.balance) : "" }));
  }, [invoiceId, headers]);
  useEffect(() => { const timer = setTimeout(() => load().catch(() => setError("Could not load the invoice")), 0); return () => clearTimeout(timer); }, [load]);

  const act = async (request) => {
    setBusy(true);
    setError("");
    try {
      await request();
      await load();
      onChanged?.();
    } catch (err) {
      setError(err.response?.data?.error || "Could not save");
    } finally {
      setBusy(false);
    }
  };
  const invoice = data?.invoice;

  return (
    <div className="fnd-backdrop" onClick={onClose}>
      <div className="fnd-modal ds-modal" onClick={(event) => event.stopPropagation()}>
        <div className="fnd-modal-head">
          <div><span className="fnd-ref">{invoice?.ref || "Invoice"}</span><h3>{invoice ? `${invoice.company_name} · ${money(invoice.total)}` : "Loading…"}</h3>{invoice && <p className="fnd-sub">{dateText(invoice.invoice_date)} · due {dateText(invoice.due_date)}</p>}</div>
          <button type="button" className="fnd-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        {invoice && (
          <div className="fnd-modal-body">
            <div className="ds-invoice-status">
              <span className={`audit-pill fnd-tone-${STATUS_TONE[invoice.status]}`}>{invoice.status}</span>
              <span>Paid <b>{money(invoice.paid)}</b> of {money(invoice.total)}</span>
              {invoice.balance > 0 && <span>Balance <b>{money(invoice.balance)}</b></span>}
              <button type="button" className="audit-btn" onClick={() => printPage(`${invoice.ref} ${invoice.company_name}`, invoicePage(invoice, data.payments, data.seller))}>🖨 Print / PDF</button>
            </div>
            <table className="ds-table">
              <thead><tr><th>Item</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead>
              <tbody>{invoice.lines.map((line, index) => <tr key={index}><td>{line.name}</td><td>{qty(line.qty)} {line.unit}</td><td>{money(line.price)}</td><td>{money(line.amount)}</td></tr>)}</tbody>
            </table>
            <div className="ds-invoice-total">
              <div><span>Subtotal</span><b>{money(invoice.subtotal)}</b></div>
              {invoice.gst_percent > 0 && <div><span>GST {invoice.gst_percent}%</span><b>{money(invoice.gst_amount)}</b></div>}
              <div className="is-grand"><span>Total</span><b>{money(invoice.total)}</b></div>
            </div>
            <h4 className="fnd-timeline-title">Payments</h4>
            {data.payments.length ? (
              <ul className="ds-history">
                {data.payments.map((item) => (
                  <li key={item.id}><b>{money(item.amount)}</b><span>{item.method}{item.reference ? ` · ${item.reference}` : ""}</span><small>{dateText(item.paid_on)} · {item.recorded_by} <button type="button" className="ds-x" onClick={() => window.confirm("Remove this payment?") && act(() => API.delete(`/supply/payments/${item.id}`, { headers }))}>✕</button></small></li>
                ))}
              </ul>
            ) : <p className="audit-empty">No payments yet.</p>}
            {invoice.status !== "Cancelled" && invoice.balance > 0 && (
              <div className="ds-pay">
                <input type="number" min="0" step="any" value={payment.amount} onChange={(event) => setPayment({ ...payment, amount: event.target.value })} placeholder="Amount" aria-label="Amount" />
                <select value={payment.method} onChange={(event) => setPayment({ ...payment, method: event.target.value })} aria-label="Method">{METHODS.map((method) => <option key={method}>{method}</option>)}</select>
                <input type="date" value={payment.paid_on} onChange={(event) => setPayment({ ...payment, paid_on: event.target.value })} aria-label="Date" />
                <input value={payment.reference} onChange={(event) => setPayment({ ...payment, reference: event.target.value })} placeholder="UTR / cheque no. (optional)" />
                <button type="button" className="audit-btn audit-btn-primary" disabled={busy || !(Number(payment.amount) > 0)} onClick={() => act(() => API.post(`/supply/invoices/${invoice.id}/payments`, payment, { headers }))}>Record payment</button>
              </div>
            )}
            {error && <div className="audit-error">{error}</div>}
            {isAdmin && invoice.status !== "Cancelled" && <button type="button" className="audit-link-danger" onClick={() => window.confirm(`Cancel ${invoice.ref}? A new invoice can then be made for this delivery.`) && act(() => API.post(`/supply/invoices/${invoice.id}/cancel`, {}, { headers }))}>Cancel invoice</button>}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Delivery & billing tab ---------- */
export function DeliveryTab({ round, headers, isAdmin, notify, version = 0, onSummary, onChanged }) {
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [hidden, setHidden] = useState(() => new Set()); // packing lists are open unless hidden
  const load = useCallback(async () => {
    try {
      const response = await API.get(`/supply/rounds/${round.id}/delivery`, { headers });
      setData(response.data);
      const list = response.data.companies;
      onSummary?.({
        roundId: round.id,
        total: list.length,
        delivered: list.filter((entry) => entry.delivery.status === "Delivered").length,
        invoiced: list.filter((entry) => entry.invoice).length,
        billed: list.reduce((sum, entry) => sum + (entry.invoice?.total || 0), 0),
        received: list.reduce((sum, entry) => sum + (entry.invoice?.paid || 0), 0),
      });
    } catch {
      notify("Could not load deliveries", true);
    }
  }, [round.id, headers, notify, onSummary]);
  useEffect(() => { const timer = setTimeout(load, 0); return () => clearTimeout(timer); }, [load, version]);
  const changed = async () => { await load(); onChanged?.(); };

  const update = async (entry, body, message) => {
    try {
      await API.post(`/supply/rounds/${round.id}/delivery/${entry.company.id}`, body, { headers });
      if (message) notify(message);
      await changed();
    } catch (err) {
      notify(err.response?.data?.error || "Could not save", true);
    }
  };
  const setDelivered = async (line, value) => {
    try {
      await API.patch(`/supply/lines/${line.line_id}/delivered`, { delivered_qty: value }, { headers });
      await changed();
    } catch (err) {
      notify(err.response?.data?.error || "Could not save", true);
    }
  };

  if (!data) return <p className="audit-empty">Loading deliveries…</p>;
  if (!data.companies.length) return <p className="audit-empty">Add orders first.</p>;
  const delivered = data.companies.filter((entry) => entry.delivery.status === "Delivered").length;
  const billed = data.companies.reduce((sum, entry) => sum + (entry.invoice?.total || 0), 0);
  const received = data.companies.reduce((sum, entry) => sum + (entry.invoice?.paid || 0), 0);

  return (
    <>
      <div className="fnd-kpis ds-kpis">
        <div className="fnd-kpi-good"><span>Delivered</span><b>{delivered} / {data.companies.length}</b><small>companies</small></div>
        <div className="fnd-kpi-blue"><span>Invoiced</span><b>{money(billed)}</b><small>{data.companies.filter((entry) => entry.invoice).length} invoice(s)</small></div>
        <div className="fnd-kpi-purple"><span>Received</span><b>{money(received)}</b><small>Balance {money(billed - received)}</small></div>
      </div>
      {!data.seller?.name && <p className="fnd-hint">Add Snackit's name, address and GSTIN for invoices under <b>Setup → Master settings</b>.</p>}
      <div className="ds-orders is-grid is-wide">
        {data.companies.map((entry) => {
          const step = STEPS.indexOf(entry.delivery.status);
          const isOpen = !hidden.has(entry.company.id);
          return (
            <div key={entry.company.id} className="ds-order ds-delivery">
              <div className="ds-order-head">
                <b>{entry.company.name}</b>
                <span className={`audit-pill fnd-tone-${STEP_TONE[entry.delivery.status]}`}>{entry.delivery.status}</span>
                {entry.delivery.delivered_at && <small>Delivered {new Date(entry.delivery.delivered_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}{entry.delivery.received_by ? ` · received by ${entry.delivery.received_by}` : ""}</small>}
                {entry.invoice
                  ? <button type="button" className={`ds-inv-chip fnd-tone-${STATUS_TONE[entry.invoice.status]}`} onClick={() => setViewing(entry.invoice.id)}>{entry.invoice.ref} · {money(entry.invoice.total)} · {entry.invoice.status}</button>
                  : <button type="button" className="audit-btn audit-btn-primary" onClick={() => setDraft(entry)}>Create invoice</button>}
              </div>
              <div className="ds-steps">
                {STEPS.map((name, index) => (
                  <button type="button" key={name} className={`${index <= step ? "done" : ""} ${index === step ? "current" : ""}`} onClick={() => index !== step && update(entry, { status: name }, `${entry.company.name}: ${name}`)}>{index < step ? "✓ " : ""}{name}</button>
                ))}
              </div>
              <div className="ds-delivery-tools">
                <button type="button" className="audit-btn" onClick={() => setHidden((current) => { const next = new Set(current); if (isOpen) next.add(entry.company.id); else next.delete(entry.company.id); return next; })}>{isOpen ? "Hide list" : "Show list"} ({entry.lines.length})</button>
                <button type="button" className="audit-btn" onClick={() => printPage(`Packing slip ${entry.company.name}`, packingSlip(round, entry, data.seller || {}))}>🖨 Packing slip</button>
                <label className="audit-btn">📷 {entry.delivery.proof_url ? "Change photo" : "Delivery photo"}<input type="file" accept="image/*" hidden onChange={async (event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) update(entry, { photo: await readFile(file) }, "Photo saved"); }} /></label>
                {entry.delivery.proof_url && <a href={entry.delivery.proof_url} target="_blank" rel="noreferrer" className="ds-proof"><img src={entry.delivery.proof_url} alt="Delivery proof" /></a>}
                <input className="ds-received" defaultValue={entry.delivery.received_by || ""} placeholder="Received by (name)" onBlur={(event) => event.target.value !== (entry.delivery.received_by || "") && update(entry, { received_by: event.target.value })} />
              </div>
              {entry.missing_prices.length > 0 && !entry.invoice && <p className="fnd-hint">No selling price yet for: {entry.missing_prices.join(", ")} (you can type it on the invoice).</p>}
              {isOpen && (
                <div className="ds-table-wrap"><table className="ds-table">
                  <thead><tr><th>Item</th><th>Ordered</th><th>Packed / delivered</th><th>Rate</th><th>Amount</th></tr></thead>
                  <tbody>
                    {entry.lines.map((line) => (
                      <tr key={line.line_id} className={line.changed && line.delivered !== line.ordered ? "is-check" : ""}>
                        <td>{line.name}{line.boxes ? <small className="ds-spellings"> · {qty(line.boxes)} box</small> : null}</td>
                        <td>{qty(line.ordered)} {line.unit}</td>
                        <td><input type="number" min="0" step="any" className="ds-qty" defaultValue={qty(line.delivered)} disabled={Boolean(entry.invoice)} onBlur={(event) => Number(event.target.value) !== line.delivered && setDelivered(line, event.target.value)} /></td>
                        <td>{money(line.price)}</td>
                        <td>{line.price != null ? money(line.price * line.delivered) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              )}
            </div>
          );
        })}
      </div>
      {draft && <InvoiceDraft round={round} entry={draft} headers={headers} onClose={() => setDraft(null)} onCreated={async (invoice) => { setDraft(null); notify(`${invoice.ref} created · ${money(invoice.total)}`); await changed(); setViewing(invoice.id); }} />}
      {viewing && <InvoiceView invoiceId={viewing} headers={headers} isAdmin={isAdmin} onChanged={changed} onClose={() => setViewing(null)} />}
    </>
  );
}

/* ---------- Accounts: what each company owes (shown inside its box on the page) ---------- */
export function Accounts({ headers, isAdmin, version = 0, onSummary, onChanged }) {
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState("open");
  const [viewing, setViewing] = useState(null);
  const load = useCallback(async () => {
    const response = await API.get("/supply/accounts", { headers });
    setData(response.data);
    onSummary?.(response.data.totals);
  }, [headers, onSummary]);
  useEffect(() => { const timer = setTimeout(() => load().catch(() => {}), 0); return () => clearTimeout(timer); }, [load, version]);
  if (!data) return <p className="audit-empty">Loading…</p>;
  const invoices = data.invoices.filter((invoice) => filter === "all" || (filter === "open" ? invoice.balance > 0 : filter === "overdue" ? invoice.balance > 0 && invoice.due_date < data.today : invoice.status === "Paid"));
  const count = (key) => data.invoices.filter((invoice) => (key === "open" ? invoice.balance > 0 : key === "overdue" ? invoice.balance > 0 && invoice.due_date < data.today : key === "paid" ? invoice.status === "Paid" : true)).length;
  return (
    <>
      <div className="fnd-kpis ds-kpis">
        <div className="fnd-kpi-blue"><span>Billed</span><b>{money(data.totals.billed)}</b><small>All invoices</small></div>
        <div className="fnd-kpi-good"><span>Received</span><b>{money(data.totals.received)}</b><small>Payments</small></div>
        <div className="fnd-kpi-warn"><span>Outstanding</span><b>{money(data.totals.outstanding)}</b><small>Still to collect</small></div>
        <div className="fnd-kpi-bad" onClick={() => setFilter("overdue")}><span>Overdue</span><b>{money(data.totals.overdue)}</b><small>Past due date</small></div>
      </div>
      <div className="ds-split">
        <div>
          <h4 className="fnd-timeline-title">By company</h4>
          <div className="ds-table-wrap is-tall">
            <table className="ds-table">
              <thead><tr><th>Company</th><th>Billed</th><th>Received</th><th>Outstanding</th><th>Overdue</th><th>Oldest due</th></tr></thead>
              <tbody>
                {data.companies.map((entry) => (
                  <tr key={entry.company_id}><td>{entry.name}</td><td>{money(entry.billed)}</td><td>{money(entry.received)}</td><td><b>{money(entry.outstanding)}</b></td><td className={entry.overdue > 0 ? "ds-minus" : ""}>{money(entry.overdue)}</td><td>{entry.oldest_due ? dateText(entry.oldest_due) : "—"}</td></tr>
                ))}
              </tbody>
            </table>
            {!data.companies.length && <p className="audit-empty">No invoices yet.</p>}
          </div>
        </div>
        <div>
          <div className="ds-tabs ds-filter">
            {[["open", "Unpaid"], ["overdue", "Overdue"], ["paid", "Paid"], ["all", "All"]].map(([key, label]) => <button type="button" key={key} className={filter === key ? "active" : ""} onClick={() => setFilter(key)}>{label} ({count(key)})</button>)}
          </div>
          <div className="ds-table-wrap is-tall">
            <table className="ds-table">
              <thead><tr><th>Invoice</th><th>Company</th><th>Due</th><th>Total</th><th>Balance</th><th>Status</th></tr></thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice.id} className="ds-click" onClick={() => setViewing(invoice.id)}>
                    <td><b>{invoice.ref}</b><small className="ds-sub">{dateText(invoice.invoice_date)}</small></td><td>{invoice.company_name}</td>
                    <td className={invoice.balance > 0 && invoice.due_date < data.today ? "ds-minus" : ""}>{dateText(invoice.due_date)}</td>
                    <td>{money(invoice.total)}</td><td>{money(invoice.balance)}</td>
                    <td><span className={`audit-pill fnd-tone-${STATUS_TONE[invoice.status]}`}>{invoice.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!invoices.length && <p className="audit-empty">No invoices here.</p>}
          </div>
        </div>
      </div>
      {viewing && <InvoiceView invoiceId={viewing} headers={headers} isAdmin={isAdmin} onChanged={async () => { await load(); onChanged?.(); }} onClose={() => setViewing(null)} />}
    </>
  );
}

/* ---------- Invoice settings: Snackit's details (shown inside its box on the page) ---------- */
export function SellerSettings({ headers, notify }) {
  const [form, setForm] = useState(null);
  const [saved, setSaved] = useState(null);
  useEffect(() => {
    let alive = true;
    API.get("/supply/seller", { headers }).then((response) => {
      if (!alive) return;
      const value = { name: "", address: "", gstin: "", phone: "", email: "", upi: "", bank: "", terms: "", public_url: "", state: "", dc_prefix: "", dc_next: "", ...response.data };
      setForm(value);
      setSaved(value);
    }).catch(() => alive && setForm({}));
    return () => { alive = false; };
  }, [headers]);
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const dirty = form && saved && JSON.stringify(form) !== JSON.stringify(saved);
  const upload = async (kind, file) => {
    if (!file) return;
    try {
      const response = await API.post("/supply/seller/image", { kind, file: await readFile(file) }, { headers });
      setForm((current) => ({ ...current, [`${kind}_url`]: response.data[`${kind}_url`] }));
      setSaved((current) => ({ ...current, [`${kind}_url`]: response.data[`${kind}_url`] }));
      notify(kind === "logo" ? "Logo saved" : "Stamp saved");
    } catch (err) {
      notify(err.response?.data?.error || "Could not upload", true);
    }
  };
  const save = async () => {
    try {
      await API.put("/supply/seller", form, { headers });
      setSaved(form);
      notify("Master settings saved");
    } catch {
      notify("Could not save", true);
    }
  };
  if (!form) return <p className="audit-empty">Loading…</p>;
  return (
    <div className="ds-settings">
      <h4 className="fnd-timeline-title">Logo & stamp</h4>
      <div className="ds-dc-images">
        {[["logo", "Logo"], ["stamp", "Stamp / signature"]].map(([kind, label]) => (
          <label key={kind} className="ds-dc-image">
            {form[`${kind}_url`] ? <img src={form[`${kind}_url`]} alt={label} /> : <span className="na">No {label.toLowerCase()}</span>}
            <span className="audit-btn">{form[`${kind}_url`] ? `Change ${label.toLowerCase()}` : `Upload ${label.toLowerCase()}`}</span>
            <input type="file" accept="image/png,image/jpeg" hidden onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; upload(kind, file); }} />
          </label>
        ))}
      </div>
      <p className="fnd-hint">The logo prints at the top left of every DC, and the stamp / signature above "Authorized Signatory".</p>
      <h4 className="fnd-timeline-title">Business details</h4>
      <div className="fnd-grid fnd-grid-3">
        <label>Business name<input value={form.name} onChange={set("name")} placeholder="Snackit … Pvt Ltd" /></label>
        <label>GSTIN<input value={form.gstin} onChange={set("gstin")} /></label>
        <label>Phone<input value={form.phone} onChange={set("phone")} /></label>
      </div>
      <label>Address<textarea rows={2} value={form.address} onChange={set("address")} /></label>
      <div className="fnd-grid fnd-grid-3">
        <label>Email<input value={form.email} onChange={set("email")} /></label>
        <label>UPI ID for payments<input value={form.upi} onChange={set("upi")} /></label>
        <label>Dashboard address for order links<input value={form.public_url} onChange={set("public_url")} placeholder={window.location.origin} /></label>
      </div>
      <label>Bank details<textarea rows={2} value={form.bank} onChange={set("bank")} placeholder="Account name, number, IFSC" /></label>
      <h4 className="fnd-timeline-title">Delivery challan (DC)</h4>
      <div className="fnd-grid fnd-grid-3">
        <label>State / place of supply<input value={form.state} onChange={set("state")} placeholder="29-Karnataka" /></label>
        <label>DC number starts with<input value={form.dc_prefix} onChange={set("dc_prefix")} placeholder="DIR26" /></label>
        <label>Next DC number<input value={form.dc_next} onChange={set("dc_next")} placeholder="00488" inputMode="numeric" /></label>
      </div>
      <p className="fnd-hint">Next DC: <b>{`${form.dc_prefix ?? ""}${form.dc_next || "1"}`}</b>. Each new DC takes the next number.</p>
      <label>Terms (optional)<textarea rows={2} value={form.terms} onChange={set("terms")} placeholder="e.g. Payment within 7 days" /></label>
      <div className="ds-settings-foot">
        <small className="na">The dashboard address is the main one people open (not a preview link).</small>
        <button type="button" className={`audit-btn audit-btn-primary ${dirty ? "" : "is-saved"}`} disabled={!dirty} onClick={save}>{dirty ? "Save" : "✓ Saved"}</button>
      </div>
    </div>
  );
}
