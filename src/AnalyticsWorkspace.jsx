import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ComposedChart, Line, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  CHROME, DELTA_INK, ISSUES, ISSUE_COLOR, NEUTRAL, ORDINAL, OTHER_ISSUE, SEQUENTIAL, SLOT, STATUS_GROUPS, WEEKDAYS,
  addDays, bucketKey, bucketKeys, bucketLabel, change, daysBetween, formatHour, formatHours, formatInr, formatInt, formatPct,
  granularityFor, hoursToResolve, isComplaint, issueOf, istDay, istHour, istWeekday, locationKey, siteOf, statusGroup,
  summarize, summarizeByBucket,
} from "./analyticsData.js";

/* Analytics: complaints, refunds and resolution for a chosen period, compared with
   the period before. One filter row scopes every number and chart on the page. */

const API = axios.create({ baseURL: "https://whatsapp-bot-backend-b3nb.onrender.com" });

const PRESETS = [["today", "Today"], ["7d", "7 days"], ["30d", "30 days"], ["90d", "90 days"], ["month", "This month"], ["all", "All time"]];
const SPEED_BUCKETS = [["< 1 hour", 0, 1], ["1–6 hours", 1, 6], ["6–24 hours", 6, 24], ["1–3 days", 24, 72], ["Over 3 days", 72, Infinity]];

function presetRange(preset, today) {
  if (preset === "today") return { from: today, to: today };
  if (preset === "7d") return { from: addDays(today, -6), to: today };
  if (preset === "90d") return { from: addDays(today, -89), to: today };
  if (preset === "month") return { from: `${today.slice(0, 7)}-01`, to: today };
  if (preset === "all") return { from: null, to: today };
  return { from: addDays(today, -29), to: today };
}

const compactInr = (value) => (value >= 100000 ? `₹${(value / 100000).toFixed(1)}L` : value >= 1000 ? `₹${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k` : `₹${Math.round(value)}`);
const shortDate = (dateStr) => bucketLabel(dateStr, "day");
const relativeDays = (iso) => {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return days <= 0 ? "Today" : days === 1 ? "Yesterday" : `${days} days ago`;
};

/* ---------- Small building blocks ---------- */

// Values lead, names follow; each row keyed by a short line in the series colour.
function ChartTip({ active, payload, format, titleFor }) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((item) => item.value !== null && item.value !== undefined);
  return (
    <div className="ax-tip">
      <div className="ax-tip-title">{titleFor(payload[0].payload)}</div>
      {rows.map((item) => (
        <div key={item.dataKey} className="ax-tip-row">
          <i className="ax-key-line" style={{ background: item.color || item.stroke || item.fill }} />
          <b>{format(item.value, item)}</b>
          <span>{item.name}</span>
        </div>
      ))}
    </div>
  );
}

// Floating tooltip for the hand-built charts (bars, heatmap cells, status segments).
function useTip() {
  const [tip, setTip] = useState(null);
  const show = useCallback((event, content) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = typeof event.clientX === "number" && event.clientX ? event.clientX : rect.left + rect.width / 2;
    const y = typeof event.clientY === "number" && event.clientY ? event.clientY : rect.top;
    setTip({ x, y, content });
  }, []);
  const hide = useCallback(() => setTip(null), []);
  return [tip, show, hide];
}

function FloatingTip({ tip }) {
  if (!tip) return null;
  return <div className="ax-tip ax-tip-float" style={{ left: tip.x, top: tip.y }} role="status">{tip.content}</div>;
}

function Delta({ value, goodWhen, suffix }) {
  if (!value) return <span className="ax-delta is-flat">No earlier data</span>;
  const direction = value.diff > 0 ? "up" : value.diff < 0 ? "down" : "flat";
  const tone = direction === "flat" || goodWhen === "neutral" ? "neutral" : direction === goodWhen ? "good" : "bad";
  return (
    <span className="ax-delta" style={{ color: DELTA_INK[tone] }}>
      <span aria-hidden="true">{direction === "up" ? "▲" : direction === "down" ? "▼" : "■"}</span> {value.text}
      <span className="ax-delta-vs">{suffix}</span>
    </span>
  );
}

// 2px de-emphasis line with the latest point in the accent colour.
function Sparkline({ values }) {
  const points = values.map((value, index) => ({ value, index })).filter((point) => point.value !== null && point.value !== undefined);
  if (points.length < 2) return <div className="ax-spark ax-spark-empty" />;
  const width = 120;
  const height = 34;
  const max = Math.max(...points.map((point) => point.value));
  const min = Math.min(...points.map((point) => point.value));
  const x = (index) => 4 + (index / Math.max(1, values.length - 1)) * (width - 8);
  const y = (value) => (max === min ? height / 2 : 4 + (1 - (value - min) / (max - min)) * (height - 8));
  const last = points[points.length - 1];
  return (
    <svg className="ax-spark" viewBox={`0 0 ${width} ${height}`} width={width} height={height} aria-hidden="true">
      <polyline points={points.map((point) => `${x(point.index)},${y(point.value)}`).join(" ")} fill="none" stroke={CHROME.baseline} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(last.index)} cy={y(last.value)} r="4" fill={SLOT[0]} stroke={CHROME.surface} strokeWidth="2" />
    </svg>
  );
}

function StatTile({ label, value, sub, delta, goodWhen, compareLabel, spark }) {
  return (
    <div className="ax-tile">
      <span className="ax-tile-label">{label}</span>
      <div className="ax-tile-value">{value}</div>
      <div className="ax-tile-foot">
        {compareLabel ? <Delta value={delta} goodWhen={goodWhen} suffix={compareLabel} /> : <span className="ax-delta is-flat">{sub}</span>}
      </div>
      {compareLabel && sub && <span className="ax-tile-sub">{sub}</span>}
      <Sparkline values={spark} />
    </div>
  );
}

function DataTable({ columns, rows }) {
  return (
    <div className="ax-table-wrap">
      <table className="ax-table">
        <thead><tr>{columns.map((column) => <th key={column.key} className={column.numeric ? "is-num" : ""}>{column.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.id ?? index}>{columns.map((column) => <td key={column.key} className={column.numeric ? "is-num" : ""}>{column.format ? column.format(row[column.key], row) : row[column.key]}</td>)}</tr>
          ))}
          {!rows.length && <tr><td colSpan={columns.length} className="ax-table-empty">No data in this period</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

// Every chart has a table twin, so no value is only readable by colour or hover.
function ChartCard({ title, subtitle, span, table, legend, children }) {
  const [asTable, setAsTable] = useState(false);
  return (
    <section className={`ax-card ax-span-${span}`}>
      <header className="ax-card-head">
        <div>
          <h3>{title}</h3>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {table && (
          <div className="ax-view-toggle" role="group" aria-label={`${title} view`}>
            <button type="button" className={asTable ? "" : "on"} onClick={() => setAsTable(false)}>Chart</button>
            <button type="button" className={asTable ? "on" : ""} onClick={() => setAsTable(true)}>Table</button>
          </div>
        )}
      </header>
      {!asTable && legend}
      {asTable && table ? <DataTable columns={table.columns} rows={table.rows} /> : children}
    </section>
  );
}

function Legend({ items }) {
  return (
    <div className="ax-legend">
      {items.map((item) => (
        <span key={item.label} className="ax-legend-item">
          <i className={item.line ? "ax-key-line" : "ax-key-rect"} style={{ background: item.color }} />
          {item.label}
          {item.value !== undefined && <b>{item.value}</b>}
        </span>
      ))}
    </div>
  );
}

const axisTick = { fontSize: 11, fill: CHROME.muted };

/* ---------- Charts ---------- */

function VolumeCharts({ rows, compare, granularity }) {
  const unit = granularity === "day" ? "day" : granularity === "week" ? "week" : "month";
  return (
    <div className="ax-volume">
      <div className="ax-subchart-title">Complaints per {unit}</div>
      <ResponsiveContainer width="100%" height={210}>
        <ComposedChart data={rows} syncId="ax-volume" margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={CHROME.grid} />
          <XAxis dataKey="label" tick={false} axisLine={{ stroke: CHROME.baseline }} tickLine={false} height={4} />
          <YAxis allowDecimals={false} tick={axisTick} axisLine={false} tickLine={false} width={36} />
          <Tooltip
            cursor={{ stroke: CHROME.baseline, strokeWidth: 1 }}
            itemSorter={(item) => (item.dataKey === "complaints" ? 0 : 1)}
            content={<ChartTip titleFor={(row) => row.title} format={(value, item) => `${formatInt(value)}${item.dataKey === "previous" && item.payload.prevTitle ? ` (${item.payload.prevTitle})` : ""}`} />}
          />
          {compare && <Line type="monotoneX" dataKey="previous" name="Previous period" stroke={CHROME.muted} strokeWidth={2} dot={false} activeDot={{ r: 4, fill: CHROME.muted, stroke: CHROME.surface, strokeWidth: 2 }} connectNulls isAnimationActive={false} />}
          <Area type="monotoneX" dataKey="complaints" name="This period" stroke={SLOT[0]} strokeWidth={2} fill={SLOT[0]} fillOpacity={0.1} dot={false} activeDot={{ r: 5, fill: SLOT[0], stroke: CHROME.surface, strokeWidth: 2 }} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="ax-subchart-title">Refunds paid per {unit}</div>
      <ResponsiveContainer width="100%" height={150}>
        <BarChart data={rows} syncId="ax-volume" margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={CHROME.grid} />
          <XAxis dataKey="label" tick={axisTick} axisLine={{ stroke: CHROME.baseline }} tickLine={false} interval="preserveStartEnd" minTickGap={18} />
          <YAxis tick={axisTick} axisLine={false} tickLine={false} width={36} tickFormatter={compactInr} />
          <Tooltip cursor={{ fill: "rgba(11, 15, 26, 0.04)" }} content={<ChartTip titleFor={(row) => row.title} format={(value, item) => `${formatInr(value)} · ${item.payload.refunds} refund${item.payload.refunds === 1 ? "" : "s"}`} />} />
          <Bar dataKey="refundPaid" name="Refunds paid" fill={SLOT[0]} maxBarSize={24} radius={[4, 4, 0, 0]} activeBar={{ fillOpacity: 0.8 }} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function StatusBreakdown({ counts, total }) {
  const [tip, show, hide] = useTip();
  if (!total) return <p className="ax-empty">No complaints in this period.</p>;
  return (
    <div className="ax-status">
      <div className="ax-status-total"><b>{formatInt(total)}</b> complaints</div>
      <div className="ax-stack" role="img" aria-label="Complaints by status">
        {STATUS_GROUPS.filter((group) => counts[group.key]).map((group) => {
          const share = counts[group.key] / total;
          return (
            <button
              type="button"
              key={group.key}
              className="ax-stack-seg"
              style={{ flexGrow: counts[group.key], background: group.color }}
              aria-label={`${group.label}: ${counts[group.key]} (${formatPct(share)})`}
              onPointerMove={(event) => show(event, <><b>{formatInt(counts[group.key])} · {formatPct(share)}</b><span>{group.label}</span></>)}
              onPointerLeave={hide}
              onFocus={(event) => show(event, <><b>{formatInt(counts[group.key])} · {formatPct(share)}</b><span>{group.label}</span></>)}
              onBlur={hide}
            />
          );
        })}
      </div>
      <ul className="ax-status-list">
        {STATUS_GROUPS.map((group) => (
          <li key={group.key} className={counts[group.key] ? "" : "is-zero"}>
            <i className="ax-key-rect" style={{ background: group.color }} />
            <span className="ax-status-name">{group.label}<small>{group.help}</small></span>
            <b>{formatInt(counts[group.key] || 0)}</b>
            <span className="ax-status-pct">{formatPct((counts[group.key] || 0) / total)}</span>
          </li>
        ))}
      </ul>
      <FloatingTip tip={tip} />
    </div>
  );
}

// One series, so every bar wears slot 1; a selected issue keeps it and the rest go gray.
function IssueBars({ rows, selected, onSelect, compare }) {
  const [tip, show, hide] = useTip();
  const max = Math.max(1, ...rows.map((row) => row.count));
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  if (!total) return <p className="ax-empty">No complaints in this period.</p>;
  const describe = (row) => <><b>{formatInt(row.count)} · {formatPct(row.count / total)}</b><span>{row.issue}{compare && row.previous !== null ? ` · previous ${formatInt(row.previous)}` : ""}</span><span className="ax-tip-hint">Click to {selected === row.issue ? "clear the filter" : "filter the page"}</span></>;
  return (
    <div className="ax-hbars">
      {rows.map((row) => {
        const active = selected === "ALL" || selected === row.issue;
        return (
          <button
            type="button"
            key={row.issue}
            className={`ax-hbar ${active ? "" : "is-muted"}`}
            onClick={() => onSelect(selected === row.issue ? "ALL" : row.issue)}
            aria-pressed={selected === row.issue}
            onPointerMove={(event) => show(event, describe(row))}
            onPointerLeave={hide}
            onFocus={(event) => show(event, describe(row))}
            onBlur={hide}
          >
            <span className="ax-hbar-name">{row.issue}</span>
            <span className="ax-hbar-track">
              <span className="ax-hbar-fill" style={{ width: `calc((100% - 84px) * ${row.count / max})`, background: active ? SLOT[0] : CHROME.other }} />
              <span className="ax-hbar-value">{formatInt(row.count)} <small>{formatPct(row.count / total)}</small></span>
            </span>
          </button>
        );
      })}
      <FloatingTip tip={tip} />
    </div>
  );
}

function IssueMix({ rows, series }) {
  return (
    <ResponsiveContainer width="100%" height={250}>
      <BarChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={CHROME.grid} />
        <XAxis dataKey="label" tick={axisTick} axisLine={{ stroke: CHROME.baseline }} tickLine={false} interval="preserveStartEnd" minTickGap={18} />
        <YAxis allowDecimals={false} tick={axisTick} axisLine={false} tickLine={false} width={36} />
        <Tooltip cursor={{ fill: "rgba(11, 15, 26, 0.04)" }} content={<ChartTip titleFor={(row) => `${row.title} · ${formatInt(row.total)} total`} format={(value) => formatInt(value)} />} />
        {series.map((item, index) => (
          <Bar
            key={item.key}
            dataKey={item.key}
            name={item.key}
            stackId="mix"
            fill={item.color}
            stroke={CHROME.surface}
            strokeWidth={2}
            maxBarSize={24}
            radius={index === series.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

function Heatmap({ grid }) {
  const [tip, show, hide] = useTip();
  const max = Math.max(0, ...grid.flat());
  if (!max) return <p className="ax-empty">No complaints in this period.</p>;
  const colour = (count) => (count ? SEQUENTIAL[Math.min(SEQUENTIAL.length - 1, Math.ceil((count / max) * SEQUENTIAL.length) - 1)] : NEUTRAL);
  let peak = { day: 0, hour: 0, count: 0 };
  grid.forEach((row, day) => row.forEach((count, hour) => { if (count > peak.count) peak = { day, hour, count }; }));
  const describe = (day, hour, count) => <><b>{formatInt(count)} complaint{count === 1 ? "" : "s"}</b><span>{WEEKDAYS[day]} {formatHour(hour)}–{formatHour((hour + 1) % 24)}</span></>;
  return (
    <div className="ax-heat">
      <p className="ax-heat-peak">Busiest: <b>{WEEKDAYS[peak.day]} {formatHour(peak.hour)}–{formatHour((peak.hour + 1) % 24)}</b> ({formatInt(peak.count)})</p>
      <div className="ax-heat-grid" role="grid" aria-label="Complaints by weekday and hour, India time">
        <span />
        {Array.from({ length: 24 }, (_, hour) => <span key={hour} className="ax-heat-hour">{hour % 3 === 0 ? formatHour(hour) : ""}</span>)}
        {grid.map((row, day) => (
          <div key={WEEKDAYS[day]} className="ax-heat-row" role="row">
            <span className="ax-heat-day">{WEEKDAYS[day]}</span>
            {row.map((count, hour) => (
              <button
                type="button"
                key={hour}
                className="ax-heat-cell"
                style={{ background: colour(count) }}
                aria-label={`${WEEKDAYS[day]} ${formatHour(hour)}: ${count} complaints`}
                onPointerMove={(event) => show(event, describe(day, hour, count))}
                onPointerLeave={hide}
                onFocus={(event) => show(event, describe(day, hour, count))}
                onBlur={hide}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="ax-scale" aria-hidden="true">
        <span>None</span><i style={{ background: NEUTRAL }} />
        <span className="ax-scale-gap">Fewer</span>
        {SEQUENTIAL.map((step) => <i key={step} style={{ background: step }} />)}
        <span>More (max {formatInt(max)})</span>
      </div>
      <FloatingTip tip={tip} />
    </div>
  );
}

function Ratings({ counts, average, total, previousAverage, compare, compareLabel }) {
  const [tip, show, hide] = useTip();
  if (!total) return <p className="ax-empty">No ratings in this period. Customers rate after a refund or a resolved issue.</p>;
  const max = Math.max(1, ...counts);
  return (
    <div className="ax-ratings">
      <div className="ax-ratings-head">
        <div className="ax-ratings-avg">{average.toFixed(1)}<span>/ 5</span></div>
        <div>
          <div className="ax-ratings-count">{formatInt(total)} rating{total === 1 ? "" : "s"}</div>
          {compare && <Delta value={change(average, previousAverage, "rating")} goodWhen="up" suffix={compareLabel} />}
        </div>
      </div>
      {[5, 4, 3, 2, 1].map((stars) => {
        const count = counts[stars - 1];
        return (
          <div
            key={stars}
            className="ax-rating-row"
            tabIndex={0}
            onPointerMove={(event) => show(event, <><b>{formatInt(count)} · {formatPct(count / total)}</b><span>{stars} star{stars === 1 ? "" : "s"}</span></>)}
            onPointerLeave={hide}
            onFocus={(event) => show(event, <><b>{formatInt(count)} · {formatPct(count / total)}</b><span>{stars} star{stars === 1 ? "" : "s"}</span></>)}
            onBlur={hide}
          >
            <span className="ax-rating-label">{stars} ★</span>
            <span className="ax-hbar-track">
              <span className="ax-hbar-fill" style={{ width: `calc((100% - 84px) * ${count / max})`, background: ORDINAL[stars - 1] }} />
              <span className="ax-hbar-value">{formatInt(count)} <small>{formatPct(count / total)}</small></span>
            </span>
          </div>
        );
      })}
      <FloatingTip tip={tip} />
    </div>
  );
}

function ResolutionSpeed({ counts, median, within24 }) {
  const [tip, show, hide] = useTip();
  const total = counts.reduce((sum, count) => sum + count, 0);
  if (!total) return <p className="ax-empty">No complaints were resolved in this period.</p>;
  const max = Math.max(1, ...counts);
  return (
    <div className="ax-speed">
      <div className="ax-speed-stats">
        <div><span>Median</span><b>{formatHours(median)}</b></div>
        <div><span>Within 24 hours</span><b>{formatPct(within24)}</b></div>
      </div>
      <div className="ax-columns">
        {SPEED_BUCKETS.map(([label], index) => (
          <div
            key={label}
            className="ax-column"
            tabIndex={0}
            onPointerMove={(event) => show(event, <><b>{formatInt(counts[index])} · {formatPct(counts[index] / total)}</b><span>Resolved in {label.toLowerCase()}</span></>)}
            onPointerLeave={hide}
            onFocus={(event) => show(event, <><b>{formatInt(counts[index])} · {formatPct(counts[index] / total)}</b><span>Resolved in {label.toLowerCase()}</span></>)}
            onBlur={hide}
          >
            <span className="ax-column-plot">
              <span className="ax-column-value">{formatInt(counts[index])}</span>
              <span className="ax-column-bar" style={{ height: `calc((100% - 22px) * ${counts[index] / max})`, background: ORDINAL[index] }} />
            </span>
            <span className="ax-column-label">{label}</span>
          </div>
        ))}
      </div>
      <FloatingTip tip={tip} />
    </div>
  );
}

function Locations({ rows, selected, onSelect }) {
  const [showAll, setShowAll] = useState(false);
  if (!rows.length) return <p className="ax-empty">No complaints in this period.</p>;
  const max = Math.max(1, ...rows.map((row) => row.count));
  const shown = showAll ? rows : rows.slice(0, 8);
  return (
    <div className="ax-locations">
      <div className="ax-table-wrap">
      <table className="ax-table ax-loc-table">
        <thead><tr><th>Location</th><th>Complaints</th><th className="is-num">Refunds paid</th><th className="is-num">Resolved</th><th className="is-num">Last complaint</th></tr></thead>
        <tbody>
          {shown.map((row) => (
            <tr key={row.key} className={selected === row.key ? "is-selected" : ""}>
              <td>
                <button type="button" className="ax-loc-name" onClick={() => onSelect(selected === row.key ? null : row.key)} title={selected === row.key ? "Clear this filter" : "Show only this location"}>
                  {row.name}
                </button>
              </td>
              <td>
                <span className="ax-loc-bar">
                  <i style={{ width: `calc((100% - 40px) * ${row.count / max})` }} />
                  <b>{formatInt(row.count)}</b>
                </span>
              </td>
              <td className="is-num">{formatInr(row.refundPaid)}</td>
              <td className="is-num">{formatPct(row.resolved)}</td>
              <td className="is-num ax-muted">{relativeDays(row.last)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      {rows.length > 8 && <button type="button" className="ax-link" onClick={() => setShowAll((value) => !value)}>{showAll ? "Show top 8" : `Show all ${rows.length} locations`}</button>}
    </div>
  );
}

/* Complaints per machine (machine ID read from the payment screenshot): today, this month and
   all time, whatever period the page shows. */
function Machines({ headers }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [sort, setSort] = useState("month");
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  useEffect(() => {
    let alive = true;
    API.get("/analytics/machines", { headers }).then((response) => alive && setData(response.data)).catch(() => alive && setError("Could not load machines"));
    return () => { alive = false; };
  }, [headers]);
  if (error) return <p className="ax-empty">{error}</p>;
  if (!data) return <p className="ax-empty">Loading…</p>;
  const q = query.trim().toLowerCase();
  const rows = data.machines
    .filter((row) => !q || `${row.code} ${row.location || ""}`.toLowerCase().includes(q))
    .sort((a, b) => b[sort] - a[sort] || b.all_time - a.all_time);
  const total = (key) => data.machines.reduce((sum, row) => sum + row[key], 0);
  const max = Math.max(1, ...rows.map((row) => row.all_time));
  const shown = showAll || q ? rows : rows.slice(0, 10);
  const label = { today: "Today", month: "This month", all_time: "All time" };
  return (
    <div className="ax-machines">
      <div className="ax-machine-stats">
        {[["today", "Today"], ["month", "This month"], ["all_time", "All time"]].map(([key, title]) => (
          <button type="button" key={key} className={sort === key ? "on" : ""} onClick={() => setSort(key)}>
            <span>{title}</span>
            <b>{formatInt(total(key))}</b>
            <small>{data.machines.filter((row) => row[key] > 0).length} machine{data.machines.filter((row) => row[key] > 0).length === 1 ? "" : "s"} with complaints</small>
          </button>
        ))}
      </div>
      <div className="ax-machine-tools">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search machine ID or location" aria-label="Search machines" />
        <span className="ax-muted">Sorted by {label[sort].toLowerCase()} · {data.machine_count} machines in the list</span>
      </div>
      {!rows.length ? <p className="ax-empty">{data.machines.length ? "Nothing matches." : "No machine IDs read from payment screenshots yet."}</p> : (
        <div className="ax-table-wrap">
          <table className="ax-table ax-loc-table">
            <thead><tr><th>Machine ID</th><th>Location</th><th className="is-num">Today</th><th className="is-num">This month</th><th>All time</th><th className="is-num">Refunded</th><th>Most common issue</th><th className="is-num">Last complaint</th></tr></thead>
            <tbody>
              {shown.map((row) => (
                <tr key={row.code}>
                  <td><b className={row.location ? "ax-machine-code" : "ax-machine-code is-unknown"}>{row.code.toUpperCase()}</b></td>
                  <td title={row.address || ""}>{row.location || <span className="ax-muted">Not in machine list</span>}</td>
                  <td className={`is-num ${sort === "today" ? "is-sorted" : ""}`}>{row.today || <span className="ax-muted">0</span>}</td>
                  <td className={`is-num ${sort === "month" ? "is-sorted" : ""}`}>{row.month || <span className="ax-muted">0</span>}</td>
                  <td>
                    <span className="ax-loc-bar">
                      <i style={{ width: `calc((100% - 40px) * ${row.all_time / max})` }} />
                      <b>{formatInt(row.all_time)}</b>
                    </span>
                  </td>
                  <td className="is-num">{formatInt(row.refunded)}</td>
                  <td>{row.top_issue || <span className="ax-muted">—</span>}</td>
                  <td className="is-num ax-muted">{relativeDays(row.last_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!q && rows.length > 10 && <button type="button" className="ax-link" onClick={() => setShowAll((value) => !value)}>{showAll ? "Show top 10" : `Show all ${rows.length} machines`}</button>}
    </div>
  );
}

/* ---------- Page ---------- */

export default function AnalyticsWorkspace({ token }) {
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);
  const [preset, setPreset] = useState("30d");
  const [issue, setIssue] = useState("ALL");
  const [location, setLocation] = useState(null);
  const [compare, setCompare] = useState(true);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const range = presetRange(preset, istDay(new Date().toISOString()));
      const response = await API.get("/analytics/overview", { headers, params: { ...(range.from ? { from: range.from } : {}), to: range.to, ...(preset === "all" ? { all: "1" } : {}) } });
      setData(response.data);
      setError("");
    } catch (err) {
      setError(err.response?.data?.error || "Could not load analytics");
    } finally {
      setLoading(false);
    }
  }, [headers, preset]);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    const refresh = setInterval(load, 5 * 60 * 1000);
    return () => { clearTimeout(timer); clearInterval(refresh); };
  }, [load]);

  const view = useMemo(() => {
    if (!data) return null;
    const { range, previous } = data;
    const granularity = granularityFor(range.days);
    const keys = bucketKeys(range.from, range.to, granularity);
    const previousKeys = previous ? bucketKeys(previous.from, previous.to, granularity) : [];
    const filtered = Boolean(location) || issue !== "ALL";
    const keep = (ticket) => !filtered || (isComplaint(ticket) && (issue === "ALL" || issueOf(ticket) === issue) && (!location || locationKey(siteOf(ticket)) === location));
    const tickets = data.tickets.filter(keep);
    const previousTickets = (data.previousTickets || []).filter(keep);
    const ids = new Set(tickets.map((ticket) => ticket.id));
    const previousIds = new Set(previousTickets.map((ticket) => ticket.id));
    const feedback = filtered ? data.feedback.filter((row) => ids.has(row.ticket_id)) : data.feedback;
    const previousFeedback = filtered ? (data.previousFeedback || []).filter((row) => previousIds.has(row.ticket_id)) : data.previousFeedback || [];
    const complaints = tickets.filter(isComplaint);
    const previousComplaints = previousTickets.filter(isComplaint);

    const summary = summarize(tickets, feedback);
    const previousSummary = previous ? summarize(previousTickets, previousFeedback) : null;
    const buckets = summarizeByBucket(tickets, feedback, keys, granularity);
    const previousBuckets = previous ? summarizeByBucket(previousTickets, previousFeedback, previousKeys, granularity) : [];

    // The bucket holding today is still filling up; say so instead of letting it look like a drop.
    const titleOf = (key) => `${granularity === "week" ? `Week of ${bucketLabel(key, granularity)}` : bucketLabel(key, granularity)}${key === bucketKey(data.today, granularity) ? " (so far)" : ""}`;
    const volumeRows = keys.map((key, index) => ({
      label: bucketLabel(key, granularity),
      title: titleOf(key),
      complaints: buckets[index].complaints,
      previous: previousBuckets[index] ? previousBuckets[index].complaints : null,
      prevTitle: previousKeys[index] ? bucketLabel(previousKeys[index], granularity) : null,
      refundPaid: buckets[index].refundPaid,
      refunds: buckets[index].refunds,
    }));

    const statusCounts = {};
    for (const ticket of complaints) statusCounts[statusGroup(ticket)] = (statusCounts[statusGroup(ticket)] || 0) + 1;

    const issueCounts = (list) => {
      const counts = Object.fromEntries([...ISSUES, OTHER_ISSUE].map((name) => [name, 0]));
      for (const ticket of list) counts[issueOf(ticket)] += 1;
      return counts;
    };
    // Issues are ranked on the unfiltered complaints so clicking one keeps the others visible (grayed).
    const allComplaints = data.tickets.filter(isComplaint).filter((ticket) => !location || locationKey(siteOf(ticket)) === location);
    const currentIssues = issueCounts(allComplaints);
    const previousIssues = issueCounts((data.previousTickets || []).filter(isComplaint).filter((ticket) => !location || locationKey(siteOf(ticket)) === location));
    const issueRows = [...ISSUES, OTHER_ISSUE]
      .map((name) => ({ issue: name, count: currentIssues[name], previous: previous ? previousIssues[name] : null }))
      .filter((row) => row.count || ISSUES.includes(row.issue))
      .sort((a, b) => b.count - a.count);

    const mixSeries = [...ISSUES.map((name) => ({ key: name, color: ISSUE_COLOR[name] })), { key: OTHER_ISSUE, color: CHROME.other }]
      .filter((item) => complaints.some((ticket) => issueOf(ticket) === item.key));
    const mixRows = keys.map((key) => ({ key, label: bucketLabel(key, granularity), title: titleOf(key), total: 0, ...Object.fromEntries(mixSeries.map((item) => [item.key, 0])) }));
    const mixIndex = new Map(keys.map((key, index) => [key, index]));
    for (const ticket of complaints) {
      const row = mixRows[mixIndex.get(bucketKey(istDay(ticket.created_at), granularity))];
      if (row && row[issueOf(ticket)] !== undefined) { row[issueOf(ticket)] += 1; row.total += 1; }
    }

    const heat = Array.from({ length: 7 }, () => Array(24).fill(0));
    for (const ticket of complaints) heat[istWeekday(ticket.created_at)][istHour(ticket.created_at)] += 1;

    const ratingCounts = [0, 0, 0, 0, 0];
    for (const row of feedback) { const rating = Math.round(Number(row.rating)); if (rating >= 1 && rating <= 5) ratingCounts[rating - 1] += 1; }

    const finishedHours = complaints.filter((ticket) => ["refunded", "auto_refunded", "resolved"].includes(statusGroup(ticket))).map(hoursToResolve).filter((hours) => hours !== null);
    const speedCounts = SPEED_BUCKETS.map(([, low, high]) => finishedHours.filter((hours) => hours >= low && hours < high).length);

    const byLocation = new Map();
    for (const ticket of data.tickets.filter(isComplaint).filter((row) => issue === "ALL" || issueOf(row) === issue)) {
      const key = locationKey(siteOf(ticket)) || "__none";
      const entry = byLocation.get(key) || { key, names: new Map(), count: 0, refundPaid: 0, finished: 0, abandoned: 0, last: ticket.created_at };
      const name = siteOf(ticket) || "No location given";
      entry.names.set(name, (entry.names.get(name) || 0) + 1);
      entry.count += 1;
      if (ticket.status === "refunded") entry.refundPaid += Number(ticket.refund_amount) || 0;
      const group = statusGroup(ticket);
      if (["refunded", "auto_refunded", "resolved"].includes(group)) entry.finished += 1;
      if (group === "abandoned") entry.abandoned += 1;
      if (new Date(ticket.created_at) > new Date(entry.last)) entry.last = ticket.created_at;
      byLocation.set(key, entry);
    }
    const locationRows = [...byLocation.values()]
      .map((entry) => ({
        key: entry.key === "__none" ? "" : entry.key,
        name: [...entry.names.entries()].sort((a, b) => b[1] - a[1])[0][0],
        count: entry.count,
        refundPaid: entry.refundPaid,
        resolved: entry.count - entry.abandoned ? entry.finished / (entry.count - entry.abandoned) : null,
        last: entry.last,
      }))
      .sort((a, b) => b.count - a.count || b.refundPaid - a.refundPaid);

    return {
      range, previous, granularity, summary, previousSummary, buckets, volumeRows, statusCounts, complaints,
      previousComplaints, issueRows, mixSeries, mixRows, heat, ratingCounts, finishedHours, speedCounts, locationRows,
      within24: finishedHours.length ? finishedHours.filter((hours) => hours < 24).length / finishedHours.length : null,
      filtered,
      heroPeak: volumeRows.reduce((best, row) => (row.refundPaid > (best?.refundPaid || 0) ? row : best), null),
    };
  }, [data, issue, location]);

  const today = data?.today || istDay(new Date().toISOString());
  const rangeLabel = view ? (view.range.from === view.range.to ? shortDate(view.range.from) : `${shortDate(view.range.from)} – ${shortDate(view.range.to)}${view.range.from.slice(0, 4) !== today.slice(0, 4) ? ` ${view.range.from.slice(0, 4)}` : ""}`) : "";
  const showCompare = compare && Boolean(view?.previous);
  const compareLabel = showCompare ? ` vs previous ${view.range.days === 1 ? "day" : `${view.range.days} days`}` : "";
  const locationName = location !== null && view ? view.locationRows.find((row) => row.key === location)?.name || location : null;

  const exportCsv = () => {
    if (!view) return;
    const cell = (value) => { const text = String(value ?? ""); return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; };
    const lines = [["Ticket", "Created (IST)", "Issue", "Site", "Location typed by customer", "Status", "Refund paid (₹)", "Hours to resolve"]]
      .concat(view.complaints.map((ticket) => [
        ticket.id,
        new Date(ticket.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
        ticket.sub_issue || ticket.main_issue || "",
        siteOf(ticket),
        ticket.location || "",
        STATUS_GROUPS.find((group) => group.key === statusGroup(ticket))?.label,
        ticket.status === "refunded" ? Number(ticket.refund_amount) || 0 : "",
        hoursToResolve(ticket) === null ? "" : hoursToResolve(ticket).toFixed(1),
      ]))
      .map((line) => line.map(cell).join(","));
    const blob = new Blob([`\uFEFF${lines.join("\n")}`], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Snackit_Complaints_${view.range.from}_to_${view.range.to}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const s = view?.summary;
  const p = view?.previousSummary;
  const spark = (metric) => (view ? view.buckets.map((bucket) => bucket[metric]) : []);

  // A few plain-language findings for the period.
  const insights = [];
  if (view && s.complaints) {
    if (showCompare && p) {
      const moved = change(s.complaints, p.complaints, "count");
      if (moved && moved.text !== "new") insights.push({ icon: moved.diff > 0 ? "▲" : moved.diff < 0 ? "▼" : "■", text: <>Complaints <b>{moved.diff > 0 ? "up" : moved.diff < 0 ? "down" : "flat"} {moved.text.replace(/^[+−]/, "")}</b>{compareLabel} ({formatInt(s.complaints)} vs {formatInt(p.complaints)})</> });
    }
    const top = view.issueRows[0];
    if (top?.count && issue === "ALL") insights.push({ icon: "◆", text: <><b>{top.issue}</b> is {formatPct(top.count / s.complaints)} of complaints</> });
    const topLocation = view.locationRows[0];
    if (topLocation && !location) insights.push({ icon: "📍", text: <><b>{topLocation.name}</b> had the most complaints ({formatInt(topLocation.count)})</> });
    if (s.unfinished && !view.filtered) insights.push({ icon: "↩", text: <><b>{formatInt(s.unfinished)}</b> chat{s.unfinished === 1 ? "" : "s"} started but didn't pick an issue (not counted as complaints)</> });
    if (s.waiting) insights.push({ icon: "⏳", text: <><b>{formatInt(s.waiting)}</b> complaint{s.waiting === 1 ? " is" : "s are"} waiting for the team</> });
  }

  return (
    <div className={`ax ${loading && data ? "is-refreshing" : ""}`}>
      <div className="ax-filters">
        <div className="ax-presets" role="group" aria-label="Period">
          {PRESETS.map(([key, label]) => <button type="button" key={key} className={preset === key ? "on" : ""} onClick={() => setPreset(key)}>{label}</button>)}
        </div>
        <select value={issue} onChange={(event) => setIssue(event.target.value)} aria-label="Issue">
          <option value="ALL">All issues</option>
          {[...ISSUES, OTHER_ISSUE].map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
        {locationName !== null && <button type="button" className="ax-chip" onClick={() => setLocation(null)}>📍 {locationName} <span aria-hidden="true">✕</span></button>}
        <label className="ax-compare"><input type="checkbox" checked={compare} onChange={(event) => setCompare(event.target.checked)} disabled={preset === "all"} /> Compare with previous period</label>
        <span className="ax-filters-right">
          <button type="button" className="ax-btn" onClick={load} disabled={loading} title={data ? `Updated ${new Date(data.generatedAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}` : ""}>{loading ? "Loading…" : "Refresh"}</button>
          <button type="button" className="ax-btn" onClick={exportCsv} disabled={!view?.complaints.length}>Export CSV</button>
        </span>
      </div>

      {error && <div className="ea-error">{error} <button type="button" className="ax-link" onClick={load}>Try again</button></div>}
      {!view && !error && <div className="ax-card ax-loading">Loading analytics…</div>}

      {view && (
        <>
          {insights.length > 0 && (
            <div className="ax-insights">
              {insights.map((item, index) => <span key={index} className="ax-insight"><i aria-hidden="true">{item.icon}</i><span>{item.text}</span></span>)}
            </div>
          )}

          <section className="ax-hero">
            <div className="ax-hero-copy">
              <span className="ax-eyebrow">Refunds paid · {rangeLabel}</span>
              <div className="ax-hero-figure">{formatInr(s.refundPaid)}</div>
              {showCompare ? <Delta value={change(s.refundPaid, p.refundPaid, "money")} goodWhen="neutral" suffix={compareLabel} /> : null}
              <p className="ax-hero-sub">
                <span><b>{formatInt(s.refunds)}</b> refund{s.refunds === 1 ? "" : "s"}</span>
                <span>avg <b>{s.avgRefund === null ? "—" : formatInr(s.avgRefund)}</b></span>
                <span><b>{formatInt(s.autoRefunded)}</b> auto-refunded by bank</span>
                <span><b>{formatInt(s.waiting)}</b> waiting for the team</span>
              </p>
            </div>
            <div className="ax-hero-chart">
              <ResponsiveContainer width="100%" height={130}>
                <AreaChart data={view.volumeRows} margin={{ top: 26, right: 40, left: 40, bottom: 0 }}>
                  <XAxis dataKey="label" hide />
                  <YAxis hide domain={[0, "dataMax"]} />
                  <Tooltip cursor={{ stroke: CHROME.baseline, strokeWidth: 1 }} content={<ChartTip titleFor={(row) => row.title} format={(value, item) => `${formatInr(value)} · ${item.payload.refunds} refund${item.payload.refunds === 1 ? "" : "s"}`} />} />
                  <Area type="monotoneX" dataKey="refundPaid" name="Refunds paid" stroke={SLOT[0]} strokeWidth={2} fill={SLOT[0]} fillOpacity={0.1} dot={false} activeDot={{ r: 5, fill: SLOT[0], stroke: CHROME.surface, strokeWidth: 2 }} isAnimationActive={false} />
                  {view.heroPeak && (
                    <ReferenceDot x={view.heroPeak.label} y={view.heroPeak.refundPaid} r={4} fill={SLOT[0]} stroke={CHROME.surface} strokeWidth={2} ifOverflow="visible"
                      label={{ value: `Peak ${formatInr(view.heroPeak.refundPaid)} · ${view.heroPeak.label}`, position: "top", fill: CHROME.secondary, fontSize: 11, fontWeight: 600, offset: 10 }} />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>

          <div className="ax-tiles">
            <StatTile label="Complaints" value={formatInt(s.complaints)} delta={p && change(s.complaints, p.complaints, "count")} goodWhen="down" compareLabel={compareLabel} sub={view.filtered ? `Filtered: ${[issue !== "ALL" ? issue : null, locationName].filter(Boolean).join(" · ")}` : `${formatInt(s.unfinished)} started but didn't pick an issue`} spark={spark("complaints")} />
            <StatTile label="Resolved" value={formatPct(s.resolutionRate)} delta={p && change(s.resolutionRate, p.resolutionRate, "rate")} goodWhen="up" compareLabel={compareLabel} sub="of complaints (abandoned left out)" spark={spark("resolutionRate")} />
            <StatTile label="Median time to resolve" value={formatHours(s.medianHours)} delta={p && change(s.medianHours, p.medianHours, "hours")} goodWhen="down" compareLabel={compareLabel} sub="from complaint to refund or fix" spark={spark("medianHours")} />
            <StatTile label="Abandoned" value={formatPct(s.abandonRate)} delta={p && change(s.abandonRate, p.abandonRate, "rate")} goodWhen="down" compareLabel={compareLabel} sub="customers who stopped half-way" spark={spark("abandonRate")} />
            <StatTile label="Customer rating" value={s.avgRating === null ? "—" : `${s.avgRating.toFixed(1)} ★`} delta={p && change(s.avgRating, p.avgRating, "rating")} goodWhen="up" compareLabel={compareLabel} sub={`${formatInt(s.ratingCount)} rating${s.ratingCount === 1 ? "" : "s"}`} spark={spark("avgRating")} />
          </div>

          <div className="ax-grid">
            <ChartCard
              span={8}
              title="Complaints and refunds over time"
              subtitle={`${view.granularity === "day" ? "Daily" : view.granularity === "week" ? "Weekly (weeks start Monday)" : "Monthly"} · India time`}
              legend={<Legend items={[{ label: "This period", color: SLOT[0], line: true, value: formatInt(s.complaints) }, ...(showCompare ? [{ label: "Previous period", color: CHROME.muted, line: true, value: formatInt(p.complaints) }] : [])]} />}
              table={{
                columns: [{ key: "title", label: view.granularity === "week" ? "Week of" : "Period" }, { key: "complaints", label: "Complaints", numeric: true, format: formatInt }, ...(showCompare ? [{ key: "previous", label: "Previous period", numeric: true, format: (value, row) => (value === null ? "—" : `${formatInt(value)} (${row.prevTitle})`) }] : []), { key: "refunds", label: "Refunds", numeric: true, format: formatInt }, { key: "refundPaid", label: "Refunds paid", numeric: true, format: formatInr }],
                rows: view.volumeRows,
              }}
            >
              <VolumeCharts rows={view.volumeRows} compare={showCompare} granularity={view.granularity} />
            </ChartCard>

            <ChartCard
              span={4}
              title="Where complaints stand"
              subtitle="Status of this period's complaints"
              table={{ columns: [{ key: "label", label: "Status" }, { key: "count", label: "Complaints", numeric: true, format: formatInt }, { key: "share", label: "Share", numeric: true, format: formatPct }], rows: STATUS_GROUPS.map((group) => ({ id: group.key, label: group.label, count: view.statusCounts[group.key] || 0, share: view.complaints.length ? (view.statusCounts[group.key] || 0) / view.complaints.length : 0 })) }}
            >
              <StatusBreakdown counts={view.statusCounts} total={view.complaints.length} />
            </ChartCard>

            <ChartCard
              span={5}
              title="What customers report"
              subtitle="Click an issue to filter the whole page"
              table={{ columns: [{ key: "issue", label: "Issue" }, { key: "count", label: "Complaints", numeric: true, format: formatInt }, ...(showCompare ? [{ key: "previous", label: "Previous period", numeric: true, format: (value) => (value === null ? "—" : formatInt(value)) }] : [])], rows: view.issueRows.map((row) => ({ ...row, id: row.issue })) }}
            >
              <IssueBars rows={view.issueRows} selected={issue} onSelect={setIssue} compare={showCompare} />
            </ChartCard>

            <ChartCard
              span={7}
              title="Issue mix over time"
              subtitle="Complaints by type"
              legend={<Legend items={view.mixSeries.map((item) => ({ label: item.key, color: item.color, value: formatInt(view.mixRows.reduce((sum, row) => sum + row[item.key], 0)) }))} />}
              table={{ columns: [{ key: "title", label: view.granularity === "week" ? "Week of" : "Period" }, ...view.mixSeries.map((item) => ({ key: item.key, label: item.key, numeric: true, format: formatInt })), { key: "total", label: "Total", numeric: true, format: formatInt }], rows: view.mixRows.map((row) => ({ ...row, id: row.key })) }}
            >
              {view.complaints.length ? <IssueMix rows={view.mixRows} series={view.mixSeries} /> : <p className="ax-empty">No complaints in this period.</p>}
            </ChartCard>

            <ChartCard
              span={8}
              title="When problems happen"
              subtitle="Complaints by weekday and hour (India time) · darker = more"
              table={{ columns: [{ key: "day", label: "Day" }, ...Array.from({ length: 24 }, (_, hour) => ({ key: `h${hour}`, label: formatHour(hour), numeric: true }))], rows: view.heat.map((row, day) => ({ id: day, day: WEEKDAYS[day], ...Object.fromEntries(row.map((count, hour) => [`h${hour}`, count])) })) }}
            >
              <Heatmap grid={view.heat} />
            </ChartCard>

            <ChartCard
              span={4}
              title="Customer rating"
              subtitle="Ratings given after a refund or fix"
              table={{ columns: [{ key: "stars", label: "Rating" }, { key: "count", label: "Customers", numeric: true, format: formatInt }], rows: [5, 4, 3, 2, 1].map((stars) => ({ id: stars, stars: `${stars} ★`, count: view.ratingCounts[stars - 1] })) }}
            >
              <Ratings counts={view.ratingCounts} average={s.avgRating || 0} total={s.ratingCount} previousAverage={p?.avgRating ?? null} compare={showCompare} compareLabel={compareLabel} />
            </ChartCard>

            <ChartCard span={12} title="Complaints by machine" subtitle="Machine ID read from the customer's payment screenshot · today, this month and all time (not limited to the period above)">
              <Machines headers={headers} />
            </ChartCard>

            <ChartCard span={7} title="Top problem locations" subtitle="Click a location to filter the whole page">
              <Locations rows={view.locationRows} selected={location} onSelect={setLocation} />
            </ChartCard>

            <ChartCard
              span={5}
              title="How fast complaints are resolved"
              subtitle="Time from complaint to refund or fix"
              table={{ columns: [{ key: "label", label: "Resolved in" }, { key: "count", label: "Complaints", numeric: true, format: formatInt }], rows: SPEED_BUCKETS.map(([label], index) => ({ id: label, label, count: view.speedCounts[index] })) }}
            >
              <ResolutionSpeed counts={view.speedCounts} median={s.medianHours} within24={view.within24} />
            </ChartCard>
          </div>
          <p className="ax-footnote">
            {rangeLabel} · India time · updated {new Date(data.generatedAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}. Complaints are refund requests raised through the WhatsApp bot. "Refunds paid" counts tickets marked Refunded; auto-refunds were returned by the bank.
            {daysBetween(view.range.from, view.range.to) > 400 ? " Long periods are grouped by month." : ""}
          </p>
        </>
      )}
    </div>
  );
}
