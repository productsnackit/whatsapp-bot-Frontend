import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import ShopView, { ItemImage } from "./ShopView.jsx";
import { longDay, qtyText } from "./shopUtils.js";
import "./styles.css";

/* The company admins' own login (/?shop): log in with the username and password Snackit gave
   them, order from the shop (ShopView.jsx), see their orders and where each one is, and change
   their password. Separate from employee logins. Server side: clientPortal.js. */

const API = axios.create({ baseURL: "https://whatsapp-bot-backend-b3nb.onrender.com" });
const KEY = "snackitShopToken";
const readToken = () => { try { return localStorage.getItem(KEY) || ""; } catch { return ""; } };
const saveToken = (value) => { try { if (value) localStorage.setItem(KEY, value); else localStorage.removeItem(KEY); } catch { /* private browsing */ } };
const STAGE_ICON = { "Order placed": "📝", "Being prepared": "📦", "Out for delivery": "🚚", Delivered: "✅" };

function Login({ onDone }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await API.post("/client/login", { username, password });
      saveToken(response.data.token);
      onDone(response.data.token);
    } catch (err) {
      setError(err.response?.data?.error || "Couldn't log in. Check your internet and try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="cp-login">
      <div className="cp-login-shell">
        <aside className="cp-login-side">
          <img className="cp-login-logo" src="/logo.png" alt="Snackit · When hunger strikes" />
          <h2>Your office pantry, sorted.</h2>
          <ul>
            <li><span>🍎</span><div><b>Fresh every delivery</b><small>Fruits, snacks, drinks and dairy for your team</small></div></li>
            <li><span>🛒</span><div><b>Order in a minute</b><small>Tap ADD, pick a delivery day, done</small></div></li>
            <li><span>🚚</span><div><b>Track every order</b><small>From placed to delivered at your door</small></div></li>
          </ul>
        </aside>
        <form className="cp-login-card" onSubmit={submit}>
          <img className="cp-login-mark" src="/brand-mark.png" alt="" />
          <h1>Welcome back</h1>
          <p>Log in with the username and password Snackit gave you.</p>
          <label>Username<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" autoCapitalize="none" placeholder="e.g. inks.priya" required /></label>
          <label>Password
            <span className="cp-pass"><input type={show ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" placeholder="••••••••" required /><button type="button" onClick={() => setShow((value) => !value)}>{show ? "Hide" : "Show"}</button></span>
          </label>
          {error && <div className="sv-error">{error}</div>}
          <button type="submit" className="sv-place cp-login-btn" disabled={busy}><b>{busy ? "Logging in…" : "Log in →"}</b></button>
          <small className="cp-login-help">No login yet, or forgot your password? Ask your Snackit contact.</small>
        </form>
      </div>
    </div>
  );
}

function Orders({ token, onReorder, onLogout }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    API.get("/client/orders", { headers: { Authorization: `Bearer ${token}` } })
      .then((response) => alive && setData(response.data))
      .catch((err) => { if (err.response?.status === 401) onLogout(); else if (alive) setError("Couldn't load your orders. Pull down or try again."); });
    return () => { alive = false; };
  }, [token, onLogout]);
  if (error) return <div className="sv-msg"><span>{error}</span></div>;
  if (!data) return <div className="sv-msg"><span>Loading your orders…</span></div>;
  if (!data.orders.length) return <div className="sv-msg"><b>No orders yet</b><span>Your orders and where they are will show here.</span></div>;
  return (
    <main className="cp-orders">
      {data.orders.map((order) => {
        const at = data.stages.indexOf(order.stage);
        return (
          <article key={order.delivery_date} className="cp-order">
            <div className="cp-order-head">
              <div><small>Delivery</small><b>{longDay(order.delivery_date)}</b></div>
              <span className={`cp-stage is-${at}`}>{STAGE_ICON[order.stage]} {order.stage}</span>
            </div>
            <ol className="cp-track">
              {data.stages.map((stage, index) => <li key={stage} className={index <= at ? "is-done" : ""}><i />{stage}</li>)}
            </ol>
            <ul className="cp-order-lines">
              {order.lines.map((line, index) => (
                <li key={index}><ItemImage item={line} size={44} className="cp-order-img" /><span>{line.name}</span><b>{qtyText(line.qty)} {line.unit}</b></li>
              ))}
            </ul>
            <div className="cp-order-foot">
              <small>{order.placed_by ? `By ${order.placed_by} · ` : ""}{order.lines.length} item{order.lines.length === 1 ? "" : "s"}</small>
              <button type="button" className="sv-btn-ghost" onClick={() => onReorder(order.lines)}>↻ Order again</button>
            </div>
          </article>
        );
      })}
    </main>
  );
}

function Account({ me, headers, onLogout }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [message, setMessage] = useState(null);
  const change = async (event) => {
    event.preventDefault();
    setMessage(null);
    try {
      await API.post("/client/password", { current, next }, { headers });
      setCurrent("");
      setNext("");
      setMessage({ ok: "Password changed." });
    } catch (err) {
      setMessage({ error: err.response?.data?.error || "Couldn't change the password" });
    }
  };
  return (
    <main className="cp-account">
      <section className="sv-panel">
        <div className="cp-me"><span className="sv-logo is-big">{String(me.name || "?").slice(0, 1).toUpperCase()}</span><div><b>{me.name}</b><small>{me.company} · {me.username}</small></div></div>
      </section>
      <form className="sv-panel" onSubmit={change}>
        <div className="sv-panel-title">🔒 Change password</div>
        <input className="sv-input" type="password" value={current} onChange={(event) => setCurrent(event.target.value)} placeholder="Current password" autoComplete="current-password" required />
        <input className="sv-input" type="password" value={next} onChange={(event) => setNext(event.target.value)} placeholder="New password (8+ characters)" autoComplete="new-password" minLength={8} required />
        {message?.error && <div className="sv-error">{message.error}</div>}
        {message?.ok && <div className="cp-ok">{message.ok}</div>}
        <button type="submit" className="sv-btn-ghost">Save new password</button>
      </form>
      <button type="button" className="cp-logout" onClick={onLogout}>Log out</button>
    </main>
  );
}

export default function ClientPortal() {
  const [token, setToken] = useState(readToken);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("shop");
  const shop = useRef(null);
  const headers = useRef({});
  headers.current = { Authorization: `Bearer ${token}` };

  const logout = useCallback(() => {
    if (token) API.post("/client/logout", {}, { headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
    saveToken("");
    setToken("");
    setData(null);
    setTab("shop");
  }, [token]);

  const load = useCallback(async () => {
    try {
      setData((await API.get("/client/shop", { headers: { Authorization: `Bearer ${token}` } })).data);
      setError("");
    } catch (err) {
      if (err.response?.status === 401) logout();
      else setError("Couldn't open the shop. Check your internet and try again.");
    }
  }, [token, logout]);
  useEffect(() => { if (token) { const timer = setTimeout(load, 0); return () => clearTimeout(timer); } return undefined; }, [token, load]);
  useEffect(() => { document.title = "Snackit · Order"; }, []);

  if (!token) return <Login onDone={setToken} />;

  const tabs = [["shop", "🛍️", "Shop"], ["orders", "📦", "My orders"], ["account", "👤", "Account"]];
  const header = ({ count, openCart, search, setSearch, showCart }) => (
    <header className="sv-top">
      <div className="sv-top-row">
        <div className="sv-brand"><img className="sv-logo-img" src="/brand-mark.png" alt="" /><div><b>Snackit</b><small>{data?.company.name || ""}</small></div></div>
        <nav className="cp-tabs-top" aria-label="Sections">{tabs.map(([key, icon, label]) => <button type="button" key={key} className={tab === key ? "is-on" : ""} onClick={() => setTab(key)}>{icon} {label}</button>)}</nav>
        {tab === "shop" && showCart && <button type="button" className="sv-cart-btn" onClick={openCart}>🛒<span>Cart</span>{count > 0 && <i>{count}</i>}</button>}
      </div>
      {tab === "shop" && setSearch && data?.rounds.length > 0 && <div className="sv-search"><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search for fruits, snacks, drinks…" /></div>}
    </header>
  );
  const bottomNav = (
    <nav className="cp-tabs-bottom" aria-label="Sections">
      {tabs.map(([key, icon, label]) => <button type="button" key={key} className={tab === key ? "is-on" : ""} onClick={() => { setTab(key); window.scrollTo(0, 0); }}><span>{icon}</span>{label}</button>)}
    </nav>
  );

  if (!data) return <div className="sv">{header({ count: 0 })}<div className="sv-msg">{error ? <><b>Couldn't open the shop</b><span>{error}</span><button type="button" className="sv-btn-ghost" onClick={load}>Try again</button></> : <span>Loading…</span>}</div></div>;

  return (
    <div className={`cp cp-tab-${tab}`}>
      <div hidden={tab !== "shop"}>
        <ShopView
          data={data}
          askName={false}
          defaultName={data.me.name}
          controller={shop}
          renderHeader={header}
          doneExtra={<button type="button" className="sv-btn-ghost" onClick={() => setTab("orders")}>See my orders</button>}
          onPlace={async (order) => {
            const response = await API.post("/client/orders", order, { headers: headers.current });
            await load();
            return response.data;
          }}
        />
      </div>
      {tab !== "shop" && <div className="sv">{header({ count: 0 })}
        {tab === "orders" && <Orders token={token} onLogout={logout} onReorder={(lines) => { setTab("shop"); setTimeout(() => shop.current?.reorder(lines), 0); }} />}
        {tab === "account" && <Account me={{ ...data.me, company: data.company.name }} headers={headers.current} onLogout={logout} />}
      </div>}
      {bottomNav}
    </div>
  );
}
