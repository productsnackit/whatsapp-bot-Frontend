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

// "Charged more than once" tickets keep every payment the customer sent (the bot's refund option 5).
export function paymentIdOf(payment) {
  if (payment?.app === "PhonePe" && /^T\d{22}$/.test(payment.app_id || "")) return payment.app_id;
  return payment?.utr || "";
}

export const paymentsOf = (ticket) => (Array.isArray(ticket?.payments) ? ticket.payments : []).filter((payment) => paymentIdOf(payment) || payment.image);

// Everything paid, when every amount was read clearly; otherwise null.
export function totalPaid(ticket) {
  const payments = paymentsOf(ticket);
  if (!payments.length || payments.some((payment) => payment.amount == null || payment.amount_uncertain)) return null;
  return payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
}

// Same rule as the bot: got nothing → everything paid; got one product → all but one of several equal payments.
export function suggestedRefund(ticket) {
  const total = totalPaid(ticket);
  if (total == null || ticket.product_received == null) return null;
  if (!ticket.product_received) return total;
  const payments = paymentsOf(ticket);
  if (payments.length < 2 || new Set(payments.map((payment) => Number(payment.amount))).size !== 1) return null;
  return total - Number(payments[0].amount);
}
