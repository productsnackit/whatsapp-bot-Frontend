import { useEffect, useState } from "react";

/* Admin Settings: who gets a WhatsApp message when the bot hands a customer to the team
   (they asked for a person, are upset, or wrote something the menus don't cover). */

const blank = () => ({ name: "", phone: "" });
const fromServer = (rows) => rows.map((row) => ({ name: row.name, phone: row.phone }));

export default function AttentionContactsCard({ api, headers }) {
  const [saved, setSaved] = useState(null);
  const [people, setPeople] = useState(null);
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);
  const authorization = headers.Authorization;

  useEffect(() => {
    let alive = true;
    api.get("/admin/attention-contacts", { headers: { Authorization: authorization } })
      .then((response) => {
        if (!alive) return;
        const list = fromServer(response.data);
        setSaved(list);
        setPeople(list.length ? list : [blank()]);
      })
      .catch((err) => { if (alive) setMessage({ error: err.response?.data?.error || "Could not load" }); });
    return () => { alive = false; };
  }, [api, authorization]);

  const update = (index, patch) => setPeople((list) => list.map((person, i) => (i === index ? { ...person, ...patch } : person)));

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const response = await api.put("/admin/attention-contacts", { contacts: people }, { headers: { Authorization: authorization } });
      const list = fromServer(response.data);
      setSaved(list);
      setPeople(list.length ? list : [blank()]);
      setMessage({ ok: "Saved." });
    } catch (err) {
      setMessage({ error: err.response?.data?.error || "Could not save" });
    } finally {
      setBusy(false);
    }
  };

  const changed = saved && people && JSON.stringify(people.filter((person) => person.name || person.phone)) !== JSON.stringify(saved);

  return (
    <div className="admin-settings-card pr-card">
      <div className="admin-settings-card-heading">
        <div>
          <h3>Admin WhatsApp alerts</h3>
          <p>The bot has no "talk to admin" option. It reads what customers write and hands the chat to you when they ask for a person ("talk to someone", "call me", "customer care"…), are upset ("fraud", "complaint", "still not received"…), or write something the menus don't cover. The ticket goes to Admin Mode with a 🔔 Needs attention badge, and these people get a WhatsApp message with what the customer said.</p>
        </div>
      </div>
      {!people ? <p className="pr-note">{message?.error || "Loading…"}</p> : (
        <>
          <div className="ce-people">
            {people.map((person, index) => (
              <div key={index} className="ce-person">
                <div className="ce-person-head">
                  <input value={person.name} onChange={(event) => update(index, { name: event.target.value })} placeholder="Name" aria-label="Name" />
                  <input value={person.phone} onChange={(event) => update(index, { phone: event.target.value })} placeholder="WhatsApp number" inputMode="tel" aria-label="WhatsApp number" />
                  <button type="button" className="ce-remove" onClick={() => setPeople((list) => list.filter((_, i) => i !== index))} aria-label={`Remove ${person.name || "person"}`}>✕</button>
                </div>
              </div>
            ))}
          </div>
          <button type="button" className="ce-add" onClick={() => setPeople((list) => [...list, blank()])}>+ Add person</button>
          {message?.error && <div className="ea-error">{message.error}</div>}
          {message?.ok && <div className="acc-ok">{message.ok}</div>}
          <div className="pr-actions">
            <button type="button" className="admin-settings-save pr-save" onClick={save} disabled={busy || !changed}>{busy ? "Saving…" : changed ? "Save admin alerts" : "✓ Saved"}</button>
          </div>
          <p className="pr-note">Messages go out with your approved ticket_attention template when the person hasn't messaged the Snackit number in the last 24 hours.</p>
        </>
      )}
    </div>
  );
}
