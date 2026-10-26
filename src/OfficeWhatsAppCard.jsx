import { useCallback, useEffect, useRef, useState } from "react";

/* Admin Settings: connect the director's office WhatsApp number (it stays on his WhatsApp
   Business app too) with Meta's Embedded Signup, and switch its office bot on or off.
   Server side: officeBot.js. */
const loadFacebook = (appId) => new Promise((resolve, reject) => {
  if (window.FB) return resolve(window.FB);
  window.fbAsyncInit = () => {
    window.FB.init({ appId, autoLogAppEvents: true, xfbml: false, version: "v23.0" });
    resolve(window.FB);
  };
  const script = document.createElement("script");
  script.src = "https://connect.facebook.net/en_US/sdk.js";
  script.async = true;
  script.defer = true;
  script.crossOrigin = "anonymous";
  script.onerror = () => reject(new Error("Facebook could not be loaded. Check the internet or an ad-blocker."));
  document.body.appendChild(script);
});

export default function OfficeWhatsAppCard({ api, headers }) {
  const [data, setData] = useState(null);
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState("");
  const [fbReady, setFbReady] = useState(false);
  const [address, setAddress] = useState(null); // samples address being edited (null = not edited)
  const session = useRef({}); // phone_number_id / waba_id from the signup window
  const authorization = headers.Authorization;
  const config = { headers: { Authorization: authorization } };

  const load = useCallback(() => api.get("/admin/office-whatsapp", { headers: { Authorization: authorization } })
    .then((response) => setData(response.data))
    .catch((err) => setMessage({ error: err.response?.data?.error || "Could not load the office number" })), [api, authorization]);
  useEffect(() => { load(); }, [load]);

  // Facebook's SDK, and what the signup window tells us when it finishes.
  useEffect(() => {
    if (!data?.app_id || data.connected) return undefined;
    loadFacebook(data.app_id).then(() => setFbReady(true)).catch((err) => setMessage({ error: err.message }));
    const onMessage = (event) => {
      if (!String(event.origin).endsWith("facebook.com")) return;
      try {
        const info = JSON.parse(event.data);
        if (info.type !== "WA_EMBEDDED_SIGNUP") return;
        if (String(info.event).startsWith("FINISH")) session.current = { ...session.current, ...info.data };
        else if (info.event === "CANCEL") session.current = { ...session.current, cancelled: info.data?.current_step || info.data?.error_message || "cancelled" };
      } catch { /* not ours */ }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [data?.app_id, data?.connected]);

  const connect = () => {
    if (!window.FB) return setMessage({ error: "Facebook is still loading. Try again in a moment." });
    setMessage(null);
    session.current = {};
    setBusy("connect");
    window.FB.login((response) => {
      const code = response?.authResponse?.code;
      if (!code) { setBusy(""); setMessage({ error: session.current.cancelled ? `Not connected: ${session.current.cancelled}` : "Not connected (the Facebook window was closed)." }); return; }
      // The number's details come in a separate message; wait for it briefly (the code works 30 s).
      const started = Date.now();
      const finish = async () => {
        if (!session.current.phone_number_id && Date.now() - started < 6000) return setTimeout(finish, 300);
        try {
          const result = await api.post("/admin/office-whatsapp/connect", { code, phone_number_id: session.current.phone_number_id, waba_id: session.current.waba_id }, config);
          setData((current) => ({ ...current, ...result.data }));
          setMessage({ ok: `Connected ${result.data.display_phone || "the office number"} ✓ The office bot is on.` });
          load();
        } catch (err) {
          setMessage({ error: err.response?.data?.error || "Could not connect" });
        } finally {
          setBusy("");
        }
      };
      finish();
    }, {
      config_id: data.config_id,
      response_type: "code",
      override_default_response_type: true,
      extras: { setup: {}, featureType: "whatsapp_business_app_onboarding", sessionInfoVersion: "3" },
    });
  };

  const update = async (fields) => {
    setBusy("save");
    try {
      const response = await api.patch("/admin/office-whatsapp", fields, config);
      setData((current) => ({ ...current, ...response.data }));
      setMessage({ ok: "Saved." });
    } catch (err) {
      setMessage({ error: err.response?.data?.error || "Could not save" });
    } finally {
      setBusy("");
    }
  };
  const disconnect = async () => {
    if (!window.confirm("Disconnect the office number from the dashboard? The office bot stops. (To remove it fully, also remove the app in Meta Business settings.)")) return;
    setBusy("save");
    try {
      const response = await api.delete("/admin/office-whatsapp", config);
      setData((current) => ({ ...current, ...response.data }));
      setMessage({ ok: "Disconnected." });
    } catch (err) {
      setMessage({ error: err.response?.data?.error || "Could not disconnect" });
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="admin-settings-card pr-card">
      <div className="admin-settings-card-heading">
        <div>
          <h3>Office WhatsApp number</h3>
          <p>The director's office number keeps working on his WhatsApp Business app, and gets the office bot: refund help, product listing, machine rental and sale, direct supply. New enquiries become leads on the Office Leads page.</p>
        </div>
      </div>
      {!data ? <p className="pr-note">{message?.error || "Loading…"}</p> : data.connected ? (
        <>
          <div className="ow-status">
            <span className="ow-dot" />
            <div>
              <b>{data.display_phone || "Office number"}{data.verified_name ? ` · ${data.verified_name}` : ""}</b>
              <small>Connected {data.connected_at ? new Date(data.connected_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : ""}{data.connected_by ? ` by ${data.connected_by}` : ""} · {data.contacts} saved contacts (bot never replies to them) · {data.leads} leads</small>
            </div>
          </div>
          <div className="pr-rows">
            <div className="pr-row">
              <div className="pr-label"><strong>Office bot</strong><small>Answers new people who message the office number.</small></div>
              <div className="pr-control">
                <label className="ow-toggle"><input type="checkbox" checked={data.bot_on} disabled={Boolean(busy)} onChange={(event) => update({ bot_on: event.target.checked })} /> {data.bot_on ? "On" : "Off"}</label>
              </div>
            </div>
            <div className="pr-row">
              <div className="pr-label"><strong>Quiet after the director replies</strong><small>When he replies from his phone, the bot stays out of that chat for this long.</small></div>
              <div className="pr-control">
                <div className="pr-presets">
                  {[4, 12, 24, 48].map((hours) => <button type="button" key={hours} className={data.pause_hours === hours ? "on" : ""} disabled={Boolean(busy)} onClick={() => update({ pause_hours: hours })}>{hours} h</button>)}
                </div>
              </div>
            </div>
            <div className="pr-row ow-address-row">
              <div className="pr-label"><strong>Address for product samples</strong><small>Sent to people who choose "List your product", with {data.product_email || "product@snackit.in"} for their product details. Empty: the bot says the team will share the address.</small></div>
              <div className="pr-control ow-address">
                <textarea rows={3} value={address ?? data.samples_address ?? ""} onChange={(event) => setAddress(event.target.value)} placeholder={"Snackit office address\ne.g. #12, 2nd floor, … Bengaluru 560001"} />
                <button type="button" className="admin-settings-save" disabled={Boolean(busy) || address === null || address === (data.samples_address || "")} onClick={async () => { await update({ samples_address: address }); setAddress(null); }}>Save address</button>
              </div>
            </div>
          </div>
          {message?.error && <div className="ea-error">{message.error}</div>}
          {message?.ok && <div className="acc-ok">{message.ok}</div>}
          <div className="pr-actions"><button type="button" className="pr-run" onClick={disconnect} disabled={Boolean(busy)}>Disconnect</button></div>
        </>
      ) : (
        <>
          {!data.secret_set && <div className="ea-error">First add <b>META_APP_SECRET</b> (the app secret from developers.facebook.com → App settings → Basic) in Render → Environment, then refresh this page.</div>}
          <ol className="ow-steps">
            <li>The director updates WhatsApp Business on his phone and keeps it nearby.</li>
            <li>Press <b>Connect office number</b>, log in with the Facebook account that manages Snackit, and choose <b>Connect your existing WhatsApp Business app</b>.</li>
            <li>Pick the Snackit business account and the office number, then he scans the QR code / approves it in his WhatsApp Business app.</li>
          </ol>
          {message?.error && <div className="ea-error">{message.error}</div>}
          {message?.ok && <div className="acc-ok">{message.ok}</div>}
          <div className="pr-actions">
            <button type="button" className="admin-settings-save" onClick={connect} disabled={!fbReady || !data.secret_set || Boolean(busy)}>
              {busy === "connect" ? "Connecting…" : fbReady ? "Connect office number" : "Loading Facebook…"}
            </button>
          </div>
          <p className="pr-note">App ID {data.app_id} · Configuration {data.config_id}</p>
        </>
      )}
    </div>
  );
}
