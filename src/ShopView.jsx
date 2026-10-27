import { useEffect, useImperativeHandle, useMemo, useState } from "react";
import { qtyText, longDay } from "./shopUtils.js";

/* The shop the company admins order from (Blinkit / Zepto style): square item tiles with
   photos, ADD → a quantity stepper in the item's unit (kg goes by 0.5), categories, search,
   and a cart with the delivery date and a note. No prices anywhere.
   Used by the company login (ClientPortal.jsx) and the company order link (PublicOrder.jsx). */

const stepOf = (unit) => (unit === "kg" || unit === "l" ? 0.5 : 1);
const blankExtra = () => ({ name: "", qty: "", unit: "pcs" });
// The shop's own font (only these pages load it, not the dashboard).
if (typeof document !== "undefined" && !document.getElementById("sv-font")) {
  const font = document.createElement("link");
  font.id = "sv-font";
  font.rel = "stylesheet";
  font.href = "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap";
  document.head.appendChild(font);
}
const dayLabel = (value) => new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
const thumb = (url, size) => (url && url.includes("/image/upload/") ? url.replace("/image/upload/", `/image/upload/c_pad,b_white,w_${size},h_${size},q_auto,f_auto/`) : url);
const ICONS = [[/apple|banana|orange|grape|mango|papaya|guava|pomegranate|kiwi|pear|melon|fruit|berry|pineapple|chikoo|sapota/i, "🍎"], [/milk|curd|dahi|paneer|butter|cheese|dairy/i, "🥛"], [/juice|drink|water|soda|cola|beverage|tea|coffee/i, "🧃"], [/chip|namkeen|snack|biscuit|cookie|nuts|bhujia|mixture/i, "🍪"], [/bread|bun|cake|rusk/i, "🍞"], [/chocolate|candy|sweet/i, "🍫"], [/egg/i, "🥚"], [/veg|tomato|onion|potato|carrot|cucumber/i, "🥕"]];
const iconFor = (item) => ICONS.find(([pattern]) => pattern.test(`${item.name} ${item.category || ""}`))?.[1] || (item.segment === "fruits" ? "🍎" : "📦");

// The cart for a date they already ordered for (empty if they haven't).
function linesOf(data, id) {
  const sent = data.sent?.[id];
  const cart = {};
  const others = [];
  for (const line of sent?.lines || []) {
    if (line.product_id && data.items.some((item) => item.id === line.product_id)) cart[line.product_id] = qtyText(line.qty);
    else others.push({ name: line.name, qty: qtyText(line.qty), unit: line.unit });
  }
  return { cart, extras: [...others, blankExtra()], note: sent?.note || "" };
}

export function ItemImage({ item, size = 240, className = "" }) {
  const [broken, setBroken] = useState(false);
  const src = thumb(item.image_url, size * 2);
  return src && !broken
    ? <img className={`sv-img ${className}`} src={src} alt="" loading="lazy" onError={() => setBroken(true)} />
    : <div className={`sv-img sv-img-empty ${className}`} aria-hidden="true"><span>{iconFor(item)}</span></div>;
}

function Stepper({ item, qty, onChange, wide }) {
  const step = stepOf(item.unit);
  return (
    <div className={`sv-step ${wide ? "is-wide" : ""}`}>
      <button type="button" onClick={() => onChange(Math.max(0, (Number(qty) || 0) - step))} aria-label={`Less ${item.name}`}>−</button>
      <input inputMode="decimal" value={qty} onChange={(event) => onChange(event.target.value.replace(/[^\d.]/g, ""), true)} aria-label={`${item.name} quantity in ${item.unit}`} />
      <button type="button" onClick={() => onChange((Number(qty) || 0) + step)} aria-label={`More ${item.name}`}>+</button>
    </div>
  );
}

// One square item tile: photo, name, last quantity, ADD → stepper.
function Tile({ item, qty, onQty }) {
  const on = qty !== undefined;
  const inCart = Number(qty) > 0;
  return (
    <article className={`sv-tile ${inCart ? "is-in" : ""}`}>
      <div className="sv-tile-img">
        <ItemImage item={item} />
        {item.usual && <span className="sv-badge">★ Usual</span>}
        {inCart && <span className="sv-incart">✓ {qtyText(qty)} {item.unit}</span>}
      </div>
      <div className="sv-tile-body">
        <b className="sv-name">{item.name}</b>
        <span className="sv-unit">{item.last_qty ? `Last time ${qtyText(item.last_qty)} ${item.last_unit || item.unit}` : `Sold per ${item.unit}`}</span>
        <div className="sv-tile-foot">
          {on
            ? <Stepper item={item} qty={qty} onChange={(value, typed) => onQty(item, value, typed)} wide />
            : <button type="button" className="sv-add" onClick={() => onQty(item, item.last_qty && (item.last_unit || item.unit) === item.unit ? item.last_qty : 1)}><span>ADD</span><i aria-hidden="true">+</i></button>}
        </div>
      </div>
    </article>
  );
}

/* data: { company, seller, rounds, items, units, sent }.
   onPlace({ round_id, lines, name, note }) → server response; afterPlaced(result) shows the done screen.
   renderHeader({ count, openCart, search, setSearch }) draws the top bar. */
export default function ShopView({ data, onPlace, renderHeader, askName = true, defaultName = "", doneExtra, controller }) {
  const [roundId, setRoundId] = useState(data.rounds[0]?.id ?? null);
  const [start] = useState(() => linesOf(data, data.rounds[0]?.id)); // what they already ordered for that date
  const [cart, setCart] = useState(start.cart);
  const [extras, setExtras] = useState(start.extras);
  const [name, setName] = useState(defaultName);
  const [note, setNote] = useState(start.note);
  const [search, setSearch] = useState("");
  const [shelf, setShelf] = useState("all");
  const [cartOpen, setCartOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(null);

  // An earlier order for a date fills the cart, so placing it again updates it.
  const fill = (id) => {
    const next = linesOf(data, id);
    setCart(next.cart);
    setExtras(next.extras);
    setNote(next.note);
  };

  // "Order again" from the orders page: those items into the cart.
  useImperativeHandle(controller, () => ({
    reorder: (lines) => {
      const next = {};
      const others = [];
      for (const line of lines) {
        const item = data.items.find((entry) => (line.product_id && entry.id === line.product_id) || entry.name.toLowerCase() === String(line.name || "").toLowerCase());
        if (item) next[item.id] = qtyText(line.qty);
        else others.push({ name: line.name, qty: qtyText(line.qty), unit: line.unit });
      }
      setCart(next);
      setExtras(others.length ? [...others, blankExtra()] : [blankExtra()]);
      setDone(null);
      setCartOpen(true);
    },
  }), [data]);

  useEffect(() => {
    document.body.style.overflow = cartOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [cartOpen]);

  const items = data.items;
  const shelves = useMemo(() => {
    const categories = [...new Set(items.map((item) => item.category || "More items"))].sort((a, b) => (a === "More items") - (b === "More items") || a.localeCompare(b));
    const iconOf = (category) => iconFor({ name: category, category, segment: items.find((item) => (item.category || "More items") === category)?.segment });
    return [["all", "All", "🛍️"], ...(items.some((item) => item.usual) ? [["usual", "Your usual", "⭐"]] : []), ...categories.map((category) => [category, category, iconOf(category)])];
  }, [items]);
  const q = search.trim().toLowerCase();
  const shown = items.filter((item) => (!q || `${item.name} ${item.category || ""}`.toLowerCase().includes(q))
    && (shelf === "all" || q || (shelf === "usual" ? item.usual : (item.category || "More items") === shelf)));

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
  const round = data.rounds.find((item) => item.id === roundId);
  const already = data.sent?.[roundId];

  const place = async () => {
    setSending(true);
    setError("");
    try {
      const lines = [
        ...inCart.map((item) => ({ product_id: item.id, qty: cart[item.id], unit: item.unit })),
        ...extraLines.map((extra) => ({ name: extra.name, qty: extra.qty, unit: extra.unit })),
      ];
      const result = await onPlace({ round_id: roundId, lines, name, note });
      setDone({ ...result, lines: [...inCart.map((item) => ({ key: item.id, item, text: `${qtyText(cart[item.id])} ${item.unit}` })), ...extraLines.map((extra, index) => ({ key: `x${index}`, item: { name: extra.name }, text: `${extra.qty} ${extra.unit}` }))] });
      setCartOpen(false);
      window.scrollTo(0, 0);
    } catch (err) {
      setError(err.response?.data?.error || "Couldn't place the order. Check your internet and try again.");
    } finally {
      setSending(false);
    }
  };

  const header = renderHeader({ count, openCart: () => setCartOpen(true), search, setSearch, showCart: !done && data.rounds.length > 0 });

  if (done) {
    return (
      <div className="sv">
        {header}
        <div className="sv-done">
          <div className="sv-done-tick">✓</div>
          <h2>{done.updated ? "Order updated" : "Order placed"}</h2>
          <p>Delivery on <b>{longDay(done.round.delivery_date)}</b></p>
          <ul>{done.lines.map((line) => <li key={line.key}>{line.item.id ? <ItemImage item={line.item} size={48} className="sv-done-img" /> : <span className="sv-done-img sv-img-empty"><span>📦</span></span>}<span>{line.item.name}</span><b>{line.text}</b></li>)}</ul>
          <div className="sv-done-actions">
            <button type="button" className="sv-btn-ghost" onClick={() => { setDone(null); fill(roundId); }}>Change this order</button>
            {doneExtra}
          </div>
        </div>
      </div>
    );
  }

  if (!data.rounds.length) {
    return <div className="sv">{header}<div className="sv-msg"><b>No delivery date is open right now</b><span>Snackit opens the next delivery date soon. For anything urgent, message Snackit on WhatsApp.</span></div></div>;
  }

  const usual = items.filter((item) => item.usual);
  const browsing = shelf === "all" && !q;
  const categoryList = shelves.filter(([key]) => !["all", "usual"].includes(key));
  const sections = browsing
    ? categoryList.map(([key, label, icon]) => [key, `${icon} ${label}`, items.filter((item) => (item.category || "More items") === key)]).filter(([, , list]) => list.length)
    : [[shelf, q ? `Results for “${search.trim()}”` : shelf === "usual" ? "★ Your usual" : `${shelves.find(([key]) => key === shelf)?.[2] || ""} ${shelf}`, shown]];
  const firstName = String(data.me?.name || data.company.contact_name || "").trim().split(/\s+/)[0];
  const hour = new Date().getHours();
  const hello = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const usualOut = usual.filter((item) => !(Number(cart[item.id]) > 0));
  const addUsual = () => setCart((current) => {
    const next = { ...current };
    for (const item of usual) if (!(Number(next[item.id]) > 0)) next[item.id] = qtyText((item.last_unit || item.unit) === item.unit && item.last_qty ? item.last_qty : 1);
    return next;
  });
  const tile = (item) => <Tile key={item.id} item={item} qty={cart[item.id]} onQty={setQty} />;

  return (
    <div className="sv">
      {header}
      {browsing && (
        <section className="sv-hero">
          <div className="sv-hero-text">
            <span className="sv-hero-kicker">{hello}{firstName ? `, ${firstName}` : ""} 👋</span>
            <h1>Everything {data.company.name} needs, delivered.</h1>
            <p>Fresh fruits, snacks and drinks for your office. Add what you need, pick a delivery day, and we take care of the rest.</p>
            <div className="sv-hero-chips">
              <span>🚚 Next delivery <b>{dayLabel(data.rounds[0].delivery_date)}</b></span>
              <span>🛍️ <b>{items.length}</b> items</span>
              {usual.length > 0 && <span>★ <b>{usual.length}</b> you order often</span>}
            </div>
          </div>
          <div className="sv-hero-art" aria-hidden="true"><span>🍎</span><span>🥤</span><span>🍪</span><span>🍌</span><span>🥛</span></div>
        </section>
      )}
      <nav className="sv-shelves" aria-label="Categories">
        {shelves.map(([key, label, icon]) => (
          <button type="button" key={key} className={shelf === key && !q ? "is-on" : ""} onClick={() => { setShelf(key); setSearch(""); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
            <span className="sv-shelf-icon" aria-hidden="true">{icon}</span><span className="sv-shelf-label">{label}</span>
          </button>
        ))}
      </nav>

      <main className="sv-main">
        {browsing && usual.length > 0 && (
          <section className="sv-section sv-usual">
            <div className="sv-section-head">
              <div><h2>★ Your usual</h2><small>What {data.company.name} orders most</small></div>
              {usualOut.length > 0 && <button type="button" className="sv-usual-btn" onClick={addUsual}>Add all {usualOut.length} to cart</button>}
            </div>
            <div className="sv-row">{usual.map(tile)}</div>
          </section>
        )}
        {sections.map(([key, title, list]) => (
          <section key={key} className="sv-section">
            <div className="sv-section-head">
              <div><h2>{title}</h2><small>{list.length} item{list.length === 1 ? "" : "s"}</small></div>
              {browsing && list.length > 10 && <button type="button" className="sv-see-all" onClick={() => { setShelf(key); window.scrollTo({ top: 0, behavior: "smooth" }); }}>See all ›</button>}
            </div>
            <div className="sv-grid">{(browsing ? list.slice(0, 10) : list).map(tile)}</div>
          </section>
        ))}
        {!shown.length && <div className="sv-empty"><span className="sv-empty-icon">🔍</span><b>Nothing found</b><span>You can still add any item by name in the cart, under “Something else?”.</span></div>}
        <footer className="sv-foot"><img src="/brand-mark.png" alt="" /> <span>Snackit · When hunger strikes</span></footer>
      </main>

      {count > 0 && (
        <button type="button" className="sv-cartbar" onClick={() => setCartOpen(true)}>
          <span className="sv-cartbar-left"><span className="sv-cartbar-icon">🛒</span><span><b>{count} item{count === 1 ? "" : "s"}</b><small>{round ? `Delivery ${dayLabel(round.delivery_date)}` : ""}</small></span></span>
          <span className="sv-cartbar-go">View cart ›</span>
        </button>
      )}

      {cartOpen && (
        <div className="sv-sheet-back" onClick={() => setCartOpen(false)}>
          <aside className="sv-sheet" role="dialog" aria-label="Your cart" onClick={(event) => event.stopPropagation()}>
            <div className="sv-sheet-head">
              <button type="button" className="sv-back" onClick={() => setCartOpen(false)} aria-label="Back to shop">‹</button>
              <h2>My cart</h2>
              <span>{count} item{count === 1 ? "" : "s"}</span>
            </div>
            <div className="sv-sheet-body">
              <section className="sv-panel">
                <div className="sv-panel-title">🚚 Delivery date</div>
                <div className="sv-dates">
                  {data.rounds.map((item) => (
                    <button type="button" key={item.id} className={item.id === roundId ? "is-on" : ""} onClick={() => { if (item.id !== roundId) { setRoundId(item.id); if (data.sent?.[item.id]) fill(item.id); } }}>
                      <b>{dayLabel(item.delivery_date)}</b>{item.title ? <small>{item.title}</small> : null}
                    </button>
                  ))}
                </div>
                {already && <p className="sv-note">You already ordered for this date{already.submitted_by ? ` (${already.submitted_by})` : ""}. Placing the order again updates it.</p>}
              </section>

              <section className="sv-panel">
                <div className="sv-panel-title">🛒 Items</div>
                {!inCart.length && <p className="sv-muted">No items yet. Go back and tap ADD on what you need.</p>}
                <ul className="sv-lines">
                  {inCart.map((item) => (
                    <li key={item.id}>
                      <ItemImage item={item} size={64} className="sv-line-img" />
                      <div className="sv-line-main"><b>{item.name}</b><small>per {item.unit}</small></div>
                      <div className="sv-line-qty">
                        <Stepper item={item} qty={cart[item.id]} onChange={(value, typed) => setQty(item, value, typed)} />
                        <small>{qtyText(cart[item.id] || 0)} {item.unit}</small>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="sv-panel">
                <div className="sv-panel-title">✍️ Something else?</div>
                <p className="sv-muted">Not in the list? Type the item and how much.</p>
                {extras.map((extra, index) => (
                  <div key={index} className="sv-extra">
                    <input value={extra.name} onChange={(event) => setExtras((list) => list.map((row, i) => (i === index ? { ...row, name: event.target.value } : row)))} placeholder="Item name" />
                    <input inputMode="decimal" value={extra.qty} onChange={(event) => setExtras((list) => list.map((row, i) => (i === index ? { ...row, qty: event.target.value.replace(/[^\d.]/g, "") } : row)))} placeholder="Qty" />
                    <select value={extra.unit} onChange={(event) => setExtras((list) => list.map((row, i) => (i === index ? { ...row, unit: event.target.value } : row)))}>{data.units.map((unit) => <option key={unit}>{unit}</option>)}</select>
                  </div>
                ))}
                <button type="button" className="sv-link" onClick={() => setExtras((list) => [...list, blankExtra()])}>+ Add another</button>
              </section>

              <section className="sv-panel">
                {askName && <>
                  <label className="sv-panel-title" htmlFor="sv-name">👤 Your name</label>
                  <input id="sv-name" className="sv-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="So we know who ordered" />
                </>}
                <label className="sv-panel-title" htmlFor="sv-note">📝 Note for Snackit <small>(optional)</small></label>
                <textarea id="sv-note" className="sv-input" rows={2} value={note} onChange={(event) => setNote(event.target.value)} placeholder="e.g. deliver before 10 am, call at the gate" />
              </section>
              {error && <div className="sv-error">{error}</div>}
            </div>
            <div className="sv-sheet-foot">
              <button type="button" className="sv-place" disabled={!count || sending || !round} onClick={place}>
                <span>{count} item{count === 1 ? "" : "s"}{round ? ` · ${dayLabel(round.delivery_date)}` : ""}</span>
                <b>{sending ? "Placing…" : already ? "Update order ›" : "Place order ›"}</b>
              </button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
