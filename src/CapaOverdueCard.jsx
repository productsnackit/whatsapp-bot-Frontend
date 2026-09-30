import { useEffect, useState } from "react";

/* Admin Settings: who gets a WhatsApp alert when a CAPA task isn't resolved in 24 hours
   (once when it crosses 24 hours, then a 10 am reminder each day while it's still open). */

const blank = () => ({ name: "", phone: "" });
const fromServer = (rows) => rows.map((row) => ({ name: row.name, phone: row.phone }));

export default function CapaOverdueCard({ api, headers }) {
  const [saved, setSaved] = useState(null);
  const [people, setPeople] = useState(null);
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);
  const authorization = headers.Authorization;

  useEffect(() => {
    let alive = true;
    api.get("/audit/overdue-contacts", { headers: { Authorization: authorization } })
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
      const response = await api.put("/audit/overdue-contacts", { contacts: people }, { headers: { Authorization: authorization } });
      const list = fromServer(response.data);
      setSaved(list);
      setPeople(list.length ? list : [blank()]);
      setMessage({ ok: list.length ? "Saved. Tasks already over 24 hours are sent within 5 minutes." : "Saved. Nobody gets overdue alerts." });
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
          <h3>CAPA overdue alerts</h3>
          <p>When a CAPA task isn't resolved within 24 hours, these people get a WhatsApp message with the task, location, refiller and how long it's been open. Every day at 10 am they get a reminder of the tasks still open. Tapping "Mark resolved" on WhatsApp resolves the task here too, and they can say who fixed it. Overdue tasks show in red on Refill Audit → CAPA.</p>
        </div>
      </div>
      {!people ? <p className="pr-note">{message?.error || "Loading…"}</p> : (
        <>
          <div className="ce-people">
            {people.map((person, index) => (
              <div key={index} className="ce-person">
                <div className="ce-person-head">
                  <input value={person.name} onChange={(event) => update(index, { name: event.target.value })} placeholder="Name, e.g. Monish" aria-label="Name" />
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
            <button type="button" className="admin-settings-save pr-save" onClick={save} disabled={busy || !changed}>{busy ? "Saving…" : "Save overdue alerts"}</button>
          </div>
          <p className="pr-note">Messages go out with your approved capa_overdue template when the person hasn't messaged the Snackit number in the last 24 hours.</p>
        </>
      )}
    </div>
  );
}
