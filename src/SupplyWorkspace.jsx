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
            <thead><tr><th>Item</th><th>Unit</th><th>Category</th><th>Other spellings</th><th /></tr></thead>
            <tbody>
              {shown.map((product) => (
                <tr key={product.id}>
                  <td><input defaultValue={product.name} onBlur={(event) => event.target.value.trim() !== product.name && onUpdate(product, { name: event.target.value })} /></td>
                  <td><select value={product.unit} onChange={(event) => onUpdate(product, { unit: event.target.value })}>{units.map((unit) => <option key={unit}>{unit}</option>)}</select></td>
                  <td><input defaultValue={product.category || ""} placeholder="e.g. Chips, Fruit" onBlur={(event) => event.target.value !== (product.category || "") && onUpdate(product, { category: event.target.value })} /></td>
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
            {tab === "master" && <input className="ds-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search items" />}
          </div>

          {tab === "master" ? (
            detail.master.length ? (
              <div className="ds-table-wrap">
                <table className="ds-table ds-master">
                  <thead>
                    <tr><th>Item</th><th>Unit</th><th className="is-total">Total</th>{detail.companies.map((company) => <th key={company.id}>{company.name}</th>)}</tr>
                  </thead>
                  <tbody>
                    {master.map((row) => (
                      <tr key={row.key} className={row.to_check ? "is-check" : ""}>
                        <td title={row.spellings.length > 1 ? `Written as: ${row.spellings.join(", ")}` : ""}>{row.name}{row.to_check && <span className="ds-chip is-check">check name</span>}{row.spellings.length > 1 && <small className="ds-spellings"> · {row.spellings.length} spellings combined</small>}</td>
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
