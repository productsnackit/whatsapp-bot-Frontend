import { useEffect, useState } from "react";

/* Admin Settings: how long saved invoices (Invoices page) are kept before they're deleted
   automatically. 0 = keep forever. Server side: savedInvoices.js. */
const PRESETS = [30, 90, 180, 365];

export default function InvoiceRetentionCard({ api, headers }) {
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);
  const authorization = headers.Authorization;

  useEffect(() => {
    let alive = true;
    api.get("/admin/invoice-retention", { headers: { Authorization: authorization } })
      .then((response) => { if (alive) { setData(response.data); setDraft(String(response.data.days)); } })
      .catch((err) => { if (alive) setMessage({ error: err.response?.data?.error || "Could not load the invoice setting" }); });
    return () => { alive = false; };
  }, [api, authorization]);

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const response = await api.put("/admin/invoice-retention", { days: Number(draft) }, { headers: { Authorization: authorization } });
      setData((current) => ({ ...current, days: response.data.days }));
      setMessage({ ok: response.data.days ? `Saved. Invoices are deleted ${response.data.days} days after they were last saved.` : "Saved. Invoices are kept forever." });
    } catch (err) {
      setMessage({ error: err.response?.data?.error || "Could not save" });
    } finally {
      setBusy(false);
    }
  };
  const runNow = async () => {
    if (!window.confirm(`Delete all saved invoices older than ${data.days} days now? They can't be recovered.`)) return;
    setBusy(true);
    try {
      const response = await api.post("/admin/invoice-retention/run", {}, { headers: { Authorization: authorization } });
      setMessage({ ok: `${response.data.deleted} saved invoice${response.data.deleted === 1 ? "" : "s"} deleted.` });
      const refreshed = await api.get("/admin/invoice-retention", { headers: { Authorization: authorization } });
      setData(refreshed.data);
    } catch (err) {
      setMessage({ error: err.response?.data?.error || "Clean-up failed" });
    } finally {
      setBusy(false);
    }
  };

  const value = Number(draft);
  const changed = data && String(data.days) !== String(draft);
  return (
    <div className="admin-settings-card pr-card">
      <div className="admin-settings-card-heading">
        <div>
          <h3>Saved invoices</h3>
          <p>Invoices made on the Invoices page are saved (by invoice number) when they're downloaded, printed or saved. Choose how long to keep them.</p>
        </div>
      </div>
      {!data ? <p className="pr-note">{message?.error || "Loading…"}</p> : (
        <>
          <div className="pr-rows">
            <div className="pr-row">
              <div className="pr-label">
                <strong>Delete saved invoices after</strong>
                <small>Counted from when each invoice was last saved. The PDFs people already downloaded aren't affected.</small>
                <small className="pr-stats">{data.saved} saved now{data.oldest ? ` · oldest saved ${new Date(data.oldest).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}` : ""}</small>
              </div>
              <div className="pr-control">
                <div className="pr-input">
                  <input type="number" min="0" max="3650" value={draft} onChange={(event) => setDraft(event.target.value)} aria-label="Days to keep saved invoices" />
                  <span>days</span>
                </div>
                <div className="pr-presets">
                  {PRESETS.map((days) => <button type="button" key={days} className={value === days ? "on" : ""} onClick={() => setDraft(String(days))}>{days}</button>)}
                  <button type="button" className={value === 0 ? "on" : ""} onClick={() => setDraft("0")} title="Never delete">Keep</button>
                </div>
                {value === 0 && <small className="pr-warn">Kept forever</small>}
              </div>
            </div>
          </div>
          {message?.error && <div className="ea-error">{message.error}</div>}
          {message?.ok && <div className="acc-ok">{message.ok}</div>}
          <div className="pr-actions">
            {data.days > 0 && <button type="button" className="pr-run" onClick={runNow} disabled={busy}>Delete old invoices now</button>}
            <button type="button" className="admin-settings-save pr-save" onClick={save} disabled={busy || !changed}>{busy ? "Saving…" : changed ? "Save invoice setting" : "✓ Saved"}</button>
          </div>
          <p className="pr-note">The clean-up runs automatically every 6 hours.</p>
        </>
      )}
    </div>
  );
}
