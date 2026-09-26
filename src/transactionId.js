// The payment's UPI transaction ID (UTR): read from the screenshot, or the one the customer typed.
export function transactionIdOf(ticket) {
  const typed = String(ticket.upi_id || "").trim();
  return ticket.upi_utr || (typed && !typed.includes("@") ? typed : "");
}

// Refunded, resolved or closed tickets are finished: no messages or actions until reopened.
export function isClosedTicket(ticket) {
  return String(ticket?.state || "").toUpperCase() === "CLOSED"
    || ["closed", "auto_closed", "resolved", "refunded", "auto_refunded"].includes(String(ticket?.status || "").toLowerCase());
}
