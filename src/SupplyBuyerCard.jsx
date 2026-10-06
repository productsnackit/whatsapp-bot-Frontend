import { useEffect, useState } from "react";

/* Admin Settings: the supply stock buyer. He gets the master sheet on WhatsApp by itself
   (when every company has ordered, or at the cutoff time the day before delivery), then taps
   Received → Processing → Ordered → Out for delivery → Delivered (with a photo of the delivery), and fills what he bought on a phone page.
   See supplyBuyer.js on the server. */

const pick = (data) => ({ name: data.name || "", phone: data.phone || "", auto: data.auto !== false, cutoff: data.cutoff || "18:00" });

export default function SupplyBuyerCard({ api, headers }) {
  const [saved, setSaved] = useState(null);
  const [form, setForm] = useState(null);
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);
  const authorization = headers.Authorization;

  useEffect(() => {
    let alive = true;
    api.get("/admin/supply-buyer", { headers: { Authorization: authorization } })
      .then((response) => { if (alive) { setSaved(pick(response.data)); setForm(pick(response.data)); } })
      .catch((err) => { if (alive) setMessage({ error: err.response?.data?.error || "Could not load" }); });
    return () => { alive = false; };
  }, [api, authorization]);

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const response = await api.put("/admin/supply-buyer", { ...form, origin: window.location.origin }, { headers: { Authorization: authorization } });
      setSaved(pick(response.data));
      setForm(pick(response.data));
      setMessage({ ok: form.phone ? "Saved. The buyer gets each delivery date's list on WhatsApp." : "Saved. No buyer set, so lists aren't sent." });
    } catch (err) {
      setMessage({ error: err.response?.data?.error || "Could not save" });
    } finally {
      setBusy(false);
    }
  };

  const changed = saved && form && JSON.stringify(form) !== JSON.stringify(saved);
  const set = (patch) => setForm((current) => ({ ...current, ...patch }));

  return (
    <div className="admin-settings-card pr-card">
      <div className="admin-settings-card-heading">
        <div>
          <h3>Supply buyer</h3>
          <p>The person who buys the stock. He gets the combined list (master sheet) of all locations on WhatsApp, taps Received → Processing → Ordered → Out for delivery → Delivered (with a photo of the delivery), and fills how much he bought, the price, where he bought it and the margin % on a simple phone page.</p>
        </div>
      </div>
      {!form ? <p className="pr-note">{message?.error || "Loading…"}</p> : (
        <>
          <div className="ce-people">
            <div className="ce-person">
              <div className="ce-person-head">
                <input value={form.name} onChange={(event) => set({ name: event.target.value })} placeholder="Buyer's name" aria-label="Buyer's name" />
                <input value={form.phone} onChange={(event) => set({ phone: event.target.value })} placeholder="Buyer's WhatsApp number" inputMode="tel" aria-label="Buyer's WhatsApp number" />
              </div>
            </div>
          </div>
          <label className="sb-row">
            <input type="checkbox" checked={form.auto} onChange={(event) => set({ auto: event.target.checked })} />
            <span>Send the list by itself</span>
          </label>
          {form.auto && (
            <label className="sb-row">
              <span>Send when every company has ordered, or at</span>
              <input type="time" value={form.cutoff} onChange={(event) => set({ cutoff: event.target.value || "18:00" })} aria-label="Cutoff time" />
              <span>the day before delivery.</span>
            </label>
          )}
          {message?.error && <div className="ea-error">{message.error}</div>}
          {message?.ok && <div className="acc-ok">{message.ok}</div>}
          <div className="pr-actions">
            <button type="button" className="admin-settings-save pr-save" onClick={save} disabled={busy || !changed}>{busy ? "Saving…" : changed ? "Save buyer" : "✓ Saved"}</button>
          </div>
          <p className="pr-note">If orders change after the list is sent, he gets an "updated list" with just the changes. When he hasn't messaged the Snackit number in 24 hours, your approved supply_buyer_list template is used.</p>
        </>
      )}
    </div>
  );
}
