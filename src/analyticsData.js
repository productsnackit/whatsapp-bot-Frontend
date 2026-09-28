/* Numbers behind the Analytics page. Everything is grouped in India time (IST). */

// Chart colours: the validated reference palette (see the dataviz method), checked
// against the dashboard's white card surface. Slots are used in this fixed order.
export const SLOT = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];
// Ordinal blue (steps 250 → 650) for ordered buckets such as star ratings.
export const ORDINAL = ["#86b6ef", "#5598e7", "#2a78d6", "#1c5cab", "#104281"];
// Sequential blue (steps 100 → 700) for magnitude; empty cells use the neutral gray.
export const SEQUENTIAL = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"];
export const NEUTRAL = "#f0efec";
export const CHROME = { grid: "#e1e0d9", baseline: "#c3c2b7", muted: "#898781", secondary: "#52514e", primary: "#0b0f1a", surface: "#ffffff", other: "#c3c2b7" };
export const DELTA_INK = { good: "#006300", bad: "#d03b3b", neutral: "#52514e" };

// The four complaint types the bot offers; each keeps its colour whatever the filter.
export const ISSUES = ["Product Not Dispensed", "Product Issue", "Charged Higher MRP", "Received Damaged Product"];
export const ISSUE_COLOR = Object.fromEntries(ISSUES.map((issue, index) => [issue, SLOT[index]]));
export const OTHER_ISSUE = "Other";

// Where a complaint stands. Order and colour are fixed so a status never changes colour
// (ordered so that no unfinished or bad state lands on the green slot).
export const STATUS_GROUPS = [
  { key: "refunded", label: "Refunded", help: "Refund paid by the team" },
  { key: "auto_refunded", label: "Auto-refunded", help: "Bank returned the money by itself" },
  { key: "resolved", label: "Resolved / closed", help: "Solved without a refund, or closed" },
  { key: "review", label: "Waiting for team", help: "Customer finished; the team hasn't acted yet" },
  { key: "abandoned", label: "Abandoned", help: "Customer stopped half-way and it auto-closed" },
  { key: "customer", label: "With customer", help: "Customer is still going through the bot" },
].map((group, index) => ({ ...group, color: SLOT[index] }));
const FINISHED = new Set(["refunded", "auto_refunded", "resolved"]);

const IST = "Asia/Kolkata";
const dayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: IST, year: "numeric", month: "2-digit", day: "2-digit" });
const hourFormat = new Intl.DateTimeFormat("en-GB", { timeZone: IST, hour: "2-digit", hourCycle: "h23" });
const weekdayFormat = new Intl.DateTimeFormat("en-US", { timeZone: IST, weekday: "short" });
export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const istDay = (iso) => dayFormat.format(new Date(iso));
export const istHour = (iso) => Number(hourFormat.format(new Date(iso))) % 24;
export const istWeekday = (iso) => WEEKDAYS.indexOf(weekdayFormat.format(new Date(iso)));

export function addDays(dateStr, days) {
  const date = new Date(`${dateStr}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function daysBetween(a, b) {
  return Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000);
}

export const isComplaint = (ticket) => String(ticket.category || "").toUpperCase() === "REFUND";
export const issueOf = (ticket) => (ISSUES.includes(ticket.sub_issue) ? ticket.sub_issue : OTHER_ISSUE);

export function statusGroup(ticket) {
  const status = ticket.status;
  if (status === "refunded") return "refunded";
  if (status === "auto_refunded") return "auto_refunded";
  if (status === "resolved" || status === "closed") return "resolved";
  if (status === "auto_closed") return "abandoned";
  if (String(ticket.state || "").toUpperCase() === "DONE" || status === "processing" || ticket.takeover) return "review";
  return "customer";
}

export function hoursToResolve(ticket) {
  if (!ticket.resolved_at) return null;
  const hours = (new Date(ticket.resolved_at) - new Date(ticket.created_at)) / 3600000;
  return hours >= 0 ? hours : null;
}

// The site the backend matched from what the customer typed (siteMatcher.js); text that
// matched none of our sites is counted together as "Not matched".
export const NOT_MATCHED = "Not matched";
export function siteOf(ticket) {
  if (ticket.site_name) return ticket.site_name;
  return String(ticket.location || "").trim() ? NOT_MATCHED : "";
}

// Customers type locations freely; "amagi ", "Amagi" and "AMAGI" are one place.
export function locationKey(location) {
  return String(location || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/* ---------- Time buckets ---------- */

export function granularityFor(days) {
  if (days <= 31) return "day";
  if (days <= 180) return "week";
  return "month";
}

function mondayOf(dateStr) {
  const date = new Date(`${dateStr}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}

export function bucketKey(dayStr, granularity) {
  if (granularity === "week") return mondayOf(dayStr);
  if (granularity === "month") return dayStr.slice(0, 7);
  return dayStr;
}

export function bucketKeys(from, to, granularity) {
  const keys = [];
  for (let day = from; day <= to; day = addDays(day, 1)) {
    const key = bucketKey(day, granularity);
    if (keys[keys.length - 1] !== key) keys.push(key);
  }
  return keys;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function bucketLabel(key, granularity) {
  const [year, month, day] = key.split("-").map(Number);
  if (granularity === "month") return `${MONTHS[month - 1]} ${String(year).slice(2)}`;
  return `${day} ${MONTHS[month - 1]}`;
}

/* ---------- Summaries ---------- */

export function summarize(tickets, feedback) {
  const complaints = tickets.filter(isComplaint);
  const refunds = complaints.filter((ticket) => ticket.status === "refunded");
  const refundPaid = refunds.reduce((sum, ticket) => sum + (Number(ticket.refund_amount) || 0), 0);
  const groups = complaints.map(statusGroup);
  const finished = groups.filter((group) => FINISHED.has(group)).length;
  const abandoned = groups.filter((group) => group === "abandoned").length;
  const considered = complaints.length - abandoned;
  const times = complaints.filter((ticket) => FINISHED.has(statusGroup(ticket))).map(hoursToResolve).filter((hours) => hours !== null);
  const ratings = feedback.map((row) => Number(row.rating)).filter((rating) => rating >= 1 && rating <= 5);
  return {
    complaints: complaints.length,
    conversations: tickets.length,
    refunds: refunds.length,
    refundPaid,
    avgRefund: refunds.length ? refundPaid / refunds.length : null,
    autoRefunded: groups.filter((group) => group === "auto_refunded").length,
    waiting: groups.filter((group) => group === "review").length,
    resolutionRate: considered ? finished / considered : null,
    medianHours: median(times),
    abandonRate: complaints.length ? abandoned / complaints.length : null,
    avgRating: ratings.length ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length : null,
    ratingCount: ratings.length,
  };
}

// The same summary for every bucket in the period (sparklines and trend charts).
export function summarizeByBucket(tickets, feedback, keys, granularity) {
  const ticketsBy = new Map(keys.map((key) => [key, []]));
  const feedbackBy = new Map(keys.map((key) => [key, []]));
  for (const ticket of tickets) ticketsBy.get(bucketKey(istDay(ticket.created_at), granularity))?.push(ticket);
  for (const row of feedback) feedbackBy.get(bucketKey(istDay(row.created_at), granularity))?.push(row);
  return keys.map((key) => ({ key, ...summarize(ticketsBy.get(key), feedbackBy.get(key)) }));
}

/* ---------- Change vs the previous period ---------- */

// kind: count | money | hours → percentage change; rate → percentage points; rating → stars.
export function change(current, previous, kind) {
  if (current === null || current === undefined || previous === null || previous === undefined) return null;
  const diff = current - previous;
  if (kind === "rate") return { diff, text: `${diff >= 0 ? "+" : "−"}${Math.abs(Math.round(diff * 100))} pts` };
  if (kind === "rating") return { diff, text: `${diff >= 0 ? "+" : "−"}${Math.abs(diff).toFixed(1)}` };
  if (previous === 0) return current === 0 ? { diff: 0, text: "0%" } : { diff, text: "new" };
  const percent = Math.round((diff / previous) * 100);
  return { diff, text: `${percent >= 0 ? "+" : "−"}${Math.abs(percent)}%` };
}

/* ---------- Formatting ---------- */

export const formatInt = (value) => Math.round(value || 0).toLocaleString("en-IN");
export const formatInr = (value) => `₹${Math.round(value || 0).toLocaleString("en-IN")}`;
export const formatPct = (ratio) => (ratio === null || ratio === undefined ? "—" : `${Math.round(ratio * 100)}%`);
export function formatHours(hours) {
  if (hours === null || hours === undefined) return "—";
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 48) return `${hours < 10 ? hours.toFixed(1) : Math.round(hours)} h`;
  return `${(hours / 24).toFixed(1)} days`;
}
export function formatHour(hour) {
  const suffix = hour < 12 ? "am" : "pm";
  return `${((hour + 11) % 12) + 1}${suffix}`;
}
