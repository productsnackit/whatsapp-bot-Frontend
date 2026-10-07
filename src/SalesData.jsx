import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Bar, BarChart, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CHROME, DELTA_INK, SLOT, WEEKDAYS, addDays, bucketLabel, formatInr, formatInt, istDay } from "./analyticsData.js";

/* Sale Data: what the vending machines sold (the Wendor reports uploaded in Live Stock), for a
   period and one location or all, against the period before (or the same days last month):
   day by day, month by month, by location, product, machine, hour and weekday.
   See salesData.js on the server. */

const API = axios.create({ baseURL: "https://whatsapp-bot-backend-b3nb.onrender.com" });
const PRESETS = [["7d", "7 days"], ["30d", "30 days"], ["month", "This month"], ["last", "Last month"], ["90d", "90 days"], ["all", "All time"]];
const COMPARE = [["previous", "vs period before"], ["month", "vs same days last month"]];
// Fixed colours: this period in the accent, the period compared with in quiet grey.
const NOW = SLOT[0];
const BEFORE = CHROME.other;

function rangeFor(preset, today) {
  if (preset === "7d") return { from: addDays(today, -6), to: today };
  if (preset === "90d") return { from: addDays(today, -89), to: today };
  if (preset === "month") return { from: `${today.slice(0, 7)}-01`, to: today };
  if (preset === "last") {
    const first = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
    first.setUTCMonth(first.getUTCMonth() - 1);
    return { from: first.toISOString().slice(0, 10), to: addDays(`${today.slice(0, 7)}-01`, -1) };
  }
  if (preset === "all") return { from: null, to: null };
  return { from: addDays(today, -29), to: today };
}
const compactInr = (value) => (value >= 100000 ? `₹${(value / 100000).toFixed(1)}L` : value >= 1000 ? `₹${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k` : `₹${Math.round(value)}`);
const axisTick = { fontSize: 11, fill: CHROME.muted };
const dayLabel = (date) => bucketLabel(date, "day");
const monthLabel = (month) => new Date(`${month}-01T00:00:00`).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
const change = (now, then) => {
  if (!then) return null;
  const pct = ((now - then) / then) * 100;
  return { diff: now - then, text: `${pct > 0 ? "+" : ""}${Math.abs(pct) < 10 ? pct.toFixed(1) : Math.round(pct)}%` };
};

function Delta({ value, suffix }) {
  if (!value) return <span className="ax-delta is-flat">No earlier data</span>;
  const direction = value.diff > 0 ? "up" : value.diff < 0 ? "down" : "flat";
  const tone = direction === "up" ? "good" : direction === "down" ? "bad" : "neutral";
  return (
    <span className="ax-delta" style={{ color: DELTA_INK[tone] }}>
      <span aria-hidden="true">{direction === "up" ? "▲" : direction === "down" ? "▼" : "■"}</span> {value.text}
      {suffix && <span className="ax-delta-vs">{suffix}</span>}
    </span>
  );
}

function Tile({ label, value, delta, suffix, sub }) {
  return (
    <div className="ax-tile">
      <span className="ax-tile-label">{label}</span>
      <div className="ax-tile-value">{value}</div>
      <div className="ax-tile-foot">{delta !== undefined ? <Delta value={delta} suffix={suffix} /> : <span className="ax-delta is-flat">{sub}</span>}</div>
    </div>
  );
}

function Tip({ active, payload, label, money = true }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload || {};
  return (
    <div className="ax-tip">
      <b>{label}</b>
      {payload.map((item) => (
        <span key={item.dataKey} className="ax-tip-row"><i style={{ background: item.color }} /> {money ? formatInr(item.value) : formatInt(item.value)} <small>{item.dataKey.startsWith("prev") && row.prev_date ? `${item.name} (${dayLabel(row.prev_date)})` : item.name}</small></span>
      ))}
    </div>
  );
}

function Legend({ items }) {
  return (
    <div className="ax-legend">
      {items.map((item) => <span key={item.label} className="ax-legend-item"><i className={item.line ? "ax-key-line" : "ax-key-rect"} style={{ background: item.color }} />{item.label}</span>)}
    </div>
  );
}

function Card({ title, subtitle, span, children, action }) {
  return (
    <section className={`ax-card ax-span-${span}`}>
      <header className="ax-card-head"><div><h3>{title}</h3>{subtitle && <p>{subtitle}</p>}</div>{action}</header>
      {children}
    </section>
  );
}

export default function SalesData({ token }) {
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);
  const [preset, setPreset] = useState("30d");
  const [compare, setCompare] = useState("previous");
  const [locationId, setLocationId] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showAll, setShowAll] = useState({ locations: false, products: false, machines: false });

  const params = useCallback(() => {
    const range = rangeFor(preset, istDay(new Date().toISOString()));
    return { ...(range.from ? { from: range.from } : {}), ...(range.to ? { to: range.to } : {}), compare, ...(locationId ? { location_id: locationId } : {}) };
  }, [preset, compare, locationId]);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData((await API.get("/saledata/overview", { headers, params: params() })).data);
    } catch (err) {
      setError(err.response?.data?.error || "Could not load the sale data");
    } finally {
      setLoading(false);
    }
  }, [headers, params]);
  useEffect(() => { const timer = setTimeout(load, 0); return () => clearTimeout(timer); }, [load]);

  const exportExcel = async () => {
    try {
      const { name, data: file } = (await API.get("/saledata/export", { headers, params: params() })).data;
      const bytes = Uint8Array.from(atob(file), (ch) => ch.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch {
      setError("Could not export");
    }
  };

  const t = data?.totals;
  const p = data?.prev_totals;
  const vsText = compare === "month" ? "vs last month" : "vs before";
  const rangeLabel = data ? (data.range.from === data.range.to ? dayLabel(data.range.from) : `${dayLabel(data.range.from)} – ${dayLabel(data.range.to)}`) : "";
  const prevLabel = data ? `${dayLabel(data.previous.from)} – ${dayLabel(data.previous.to)}` : "";
  const daily = (data?.daily || []).map((day) => ({ ...day, label: dayLabel(day.date) }));
  const location = data?.location_options.find((option) => String(option.id) === String(locationId));
  const list = (key, size) => (showAll[key] ? data?.[key] || [] : (data?.[key] || []).slice(0, size));
  const maxLocation = Math.max(1, ...(data?.locations || []).map((place) => place.value));
  const weekdays = (data?.weekdays || []).map((day) => ({ ...day, label: WEEKDAYS[day.day] }));
  const hours = (data?.hours || []).filter((hour) => hour.hour >= 6 || hour.units).map((hour) => ({ ...hour, label: `${hour.hour % 12 || 12}${hour.hour < 12 ? "a" : "p"}` }));
  const months = (data?.months || []).map((month) => ({ ...month, label: monthLabel(month.month) }));
  const stale = data?.data.last && data.range.asked_to > data.data.last;

  return (
    <div className={`ax ${loading && data ? "is-refreshing" : ""}`}>
      <div className="ax-filters">
        <div className="ax-presets" role="group" aria-label="Period">
          {PRESETS.map(([key, text]) => <button type="button" key={key} className={preset === key ? "on" : ""} onClick={() => setPreset(key)}>{text}</button>)}
        </div>
        <div className="ax-presets" role="group" aria-label="Compare with">
          {COMPARE.map(([key, text]) => <button type="button" key={key} className={compare === key ? "on" : ""} onClick={() => setCompare(key)}>{text}</button>)}
        </div>
        <select className="sd-location" value={locationId} onChange={(event) => setLocationId(event.target.value)} aria-label="Location">
          <option value="">All locations</option>
          {(data?.location_options || []).map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
        </select>
        <span className="ax-filters-right">
          <button type="button" className="ax-btn" onClick={exportExcel} disabled={!data}>⬇ Excel</button>
          <button type="button" className="ax-btn" onClick={load} disabled={loading}>{loading ? "Loading…" : "Refresh"}</button>
        </span>
      </div>

      {error && <div className="ea-error">{error} <button type="button" className="ax-link" onClick={load}>Try again</button></div>}
      {!data && !error && <div className="ax-card ax-loading">Loading sale data…</div>}
      {stale && <div className="sd-note">Sales are uploaded up to {dayLabel(data.data.last)}, so this shows up to then (and compares the same number of days). Upload the Wendor reports after that in Live Stock → Upload.</div>}

      {data && t && (
        <>
          <section className="ax-hero">
            <div className="ax-hero-copy">
              <span className="ax-eyebrow">Sales · {rangeLabel}{location ? ` · ${location.name}` : " · all locations"}</span>
              <div className="ax-hero-figure">{formatInr(t.value)}</div>
              <p className="ax-hero-sub">
                <Delta value={change(t.value, p.value)} suffix={`${vsText} (${formatInr(p.value)}, ${prevLabel})`} />
              </p>
              <p className="ax-hero-sub">
                <span><b>{formatInt(t.units)}</b> items sold</span>
                <span><b>{formatInt(t.machines)}</b> machine{t.machines === 1 ? "" : "s"}</span>
                {!location && <span><b>{formatInt(t.locations)}</b> location{t.locations === 1 ? "" : "s"}</span>}
                <span><b>{formatInt(t.sales_days)}</b> days with sales</span>
              </p>
            </div>
            <div className="ax-hero-chart">
              <ResponsiveContainer width="100%" height={130}>
                <BarChart data={daily} margin={{ top: 10, right: 10, left: 10, bottom: 0 }} barCategoryGap="18%">
                  <XAxis dataKey="label" hide />
                  <YAxis hide />
                  <Tooltip content={<Tip />} cursor={{ fill: "rgba(0,0,0,.04)" }} />
                  <Bar dataKey="value" name="Sales" fill={NOW} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <div className="ax-tiles">
            <Tile label="Sales" value={compactInr(t.value)} delta={change(t.value, p.value)} suffix={vsText} />
            <Tile label="Items sold" value={formatInt(t.units)} delta={change(t.units, p.units)} suffix={vsText} />
            <Tile label="Sales per day" value={compactInr(t.per_day)} delta={change(t.per_day, p.per_day)} suffix={vsText} />
            <Tile label="Average price" value={`₹${t.avg_price}`} delta={change(t.avg_price, p.avg_price)} suffix={vsText} />
            <Tile label="Best day" value={t.best_day ? compactInr(t.best_day.value) : "—"} sub={t.best_day ? `${dayLabel(t.best_day.date)} · ${formatInt(t.best_day.units)} items` : "No sales"} />
          </div>

          <div className="ax-grid">
            <Card span={12} title="Sales by day" subtitle={`Each day next to the same day ${compare === "month" ? "last month" : "of the period before"} (${prevLabel})`}>
              <Legend items={[{ label: `Sales, ${rangeLabel}`, color: NOW }, { label: `Sales, ${prevLabel}`, color: BEFORE, line: true }]} />
              {daily.some((day) => day.value || day.prev_value) ? (
                <ResponsiveContainer width="100%" height={280}>
                  <ComposedChart data={daily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke={CHROME.grid} vertical={false} />
                    <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: CHROME.baseline }} interval="preserveStartEnd" minTickGap={18} />
                    <YAxis tick={axisTick} tickLine={false} axisLine={false} tickFormatter={compactInr} width={56} />
                    <Tooltip content={<Tip />} cursor={{ fill: "rgba(0,0,0,.04)" }} />
                    <Bar dataKey="value" name="Sales" fill={NOW} radius={[4, 4, 0, 0]} />
                    <Line dataKey="prev_value" name="Before" stroke={BEFORE} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : <p className="ax-empty">No sales in this period.</p>}
            </Card>

            {!location && (
              <Card span={12} title="By location" subtitle={`Sales ${rangeLabel} and the change ${vsText}. Click a location to see only it.`}>
                <div className="ax-table-wrap">
                  <table className="ax-table">
                    <thead><tr><th>Location</th><th className="is-num">Machines</th><th className="is-num">Items</th><th className="is-num">Sales</th><th>Share</th><th className="is-num">Before</th><th className="is-num">Change</th><th className="is-num">Per day</th><th>Top product</th></tr></thead>
                    <tbody>
                      {list("locations", 12).map((place) => (
                        <tr key={place.name} className={place.id ? "sd-click" : ""} onClick={() => place.id && setLocationId(String(place.id))}>
                          <td><b>{place.name}</b></td>
                          <td className="is-num">{place.machines}</td>
                          <td className="is-num">{formatInt(place.units)}</td>
                          <td className="is-num">{formatInr(place.value)}</td>
                          <td><span className="sd-share"><i style={{ width: `${(place.value / maxLocation) * 100}%`, background: NOW }} /></span></td>
                          <td className="is-num ax-muted">{formatInr(place.prev_value)}</td>
                          <td className="is-num"><Delta value={change(place.value, place.prev_value)} /></td>
                          <td className="is-num">{formatInr(place.per_day)}</td>
                          <td className="ax-muted">{place.top_product ? `${place.top_product.name} (${place.top_product.units})` : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {data.locations.length > 12 && <button type="button" className="ax-link" onClick={() => setShowAll((value) => ({ ...value, locations: !value.locations }))}>{showAll.locations ? "Show top 12" : `Show all ${data.locations.length}`}</button>}
              </Card>
            )}

            <Card span={7} title="Top products" subtitle={`By sales, ${rangeLabel}`}>
              {data.products.length ? (
                <div className="ax-table-wrap">
                  <table className="ax-table">
                    <thead><tr><th>Product</th><th className="is-num">Items</th><th className="is-num">Sales</th><th className="is-num">Change</th></tr></thead>
                    <tbody>
                      {list("products", 15).map((product) => (
                        <tr key={product.name}>
                          <td>{product.name}</td>
                          <td className="is-num">{formatInt(product.units)}</td>
                          <td className="is-num">{formatInr(product.value)}</td>
                          <td className="is-num"><Delta value={change(product.value, product.prev_value)} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="ax-empty">No sales in this period.</p>}
              {data.products.length > 15 && <button type="button" className="ax-link" onClick={() => setShowAll((value) => ({ ...value, products: !value.products }))}>{showAll.products ? "Show top 15" : `Show all ${data.products.length} products`}</button>}
            </Card>

            <Card span={5} title="Month by month" subtitle={`All uploaded sales${location ? ` at ${location.name}` : ""}`}>
              {months.length ? (
                <>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={months} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="30%">
                      <CartesianGrid stroke={CHROME.grid} vertical={false} />
                      <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: CHROME.baseline }} />
                      <YAxis tick={axisTick} tickLine={false} axisLine={false} tickFormatter={compactInr} width={56} />
                      <Tooltip content={<Tip />} cursor={{ fill: "rgba(0,0,0,.04)" }} />
                      <Bar dataKey="value" name="Sales" fill={NOW} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="ax-table-wrap">
                    <table className="ax-table">
                      <thead><tr><th>Month</th><th className="is-num">Days</th><th className="is-num">Items</th><th className="is-num">Sales</th><th className="is-num">Per day</th></tr></thead>
                      <tbody>{[...months].reverse().map((month) => <tr key={month.month}><td>{month.label}</td><td className="is-num">{month.days}</td><td className="is-num">{formatInt(month.units)}</td><td className="is-num">{formatInr(month.value)}</td><td className="is-num">{formatInr(month.days ? month.value / month.days : 0)}</td></tr>)}</tbody>
                    </table>
                  </div>
                </>
              ) : <p className="ax-empty">No sales uploaded yet.</p>}
            </Card>

            <Card span={7} title="By hour of day" subtitle={`Items sold in each hour, ${rangeLabel} (India time)`}>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={hours} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="16%">
                  <CartesianGrid stroke={CHROME.grid} vertical={false} />
                  <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: CHROME.baseline }} interval={1} />
                  <YAxis tick={axisTick} tickLine={false} axisLine={false} width={40} />
                  <Tooltip content={<Tip money={false} />} cursor={{ fill: "rgba(0,0,0,.04)" }} />
                  <Bar dataKey="units" name="Items sold" fill={NOW} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <Card span={5} title="By weekday" subtitle="Average sales per day on each weekday">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={weekdays} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="22%">
                  <CartesianGrid stroke={CHROME.grid} vertical={false} />
                  <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: CHROME.baseline }} />
                  <YAxis tick={axisTick} tickLine={false} axisLine={false} tickFormatter={compactInr} width={56} />
                  <Tooltip content={<Tip />} cursor={{ fill: "rgba(0,0,0,.04)" }} />
                  <Bar dataKey="per_day" name="Average sales" fill={NOW} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <Card span={12} title="By machine" subtitle={`Sales ${rangeLabel}${location ? ` at ${location.name}` : ""}`}>
              <div className="ax-table-wrap">
                <table className="ax-table">
                  <thead><tr><th>Machine</th><th>Location</th><th className="is-num">Items</th><th className="is-num">Sales</th><th className="is-num">Before</th><th className="is-num">Change</th></tr></thead>
                  <tbody>
                    {list("machines", 12).map((machine) => (
                      <tr key={machine.id}><td><b>{machine.name}</b></td><td className="ax-muted">{machine.location}</td><td className="is-num">{formatInt(machine.units)}</td><td className="is-num">{formatInr(machine.value)}</td><td className="is-num ax-muted">{formatInr(machine.prev_value)}</td><td className="is-num"><Delta value={change(machine.value, machine.prev_value)} /></td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {data.machines.length > 12 && <button type="button" className="ax-link" onClick={() => setShowAll((value) => ({ ...value, machines: !value.machines }))}>{showAll.machines ? "Show top 12" : `Show all ${data.machines.length} machines`}</button>}
            </Card>
          </div>
          <p className="ax-footnote">
            {rangeLabel} compared with {prevLabel} · India time. Sales = completed vends in the Wendor reports uploaded in Live Stock (sales uploaded {data.data.first ? `${dayLabel(data.data.first)} – ${dayLabel(data.data.last)}` : "none yet"}); value = the amount Wendor recorded. Machines not linked to a location (Live Stock → Settings) show under their own name.
          </p>
        </>
      )}
    </div>
  );
}
