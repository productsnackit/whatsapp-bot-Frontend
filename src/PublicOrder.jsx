import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import "./styles.css";

/* The page a company admin opens from their order link (/?order=<token>): no login.
   A shop: item photos, categories, Add → quantity in the item's unit (pcs, kg…), a cart with
   the delivery date, their name and a note, then Place order. No prices are shown.
   See supplyOrderLink.js on the server (photos come from Setup → Items). */

const API = axios.create({ baseURL: "https://whatsapp-bot-backend-b3nb.onrender.com" });
const dayLabel = (value) => new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
const longDay = (value) => new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
const qtyText = (value) => String(Math.round(Number(value) * 1000) / 1000);
const stepOf = (unit) => (unit === "kg" || unit === "l" ? 0.5 : 1);
const blankExtra = () => ({ name: "", qty: "", unit: "pcs" });
const thumb = (url, size) => (url ? url.replace("/image/upload/", `/image/upload/c_fill,w_${size},h_${size},q_auto,f_auto/`) : null);
// No photo yet: a soft tile with an emoji for the kind of item.
const ICONS = [[/apple|banana|orange|grape|mango|papaya|guava|pomegranate|kiwi|pear|melon|fruit|berry|pineapple|chikoo|sapota/i, "🍎"], [/milk|curd|dahi|paneer|butter|cheese|dairy/i, "🥛"], [/juice|drink|water|soda|cola|beverage|tea|coffee/i, "🧃"], [/chip|namkeen|snack|biscuit|cookie|nuts|bhujia|mixture/i, "🍪"], [/bread|bun|cake|rusk/i, "🍞"], [/chocolate|candy|sweet/i, "🍫"], [/egg/i, "🥚"], [/veg|tomato|onion|potato|carrot|cucumber/i, "🥕"]];
const iconFor = (item) => ICONS.find(([pattern]) => pattern.test(`${item.name} ${item.category || ""}`))?.[1] || (item.segment === "fruits" ? "🍎" : "📦");

function Photo({ item, size }) {
  const [broken, setBroken] = useState(false);
  const src = thumb(item.image_url, size * 2);
  return src && !broken
    ? <img className="shop-photo" src={src} alt="" loading="lazy" onError={() => setBroken(true)} />
    : <div className="shop-photo shop-photo-empty" aria-hidden="true">{iconFor(item)}</div>;
}

function Stepper({ item, qty, onChange }) {
  const step = stepOf(item.unit);
  return (
    <div className="shop-stepper">
      <button type="button" onClick={() => onChange(Math.max(0, (Number(qty) || 0) - step))} aria-label={`Less ${item.name}`}>−</button>
      <input inputMode="decimal" value={qty} onChange={(event) => onChange(event.target.value.replace(/[^\d.]/g, ""), true)} aria-label={`${item.name} quantity`} />
      <button type="button" onClick={() => onChange((Number(qty) || 0) + step)} aria-label={`More ${item.name}`}>+</button>
      <span>{item.unit}</span>
    </div>
  );
}

export default function PublicOrder({ token }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [roundId, setRoundId] = useState(null);
  const [cart, setCart] = useState({}); // product id → quantity (text)
  const [extras, setExtras] = useState([blankExtra()]);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [search, setSearch] = useState("");
  const [shelf, setShelf] = useState("all");
  const [cartOpen, setCartOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(null);

  // Their earlier order for a date fills the cart, so placing it again updates it.
  const fill = (payload, id) => {
    const sent = payload?.sent?.[id];
    const next = {};
    const others = [];
    for (const line of sent?.lines || []) {
      if (line.product_id && payload.items.some((item) => item.id === line.product_id)) next[line.product_id] = qtyText(line.qty);
      else others.push({ name: line.name, qty: qtyText(line.qty), unit: line.unit });
    }
    setCart(next);
    setExtras(others.length ? [...others, blankExtra()] : [blankExtra()]);
    setNote(sent?.note || "");
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

  // Keep the page behind the cart from scrolling.
  useEffect(() => {
    document.body.style.overflow = cartOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [cartOpen]);

  const items = useMemo(() => data?.items || [], [data]);
  const shelves = useMemo(() => {
    const categories = [...new Set(items.map((item) => item.category || "More items"))].sort((a, b) => (a === "More items") - (b === "More items") || a.localeCompare(b));
    return [["all", "All items"], ...(items.some((item) => item.usual) ? [["usual", "⭐ Your usual"]] : []), ...categories.map((category) => [category, category])];
  }, [items]);
  const q = search.trim().toLowerCase();
  const shown = items.filter((item) => (!q || `${item.name} ${item.category || ""}`.toLowerCase().includes(q))
    && (shelf === "all" || (shelf === "usual" ? item.usual : (item.category || "More items") === shelf)));

  const setQty = (item, value, typed = false) => setCart((current) => {
    const next = { ...current };
    if (typed) next[item.id] = value;
    else if (Number(value) > 0) next[item.id] = qtyText(value);
    else delete next[item.id];
    return next;
  });
  const inCart = items.filter((item) => Number(cart[item.id]) > 0);
  const extraLines = extras.filter((extra) => extra.name.trim() && Number(extra.qty) > 0);
  const count = inCart.length + extraLines.length;
  const round = data?.rounds.find((item) => item.id === roundId);
  const already = data?.sent?.[roundId];

  const send = async () => {
    setSending(true);
    setError("");
    try {
      try { localStorage.setItem("snackitOrderName", name); } catch { /* private browsing */ }
      const lines = [
        ...inCart.map((item) => ({ product_id: item.id, qty: cart[item.id], unit: item.unit })),
        ...extraLines.map((extra) => ({ name: extra.name, qty: extra.qty, unit: extra.unit })),
      ];
      const response = await API.post(`/public/supply/order/${encodeURIComponent(token)}`, { round_id: roundId, lines, name, note });
      setDone({ ...response.data, lines: [...inCart.map((item) => ({ key: item.id, name: item.name, text: `${qtyText(cart[item.id])} ${item.unit}` })), ...extraLines.map((extra, index) => ({ key: `x${index}`, name: extra.name, text: `${extra.qty} ${extra.unit}` }))] });
      setCartOpen(false);
      const refreshed = await API.get(`/public/supply/order/${encodeURIComponent(token)}`);
      setData(refreshed.data);
      window.scrollTo(0, 0);
    } catch (err) {
      setError(err.response?.data?.error || "Couldn't place the order. Check your internet and try again.");
    } finally {
      setSending(false);
    }
  };

  const header = (
    <header className="shop-top">
      <div className="shop-top-inner">
        <div className="shop-brand"><b>{data?.seller || "Snackit"}</b><span>{data ? `Ordering for ${data.company.name}` : "Order page"}</span></div>
        {data && !done && data.rounds.length > 0 && (
          <button type="button" className="shop-cart-btn" onClick={() => setCartOpen(true)} aria-label={`Cart, ${count} items`}>
            🛒<span>Cart</span>{count > 0 && <i>{count}</i>}
          </button>
        )}
      </div>
    </header>
  );

  if (error && !data) return <div className="shop">{header}<div className="shop-msg">⚠️ {error}</div></div>;
  if (!data) return <div className="shop">{header}<div className="shop-msg">Loading…</div></div>;

  if (done) {
    return (
      <div className="shop">
        {header}
        <div className="shop-done">
          <div className="shop-done-icon">✅</div>
          <h2>{done.updated ? "Order updated" : "Order placed"}</h2>
          <p>Delivery on <b>{longDay(done.round.delivery_date)}</b>. Thank you!</p>
          <ul>{done.lines.map((line) => <li key={line.key}><span>{line.name}</span><b>{line.text}</b></li>)}</ul>
          <button type="button" className="shop-secondary" onClick={() => { setDone(null); fill(data, roundId); }}>Change this order</button>
        </div>
      </div>
    );
  }

  if (!data.rounds.length) return <div className="shop">{header}<div className="shop-msg">No delivery is open for orders right now. Please message {data.seller} on WhatsApp.</div></div>;

  return (
    <div className="shop">
      {header}
      <div className="shop-tools">
        <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="🔍 Search fruits, snacks, drinks…" />
        <div className="shop-shelves">
          {shelves.map(([key, label]) => <button type="button" key={key} className={shelf === key ? "is-on" : ""} onClick={() => setShelf(key)}>{label}</button>)}
        </div>
      </div>

      <main className="shop-grid">
        {shown.map((item) => {
          const qty = cart[item.id];
          return (
            <article key={item.id} className={`shop-card ${Number(qty) > 0 ? "is-in" : ""}`}>
              <Photo item={item} size={240} />
              <div className="shop-card-body">
                <b className="shop-name">{item.name}</b>
                <small>Sold in {item.unit}{item.last_qty ? ` · last time ${qtyText(item.last_qty)} ${item.last_unit || item.unit}` : ""}</small>
                {qty !== undefined
                  ? <Stepper item={item} qty={qty} onChange={(value, typed) => setQty(item, value, typed)} />
                  : <button type="button" className="shop-add" onClick={() => setQty(item, item.last_qty && (item.last_unit || item.unit) === item.unit ? item.last_qty : 1)}>Add to cart</button>}
              </div>
            </article>
          );
        })}
        {!shown.length && <p className="shop-empty">No items match. You can add anything by name in the cart (“Something else?”).</p>}
      </main>

      <div className="shop-bar">
        <span>{count ? `🛒 ${count} item${count === 1 ? "" : "s"} in cart` : "Add items to your cart"}</span>
        <button type="button" onClick={() => setCartOpen(true)}>{count ? "View cart" : "Cart"}</button>
      </div>

      {cartOpen && (
        <div className="shop-sheet-back" onClick={() => setCartOpen(false)}>
          <aside className="shop-sheet" role="dialog" aria-label="Your cart" onClick={(event) => event.stopPropagation()}>
            <div className="shop-sheet-head">
              <h2>Your cart</h2>
              <button type="button" onClick={() => setCartOpen(false)} aria-label="Close cart">×</button>
            </div>
            <div className="shop-sheet-body">
              {!inCart.length && !extraLines.length && <p className="shop-empty">Your cart is empty. Tap “Add to cart” on the items you need.</p>}
              <ul className="shop-lines">
                {inCart.map((item) => (
                  <li key={item.id}>
                    <Photo item={item} size={64} />
                    <div><b>{item.name}</b><Stepper item={item} qty={cart[item.id]} onChange={(value, typed) => setQty(item, value, typed)} /></div>
                    <button type="button" className="shop-remove" onClick={() => setQty(item, 0)} aria-label={`Remove ${item.name}`}>✕</button>
                  </li>
                ))}
              </ul>

              <div className="shop-block">
                <div className="shop-label">Something else?</div>
                {extras.map((extra, index) => (
                  <div key={index} className="shop-extra">
                    <input value={extra.name} onChange={(event) => setExtras((list) => list.map((row, i) => (i === index ? { ...row, name: event.target.value } : row)))} placeholder="Item name" />
                    <input inputMode="decimal" value={extra.qty} onChange={(event) => setExtras((list) => list.map((row, i) => (i === index ? { ...row, qty: event.target.value.replace(/[^\d.]/g, "") } : row)))} placeholder="Qty" />
                    <select value={extra.unit} onChange={(event) => setExtras((list) => list.map((row, i) => (i === index ? { ...row, unit: event.target.value } : row)))}>{data.units.map((unit) => <option key={unit}>{unit}</option>)}</select>
                  </div>
                ))}
                <button type="button" className="shop-link" onClick={() => setExtras((list) => [...list, blankExtra()])}>+ Add another</button>
              </div>

              <div className="shop-block">
                <div className="shop-label">Delivery date</div>
                <div className="shop-dates">
                  {data.rounds.map((item) => (
                    <button type="button" key={item.id} className={item.id === roundId ? "is-on" : ""} onClick={() => { if (item.id !== roundId) { setRoundId(item.id); if (data.sent?.[item.id]) fill(data, item.id); } }}>
                      {dayLabel(item.delivery_date)}{item.title ? <small>{item.title}</small> : null}
                    </button>
                  ))}
                </div>
                {already && <p className="shop-note">You already ordered for this date{already.submitted_by ? ` (${already.submitted_by})` : ""}. Placing the order again updates it.</p>}
              </div>

              <div className="shop-block">
                <label className="shop-label" htmlFor="shop-name">Your name</label>
                <input id="shop-name" className="shop-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="So we know who ordered" />
                <label className="shop-label" htmlFor="shop-note">Note (optional)</label>
                <textarea id="shop-note" className="shop-input" rows={2} value={note} onChange={(event) => setNote(event.target.value)} placeholder="e.g. deliver before 10 am" />
              </div>
              {error && <div className="shop-error">{error}</div>}
            </div>
            <div className="shop-sheet-foot">
              <button type="button" className="shop-place" disabled={!count || sending || !round} onClick={send}>
                {sending ? "Placing order…" : `${already ? "Update order" : "Place order"} · ${count} item${count === 1 ? "" : "s"}`}
              </button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
