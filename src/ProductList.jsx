import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";

/* Product List: every product (Wendor's product list is the master), linked to Live Stock.
   Names from closing stocks, DCs and Wendor sales join a listed product by themselves when the
   match is sure (spelling slips, short names); the rest, the list's own duplicates and products
   with two prices wait at the top for the admin to confirm. See productMatch.js / locationStock.js. */

const API = axios.create({ baseURL: "https://whatsapp-bot-backend-b3nb.onrender.com" });
const rupees = (value) => (value == null ? "—" : `₹${Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`);
const readFile = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve({ name: file.name, type: file.type, data: reader.result });
  reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
  reader.readAsDataURL(file);
});
const used = (product) => [product.locations ? `${product.locations} location${product.locations === 1 ? "" : "s"}` : "", product.sold_60d ? `${product.sold_60d} sold (60 days)` : ""].filter(Boolean).join(" · ") || "not used yet";

// Pick the price: one of the prices seen, or another.
function PricePick({ prices, onPick, busy, label = "Confirm" }) {
  const list = [...new Set(prices.filter((price) => price != null).map(Number))];
  const [choice, setChoice] = useState(list.length === 1 ? String(list[0]) : "");
  const [other, setOther] = useState("");
  const value = choice === "other" ? other : choice;
  return (
    <span className="pl-price-pick">
      {list.map((price) => (
        <label key={price}><input type="radio" checked={choice === String(price)} onChange={() => setChoice(String(price))} /> ₹{price}</label>
      ))}
      <label><input type="radio" checked={choice === "other"} onChange={() => setChoice("other")} /> Other</label>
      {choice === "other" && <input type="number" min="0" step="0.01" value={other} onChange={(event) => setOther(event.target.value)} placeholder="₹" aria-label="Price" autoFocus />}
      <button type="button" className="audit-btn audit-btn-primary" disabled={busy || value === "" || Number.isNaN(Number(value))} onClick={() => onPick(value)}>{label}</button>
    </span>
  );
}

export default function ProductList({ token }) {
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);
  const [data, setData] = useState(null);
  const [toast, setToast] = useState(null);
  const [busy, setBusy] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [open, setOpen] = useState(null); // the "same as" choice waiting for its price
  const notify = useCallback((message, isError = false) => { setToast({ message, isError }); setTimeout(() => setToast(null), 5000); }, []);
  const load = useCallback(() => API.get("/locstock/products", { headers }).then((response) => setData(response.data)).catch((err) => notify(err.response?.data?.error || "Could not load the products", true)), [headers, notify]);
  useEffect(() => { const timer = setTimeout(load, 0); return () => clearTimeout(timer); }, [load]);

  const act = async (key, fn, message) => {
    setBusy(key);
    try { await fn(); if (message) notify(message); setOpen(null); await load(); } catch (err) { notify(err.response?.data?.error || "Could not save", true); } finally { setBusy(""); }
  };
  const same = (from, into, price, message) => act(`same-${from.id}-${into.id}`, () => API.post("/locstock/products/same", { from_id: from.id, into_id: into.id, price }, { headers }), message || `“${from.name}” is now “${into.name}”`);
  const notSame = (a, b) => act(`not-${a.id}-${b.id}`, () => API.post("/locstock/products/not-same", { a_id: a.id, b_id: b.id }, { headers }), "Marked as different products");
  const setPrice = (product, price) => act(`price-${product.id}`, () => API.patch(`/locstock/items/${product.id}`, { price }, { headers }), `${product.name}: ${price === "" ? "price cleared" : `₹${price}`}`);
  const upload = async (file) => {
    setBusy("upload");
    try {
      const result = (await API.post("/locstock/products/upload", { file: await readFile(file) }, { headers })).data;
      notify(`Product list: ${result.products} products (${result.added} new, ${result.updated} updated) · ${result.linked} names linked to them`);
      await load();
    } catch (err) {
      notify(err.response?.data?.error || "Could not read the product list", true);
    } finally {
      setBusy("");
    }
  };

  if (!data) return <div className="audit-workspace"><p className="audit-empty">Loading products…</p></div>;
  const { confirm } = data;
  const toMatch = confirm.matches.filter((match) => match.options.length);
  const outside = confirm.matches.filter((match) => !match.options.length);
  const products = data.products.filter((product) => (filter === "all" || (filter === "listed" ? product.in_list : filter === "outside" ? !product.in_list : product.price == null))
    && (!query.trim() || `${product.name} ${product.brand || ""} ${(product.wendor_ids || []).join(" ")} ${(product.aliases || []).join(" ")}`.toLowerCase().includes(query.trim().toLowerCase())));
  const toConfirm = toMatch.length + confirm.duplicates.length + confirm.prices.length;

  return (
    <div className="audit-workspace ls-page">
      {toast && <div className={`audit-toast ${toast.isError ? "is-error" : ""}`}>{toast.message}</div>}

      <section className="audit-card ls-upload">
        <div>
          <h3>Product list</h3>
          <p>Upload Wendor's product list (Excel or PDF: Product ID, Product Name, Product Price, Brand). It is the master list: names in closing stocks, DCs and Wendor reports join these products by themselves even with spelling slips. Anything unsure, the list's own duplicates and products with two prices are asked below.</p>
        </div>
        <label className={`audit-btn audit-btn-primary ls-upload-btn ${busy === "upload" ? "is-busy" : ""}`}>
          {busy === "upload" ? "Reading…" : "⬆ Upload product list"}
          <input type="file" accept=".xlsx,.xls,.csv,.pdf" hidden disabled={Boolean(busy)} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) upload(file); }} />
        </label>
      </section>

      <div className="fnd-kpis ds-kpis ls-kpis">
        <div className="fnd-kpi-blue"><span>Products</span><b>{data.counts.total}</b><small>{data.counts.listed} from the product list</small></div>
        <div className={toConfirm ? "fnd-kpi-warn" : "fnd-kpi-good"}><span>To confirm</span><b>{toConfirm}</b><small>names, duplicates and prices</small></div>
        <div className={outside.length ? "fnd-kpi-bad" : ""}><span>Not in the list</span><b>{outside.length}</b><small>no close product found</small></div>
        <div><span>Without a price</span><b>{data.products.filter((product) => product.price == null).length}</b><small>not counted in stock value</small></div>
      </div>

      {toMatch.length > 0 && (
        <section className="audit-card ls-alerts">
          <div className="audit-card-head"><div><h3>⚠ Which product is this? ({toMatch.length})</h3><p>Names from closing stocks, DCs or Wendor that aren't surely one product. Pick the product it is (its stock and sales join it), or say it's none of them.</p></div></div>
          {toMatch.map(({ item, options }) => (
            <div key={item.id} className="pl-confirm">
              <div className="pl-name"><b>{item.name}</b><small>{used(item)}{item.price != null ? ` · ${rupees(item.price)}` : ""}</small></div>
              <div className="pl-options">
                {options.map((option) => {
                  const key = `${item.id}-${option.id}`;
                  return (
                    <div key={option.id} className={`pl-option ${open === key ? "is-open" : ""}`}>
                      <button type="button" className="audit-btn" onClick={() => setOpen(open === key ? null : key)}>Same as <b>{option.name}</b> <span className="na">{rupees(option.price)} · {option.score}%</span></button>
                      {open === key && <PricePick prices={[option.price, item.price, ...(option.price_options || [])]} busy={Boolean(busy)} label="Yes, same" onPick={(price) => same(item, option, price)} />}
                    </div>
                  );
                })}
                <button type="button" className="audit-btn pl-none" disabled={Boolean(busy)} onClick={async () => { for (const option of options) await API.post("/locstock/products/not-same", { a_id: item.id, b_id: option.id }, { headers }).catch(() => {}); notify(`“${item.name}” kept as its own product`); load(); }}>None of these</button>
              </div>
            </div>
          ))}
        </section>
      )}

      {confirm.duplicates.length > 0 && (
        <section className="audit-card ls-alerts">
          <div className="audit-card-head"><div><h3>⚠ Same product twice? ({confirm.duplicates.length})</h3><p>Products in the list that look like one. If they're the same, choose the name to keep and confirm the price.</p></div></div>
          {confirm.duplicates.map(({ a, b, score }) => {
            const key = `dup-${a.id}-${b.id}`;
            return (
              <div key={key} className="pl-confirm">
                <div className="pl-pair">
                  <div><b>{a.name}</b><small>{rupees(a.price)} · {used(a)}{a.wendor_ids?.length ? ` · ID ${a.wendor_ids.join(", ")}` : ""}</small></div>
                  <span className="pl-vs">{score}%</span>
                  <div><b>{b.name}</b><small>{rupees(b.price)} · {used(b)}{b.wendor_ids?.length ? ` · ID ${b.wendor_ids.join(", ")}` : ""}</small></div>
                </div>
                <div className="pl-options">
                  <button type="button" className="audit-btn" onClick={() => setOpen(open === `${key}-a` ? null : `${key}-a`)}>Same · keep “{a.name}”</button>
                  <button type="button" className="audit-btn" onClick={() => setOpen(open === `${key}-b` ? null : `${key}-b`)}>Same · keep “{b.name}”</button>
                  <button type="button" className="audit-btn pl-none" disabled={Boolean(busy)} onClick={() => notSame(a, b)}>Different products</button>
                </div>
                {open === `${key}-a` && <PricePick prices={[a.price, b.price]} busy={Boolean(busy)} label="Confirm" onPick={(price) => same(b, a, price, `Kept “${a.name}” at ₹${price}`)} />}
                {open === `${key}-b` && <PricePick prices={[b.price, a.price]} busy={Boolean(busy)} label="Confirm" onPick={(price) => same(a, b, price, `Kept “${b.name}” at ₹${price}`)} />}
              </div>
            );
          })}
        </section>
      )}

      {confirm.prices.length > 0 && (
        <section className="audit-card">
          <div className="audit-card-head"><div><h3>Prices to confirm ({confirm.prices.length})</h3><p>Products listed with two prices, and products in use without a price.</p></div></div>
          {confirm.prices.map((product) => (
            <div key={product.id} className="pl-confirm pl-row">
              <div className="pl-name"><b>{product.name}</b><small>{used(product)}{product.price_options?.length > 1 ? ` · listed at ${product.price_options.map((price) => `₹${price}`).join(" and ")}` : " · no price"}</small></div>
              <PricePick prices={product.price_options?.length ? product.price_options : [product.price]} busy={Boolean(busy)} onPick={(price) => setPrice(product, price)} />
            </div>
          ))}
        </section>
      )}

      <section className="audit-card">
        <div className="ls-tools">
          <div className="ds-tabs ls-mini-tabs">
            {[["all", `All (${data.products.length})`], ["listed", "In the product list"], ["outside", `Not in the list (${data.counts.not_listed})`], ["noprice", "No price"]].map(([key, label]) => <button key={key} type="button" className={filter === key ? "active" : ""} onClick={() => setFilter(key)}>{label}</button>)}
          </div>
          <input className="ds-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search product, brand or ID" aria-label="Search products" />
        </div>
        <div className="ds-table-wrap is-tall">
          <table className="ds-table">
            <thead><tr><th>Product</th><th>Wendor ID</th><th>Brand</th><th title="One unit; used for stock values">Price (₹)</th><th>Used</th><th>Other spellings</th></tr></thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id}>
                  <td><b>{product.name}</b>{!product.in_list && <small className="ds-sub ds-short">not in the product list</small>}</td>
                  <td>{product.wendor_ids?.join(", ") || "—"}</td>
                  <td>{product.brand || "—"}</td>
                  <td>
                    <input key={`${product.id}-${product.price}`} className="ls-price" type="number" min="0" step="0.01" defaultValue={product.price ?? ""} placeholder="—" aria-label={`Price of ${product.name}`} onBlur={(event) => { if (String(event.target.value) !== String(product.price ?? "")) setPrice(product, event.target.value); }} />
                    <small className="ds-sub">{product.price_ok ? "✓ confirmed" : product.price_from === "product list" ? "from the list" : product.price_from === "closing stock" ? "MRP in closing stock" : product.price_from === "page" ? "set here" : ""}</small>
                  </td>
                  <td>{used(product)}</td>
                  <td className="ls-top">{(product.aliases || []).join(" · ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!products.length && <p className="audit-empty">{data.products.length ? "No products match." : "No products yet. Upload the product list."}</p>}
        </div>
      </section>
    </div>
  );
}
