import { useState } from "react";

/* Tickets table "Location": the site we matched from what the customer typed (bold), their
   own words underneath, and a way to set the site when it didn't match. "Remember" keeps
   their wording as another name for the site, so the next customer writing it matches. */

// A complaint typed where the location should be is never kept as a site name (same rule as the server).
const COMPLAINT_WORDS = /\b(money|debited|deducted|refund|payment|paid|amount|rupees|rs|not dispensed|dispense|product|stuck|received|charged|wrong|damaged|expired|help|please)\b/i;

export default function SiteCell({ ticket, sites, onSet }) {
  const [editing, setEditing] = useState(false);
  const [siteId, setSiteId] = useState("");
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const typed = String(ticket.location || "").trim();
  if (!typed && !ticket.site_name) return <span className="na">—</span>;

  const open = () => {
    setSiteId(ticket.site_id ? String(ticket.site_id) : "");
    setRemember(ticket.site_match !== "manual");
    setError("");
    setEditing(true);
  };
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      await onSet(ticket.id, siteId ? Number(siteId) : null, remember && Boolean(siteId));
      setEditing(false);
    } catch (err) {
      setError(err.response?.data?.error || "Could not save");
    } finally {
      setBusy(false);
    }
  };

  const sameAsTyped = ticket.site_name && typed.toLowerCase() === ticket.site_name.toLowerCase();
  return (
    <div className="site-cell">
      {ticket.site_name ? (
        <span className={`site-name is-${ticket.site_match || "site"}`} title={ticket.site_match === "group" ? "Company matched, but not which of its sites" : ticket.site_match === "manual" ? "Set by hand" : ticket.site_match === "machine" ? `Read from the payment screenshot: paid to machine ${String(ticket.paid_machine || "").toUpperCase()}` : "Matched from what the customer typed"}>
          📍 {ticket.site_name}{ticket.site_match === "group" ? " · which site?" : ""}
        </span>
      ) : <span className="site-name is-none">⚠ Not matched</span>}
      {ticket.paid_machine && <small className="site-machine" title="Machine ID from the payment screenshot">🔢 {String(ticket.paid_machine).toUpperCase()}{ticket.site_match === "machine" ? " · from payment" : ""}</small>}
      {typed && !sameAsTyped && <small className="site-typed">“{typed}”</small>}
      {!editing && <button type="button" className="site-edit" onClick={open}>{ticket.site_name ? "Change" : "Set site"}</button>}
      {editing && (
        <div className="site-editor">
          <select value={siteId} onChange={(event) => setSiteId(event.target.value)} aria-label="Site">
            <option value="">Match automatically</option>
            {sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
          </select>
          {siteId && typed && !COMPLAINT_WORDS.test(typed) && (
            <label className="site-remember">
              <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
              <span>Remember “{typed.slice(0, 60)}{typed.length > 60 ? "…" : ""}” as a name for this site</span>
            </label>
          )}
          {error && <small className="site-error">{error}</small>}
          <div className="site-actions">
            <button type="button" onClick={() => setEditing(false)} disabled={busy}>Cancel</button>
            <button type="button" className="primary" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
          </div>
        </div>
      )}
    </div>
  );
}
