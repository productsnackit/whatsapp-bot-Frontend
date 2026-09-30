import { useEffect, useState } from "react";

/* Admin Settings: how many days photos are kept before they're deleted from
   Cloudinary and the dashboard, separately for tickets, refills and audits. */

const KINDS = [
  ["tickets", "Customer ticket images", "Product photos, payment screenshots and ticket-chat photos. Counted from when the ticket is closed; open tickets keep everything."],
  ["refills", "Refill proof photos", "Photos refillers send on WhatsApp. Counted from when they were sent, once the refill is verified or rejected."],
  ["audits", "Refill Audit photos", "Photos taken during refill audits. Counted from the audit date."],
];
const PRESETS = [7, 10, 15, 30, 60, 90];

export default function PhotoRetentionCard({ api, headers }) {
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState(null);
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);
  const authorization = headers.Authorization;

  useEffect(() => {
    let alive = true;
    api.get("/admin/image-retention", { headers: { Authorization: authorization } })
      .then((response) => { if (alive) { setData(response.data); setDraft(response.data.days); } })
      .catch((err) => { if (alive) setMessage({ error: err.response?.data?.error || "Could not load photo settings" }); });
    return () => { alive = false; };
  }, [api, authorization]);

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const response = await api.put("/admin/image-retention", draft, { headers: { Authorization: authorization } });
      setData((current) => ({ ...current, days: response.data.days }));
      setDraft(response.data.days);
      setMessage({ ok: "Saved. The next clean-up uses these numbers." });
    } catch (err) {
      setMessage({ error: err.response?.data?.error || "Could not save" });
    } finally {
      setBusy(false);
    }
  };

  const runNow = async () => {
    if (!window.confirm("Delete all photos that are past these limits now? Deleted photos can't be recovered.")) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await api.post("/admin/image-retention/run", {}, { headers: { Authorization: authorization } });
      setMessage({ ok: `Clean-up done: ${response.data.files} photo${response.data.files === 1 ? "" : "s"} deleted.` });
      const refreshed = await api.get("/admin/image-retention", { headers: { Authorization: authorization } });
      setData(refreshed.data);
    } catch (err) {
      setMessage({ error: err.response?.data?.error || "Clean-up failed" });
    } finally {
      setBusy(false);
    }
  };

  const changed = data && draft && KINDS.some(([kind]) => Number(draft[kind]) !== Number(data.days[kind]));

  return (
    <div className="admin-settings-card pr-card">
      <div className="admin-settings-card-heading">
        <div>
          <h3>Photo storage</h3>
          <p>Photos are deleted from Cloudinary and the dashboard after these many days, to stay within the free plan. Details read from photos (transaction ID, amount, scores) are always kept.</p>
        </div>
      </div>
      {!draft ? <p className="pr-note">{message?.error || "Loading…"}</p> : (
        <>
          <div className="pr-rows">
            {KINDS.map(([kind, label, help]) => {
              const value = Number(draft[kind]);
              const stats = data.stats || {};
              return (
                <div key={kind} className="pr-row">
                  <div className="pr-label">
                    <strong>{label}</strong>
                    <small>{help}</small>
                    <small className="pr-stats">{stats[`${kind}_kept`] ?? "–"} with photos now · {stats[`${kind}_deleted`] ?? "–"} already cleaned</small>
                  </div>
                  <div className="pr-control">
                    <div className="pr-input">
                      <input type="number" min="0" max="3650" value={draft[kind]} onChange={(event) => setDraft({ ...draft, [kind]: event.target.value })} aria-label={`${label} days`} />
                      <span>days</span>
                    </div>
                    <div className="pr-presets">
                      {PRESETS.map((days) => <button type="button" key={days} className={value === days ? "on" : ""} onClick={() => setDraft({ ...draft, [kind]: days })}>{days}</button>)}
                      <button type="button" className={value === 0 ? "on" : ""} onClick={() => setDraft({ ...draft, [kind]: 0 })} title="Never delete">Keep</button>
                    </div>
                    {value === 0 && <small className="pr-warn">Kept forever (uses Cloudinary storage)</small>}
                  </div>
                </div>
              );
            })}
          </div>
          {message?.error && <div className="ea-error">{message.error}</div>}
          {message?.ok && <div className="acc-ok">{message.ok}</div>}
          <div className="pr-actions">
            <button type="button" className="pr-run" onClick={runNow} disabled={busy}>Delete old photos now</button>
            <button type="button" className="admin-settings-save pr-save" onClick={save} disabled={busy || !changed}>{busy ? "Saving…" : changed ? "Save photo settings" : "✓ Saved"}</button>
          </div>
          <p className="pr-note">Clean-up runs automatically every 6 hours. Deleted photos can't be recovered, so download anything you need first.</p>
        </>
      )}
    </div>
  );
}
