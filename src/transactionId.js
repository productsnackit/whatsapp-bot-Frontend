// The payment's UPI transaction ID (UTR): read from the screenshot, or the one the customer typed.
export function transactionIdOf(ticket) {
  const typed = String(ticket.upi_id || "").trim();
  return ticket.upi_utr || (typed && !typed.includes("@") ? typed : "");
}
