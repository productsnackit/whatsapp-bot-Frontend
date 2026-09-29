// The one transaction ID shown for a payment: the ID the customer's app calls its transaction ID.
//   PhonePe:    "PhonePe Transaction ID" (T + 22 digits)
//   Google Pay: "UPI transaction ID" (12 digits)
//   Paytm:      "UPI Ref No" (12 digits, the only ID Paytm shows)
// Read from the screenshot, else what the customer typed. (The bank UTR and Google's own ID are
// still kept behind the scenes for duplicate checks and search.)
export function transactionIdOf(ticket) {
  const scan = ticket.upi_scan || {};
  if (scan.app === "PhonePe" && /^T\d{22}$/.test(scan.app_txn_id || "")) return scan.app_txn_id;
  const typed = String(ticket.upi_id || "").trim();
  return ticket.upi_utr || (typed && !typed.includes("@") ? typed : "");
}

// Refunded, resolved or closed tickets are finished: no messages or actions until reopened.
export function isClosedTicket(ticket) {
  return String(ticket?.state || "").toUpperCase() === "CLOSED"
    || ["closed", "auto_closed", "resolved", "refunded", "auto_refunded"].includes(String(ticket?.status || "").toLowerCase());
}
