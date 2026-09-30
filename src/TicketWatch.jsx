import { useEffect, useState } from "react";
import { waitInfo, waitLabel, needsRefundCheck, HOUR } from "./ticketWatchData.js";

/* Reply timers, refund checks and customer history for the Tickets page
   (worked out by the backend's ticketWatch.js). */

const checkLevel = (ticket) => ((ticket.refund_checks || []).some((check) => check.level === "high") ? "high" : "warn");

export function WaitBadge({ ticket, hours, now }) {
  const wait = waitInfo(ticket, hours, now);
  if (!wait) return null;
  const title = wait.level === "overdue"
    ? `Overdue: waiting ${wait.label} for a reply (limit ${hours.sla_overdue_hours}h)`
    : `Waiting ${wait.label} for a reply from the team`;
  return <span className={`tw-wait is-${wait.level}`} title={title}>⏱ {wait.label}</span>;
}

export function RiskBadge({ ticket, onOpen }) {
  const checks = ticket.refund_checks || [];
  if (!checks.length) return null;
  const level = checkLevel(ticket);
  return (
    <button type="button" className={`tw-risk is-${level}`} onClick={onOpen} title={checks.map((check) => `⚠ ${check.text}`).join("\n")}>
      ⚠ {level === "high" ? "Possible repeat" : checks.length === 1 ? "1 check" : `${checks.length} checks`}
    </button>
  );
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

// The strip above the tickets table: overdue, waiting, refund checks, typical first reply.
export function WatchStrip({ tickets, hours, now, filter, onFilter }) {
  const waits = tickets.map((ticket) => waitInfo(ticket, hours, now)).filter(Boolean);
  const overdue = waits.filter((wait) => wait.level === "overdue").length;
  const flagged = tickets.filter(needsRefundCheck).length;
  const weekAgo = now - 7 * 24 * HOUR;
  const firstReplies = tickets
    .filter((ticket) => ticket.first_response_at && new Date(ticket.created_at).getTime() >= weekAgo)
    .map((ticket) => new Date(ticket.first_response_at) - new Date(ticket.created_at))
    .filter((ms) => ms >= 0);
  const typical = median(firstReplies);
  const chip = (key, className, value, label, help) => (
    <button type="button" className={`tw-chip ${className} ${filter === key ? "is-on" : ""}`} onClick={() => onFilter(filter === key ? "" : key)} title={help}>
      <b>{value}</b><span>{label}</span>
    </button>
  );
  return (
    <div className="tw-strip">
      {chip("overdue", overdue ? "is-overdue" : "", overdue, "Overdue", `Waiting more than ${hours.sla_overdue_hours}h for a reply. Click to show them.`)}
      {chip("waiting", "", waits.length, "Waiting for reply", "Customer finished or replied, and the team hasn't answered yet. Click to show them.")}
      {chip("checks", flagged ? "is-flagged" : "", flagged, "Refund checks", "Open tickets that may be a repeat or false claim. Click to show them.")}
      <div className="tw-chip is-static" title="Middle value of the time from a ticket being raised to the team's first message, for tickets raised in the last 7 days.">
        <b>{typical == null ? "—" : waitLabel(typical)}</b><span>Typical first reply · 7 days</span>
      </div>
    </div>
  );
}

/* ---------- Customer history in the ticket chat ---------- */

const STATUS_LABEL = { refunded: "Refunded", auto_refunded: "Auto-refunded", resolved: "Resolved", closed: "Closed", auto_closed: "Abandoned" };
const inr = (value) => `₹${Math.round(Number(value) || 0).toLocaleString("en-IN")}`;
const shortDate = (value) => new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" });

export function CustomerHistory({ api, headers, ticketId, refreshKey }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const authorization = headers.Authorization;

  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
      setError("");
      api.get(`/tickets/${ticketId}/customer`, { headers: { Authorization: authorization } })
        .then((response) => { if (alive) setData({ ...response.data, forTicket: ticketId }); })
        .catch((err) => { if (alive) setError(err.response?.data?.error || "Could not load the customer's history"); });
    }, 0);
    return () => { alive = false; clearTimeout(timer); };
  }, [api, authorization, ticketId, refreshKey]);

  if (error) return <div className="tw-customer"><p className="tw-customer-error">{error}</p></div>;
  if (!data || data.forTicket !== ticketId) return <div className="tw-customer"><p className="tw-customer-loading">Loading customer history…</p></div>;
  const { totals, rating, top_location: place, checks } = data;
  const others = data.tickets.filter((ticket) => !ticket.current);
  const high = checks.some((check) => check.level === "high");
  const firstTime = totals.tickets <= 1;

  return (
    <div className={`tw-customer ${checks.length ? (high ? "is-high" : "is-warn") : ""}`}>
      <button type="button" className="tw-customer-head" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <span className="tw-customer-title">
          {firstTime ? "🆕 First-time customer" : `👤 Customer since ${shortDate(data.first_seen)}`}
          {checks.length > 0 && <em>⚠ {checks.length} refund check{checks.length === 1 ? "" : "s"}</em>}
        </span>
        <span className="tw-customer-toggle">{open ? "Hide" : "Details"}</span>
      </button>
      <div className="tw-customer-stats">
        <div><b>{totals.tickets}</b><span>ticket{totals.tickets === 1 ? "" : "s"}</span></div>
        <div className={totals.complaints_30_days >= 3 ? "is-warn" : ""}><b>{totals.complaints_30_days}</b><span>in 30 days</span></div>
        <div><b>{inr(totals.refunded_amount)}</b><span>{totals.refunds} refund{totals.refunds === 1 ? "" : "s"}</span></div>
        <div><b>{rating.average == null ? "—" : `★ ${rating.average.toFixed(1)}`}</b><span>{rating.count ? `${rating.count} rating${rating.count === 1 ? "" : "s"}` : "no rating"}</span></div>
      </div>
      {checks.length > 0 && (
        <ul className="tw-customer-checks">
          {checks.map((check) => <li key={check.text} className={`is-${check.level}`}>⚠ {check.text}</li>)}
        </ul>
      )}
      {open && (
        <div className="tw-customer-body">
          {place && <p className="tw-customer-place">📍 Usually at <b>{place.name}</b>{place.count > 1 ? ` (${place.count} tickets)` : ""}</p>}
          {rating.last?.comment && <p className="tw-customer-place">💬 Last feedback: “{rating.last.comment}” ({rating.last.rating}★)</p>}
          {others.length ? (
            <ul className="tw-customer-list">
              {others.slice(0, 12).map((ticket) => (
                <li key={ticket.id}>
                  <span className="tw-customer-id">#{ticket.id}</span>
                  <span className="tw-customer-what">
                    <b>{ticket.sub_issue || ticket.main_issue || ticket.category || "Conversation"}</b>
                    <small>{shortDate(ticket.created_at)}{ticket.location ? ` · ${ticket.location}` : ""}{ticket.upi_utr ? ` · UTR …${ticket.upi_utr.slice(-4)}` : ""}</small>
                  </span>
                  <span className={`tw-customer-status s-${ticket.status || "open"}`}>
                    {STATUS_LABEL[ticket.status] || "Open"}
                    {ticket.status === "refunded" && Number(ticket.refund_amount) > 0 ? ` ${inr(ticket.refund_amount)}` : ""}
                  </span>
                </li>
              ))}
              {others.length > 12 && <li className="tw-customer-more">…and {others.length - 12} older</li>}
            </ul>
          ) : <p className="tw-customer-place">No other tickets from this number.</p>}
        </div>
      )}
    </div>
  );
}

/* ---------- Admin Settings: ticket alerts ---------- */

export function TicketAlertsCard({ api, headers }) {
  const [saved, setSaved] = useState(null);
  const [draft, setDraft] = useState(null);
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);
  const authorization = headers.Authorization;

  useEffect(() => {
    let alive = true;
    api.get("/admin/ticket-alerts", { headers: { Authorization: authorization } })
      .then((response) => { if (alive) { setSaved(response.data); setDraft(response.data); } })
      .catch((err) => { if (alive) setMessage({ error: err.response?.data?.error || "Could not load ticket alert settings" }); });
    return () => { alive = false; };
  }, [api, authorization]);

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const response = await api.put("/admin/ticket-alerts", draft, { headers: { Authorization: authorization } });
      setSaved(response.data);
      setDraft(response.data);
      setMessage({ ok: "Saved." });
    } catch (err) {
      setMessage({ error: err.response?.data?.error || "Could not save" });
    } finally {
      setBusy(false);
    }
  };

  const set = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  const changed = saved && draft && Object.keys(draft).some((key) => String(draft[key]) !== String(saved[key]));
  const number = (key, label, help, unit, props) => (
    <div className="pr-row">
      <div className="pr-label"><strong>{label}</strong><small>{help}</small></div>
      <div className="pr-control">
        <div className="pr-input">
          <input type="number" value={draft[key]} onChange={(event) => set(key, event.target.value)} aria-label={label} {...props} />
          <span>{unit}</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="admin-settings-card pr-card">
      <div className="admin-settings-card-heading">
        <div>
          <h3>Ticket alerts &amp; refund checks</h3>
          <p>Reply timers on the Tickets page, alerts when a customer waits too long, and when a refund claim looks like a repeat.</p>
        </div>
      </div>
      {!draft ? <p className="pr-note">{message?.error || "Loading…"}</p> : (
        <>
          <div className="pr-rows">
            {number("sla_warn_hours", "Amber after", "The timer turns amber when a customer has waited this long for a reply.", "hours", { min: 0.25, max: 168, step: 0.5 })}
            {number("sla_overdue_hours", "Overdue after", "The timer turns red and the alert is sent. 0 turns the alert off.", "hours", { min: 0, max: 168, step: 0.5 })}
            <div className="pr-row">
              <div className="pr-label">
                <strong>WhatsApp alert numbers</strong>
                <small>Managers who get a WhatsApp listing the overdue tickets. Separate numbers with commas. WhatsApp only delivers it if that number has messaged the Snackit bot in the last 24 hours.</small>
              </div>
              <div className="pr-control">
                <input className="tw-phones" value={draft.sla_alert_phones} onChange={(event) => set("sla_alert_phones", event.target.value)} placeholder="98XXXXXXXX, 99XXXXXXXX" aria-label="WhatsApp alert numbers" />
              </div>
            </div>
            <label className="pr-row tw-check-row">
              <div className="pr-label"><strong>Phone notification to the ticket team</strong><small>Everyone who can open Tickets and has notifications on gets the overdue alert.</small></div>
              <input type="checkbox" checked={Boolean(draft.sla_alert_push)} onChange={(event) => set("sla_alert_push", event.target.checked)} />
            </label>
            {number("fraud_claims_limit", "Complaints allowed per number", "More complaints than this from one phone number within the period below are flagged. 0 turns the check off.", "complaints", { min: 0, max: 50 })}
            {number("fraud_claims_days", "Complaint period", "The period for the complaint limit above.", "days", { min: 1, max: 365 })}
          </div>
          {message?.error && <div className="ea-error">{message.error}</div>}
          {message?.ok && <div className="acc-ok">{message.ok}</div>}
          <div className="pr-actions">
            <button type="button" className="admin-settings-save pr-save" onClick={save} disabled={busy || !changed}>{busy ? "Saving…" : changed ? "Save ticket alerts" : "✓ Saved"}</button>
          </div>
          <p className="pr-note">Same transaction ID, same screenshot and the same UPI ID on another number are always checked.</p>
        </>
      )}
    </div>
  );
}
