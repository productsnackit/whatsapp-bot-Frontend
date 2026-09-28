import { useEffect, useState } from "react";
import { MASTER_CHECKLIST } from "./auditChecklist.js";

/* Admin Settings: who gets a CAPA task on WhatsApp when the refiller taps "Can't do it",
   by kind of issue (the refill audit checklist). */

const blank = () => ({ name: "", phone: "", all_issues: false, keys: [] });
const TEXT_BY_KEY = Object.fromEntries(MASTER_CHECKLIST.flatMap((group) => group.items.map((item) => [item.id, item.text])));

function fromServer(rows) {
  return rows.map((row) => ({ name: row.name, phone: row.phone, all_issues: row.all_issues, keys: row.issue_keys || [] }));
}

export default function CapaEscalationCard({ api, headers }) {
  const [saved, setSaved] = useState(null);
  const [people, setPeople] = useState(null);
  const [open, setOpen] = useState(0);
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);
  const authorization = headers.Authorization;

  useEffect(() => {
    let alive = true;
    api.get("/audit/escalation-contacts", { headers: { Authorization: authorization } })
      .then((response) => {
        if (!alive) return;
        const list = fromServer(response.data);
        setSaved(list);
        setPeople(list.length ? list : [blank()]);
      })
      .catch((err) => { if (alive) setMessage({ error: err.response?.data?.error || "Could not load escalation contacts" }); });
    return () => { alive = false; };
  }, [api, authorization]);

  const update = (index, patch) => setPeople((list) => list.map((person, i) => (i === index ? { ...person, ...patch } : person)));
  const toggleKeys = (index, keys, on) => setPeople((list) => list.map((person, i) => {
    if (i !== index) return person;
    const next = new Set(person.keys);
    keys.forEach((key) => (on ? next.add(key) : next.delete(key)));
    return { ...person, keys: [...next] };
  }));

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const contacts = people.map((person) => ({
        name: person.name,
        phone: person.phone,
        all_issues: person.all_issues,
        issues: person.keys.map((key) => ({ key, text: TEXT_BY_KEY[key] || "" })),
      }));
      const response = await api.put("/audit/escalation-contacts", { contacts }, { headers: { Authorization: authorization } });
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
          <h3>CAPA escalation</h3>
          <p>When a refiller taps "Can't do it" on a CAPA task, the people below get the task, machine ID, location and issue on WhatsApp, and can tap "Yes, resolved" once it's fixed. Choose which kinds of issues each person handles.</p>
        </div>
      </div>
      {!people ? <p className="pr-note">{message?.error || "Loading…"}</p> : (
        <>
          <div className="ce-people">
            {people.map((person, index) => {
              const count = person.all_issues ? "All other issues" : `${person.keys.length} kind${person.keys.length === 1 ? "" : "s"} of issue`;
              return (
                <div key={index} className="ce-person">
                  <div className="ce-person-head">
                    <input value={person.name} onChange={(event) => update(index, { name: event.target.value })} placeholder="Name, e.g. Xavier" aria-label="Name" />
                    <input value={person.phone} onChange={(event) => update(index, { phone: event.target.value })} placeholder="WhatsApp number" inputMode="tel" aria-label="WhatsApp number" />
                    <button type="button" className="ce-toggle" onClick={() => setOpen(open === index ? -1 : index)} aria-expanded={open === index}>{count} {open === index ? "▲" : "▼"}</button>
                    <button type="button" className="ce-remove" onClick={() => { setPeople((list) => list.filter((_, i) => i !== index)); setOpen(-1); }} aria-label={`Remove ${person.name || "person"}`}>✕</button>
                  </div>
                  {open === index && (
                    <div className="ce-issues">
                      <label className="ce-all">
                        <input type="checkbox" checked={person.all_issues} onChange={(event) => update(index, { all_issues: event.target.checked })} />
                        <span><b>All other issues</b><small>Gets every task that nobody below is set up for (including custom checks).</small></span>
                      </label>
                      {!person.all_issues && MASTER_CHECKLIST.map((group) => {
                        const keys = group.items.map((item) => item.id);
                        const all = keys.every((key) => person.keys.includes(key));
                        return (
                          <fieldset key={group.id} className="ce-group">
                            <legend>
                              <label><input type="checkbox" checked={all} onChange={(event) => toggleKeys(index, keys, event.target.checked)} /> {group.title}</label>
                            </legend>
                            {group.items.map((item) => (
                              <label key={item.id} className="ce-item">
                                <input type="checkbox" checked={person.keys.includes(item.id)} onChange={(event) => toggleKeys(index, [item.id], event.target.checked)} />
                                <span>{item.text}{item.critical ? <em> critical</em> : null}</span>
                              </label>
                            ))}
                          </fieldset>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <button type="button" className="ce-add" onClick={() => { setPeople((list) => [...list, blank()]); setOpen(people.length); }}>+ Add person</button>
          {message?.error && <div className="ea-error">{message.error}</div>}
          {message?.ok && <div className="acc-ok">{message.ok}</div>}
          <div className="pr-actions">
            <button type="button" className="admin-settings-save pr-save" onClick={save} disabled={busy || !changed}>{busy ? "Saving…" : "Save escalation contacts"}</button>
          </div>
          <p className="pr-note">Messages go out with your approved capa_task template when the person hasn't messaged the Snackit number in the last 24 hours.</p>
        </>
      )}
    </div>
  );
}
