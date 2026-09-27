/* Reply timers and refund checks for the Tickets page (see TicketWatch.jsx). */
import { isClosedTicket } from "./transactionId.js";

export const DEFAULT_WATCH_HOURS = { sla_warn_hours: 2, sla_overdue_hours: 6 };
export const HOUR = 3600000;

export function waitLabel(ms) {
  const minutes = Math.max(0, Math.floor(ms / 60000));
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 48 * 60) return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
  return `${Math.floor(minutes / 1440)}d ${Math.floor((minutes % 1440) / 60)}h`;
}

// How long a ticket has waited for the team, or null when it isn't waiting for anyone.
export function waitInfo(ticket, hours, now) {
  if (!ticket.waiting_since) return null;
  const ms = now - new Date(ticket.waiting_since).getTime();
  const overdue = Number(hours.sla_overdue_hours) > 0 && ms >= Number(hours.sla_overdue_hours) * HOUR;
  const level = overdue ? "overdue" : ms >= Number(hours.sla_warn_hours) * HOUR ? "warn" : "ok";
  return { ms, level, label: waitLabel(ms) };
}

// Only open tickets are worth checking; finished ones keep their badge in the table.
export const needsRefundCheck = (ticket) => (ticket.refund_checks || []).length > 0 && !isClosedTicket(ticket);

// Problems to confirm before sending "Refunded".
export function refundWarnings(ticket) {
  const warnings = (ticket.refund_checks || []).map((check) => check.text);
  const paid = ticket.upi_scan?.amount;
  if (paid != null && Number(ticket.refund_amount) > Number(paid)) warnings.push(`Refund ₹${Number(ticket.refund_amount)} is more than the ₹${paid} paid on the screenshot`);
  if (ticket.upi_scan?.status === "FAILED") warnings.push("The screenshot shows a FAILED payment");
  return warnings;
}
