import { useState } from "react";

/* "My account": who you are, what you can open, and changing your password. */

const PAGE_LABELS = {
  tickets: "Tickets & customer chat", feedback: "Feedback", products: "Product leads", operations: "Operations",
  audit: "Refill Audit", refills: "Refill Schedule", findings: "Internal Audit", expiry: "Expiry Tracking", analytics: "Analytics",
  activity: "Activity log", settings: "Bot settings",
};

export default function AccountPanel({ api, headers, name, username, access, isOwner, onClose }) {
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    if (form.next.length < 8) return setStatus({ error: "New password must be at least 8 characters" });
    if (form.next !== form.confirm) return setStatus({ error: "The two new passwords don't match" });
    setSaving(true);
    try {
      await api.post("/me/password", { current: form.current, next: form.next }, { headers });
      setForm({ current: "", next: "", confirm: "" });
      setStatus({ ok: "Password changed. Your other devices have been logged out." });
    } catch (err) {
      setStatus({ error: err.response?.data?.error || "Could not change password" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="upi-scan-backdrop" onClick={onClose}>
      <div className="acc" onClick={(event) => event.stopPropagation()}>
        <div className="upi-scan-head">
          <div><h3>My account</h3><p>{name}{username ? ` · ${username}` : ""}</p></div>
          <button type="button" className="upi-scan-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="acc-body">
          <div className="acc-role">
            <span>Your role</span>
            <b>{access.roleLabel || (isOwner ? "Owner" : "Staff")}</b>
            {access.readOnly && <small>View only: you can look but not change anything.</small>}
          </div>
          <div className="acc-pages">
            <span>You can open</span>
            <div className="ea-chips">
              {access.isAdmin ? <span className="ea-chip strong">Every page, incl. employees</span> : null}
              {!access.isAdmin && (access.pages || []).map((page) => <span key={page} className="ea-chip">{PAGE_LABELS[page] || page}</span>)}
              <span className="ea-chip">Internal Chat</span>
            </div>
            {!access.isAdmin && <small>Need another page? Ask an admin.</small>}
          </div>

          {isOwner ? (
            <p className="acc-note">This is the shared owner login. Its password is set on the server (ADMIN_PASS on Render). For day-to-day work, give each person their own account under Employees & access.</p>
          ) : (
            <form className="acc-form" onSubmit={submit}>
              <b>Change password</b>
              <input type="password" autoComplete="current-password" placeholder="Current password" value={form.current} onChange={(event) => setForm({ ...form, current: event.target.value })} />
              <input type="password" autoComplete="new-password" placeholder="New password (8+ characters)" value={form.next} onChange={(event) => setForm({ ...form, next: event.target.value })} />
              <input type="password" autoComplete="new-password" placeholder="Type the new password again" value={form.confirm} onChange={(event) => setForm({ ...form, confirm: event.target.value })} />
              {status?.error && <div className="ea-error">{status.error}</div>}
              {status?.ok && <div className="acc-ok">{status.ok}</div>}
              <button type="submit" disabled={saving || !form.current || !form.next}>{saving ? "Saving…" : "Change password"}</button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
