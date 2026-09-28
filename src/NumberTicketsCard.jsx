import { useState } from "react";

/* Admin Settings: delete every ticket of one phone number (e.g. a test number), after
   showing exactly which tickets, messages, ratings and photos will go. */

const shortDate = (value) => new Date(value).toLocaleString("en-IN", { day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" });

export default function NumberTicketsCard({ api, headers }) {
  const [phone, setPhone] = useState("");
  const [found, setFound] = useState(null);
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);
  const authorization = headers.Authorization;

  const search = async (event) => {
    event?.preventDefault();
    setBusy(true);
    setMessage(null);
    setFound(null);
    try {
      const response = await api.get("/admin/number-tickets", { params: { phone }, headers: { Authorization: authorization } });
      setFound(response.data);
    } catch (err) {
      setMessage({ error: err.response?.data?.error || "Could not look up the tickets" });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    const count = found.tickets.length;
    if (!window.confirm(`Permanently delete all ${count} ticket${count === 1 ? "" : "s"} of ${found.phone}, with ${found.messages} chat message${found.messages === 1 ? "" : "s"}, ${found.feedback} rating${found.feedback === 1 ? "" : "s"} and ${found.photos} photo${found.photos === 1 ? "" : "s"}?\n\nThis can't be undone.`)) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await api.post("/admin/number-tickets/delete", { phone: found.phone, ticket_ids: found.tickets.map((ticket) => ticket.id) }, { headers: { Authorization: authorization } });
      const result = response.data;
      setMessage({ ok: `Deleted ${result.deleted} ticket${result.deleted === 1 ? "" : "s"} of ${found.phone} (${result.messages} messages, ${result.feedback} ratings, ${result.photos} photos).` });
      setFound(null);
    } catch (err) {
      setMessage({ error: err.response?.data?.error || "Could not delete the tickets" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-settings-card pr-card">
      <div className="admin-settings-card-heading">
        <div>
          <h3>Delete a number's tickets</h3>
          <p>For test numbers: removes every ticket of one phone number for good, with its chat messages, ratings and photos. You see the list before anything is deleted.</p>
        </div>
      </div>
      <form className="nt-search" onSubmit={search}>
        <input value={phone} onChange={(event) => { setPhone(event.target.value); setFound(null); }} placeholder="Phone number, e.g. 8978056857" inputMode="tel" aria-label="Phone number" />
        <button type="submit" className="nt-find" disabled={busy || phone.replace(/\D/g, "").length < 10}>{busy && !found ? "Looking…" : "Find tickets"}</button>
      </form>
      {found && (
        found.tickets.length ? (
          <div className="nt-found">
            <p className="nt-summary">
              <b>{found.tickets.length} ticket{found.tickets.length === 1 ? "" : "s"}</b> of {found.phone} · {found.messages} chat message{found.messages === 1 ? "" : "s"} · {found.feedback} rating{found.feedback === 1 ? "" : "s"} · {found.photos} photo{found.photos === 1 ? "" : "s"}
            </p>
            <ul className="nt-list">
              {found.tickets.map((ticket) => (
                <li key={ticket.id}>
                  <b>#{ticket.id}</b>
                  <span>{ticket.sub_issue || "No issue chosen"}{ticket.location ? ` · ${ticket.location}` : ""}</span>
                  <small>{shortDate(ticket.created_at)} · {ticket.status || ticket.state || "open"}</small>
                </li>
              ))}
            </ul>
            <button type="button" className="nt-delete" onClick={remove} disabled={busy}>{busy ? "Deleting…" : `Delete all ${found.tickets.length} ticket${found.tickets.length === 1 ? "" : "s"} permanently`}</button>
          </div>
        ) : <p className="pr-note">No tickets found for {found.phone}.</p>
      )}
      {message?.error && <div className="ea-error">{message.error}</div>}
      {message?.ok && <div className="acc-ok">{message.ok}</div>}
    </div>
  );
}
