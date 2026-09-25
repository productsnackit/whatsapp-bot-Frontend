import { useState } from "react";

/* What was read from a customer's UPI screenshot (UTR, amount, UPI IDs),
   shown under the screenshot in the tickets table, with a details window. */

function copy(text) {
  navigator.clipboard?.writeText(text).catch(() => {});
}

// The refund amount can be edited later, so that check is made here, live.
function flagsFor(ticket) {
  const scan = ticket.upi_scan || {};
  const flags = (scan.flags || []).filter((flag) => !flag.startsWith("Amount on screenshot"));
  if (Number(ticket.refund_amount) > 0 && scan.amount != null && Number(ticket.refund_amount) !== Number(scan.amount)) {
    flags.push(`Amount on screenshot ₹${scan.amount} differs from refund amount ₹${Number(ticket.refund_amount)}.`);
  }
  return flags;
}

// UPI ID column: the customer's UPI ID read from the screenshot, plus what they typed if it differs.
export function UpiIdCell({ ticket }) {
  const fromScreenshot = ticket.screenshot_upi_id || ticket.upi_scan?.payer_upi || "";
  const typed = String(ticket.upi_id || "").trim();
  if (!fromScreenshot) return typed ? <>{typed}</> : <span className="na">—</span>;
  const differs = typed && typed.toLowerCase() !== fromScreenshot.toLowerCase();
  return (
    <div className="upi-id-cell">
      <b>{fromScreenshot}</b>
      <small>📷 From screenshot</small>
      {differs && <small className="upi-id-typed">Typed: {typed}</small>}
    </div>
  );
}

export function UpiScanSummary({ ticket, onOpen }) {
  const scan = ticket.upi_scan;
  if (!ticket.upi_image) return null;
  if (!scan) {
    return <button type="button" className="upi-scan-chip is-empty" onClick={onOpen}>🔎 Read details</button>;
  }
  const flags = flagsFor(ticket);
  return (
    <button type="button" className={`upi-scan-chip ${flags.length ? "is-warn" : "is-ok"}`} onClick={onOpen} title="See what was read from the screenshot">
      <span>{scan.amount != null ? `₹${scan.amount}` : "₹ ?"}{scan.utr ? ` · UTR …${scan.utr.slice(-4)}` : ""}</span>
      <b>{flags.length ? `⚠ ${flags.length} to check` : "✓ Looks fine"}</b>
    </button>
  );
}

export function UpiScanDetails({ ticket, onClose, onRescan }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showText, setShowText] = useState(false);
  const scan = ticket.upi_scan;

  const rescan = async () => {
    setBusy(true);
    setError("");
    try {
      await onRescan(ticket.id);
    } catch (err) {
      setError(err.response?.data?.error || "Could not read the screenshot");
    } finally {
      setBusy(false);
    }
  };

  const rows = scan ? [
    ["UTR / UPI ref", scan.utr],
    ["Amount", scan.amount != null ? `₹${scan.amount}` : null],
    ["Customer UPI ID (screenshot)", scan.payer_upi],
    ["Status", scan.status && { SUCCESS: "✅ Successful", FAILED: "❌ Failed", PENDING: "⏳ Pending" }[scan.status]],
    ["Date & time", scan.paid_at],
    ["App", scan.app],
  ] : [];

  return (
    <div className="upi-scan-backdrop" onClick={onClose}>
      <div className="upi-scan-modal" onClick={(event) => event.stopPropagation()}>
        <div className="upi-scan-head">
          <div>
            <h3>UPI screenshot details</h3>
            <p>Ticket #{ticket.id} · {ticket.phone}</p>
          </div>
          <button type="button" className="upi-scan-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="upi-scan-body">
          <a href={ticket.upi_image} target="_blank" rel="noreferrer" className="upi-scan-image"><img src={ticket.upi_image} alt="UPI screenshot" /></a>
          <div className="upi-scan-info">
            {scan ? <>
              {flagsFor(ticket).length > 0 ? (
                <ul className="upi-scan-flags">{flagsFor(ticket).map((flag) => <li key={flag}>⚠ {flag}</li>)}</ul>
              ) : <div className="upi-scan-ok">✓ Nothing unusual found</div>}
              <dl>
                {rows.map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value ? <>{value}{["UTR / UPI ref", "Customer UPI ID (screenshot)"].includes(label) && <button type="button" onClick={() => copy(String(value))}>Copy</button>}</> : <span className="na">Not found</span>}</dd>
                  </div>
                ))}
                <div><dt>Customer typed UPI ID</dt><dd>{ticket.upi_id || <span className="na">—</span>}</dd></div>
              </dl>
              <p className="upi-scan-note">Read automatically from the image ({scan.confidence}% confidence). Always compare with the screenshot before refunding.</p>
              <button type="button" className="upi-scan-link" onClick={() => setShowText((value) => !value)}>{showText ? "Hide" : "Show"} all text read</button>
              {showText && <pre className="upi-scan-text">{scan.text}</pre>}
            </> : <p className="upi-scan-note">This screenshot hasn't been read yet.</p>}
            {error && <div className="upi-scan-error">{error}</div>}
            <button type="button" className="upi-scan-btn" onClick={rescan} disabled={busy}>{busy ? "Reading… (a few seconds)" : scan ? "Read again" : "Read screenshot"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
