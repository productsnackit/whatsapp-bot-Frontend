import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import "./styles.css";

/* The page a company admin opens from their order link (/?order=<token>): no login.
   They pick the delivery date, type quantities, add anything else by name, and send.
   See supplyOrderLink.js on the server. */

const API = axios.create({ baseURL: "https://whatsapp-bot-backend-b3nb.onrender.com" });
const dayLabel = (value) => new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" });
const money = (value) => `₹${Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const qtyText = (value) => String(Math.round(Number(value) * 1000) / 1000);
const blankExtra = () => ({ name: "", qty: "", unit: "pcs" });

export default function PublicOrder({ token }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [roundId, setRoundId] = useState(null);
  const [quantities, setQuantities] = useState({});
  const [extras, setExtras] = useState([blankExtra()]);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [search, setSearch] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(null);

  // Their earlier order for a date fills the boxes, so sending again updates it.
  const fill = (payload, id) => {
    const sent = payload?.sent?.[id];
    const next = {};
    const others = [];
    for (const line of sent?.lines || []) {
      if (line.product_id && payload.items.some((item) => item.id === line.product_id)) next[line.product_id] = qtyText(line.qty);
      else others.push({ name: line.name, qty: qtyText(line.qty), unit: line.unit });
    }
    setQuantities(next);
    setExtras(others.length ? [...others, blankExtra()] : [blankExtra()]);
    if (sent?.note) setNote(sent.note);
    if (sent?.submitted_by) setName((current) => current || sent.submitted_by);
  };

  useEffect(() => {
    let alive = true;
    API.get(`/public/supply/order/${encodeURIComponent(token)}`)
      .then((response) => {
        if (!alive) return;
        setData(response.data);
        const first = response.data.rounds[0]?.id ?? null;
        setRoundId(first);
        if (first) fill(response.data, first);
        try { setName(localStorage.getItem("snackitOrderName") || response.data.company.contact_name || ""); } catch { setName(response.data.company.contact_name || ""); }
      })
      .catch((err) => alive && setError(err.response?.data?.error || "Couldn't open the order page. Check your internet and try again."));
    return () => { alive = false; };
  }, [token]);

  const q = search.trim().toLowerCase();
  const groups = useMemo(() => {
    if (!data) return [];
    const shown = data.items.filter((item) => !q || item.name.toLowerCase().includes(q));
    const usual = shown.filter((item) => item.usual);
    const rest = shown.filter((item) => !item.usual);
    const byCategory = new Map();
    for (const item of rest) {
      const key = item.category || "More items";
      if (!byCategory.has(key)) byCategory.set(key, []);
      byCategory.get(key).push(item);
    }
    return [...(usual.length ? [["Your usual items", usual]] : []), ...byCategory.entries()];
  }, [data, q]);

  const picked = data ? data.items.filter((item) => Number(quantities[item.id]) > 0) : [];
  const extraLines = extras.filter((extra) => extra.name.trim() && Number(extra.qty) > 0);
  const count = picked.length + extraLines.length;
  const estimate = picked.reduce((sum, item) => sum + (item.price != null ? Number(quantities[item.id]) * item.price : 0), 0);
  const round = data?.rounds.find((item) => item.id === roundId);
  const already = data?.sent?.[roundId];

  const step = (item, direction) => {
    const by = item.unit === "kg" ? 0.5 : 1;
    setQuantities((current) => {
      const next = Math.max(0, (Number(current[item.id]) || 0) + direction * by);
      return { ...current, [item.id]: next ? qtyText(next) : "" };
    });
  };

  const send = async () => {
    setSending(true);
    setError("");
    try {
      try { localStorage.setItem("snackitOrderName", name); } catch { /* private browsing */ }
      const lines = [
        ...picked.map((item) => ({ product_id: item.id, qty: quantities[item.id], unit: item.unit })),
        ...extraLines.map((extra) => ({ name: extra.name, qty: extra.qty, unit: extra.unit })),
      ];
      const response = await API.post(`/public/supply/order/${encodeURIComponent(token)}`, { round_id: roundId, lines, name, note });
      setDone({ ...response.data, lines: [...picked.map((item) => `${item.name}: ${quantities[item.id]} ${item.unit}`), ...extraLines.map((extra) => `${extra.name}: ${extra.qty} ${extra.unit}`)] });
      const refreshed = await API.get(`/public/supply/order/${encodeURIComponent(token)}`);
      setData(refreshed.data);
      window.scrollTo(0, 0);
    } catch (err) {
      setError(err.response?.data?.error || "Couldn't send. Check your internet and try again.");
    } finally {
      setSending(false);
    }
  };

  if (error && !data) return <div className="po"><div className="po-card po-message">⚠️ {error}</div></div>;
  if (!data) return <div className="po"><div className="po-card po-message">Loading…</div></div>;

  if (done) {
    return (
      <div className="po">
        <header className="po-head"><b>{data.seller}</b><span>Order for {data.company.name}</span></header>
        <div className="po-card po-done">
          <div className="po-done-icon">✅</div>
          <h2>{done.updated ? "Order updated" : "Order sent"}</h2>
          <p>For delivery on <b>{dayLabel(done.round.delivery_date)}</b>. Thank you!</p>
          <ul>{done.lines.map((line) => <li key={line}>{line}</li>)}</ul>
          <button type="button" className="po-secondary" onClick={() => { setDone(null); fill(data, roundId); }}>Change this order</button>
        </div>
      </div>
    );
  }

  return (
    <div className="po">
      <header className="po-head"><b>{data.seller}</b><span>Order for {data.company.name}</span></header>
      {!data.rounds.length ? (
        <div className="po-card po-message">No delivery is open for orders right now. Please message {data.seller} on WhatsApp.</div>
      ) : <>
        <div className="po-card">
          <div className="po-label">Delivery date</div>
          <div className="po-dates">
            {data.rounds.map((item) => (
              <button type="button" key={item.id} className={item.id === roundId ? "active" : ""} onClick={() => { setRoundId(item.id); fill(data, item.id); }}>
                {dayLabel(item.delivery_date)}{item.title ? <small>{item.title}</small> : null}
              </button>
            ))}
          </div>
          {already && <p className="po-note">You already sent an order for this date{already.submitted_by ? ` (${already.submitted_by})` : ""}. Change the quantities below and send again to update it.</p>}
        </div>

        <div className="po-search"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search items" /></div>

        {groups.map(([title, items]) => (
          <div key={title} className="po-card">
            <div className="po-label">{title}</div>
            {items.map((item) => (
              <div key={item.id} className={`po-item ${Number(quantities[item.id]) > 0 ? "is-on" : ""}`}>
                <div className="po-item-name">
                  <b>{item.name}</b>
                  <small>{item.price != null ? `${money(item.price)}/${item.unit}` : item.unit}{item.last_qty ? ` · last time ${qtyText(item.last_qty)} ${item.last_unit || item.unit}` : ""}</small>
                </div>
                <div className="po-qty">
                  <button type="button" onClick={() => step(item, -1)} aria-label={`Less ${item.name}`}>−</button>
                  <input inputMode="decimal" value={quantities[item.id] || ""} placeholder="0" onChange={(event) => setQuantities((current) => ({ ...current, [item.id]: event.target.value.replace(/[^\d.]/g, "") }))} aria-label={`${item.name} quantity`} />
                  <button type="button" onClick={() => step(item, 1)} aria-label={`More ${item.name}`}>+</button>
                  <span>{item.unit}</span>
                </div>
              </div>
            ))}
          </div>
        ))}

        <div className="po-card">
          <div className="po-label">Something else?</div>
          {extras.map((extra, index) => (
            <div key={index} className="po-extra">
              <input value={extra.name} onChange={(event) => setExtras((list) => list.map((item, i) => (i === index ? { ...item, name: event.target.value } : item)))} placeholder="Item name" />
              <input inputMode="decimal" value={extra.qty} onChange={(event) => setExtras((list) => list.map((item, i) => (i === index ? { ...item, qty: event.target.value.replace(/[^\d.]/g, "") } : item)))} placeholder="Qty" />
              <select value={extra.unit} onChange={(event) => setExtras((list) => list.map((item, i) => (i === index ? { ...item, unit: event.target.value } : item)))}>{data.units.map((unit) => <option key={unit}>{unit}</option>)}</select>
            </div>
          ))}
          <button type="button" className="po-link" onClick={() => setExtras((list) => [...list, blankExtra()])}>+ Add another</button>
        </div>

        <div className="po-card">
          <label className="po-label" htmlFor="po-name">Your name</label>
          <input id="po-name" className="po-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="So we know who ordered" />
          <label className="po-label" htmlFor="po-note">Note (optional)</label>
          <textarea id="po-note" className="po-input" rows={2} value={note} onChange={(event) => setNote(event.target.value)} placeholder="e.g. deliver before 10 am" />
        </div>
        {error && <div className="po-card po-error">{error}</div>}
        <div className="po-bar">
          <span>{count ? `${count} item${count === 1 ? "" : "s"}${estimate ? ` · about ${money(estimate)}` : ""}` : "Add quantities above"}</span>
          <button type="button" disabled={!count || sending || !round} onClick={send}>{sending ? "Sending…" : already ? "Update order" : "Send order"}</button>
        </div>
      </>}
    </div>
  );
}
