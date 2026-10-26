import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { Box } from "./SupplyFrame.jsx";

/* Direct Supply → Setup → Company logins: usernames and passwords for the companies' admins,
   who log in at <dashboard>/?shop to order (ClientPortal.jsx). A password is shown once, when
   the login is made or reset, with Copy and Send on WhatsApp. Server side: clientPortal.js. */

const API = axios.create({ baseURL: "https://whatsapp-bot-backend-b3nb.onrender.com" });
const when = (value) => (value ? new Date(value).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "Never");
const showPhone = (phone) => String(phone || "").replace(/^91(?=\d{10}$)/, "");

export default function ClientLogins({ headers, companies, className }) {
  const [logins, setLogins] = useState(null);
  const [base, setBase] = useState(window.location.origin);
  const [draft, setDraft] = useState({ company_id: "", name: "", phone: "" });
  const [shown, setShown] = useState(null); // { name, phone, company, username, password }
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const shopUrl = `${base.replace(/\/$/, "")}/?shop`;

  const load = useCallback(() => API.get("/supply/client-users", { headers }).then((response) => setLogins(response.data)).catch((err) => setError(err.response?.data?.error || "Could not load the logins")), [headers]);
  useEffect(() => {
    const timer = setTimeout(load, 0);
    API.get("/supply/seller", { headers }).then((response) => { if (response.data.public_url) setBase(response.data.public_url); }).catch(() => {});
    return () => clearTimeout(timer);
  }, [load, headers]);

  const run = async (action) => {
    setError("");
    setBusy(true);
    try { return await action(); } catch (err) { setError(err.response?.data?.error || "Something went wrong"); return null; } finally { setBusy(false); }
  };
  const create = (event) => {
    event.preventDefault();
    run(async () => {
      const response = await API.post("/supply/client-users", draft, { headers });
      const company = companies.find((item) => String(item.id) === String(draft.company_id));
      setShown({ ...response.data.credentials, name: draft.name, phone: response.data.login.phone, company: company?.name });
      setDraft({ company_id: draft.company_id, name: "", phone: "" });
      await load();
    });
  };
  const reset = (login) => window.confirm(`Make a new password for ${login.name}? The old one stops working.`) && run(async () => {
    const response = await API.post(`/supply/client-users/${login.id}/reset-password`, {}, { headers });
    setShown({ ...response.data.credentials, name: login.name, phone: login.phone, company: login.company_name });
  });
  const toggle = (login) => run(async () => { await API.patch(`/supply/client-users/${login.id}`, { active: !login.active }, { headers }); await load(); });
  const remove = (login) => window.confirm(`Delete the login ${login.username} (${login.name})? They won't be able to log in. Their orders stay.`) && run(async () => { await API.delete(`/supply/client-users/${login.id}`, { headers }); await load(); });

  const message = shown && `Hi ${shown.name}, here is your Snackit login to order for ${shown.company}:\n\n🔗 ${shopUrl}\n👤 Username: ${shown.username}\n🔑 Password: ${shown.password}\n\nOpen the link, log in, add items to the cart and place your order. You can change the password after logging in (Account).`;
  const activeCompanies = companies.filter((company) => company.active !== false);

  return (
    <Box id="ds-logins" icon="🔐" tone="green" title="Company logins (shop)" sub={`Company admins log in at ${shopUrl} to order with photos and a cart. No prices are shown to them.`} className={className}>
      {shown && (
        <div className="cl-cred">
          <div>
            <b>Login for {shown.name} · {shown.company}</b>
            <span>Username <code>{shown.username}</code> · Password <code>{shown.password}</code></span>
            <small>The password is shown only now. Send it to them, or press Reset password later for a new one.</small>
          </div>
          <div className="cl-cred-actions">
            <button type="button" className="audit-btn" onClick={() => { navigator.clipboard?.writeText(message); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? "Copied ✓" : "Copy message"}</button>
            <a className="audit-btn" href={`https://wa.me/${shown.phone || ""}?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer">Send on WhatsApp</a>
            <button type="button" className="audit-btn" onClick={() => setShown(null)}>Done</button>
          </div>
        </div>
      )}
      <form className="cl-add" onSubmit={create}>
        <select value={draft.company_id} onChange={(event) => setDraft((current) => ({ ...current, company_id: event.target.value }))} required aria-label="Company">
          <option value="">Company…</option>
          {activeCompanies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
        </select>
        <input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Admin's name" required />
        <input value={draft.phone} onChange={(event) => setDraft((current) => ({ ...current, phone: event.target.value }))} placeholder="WhatsApp number (optional)" inputMode="tel" />
        <button type="submit" className="audit-btn primary" disabled={busy}>+ Make login</button>
      </form>
      {error && <div className="audit-error">{error}</div>}
      {!logins ? <p className="audit-empty">Loading…</p> : !logins.length ? <p className="audit-empty">No logins yet. Pick a company, type the admin's name and press Make login.</p> : (
        <div className="ds-table-wrap">
          <table className="ds-table">
            <thead><tr><th>Company</th><th>Name</th><th>Username</th><th>WhatsApp</th><th>Last login</th><th>Status</th><th /></tr></thead>
            <tbody>
              {logins.map((login) => (
                <tr key={login.id} className={login.active ? "" : "cl-off"}>
                  <td>{login.company_name}</td>
                  <td>{login.name}</td>
                  <td><code>{login.username}</code></td>
                  <td>{showPhone(login.phone) || "—"}</td>
                  <td>{when(login.last_login_at)}</td>
                  <td><button type="button" className={`cl-status ${login.active ? "is-on" : ""}`} disabled={busy} onClick={() => toggle(login)}>{login.active ? "Active" : "Switched off"}</button></td>
                  <td className="cl-actions">
                    <button type="button" className="audit-btn" disabled={busy} onClick={() => reset(login)}>Reset password</button>
                    <button type="button" className="audit-link-danger" disabled={busy} onClick={() => remove(login)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Box>
  );
}
