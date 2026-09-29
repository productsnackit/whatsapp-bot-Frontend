import { useState } from "react";
import { transactionIdOf } from "./transactionId.js";
import ImageViewer from "./ImageViewer.jsx";

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

function CopyId({ value, label }) {
  const [copied, setCopied] = useState(false);
  const copyId = (event) => {
    event.stopPropagation();
    copy(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return <button type="button" className="txn-copy" onClick={copyId} title={`Copy ${label}`}>{copied ? "Copied ✓" : "Copy"}</button>;
}

// The transaction ID (see transactionIdOf): one ID, with a Copy button.
export function TxnIdCell({ ticket }) {
  const txn = transactionIdOf(ticket);
  const typed = String(ticket.upi_id || "").trim();
  if (!txn) return <span className="na">—</span>;
  const scan = ticket.upi_scan || {};
  const fromScreenshot = txn !== typed || Boolean(ticket.upi_utr);
  // The customer typed something that is none of this payment's IDs.
  const differs = fromScreenshot && typed && !typed.includes("@") && ![txn, ticket.upi_utr, scan.app_txn_id].includes(typed);
  return (
    <div className="upi-id-cell">
      <span className="txn-id-row">
        <b className="txn-id">{txn}</b>
        <CopyId value={txn} label="transaction ID" />
      </span>
      <small>{fromScreenshot ? "📷 Read from screenshot" : "Typed by customer"}</small>
      {differs && <small className="upi-id-typed">Customer typed: {typed}</small>}
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
      <span>{scan.amount != null ? `₹${scan.amount}${scan.amount_uncertain ? "?" : ""}` : "₹ ?"}</span>
      <b>{flags.length ? `⚠ ${flags.length} to check` : "✓ Looks fine"}</b>
    </button>
  );
}

export function UpiScanDetails({ ticket, onClose, onRescan, loadText }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showText, setShowText] = useState(false);
  // The full text read isn't in the tickets list (it's large); it's fetched when asked for.
  const [fullText, setFullText] = useState(null);
  const toggleText = () => {
    setShowText((value) => !value);
    if (fullText === null && !ticket.upi_scan?.text && loadText) {
      setFullText("Loading…");
      loadText(ticket.id).then(setFullText).catch(() => setFullText("Could not load the text."));
    }
  };
  const [viewing, setViewing] = useState(false);
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
    ["Transaction ID", transactionIdOf(ticket) || null],
    // An unclear amount is shown with the other possible readings and never filled in automatically.
    ["Amount", scan.amount != null ? `₹${scan.amount}${scan.amount_uncertain ? " (not sure, check the screenshot)" : ""}` : null],
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
          <button type="button" className="upi-scan-image" onClick={() => setViewing(true)} title="View full screen"><img src={ticket.upi_image} alt="UPI screenshot" /></button>
          {viewing && <ImageViewer images={[{ url: ticket.upi_image, caption: `Ticket #${ticket.id} · payment screenshot` }]} index={0} onIndex={() => {}} onClose={() => setViewing(false)} />}
          <div className="upi-scan-info">
            {scan ? <>
              {flagsFor(ticket).length > 0 ? (
                <ul className="upi-scan-flags">{flagsFor(ticket).map((flag) => <li key={flag}>⚠ {flag}</li>)}</ul>
              ) : <div className="upi-scan-ok">✓ Nothing unusual found</div>}
              <dl>
                {rows.map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value ? <>{value}{["Transaction ID", "Customer UPI ID (screenshot)"].includes(label) && <button type="button" onClick={() => copy(String(value))}>Copy</button>}</> : <span className="na">Not found</span>}</dd>
                  </div>
                ))}
                <div><dt>Customer typed UPI ID</dt><dd>{ticket.upi_id || <span className="na">—</span>}</dd></div>
              </dl>
              <p className="upi-scan-note">Read automatically from the image ({scan.confidence}% confidence). Always compare with the screenshot before refunding.</p>
              <button type="button" className="upi-scan-link" onClick={toggleText}>{showText ? "Hide" : "Show"} all text read</button>
              {showText && <pre className="upi-scan-text">{scan.text || fullText}</pre>}
            </> : <p className="upi-scan-note">This screenshot hasn't been read yet.</p>}
            {error && <div className="upi-scan-error">{error}</div>}
            <button type="button" className="upi-scan-btn" onClick={rescan} disabled={busy}>{busy ? "Reading… (a few seconds)" : scan ? "Read again" : "Read screenshot"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
