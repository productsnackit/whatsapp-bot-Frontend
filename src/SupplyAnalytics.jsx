import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CHROME, SLOT, addDays, bucketLabel, formatInr, formatInt, istDay } from "./analyticsData.js";

/* Supply Analytics: Fruits Supply and Direct Supply (packaged) on one page, for a period of
   delivery dates, for both or one of them. See supplyAnalytics.js on the server. */

const API = axios.create({ baseURL: "https://whatsapp-bot-backend-b3nb.onrender.com" });
const PRESETS = [["7d", "7 days"], ["30d", "30 days"], ["month", "This month"], ["last", "Last month"], ["90d", "90 days"], ["all", "All time"]];
const SEGMENTS = [["all", "All"], ["fruits", "🍎 Fruits"], ["packaged", "📦 Packaged"]];
// Fixed colours: fruits and packaged keep theirs whatever the filter.
const COLOR = { fruits: SLOT[2], packaged: SLOT[0], spent: SLOT[1] };

function rangeFor(preset, today) {
  if (preset === "7d") return { from: addDays(today, -6), to: today };
  if (preset === "90d") return { from: addDays(today, -89), to: today };
  if (preset === "month") return { from: `${today.slice(0, 7)}-01`, to: today };
  if (preset === "last") {
    const first = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
    first.setUTCMonth(first.getUTCMonth() - 1);
    const start = first.toISOString().slice(0, 10);
    const end = addDays(`${today.slice(0, 7)}-01`, -1);
    return { from: start, to: end };
  }
  if (preset === "all") return { from: null, to: today };
  return { from: addDays(today, -29), to: today };
}

const compactInr = (value) => (value >= 100000 ? `₹${(value / 100000).toFixed(1)}L` : value >= 1000 ? `₹${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k` : `₹${Math.round(value)}`);
const qtyText = (qty) => Object.entries(qty || {}).filter(([, value]) => value).map(([unit, value]) => `${formatInt(Math.round(value))} ${unit}`).join(" · ") || "—";
const axisTick = { fontSize: 11, fill: CHROME.muted };

function Tile({ label, value, sub }) {
  return (
    <div className="ax-tile">
      <span className="ax-tile-label">{label}</span>
      <div className="ax-tile-value">{value}</div>
      <div className="ax-tile-foot"><span className="ax-delta is-flat">{sub}</span></div>
    </div>
  );
}

function Tip({ active, payload, label, money = true }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="ax-tip">
      <b>{label}</b>
      {payload.map((item) => (
        <span key={item.dataKey} className="ax-tip-row"><i style={{ background: item.color }} /> {money ? formatInr(item.value) : formatInt(item.value)} <small>{item.name}</small></span>
      ))}
    </div>
  );
}

function Legend({ items }) {
  return (
    <div className="ax-legend">
      {items.map((item) => <span key={item.label} className="ax-legend-item"><i className="ax-key-rect" style={{ background: item.color }} />{item.label}{item.value !== undefined && <b>{item.value}</b>}</span>)}
    </div>
  );
}

function Card({ title, subtitle, span, children }) {
  return (
    <section className={`ax-card ax-span-${span}`}>
      <header className="ax-card-head"><div><h3>{title}</h3>{subtitle && <p>{subtitle}</p>}</div></header>
      {children}
    </section>
  );
}

export default function SupplyAnalytics({ token, version = 0 }) {
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);
  const [preset, setPreset] = useState("30d");
  const [segment, setSegment] = useState("all");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showAll, setShowAll] = useState({ companies: false, items: false });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const range = rangeFor(preset, istDay(new Date().toISOString()));
      const response = await API.get("/analytics/supply", { headers, params: { ...(range.from ? { from: range.from } : { all: 1 }), to: range.to, ...(segment !== "all" ? { segment } : {}) } });
      setData(response.data);
    } catch (err) {
      setError(err.response?.data?.error || "Could not load supply analytics");
    } finally {
      setLoading(false);
    }
  }, [headers, preset, segment]);
  useEffect(() => { const timer = setTimeout(load, 0); return () => clearTimeout(timer); }, [load, version]);

  const t = data?.totals;
  const both = segment === "all";
  const label = (date) => bucketLabel(date, "day");
  const daily = (data?.daily || []).map((day) => ({ ...day, label: label(day.date), selling: day.fruits + day.packaged }));
  const companies = showAll.companies ? data?.companies || [] : (data?.companies || []).slice(0, 10);
  const items = showAll.items ? data?.items || [] : (data?.items || []).slice(0, 12);
  const rangeLabel = data ? (data.range.from === data.range.to ? label(data.range.from) : `${label(data.range.from)} – ${label(data.range.to)}`) : "";

  return (
    <div className={`ax ${loading && data ? "is-refreshing" : ""}`}>
      <div className="ax-filters">
        <div className="ax-presets" role="group" aria-label="Period">
          {PRESETS.map(([key, text]) => <button type="button" key={key} className={preset === key ? "on" : ""} onClick={() => setPreset(key)}>{text}</button>)}
        </div>
        <div className="ax-presets" role="group" aria-label="Supply">
          {SEGMENTS.map(([key, text]) => <button type="button" key={key} className={segment === key ? "on" : ""} onClick={() => setSegment(key)}>{text}</button>)}
        </div>
        <span className="ax-filters-right"><button type="button" className="ax-btn" onClick={load} disabled={loading}>{loading ? "Loading…" : "Refresh"}</button></span>
      </div>

      {error && <div className="ea-error">{error} <button type="button" className="ax-link" onClick={load}>Try again</button></div>}
      {!data && !error && <div className="ax-card ax-loading">Loading supply analytics…</div>}

      {data && t && (
        <>
          <section className="ax-hero">
            <div className="ax-hero-copy">
              <span className="ax-eyebrow">Order value · {rangeLabel}{both ? "" : segment === "fruits" ? " · Fruits" : " · Packaged"}</span>
              <div className="ax-hero-figure">{formatInr(t.selling)}</div>
              <p className="ax-hero-sub">
                <span><b>{formatInt(t.dates)}</b> delivery date{t.dates === 1 ? "" : "s"}</span>
                <span><b>{formatInt(t.orders)}</b> orders</span>
                <span><b>{formatInt(t.companies)}</b> compan{t.companies === 1 ? "y" : "ies"}</span>
                <span>{qtyText(t.qty)}</span>
              </p>
            </div>
            <div className="ax-hero-chart">
              <ResponsiveContainer width="100%" height={130}>
                <BarChart data={daily} margin={{ top: 10, right: 10, left: 10, bottom: 0 }} barCategoryGap="18%">
                  <XAxis dataKey="label" hide />
                  <YAxis hide />
                  <Tooltip content={<Tip />} cursor={{ fill: "rgba(0,0,0,.04)" }} />
                  {(both || segment === "fruits") && <Bar dataKey="fruits" name="Fruits" stackId="v" fill={COLOR.fruits} radius={both ? [0, 0, 0, 0] : [4, 4, 0, 0]} />}
                  {(both || segment === "packaged") && <Bar dataKey="packaged" name="Packaged" stackId="v" fill={COLOR.packaged} radius={[4, 4, 0, 0]} />}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <div className="ax-tiles">
            <Tile label="Order value" value={compactInr(t.selling)} sub={t.unpriced_lines ? `${t.unpriced_lines} lines without a price` : "All lines priced"} />
            <Tile label="Bought (spent)" value={compactInr(t.spent)} sub="Recorded purchases" />
            <Tile label="Margin" value={t.margin_percent == null ? "—" : `${t.margin_percent}%`} sub={t.margin == null ? "Needs prices and purchases" : `${formatInr(t.margin)} on what was bought`} />
            <Tile label="Billed" value={compactInr(t.billed)} sub={t.outstanding > 0 ? `${formatInr(t.outstanding)} still to collect` : "Nothing outstanding"} />
            <Tile label="Delivered" value={t.deliveries ? `${Math.round((t.delivered / t.deliveries) * 100)}%` : "—"} sub={`${formatInt(t.delivered)} of ${formatInt(t.deliveries)} company deliveries`} />
            <Tile label="Buyer time" value={t.buyer_hours == null ? "—" : t.buyer_hours < 24 ? `${Math.round(t.buyer_hours)} h` : `${(t.buyer_hours / 24).toFixed(1)} d`} sub="From list sent to goods received" />
          </div>

          <div className="ax-grid">
            {both && (
              <Card span={12} title="Fruits and packaged side by side" subtitle={`Fruits Supply and Direct Supply · ${rangeLabel}`}>
                <div className="sa-split">
                  {[["fruits", "🍎 Fruits Supply"], ["packaged", "📦 Direct Supply"]].map(([key, title]) => {
                    const part = data.by_segment[key];
                    return (
                      <div key={key} className="sa-part" style={{ borderTopColor: COLOR[key] }}>
                        <b>{title}</b>
                        <div className="sa-part-figure">{formatInr(part.selling)}</div>
                        <span>{formatInt(part.dates)} dates · {formatInt(part.orders)} orders · {formatInt(part.companies)} companies</span>
                        <span>{qtyText(part.qty)}</span>
                        <span>Spent {formatInr(part.spent)} · billed {formatInr(part.billed)}</span>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}

            <Card span={12} title="Order value and buying by day" subtitle="Order value (quantity × selling price) against what the buyer spent, by delivery date">
              <Legend items={[...(both || segment === "fruits" ? [{ label: "Fruits order value", color: COLOR.fruits }] : []), ...(both || segment === "packaged" ? [{ label: "Packaged order value", color: COLOR.packaged }] : []), { label: "Spent by buyer", color: COLOR.spent }]} />
              {daily.length ? (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={daily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
                    <CartesianGrid stroke={CHROME.grid} vertical={false} />
                    <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: CHROME.baseline }} interval="preserveStartEnd" minTickGap={18} />
                    <YAxis tick={axisTick} tickLine={false} axisLine={false} tickFormatter={compactInr} width={52} />
                    <Tooltip content={<Tip />} cursor={{ fill: "rgba(0,0,0,.04)" }} />
                    {(both || segment === "fruits") && <Bar dataKey="fruits" name="Fruits order value" stackId="v" fill={COLOR.fruits} radius={both ? [0, 0, 0, 0] : [4, 4, 0, 0]} />}
                    {(both || segment === "packaged") && <Bar dataKey="packaged" name="Packaged order value" stackId="v" fill={COLOR.packaged} radius={[4, 4, 0, 0]} />}
                    <Bar dataKey="spent" name="Spent by buyer" fill={COLOR.spent} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="ax-empty">No deliveries in this period.</p>}
            </Card>

            <Card span={7} title="By company" subtitle="Order value, orders and what is still to collect">
              {companies.length ? (
                <div className="ax-table-wrap">
                  <table className="ax-table">
                    <thead><tr><th>Company</th><th>Supplies</th><th className="is-num">Dates</th><th>Quantity</th><th className="is-num">Order value</th><th className="is-num">Outstanding</th></tr></thead>
                    <tbody>
                      {companies.map((company) => (
                        <tr key={company.name}>
                          <td><b>{company.name}</b></td>
                          <td>{company.segments.map((value) => (value === "fruits" ? "🍎" : "📦")).join(" ")}</td>
                          <td className="is-num">{company.dates}</td>
                          <td className="ax-muted">{qtyText(company.qty)}</td>
                          <td className="is-num">{formatInr(company.selling)}</td>
                          <td className="is-num">{company.outstanding > 0 ? formatInr(company.outstanding) : <span className="ax-muted">—</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="ax-empty">No orders in this period.</p>}
              {(data.companies.length > 10) && <button type="button" className="ax-link" onClick={() => setShowAll((value) => ({ ...value, companies: !value.companies }))}>{showAll.companies ? "Show top 10" : `Show all ${data.companies.length} companies`}</button>}
            </Card>

            <Card span={5} title="Top items" subtitle="By order value">
              {items.length ? (
                <div className="ax-table-wrap">
                  <table className="ax-table">
                    <thead><tr><th>Item</th><th className="is-num">Quantity</th><th className="is-num">Order value</th><th className="is-num">Avg buy</th></tr></thead>
                    <tbody>
                      {items.map((item) => (
                        <tr key={`${item.name}-${item.unit}`}>
                          <td><span aria-hidden="true">{item.segment === "fruits" ? "🍎 " : "📦 "}</span>{item.name}</td>
                          <td className="is-num">{formatInt(Math.round(item.qty * 10) / 10)} {item.unit}</td>
                          <td className="is-num">{item.selling ? formatInr(item.selling) : <span className="ax-muted">no price</span>}</td>
                          <td className="is-num">{item.avg_buy == null ? <span className="ax-muted">—</span> : `${formatInr(item.avg_buy)}/${item.unit}`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="ax-empty">No items in this period.</p>}
              {(data.items.length > 12) && <button type="button" className="ax-link" onClick={() => setShowAll((value) => ({ ...value, items: !value.items }))}>{showAll.items ? "Show top 12" : `Show all ${data.items.length} items`}</button>}
            </Card>
          </div>
          <p className="ax-footnote">
            {rangeLabel} · by delivery date, India time. Order value = quantity × the company's price, else the item's selling price (lines without a price count as ₹0). Margin compares what was bought with what that quantity sells for, for items with both a price and a purchase.
          </p>
        </>
      )}
    </div>
  );
}
