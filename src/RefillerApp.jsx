/* Refiller app: what a refiller sees after logging in with their phone number and PIN.
   One very simple page: today's refills (take a photo → done), problems to fix (Fixed /
   Can't fix), and a refill at another of their sites. Server side: refillerApp.js. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import "./styles.css";

const API = axios.create({ baseURL: "https://whatsapp-bot-backend-b3nb.onrender.com" });

const WHEN = { ANY: "Anytime today", MORNING: "Morning", AFTERNOON: "Afternoon", EVENING: "Evening" };
const whenText = (time) => {
  if (WHEN[time]) return WHEN[time];
  const match = /^(\d{2}):(\d{2})$/.exec(time || "");
  if (!match) return "Today";
  const hour = Number(match[1]);
  return `${hour % 12 || 12}:${match[2]} ${hour < 12 ? "am" : "pm"}`;
};
const STATUS = {
  scheduled: { label: "To do", tone: "todo" },
  done: { label: "Sent ✓ Office will check", tone: "sent" },
  verified: { label: "Checked ✅", tone: "ok" },
  rejected: { label: "Do again ❌", tone: "bad" },
  missed: { label: "Missed ⚠️", tone: "warn" },
};
const canDo = (status) => ["scheduled", "rejected", "missed"].includes(status);

// Phone photos are big: made smaller (longest side 1600 px) before sending.
function shrink(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve({ name: (file.name || "photo").replace(/\.\w+$/, "") + ".jpg", type: "image/jpeg", data: canvas.toDataURL("image/jpeg", 0.82) });
      };
      image.onerror = () => resolve({ name: file.name, type: file.type, data: reader.result });
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export default function RefillerApp() {
  const token = localStorage.getItem("token");
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);
  const [photoFor, setPhotoFor] = useState(null); // { location_id, name }
  const [photos, setPhotos] = useState([]);
  const [sending, setSending] = useState(false);
  const [pickSite, setPickSite] = useState(false);
  const [cantFix, setCantFix] = useState(null); // problem id
  const [note, setNote] = useState("");
  const camera = useRef(null);

  const logout = useCallback(() => {
    API.post("/logout", {}, { headers }).catch(() => {});
    ["token", "userRole", "userName"].forEach((key) => localStorage.removeItem(key));
    window.location.reload();
  }, [headers]);
  const notify = (message, bad = false) => { setToast({ message, bad }); setTimeout(() => setToast(null), 4000); };

  const load = useCallback(async () => {
    try {
      setData((await API.get("/refiller/today", { headers })).data);
      setError("");
    } catch (err) {
      if (err.response?.status === 401 || err.response?.status === 403) return logout();
      setError("No internet or the server is waking up. Tap ↻ to try again.");
    }
  }, [headers, logout]);
  useEffect(() => {
    const timer = setTimeout(load, 0);
    const refresh = () => { if (document.visibilityState === "visible") load(); };
    const every = setInterval(refresh, 60000);
    document.addEventListener("visibilitychange", refresh);
    return () => { clearTimeout(timer); clearInterval(every); document.removeEventListener("visibilitychange", refresh); };
  }, [load]);

  const openCamera = (site) => { setPhotoFor(site); setPhotos([]); setPickSite(false); setTimeout(() => camera.current?.click(), 0); };
  const addPhotos = async (files) => {
    const list = [...files].filter((file) => /^image\//.test(file.type)).slice(0, 4 - photos.length);
    if (!list.length) return;
    const shrunk = await Promise.all(list.map(shrink));
    setPhotos((current) => [...current, ...shrunk].slice(0, 4));
  };
  const send = async () => {
    if (!photoFor || !photos.length || sending) return;
    setSending(true);
    try {
      const result = (await API.post("/refiller/refilled", { location_id: photoFor.location_id, photos }, { headers })).data;
      notify(`✅ Refill at ${result.location} sent. Thank you!`);
      setPhotoFor(null);
      setPhotos([]);
      load();
    } catch (err) {
      notify(err.response?.data?.error || "Could not send. Check your internet and try again.", true);
    } finally {
      setSending(false);
    }
  };
  const answer = async (id, kind) => {
    try {
      await API.post(`/refiller/problems/${id}`, { answer: kind, note: kind === "cant" ? note : "" }, { headers });
      notify(kind === "fixed" ? "✅ Marked as fixed. Thank you!" : "🆘 Sent to the office. They will arrange it.");
      setCantFix(null);
      setNote("");
      load();
    } catch (err) {
      notify(err.response?.data?.error || "Could not send. Try again.", true);
    }
  };

  const visits = data?.visits || [];
  const todays = visits.filter((visit) => !visit.yesterday);
  const done = todays.filter((visit) => ["done", "verified"].includes(visit.status)).length;
  const firstName = String(data?.name || localStorage.getItem("userName") || "").split(" ")[0];

  return (
    <div className="rf-app">
      <header className="rf-app-top">
        <div>
          <span>{new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}</span>
          <h1>Hi {firstName} 👋</h1>
        </div>
        <div className="rf-app-top-btns">
          <button type="button" onClick={load} aria-label="Refresh">↻</button>
          <button type="button" onClick={logout} className="rf-app-logout">Log out</button>
        </div>
      </header>

      {toast && <div className={`rf-app-toast ${toast.bad ? "is-bad" : ""}`}>{toast.message}</div>}
      {error && <div className="rf-app-error">{error}</div>}

      <main className="rf-app-main">
        {!data && !error && <div className="rf-app-loading">Loading your refills…</div>}

        {data && (
          <section className="rf-app-progress">
            {todays.length ? (
              <>
                <b>{done} of {todays.length} refills done today</b>
                <div className="rf-app-bar"><span style={{ width: `${Math.round((done / todays.length) * 100)}%` }} /></div>
                {done === todays.length && <small>🎉 All done for today. Great work!</small>}
              </>
            ) : <b>No refills planned for today.</b>}
          </section>
        )}

        {visits.length > 0 && (
          <section>
            <h2>Today's refills</h2>
            <ul className="rf-app-list">
              {visits.map((visit) => {
                const status = STATUS[visit.status] || STATUS.scheduled;
                return (
                  <li key={visit.id} className={`rf-app-card is-${status.tone}`}>
                    <div className="rf-app-card-top">
                      <div>
                        <b>{visit.location_name}</b>
                        <small>{visit.yesterday ? "Yesterday · " : ""}{whenText(visit.due_time)}{visit.machine_code ? ` · ${visit.machine_code}` : ""}</small>
                      </div>
                      <span className={`rf-app-pill is-${status.tone}`}>{status.label}</span>
                    </div>
                    {visit.status === "rejected" && visit.reject_reason && <p className="rf-app-reason">Office says: {visit.reject_reason}</p>}
                    {canDo(visit.status) && (
                      <button type="button" className="rf-app-big" onClick={() => openCamera({ location_id: visit.location_id, name: visit.location_name })}>📷 Take photo · mark done</button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {data?.problems?.length > 0 && (
          <section>
            <h2>Problems to fix</h2>
            <ul className="rf-app-list">
              {data.problems.map((problem) => (
                <li key={problem.id} className="rf-app-card is-problem">
                  <div className="rf-app-card-top">
                    <div>
                      <b>{problem.defect}</b>
                      <small>{problem.location}{problem.ref ? ` · ${problem.ref}` : ""}</small>
                    </div>
                    {problem.severity && <span className={`rf-app-pill ${/critical|high/i.test(problem.severity) ? "is-bad" : "is-warn"}`}>{problem.severity}</span>}
                  </div>
                  {problem.escalated_at ? (
                    <p className="rf-app-reason">Sent to {problem.escalated_to || "the office"}. They will arrange it.</p>
                  ) : cantFix === problem.id ? (
                    <div className="rf-app-cant">
                      <textarea rows={2} placeholder="Why? (optional) e.g. needs technician, part missing" value={note} onChange={(event) => setNote(event.target.value)} />
                      <div className="rf-app-two">
                        <button type="button" className="rf-app-ghost" onClick={() => { setCantFix(null); setNote(""); }}>Back</button>
                        <button type="button" className="rf-app-big is-red" onClick={() => answer(problem.id, "cant")}>Send to office</button>
                      </div>
                    </div>
                  ) : (
                    <div className="rf-app-two">
                      <button type="button" className="rf-app-big" onClick={() => answer(problem.id, "fixed")}>✅ Fixed</button>
                      <button type="button" className="rf-app-big is-red" onClick={() => setCantFix(problem.id)}>🆘 Can't fix</button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {data && (
          <section>
            {!pickSite ? (
              <button type="button" className="rf-app-other" onClick={() => setPickSite(true)}>➕ Refilled another site?</button>
            ) : (
              <div className="rf-app-card">
                <div className="rf-app-card-top"><b>Which site did you refill?</b><button type="button" className="rf-app-ghost" onClick={() => setPickSite(false)}>Close</button></div>
                {!data.sites.length && <p className="rf-app-reason">No sites are given to you yet. Ask the office.</p>}
                <div className="rf-app-sites">
                  {data.sites.map((site) => <button type="button" key={site.id} onClick={() => openCamera({ location_id: site.id, name: site.name })}>{site.name}{site.machine_code ? <small>{site.machine_code}</small> : null}</button>)}
                </div>
              </div>
            )}
          </section>
        )}
      </main>

      <input ref={camera} type="file" accept="image/*" capture="environment" multiple hidden onChange={(event) => { const files = [...(event.target.files || [])]; event.target.value = ""; addPhotos(files); }} />

      {photoFor && (
        <div className="rf-app-sheet-back">
          <div className="rf-app-sheet" role="dialog" aria-label="Send refill photos">
            <h3>{photoFor.name}</h3>
            <p>Take a clear photo of the machine after refilling. You can add up to 4.</p>
            <div className="rf-app-photos">
              {photos.map((photo, index) => (
                <div key={index}><img src={photo.data} alt={`Photo ${index + 1}`} /><button type="button" aria-label="Remove photo" onClick={() => setPhotos((current) => current.filter((_, i) => i !== index))}>×</button></div>
              ))}
              {photos.length < 4 && <button type="button" className="rf-app-add" onClick={() => camera.current?.click()}>📷<span>{photos.length ? "Add photo" : "Take photo"}</span></button>}
            </div>
            <button type="button" className="rf-app-big" disabled={!photos.length || sending} onClick={send}>{sending ? "Sending…" : photos.length ? `✅ Send · refill done` : "Take a photo first"}</button>
            <button type="button" className="rf-app-ghost rf-app-cancel" disabled={sending} onClick={() => { setPhotoFor(null); setPhotos([]); }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
