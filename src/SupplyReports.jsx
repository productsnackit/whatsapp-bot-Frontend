import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";

/* Direct Supply reports: sales, cost, profit, received and outstanding for a period; six
   months side by side; by company and by item; and the price trend of an item across vendors.
   Charts are plain SVG. Colours: categorical slots 1–4 (blue, orange, aqua, yellow), checked
   for colour-blind separation; values sit in text colours, with a legend and tables beside. */

const API = axios.create({ baseURL: "https://whatsapp-bot-backend-b3nb.onrender.com" });
const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"];
const money = (value) => (value == null ? "—" : `₹${Number(value).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`);
const short = (value) => {
  const n = Math.abs(Number(value));
  const sign = Number(value) < 0 ? "−" : "";
  if (n >= 100000) return `${sign}₹${(n / 100000).toFixed(n >= 1000000 ? 0 : 1)}L`;
  if (n >= 1000) return `${sign}₹${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return `${sign}₹${Math.round(n)}`;
};
const pad = (n) => String(n).padStart(2, "0");
const iso = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const PERIODS = [
  ["month", "This month", () => { const now = new Date(); return [iso(new Date(now.getFullYear(), now.getMonth(), 1)), iso(now)]; }],
  ["last", "Last month", () => { const now = new Date(); return [iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)), iso(new Date(now.getFullYear(), now.getMonth(), 0))]; }],
  ["quarter", "Last 3 months", () => { const now = new Date(); return [iso(new Date(now.getFullYear(), now.getMonth() - 2, 1)), iso(now)]; }],
  ["year", "This year", () => { const now = new Date(); return [iso(new Date(now.getFullYear(), 0, 1)), iso(now)]; }],
];

// Rounded "nice" top for an axis.
function niceMax(value) {
  if (value <= 0) return 100;
  const power = 10 ** Math.floor(Math.log10(value));
  return [1, 2, 2.5, 5, 10].find((option) => option * power >= value) * power;
}

// Path for a bar with 4px rounded top corners, square at the baseline.
function barPath(x, y, width, height) {
  if (height <= 0) return "";
  const r = Math.min(4, width / 2, height);
  return `M${x},${y + height}V${y + r}Q${x},${y} ${x + r},${y}H${x + width - r}Q${x + width},${y} ${x + width},${y + r}V${y + height}Z`;
}

function MonthlyChart({ months }) {
  const [hover, setHover] = useState(null);
  const W = 640;
  const H = 240;
  const left = 52;
  const bottom = 28;
  const top = 26;
  const top_ = niceMax(Math.max(...months.flatMap((month) => [month.sales, month.cost]), 0));
  const plotH = H - top - bottom;
  const slot = (W - left - 8) / months.length;
  const barW = Math.min(26, (slot - 18) / 2);
  const y = (value) => top + plotH - (value / top_) * plotH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((part) => part * top_);
  return (
    <div className="sr-chart">
      <div className="sr-legend"><span><i style={{ background: SERIES[0] }} />Sales</span><span><i style={{ background: SERIES[1] }} />Cost</span><span className="sr-legend-note">Profit shown above each month</span></div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Sales and cost by month">
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={left} x2={W - 8} y1={y(tick)} y2={y(tick)} className="sr-grid" />
            <text x={left - 8} y={y(tick) + 4} className="sr-axis" textAnchor="end">{short(tick)}</text>
          </g>
        ))}
        {months.map((month, index) => {
          const cx = left + slot * index + slot / 2;
          const active = hover === index;
          return (
            <g key={month.month}>
              <path d={barPath(cx - barW - 1, y(month.sales), barW, top + plotH - y(month.sales))} fill={SERIES[0]} opacity={hover == null || active ? 1 : 0.45} />
              <path d={barPath(cx + 1, y(month.cost), barW, top + plotH - y(month.cost))} fill={SERIES[1]} opacity={hover == null || active ? 1 : 0.45} />
              {(month.sales || month.cost) ? <text x={cx} y={Math.min(y(month.sales), y(month.cost)) - 8} textAnchor="middle" className="sr-value">{month.profit >= 0 ? "+" : ""}{short(month.profit)}</text> : null}
              <text x={cx} y={H - 8} textAnchor="middle" className="sr-axis">{month.label}</text>
              <rect x={cx - slot / 2} y={top} width={slot} height={plotH} fill="transparent" onMouseEnter={() => setHover(index)} onMouseLeave={() => setHover(null)} onClick={() => setHover(index)} />
            </g>
          );
        })}
        <line x1={left} x2={W - 8} y1={top + plotH} y2={top + plotH} className="sr-base" />
      </svg>
      {hover != null && (
        <div className="sr-tip" style={{ left: `${((left + slot * hover + slot / 2) / W) * 100}%` }}>
          <b>{months[hover].label}</b>
          <span><i style={{ background: SERIES[0] }} />Sales {money(months[hover].sales)}</span>
          <span><i style={{ background: SERIES[1] }} />Cost {money(months[hover].cost)}</span>
          <span>Profit <b>{money(months[hover].profit)}</b></span>
          <small>{months[hover].rounds} deliver{months[hover].rounds === 1 ? "y" : "ies"}</small>
        </div>
      )}
    </div>
  );
}

function PriceTrend({ rates, unit }) {
  const [hover, setHover] = useState(null);
  // Up to four vendors with the most rates; the rest are left out of the chart (see the table).
  const vendors = useMemo(() => {
    const counts = new Map();
    for (const rate of rates) counts.set(rate.vendor_id, { id: rate.vendor_id, name: rate.vendor_name, count: (counts.get(rate.vendor_id)?.count || 0) + 1 });
    return [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 4);
  }, [rates]);
  if (!rates.length) return <p className="audit-empty">No rates recorded for this item in this period.</p>;
  const W = 640;
  const H = 230;
  const left = 52;
  const right = 120;
  const top = 16;
  const bottom = 28;
  const times = rates.map((rate) => new Date(rate.recorded_at).getTime());
  const t0 = Math.min(...times);
  const t1 = Math.max(...times);
  const prices = rates.map((rate) => rate.price);
  const low = Math.max(0, Math.min(...prices) * 0.9);
  const high = Math.max(...prices) * 1.08 || 1;
  const x = (time) => (t1 === t0 ? left + (W - left - right) / 2 : left + ((time - t0) / (t1 - t0)) * (W - left - right));
  const y = (price) => top + (1 - (price - low) / (high - low)) * (H - top - bottom);
  const ticks = [0, 0.33, 0.66, 1].map((part) => low + part * (high - low));
  const day = (time) => new Date(time).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  const shown = rates.filter((rate) => vendors.some((vendor) => vendor.id === rate.vendor_id));
  return (
    <div className="sr-chart">
      <div className="sr-legend">{vendors.map((vendor, index) => <span key={vendor.id}><i style={{ background: SERIES[index] }} />{vendor.name}</span>)}</div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Rates per ${unit} over time`}>
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={left} x2={W - right} y1={y(tick)} y2={y(tick)} className="sr-grid" />
            <text x={left - 8} y={y(tick) + 4} className="sr-axis" textAnchor="end">₹{Math.round(tick)}</text>
          </g>
        ))}
        <text x={left} y={H - 8} className="sr-axis">{day(t0)}</text>
        {t1 !== t0 && <text x={W - right} y={H - 8} className="sr-axis" textAnchor="end">{day(t1)}</text>}
        {vendors.map((vendor, index) => {
          const points = shown.filter((rate) => rate.vendor_id === vendor.id).map((rate) => [x(new Date(rate.recorded_at).getTime()), y(rate.price), rate]);
          const last = points[points.length - 1];
          return (
            <g key={vendor.id}>
              {points.length > 1 && <polyline points={points.map(([px, py]) => `${px},${py}`).join(" ")} fill="none" stroke={SERIES[index]} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
              {points.map(([px, py, rate], pointIndex) => (
                <circle key={pointIndex} cx={px} cy={py} r={hover === rate ? 6 : 4} fill={SERIES[index]} stroke="#fff" strokeWidth="2" onMouseEnter={() => setHover(rate)} onMouseLeave={() => setHover(null)} onClick={() => setHover(rate)} />
              ))}
              {last && <text x={W - right + 8} y={last[1] + 4} className="sr-end">₹{last[2].price} · {vendor.name.split(/[\s-]+/)[0].slice(0, 10)}</text>}
            </g>
          );
        })}
      </svg>
      {hover && (
        <div className="sr-tip" style={{ left: `${(x(new Date(hover.recorded_at).getTime()) / W) * 100}%` }}>
          <b>{money(hover.price)}/{unit}</b>
          <span>{hover.vendor_name}</span>
          <small>{new Date(hover.recorded_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</small>
        </div>
      )}
    </div>
  );
}

export default function SupplyReports({ headers, products, onClose }) {
  const [period, setPeriod] = useState("month");
  const [range, setRange] = useState(PERIODS[0][2]());
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [itemId, setItemId] = useState("");
  const [rates, setRates] = useState(null);

  const load = useCallback(async () => {
    try {
      const response = await API.get("/supply/reports", { headers, params: { from: range[0], to: range[1] } });
      setData(response.data);
      setError("");
    } catch (err) {
      setError(err.response?.data?.error || "Could not load the report");
    }
  }, [headers, range]);
  useEffect(() => { const timer = setTimeout(load, 0); return () => clearTimeout(timer); }, [load]);

  const item = products.find((product) => String(product.id) === String(itemId));
  useEffect(() => {
    if (!itemId) return undefined;
    let alive = true;
    API.get("/supply/reports/prices", { headers, params: { product_id: itemId } }).then((response) => alive && setRates(response.data.filter((rate) => !item || rate.unit === item.unit))).catch(() => alive && setRates([]));
    return () => { alive = false; };
  }, [itemId, headers, item]);

  const choosePeriod = (key) => {
    setPeriod(key);
    const found = PERIODS.find(([value]) => value === key);
    if (found) setRange(found[2]());
  };

  return (
    <div className="fnd-backdrop" onClick={onClose}>
      <div className="fnd-modal ds-modal sr" onClick={(event) => event.stopPropagation()}>
        <div className="fnd-modal-head"><div><h3>Direct Supply reports</h3><p className="fnd-sub">By delivery date · sales are invoiced amounts before GST</p></div><button type="button" className="fnd-close" onClick={onClose} aria-label="Close">×</button></div>
        <div className="fnd-modal-body">
          <div className="sr-filters">
            {PERIODS.map(([key, label]) => <button type="button" key={key} className={period === key ? "active" : ""} onClick={() => choosePeriod(key)}>{label}</button>)}
            <input type="date" value={range[0]} onChange={(event) => { setPeriod("custom"); setRange([event.target.value, range[1]]); }} aria-label="From" />
            <span>to</span>
            <input type="date" value={range[1]} onChange={(event) => { setPeriod("custom"); setRange([range[0], event.target.value]); }} aria-label="To" />
          </div>
          {error && <div className="audit-error">{error}</div>}
          {!data ? <p className="audit-empty">Loading…</p> : <>
            <div className="fnd-kpis ds-kpis">
              <div className="fnd-kpi-blue"><span>Sales</span><b>{money(data.sales)}</b><small>{data.invoiced_rounds} of {data.rounds} deliveries invoiced</small></div>
              <div className="fnd-kpi-warn"><span>Cost of sales</span><b>{money(data.cost)}</b><small>{data.estimated_cost ? `incl. ${money(data.estimated_cost)} estimated from rates` : "What the sold items cost"}</small></div>
              <div className={data.profit >= 0 ? "fnd-kpi-good" : "fnd-kpi-bad"}><span>Profit</span><b>{money(data.profit)}</b><small>{data.margin_percent != null ? `${data.margin_percent}% of sales` : "—"}</small></div>
              <div><span>Bought</span><b>{money(data.bought)}</b><small>Spent on stock</small></div>
              <div className="fnd-kpi-purple"><span>Received</span><b>{money(data.received)}</b><small>Payments in this period</small></div>
              <div className="fnd-kpi-bad"><span>Outstanding</span><b>{money(data.outstanding)}</b><small>Owed to Snackit now</small></div>
            </div>
            {data.invoiced_rounds < data.rounds && <p className="fnd-hint">{data.rounds - data.invoiced_rounds} deliver{data.rounds - data.invoiced_rounds === 1 ? "y isn't" : "ies aren't"} invoiced yet, so {data.rounds - data.invoiced_rounds === 1 ? "it isn't" : "they aren't"} in sales or profit.</p>}
            {data.uncosted_sales > 0 && <p className="fnd-hint">⚠ {money(data.uncosted_sales)} of sales ({data.uncosted_items.join(", ")}) has no purchase or vendor rate, so it's left out of the profit. Add a rate under Buying & margin.</p>}
            <p className="fnd-hint">Profit uses the cost of what was sold: the price paid for that delivery, else the average paid in the period, else the latest vendor rate (estimated).</p>

            <h4 className="fnd-timeline-title">Last 6 months</h4>
            <MonthlyChart months={data.months} />

            <h4 className="fnd-timeline-title">By company</h4>
            <div className="ds-table-wrap">
              <table className="ds-table sr-table">
                <thead><tr><th>Company</th><th>Invoices</th><th>Sales</th><th>Cost of sales</th><th>Profit</th></tr></thead>
                <tbody>
                  {data.companies.map((row) => <tr key={row.company_id}><td>{row.name}</td><td>{row.invoices}</td><td>{money(row.sales)}</td><td>{money(row.cost)}</td><td className={row.profit == null ? "" : row.profit >= 0 ? "ds-plus" : "ds-minus"}>{money(row.profit)}</td></tr>)}
                  {!data.companies.length && <tr><td colSpan={5} className="na">No invoices in this period.</td></tr>}
                </tbody>
              </table>
            </div>

            <h4 className="fnd-timeline-title">By item</h4>
            <div className="ds-table-wrap">
              <table className="ds-table sr-table">
                <thead><tr><th>Item</th><th>Sold</th><th>Avg sell</th><th>Sales</th><th>Cost of sales</th><th>Profit</th><th>Bought</th><th>Avg buy</th><th /></tr></thead>
                <tbody>
                  {data.items.map((row) => (
                    <tr key={`${row.product_id}-${row.unit}`}>
                      <td>{row.name}</td><td>{row.qty} {row.unit}</td><td>{money(row.avg_sell)}</td><td>{money(row.sales)}</td>
                      <td>{row.profit == null ? "—" : money(row.cost)}{row.estimated ? <small className="ds-spellings"> est.</small> : null}</td>
                      <td className={row.profit == null ? "" : row.profit >= 0 ? "ds-plus" : "ds-minus"}>{money(row.profit)}</td>
                      <td>{row.bought_qty ? `${row.bought_qty} ${row.unit}` : "—"}</td><td>{money(row.avg_buy)}</td>
                      <td>{row.product_id && <button type="button" className="audit-btn" onClick={() => setItemId(String(row.product_id))}>Price trend</button>}</td>
                    </tr>
                  ))}
                  {!data.items.length && <tr><td colSpan={9} className="na">Nothing sold or bought in this period.</td></tr>}
                </tbody>
              </table>
            </div>

            <h4 className="fnd-timeline-title">Price trend</h4>
            <div className="sr-filters">
              <select value={itemId} onChange={(event) => setItemId(event.target.value)} aria-label="Item">
                <option value="">Choose an item…</option>
                {products.map((product) => <option key={product.id} value={product.id}>{product.name} ({product.unit})</option>)}
              </select>
            </div>
            {itemId && (rates === null ? <p className="audit-empty">Loading…</p> : <PriceTrend rates={rates} unit={item?.unit || ""} />)}
          </>}
        </div>
      </div>
    </div>
  );
}
