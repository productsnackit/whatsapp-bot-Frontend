import { useEffect, useState } from "react";
import axios from "axios";
import ShopView from "./ShopView.jsx";
import "./styles.css";

/* The page a company admin opens from their order link (/?order=<token>): no login.
   The same shop as the company login (ShopView.jsx); see supplyOrderLink.js on the server. */

const API = axios.create({ baseURL: "https://whatsapp-bot-backend-b3nb.onrender.com" });

export default function PublicOrder({ token }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const path = `/public/supply/order/${encodeURIComponent(token)}`;

  useEffect(() => {
    let alive = true;
    API.get(path)
      .then((response) => alive && setData(response.data))
      .catch((err) => alive && setError(err.response?.data?.error || "Couldn't open the order page. Check your internet and try again."));
    return () => { alive = false; };
  }, [path]);

  const defaultName = (() => { try { return localStorage.getItem("snackitOrderName") || ""; } catch { return ""; } })();
  const header = ({ count, openCart, search, setSearch, showCart }) => (
    <header className="sv-top">
      <div className="sv-top-row">
        <div className="sv-brand"><span className="sv-logo">S</span><div><b>{data?.seller || "Snackit"}</b><small>{data ? data.company.name : "Order page"}</small></div></div>
        {showCart && <button type="button" className="sv-cart-btn" onClick={openCart}>🛒<span>Cart</span>{count > 0 && <i>{count}</i>}</button>}
      </div>
      {data?.rounds.length > 0 && setSearch && <div className="sv-search"><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search for fruits, snacks, drinks…" /></div>}
    </header>
  );

  if (!data) {
    return <div className="sv">{header({ count: 0 })}<div className="sv-msg">{error ? <><b>Couldn't open the page</b><span>{error}</span></> : <span>Loading…</span>}</div></div>;
  }
  return (
    <ShopView
      data={data}
      defaultName={defaultName || data.company.contact_name || ""}
      renderHeader={header}
      onPlace={async (order) => {
        try { localStorage.setItem("snackitOrderName", order.name || ""); } catch { /* private browsing */ }
        const response = await API.post(path, order);
        setData((await API.get(path)).data);
        return response.data;
      }}
    />
  );
}
