import { useEffect, useRef, useState } from "react";
import axios from "axios";
import "./styles.css";

/* The stock buyer's page (/?buy=<token>), opened from the WhatsApp list: no login.
   He marks the steps (Received → … → Out for delivery → Delivered, which needs a photo) and, per item, fills how much he bought, the
   purchase price, the selling price and where he bought it; the margin is worked out for him. See supplyBuyer.js on the server. */

const API = axios.create({ baseURL: "https://whatsapp-bot-backend-b3nb.onrender.com" });
const dayLabel = (value) => new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" });
const qtyText = (value) => String(Math.round(Number(value) * 1000) / 1000);
const money = (value) => `₹${Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const timeText = (value) => new Date(value).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const formOf = (items) => Object.fromEntries(items.map((item) => [item.key, {
  qty: item.bought ? qtyText(item.bought.qty) : "",
  price: item.bought ? String(item.bought.price) : "",
  place: item.bought?.place || "",
  mfg: item.bought?.mfg || "",
  exp: item.bought?.exp || "",
  sell: item.bought?.sell != null ? String(item.bought.sell) : item.sell_price != null ? String(item.sell_price) : "",
}]));
const readPhoto = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve({ name: file.name || "delivery.jpg", type: file.type || "image/jpeg", data: reader.result });
  reader.onerror = () => reject(new Error("Couldn't read the photo"));
  reader.readAsDataURL(file);
});
const number = (value) => value.replace(/[^\d.]/g, "");
// "09072026" → "09/07/2026" as he types (the date as printed on the pack).
const dateInput = (value) => {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)].filter(Boolean).join("/");
};

export default function PublicBuyer({ token }) {
  const [data, setData] = useState(null);
  const [form, setForm] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");
  const photoInput = useRef(null);

  const take = (payload) => { setData(payload); setForm(formOf(payload.items)); };

  useEffect(() => {
    let alive = true;
    API.get(`/public/supply/buy/${encodeURIComponent(token)}`)
      .then((response) => alive && take(response.data))
      .catch((err) => alive && setError(err.response?.data?.error || "Couldn't open the list. Check your internet and try again."));
    return () => { alive = false; };
  }, [token]);

  if (error && !data) return <div className="po"><div className="po-card po-message">⚠️ {error}</div></div>;
  if (!data) return <div className="po"><div className="po-card po-message">Loading…</div></div>;

  const set = (key, patch) => setForm((current) => ({ ...current, [key]: { ...current[key], ...patch } }));
  const isChanged = (item) => JSON.stringify(form[item.key]) !== JSON.stringify(formOf([item])[item.key]);
  const changed = data.items.filter((item) => item.product_id && isChanged(item));
  const done = data.items.filter((item) => item.bought).length;
  const stepIndex = data.steps.indexOf(data.round.buyer_status);

  // Delivered needs a photo of the delivery: the button opens the camera first.
  const markStep = async (step, photoFile = null) => {
    if (step === "Delivered" && !photoFile) {
      setError("");
      photoInput.current?.click();
      return;
    }
    setBusy(step);
    setError("");
    try {
      const photo = photoFile ? await readPhoto(photoFile) : undefined;
      const response = await API.post(`/public/supply/buy/${encodeURIComponent(token)}/status`, { step, photo });
      setData(response.data);
      setNote(step === "Delivered" ? "Marked: Delivered, with the photo ✓" : `Marked: ${step}`);
    } catch (err) {
      setError(err.response?.data?.error || "Couldn't save. Try again.");
    } finally {
      setBusy("");
    }
  };

  const save = async () => {
    setBusy("save");
    setError("");
    try {
      const items = changed.map((item) => ({ product_id: item.product_id, unit: item.unit, ...form[item.key] }));
      const response = await API.post(`/public/supply/buy/${encodeURIComponent(token)}/items`, { items });
      take(response.data);
      setNote(`Saved ${items.length} item${items.length === 1 ? "" : "s"} ✓`);
    } catch (err) {
      setError(err.response?.data?.error || "Couldn't save. Check your internet and try again.");
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="po pb">
      <header className="po-head"><b>{data.seller} · Stock list</b><span>Delivery {dayLabel(data.round.delivery_date)} · {data.round.ref}{data.round.title ? ` · ${data.round.title}` : ""}</span></header>

      <div className="po-card">
        <div className="po-label">Where are you? Tap the step when it's done</div>
        <div className="pb-steps">
          {data.steps.map((step, index) => (
            <button type="button" key={step} className={`${index <= stepIndex ? "done" : ""} ${index === stepIndex + 1 ? "next" : ""}`} disabled={Boolean(busy)} onClick={() => markStep(step)}>
              <span>{index < stepIndex + 1 ? "✓" : index + 1}</span>
              <b>{step}{step === "Delivered" ? " 📸" : ""}</b>
              {data.round.buyer_steps[step] && <small>{timeText(data.round.buyer_steps[step])}</small>}
            </button>
          ))}
        </div>
        <input ref={photoInput} type="file" accept="image/*" capture="environment" hidden onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) markStep("Delivered", file); }} />
        <small className="pb-photo-note">Delivered needs a photo of the delivery{data.round.photos ? ` · ${data.round.photos} photo${data.round.photos === 1 ? "" : "s"} sent` : ""}.</small>
      </div>

      <div className="po-card pb-intro">
        <b>{done} of {data.items.length} items filled</b>
        <span>For each item: how much you bought, the purchase price and the selling price. The margin is worked out for you.</span>
      </div>

      <datalist id="pb-places">{data.places.map((place) => <option key={place} value={place} />)}</datalist>

      {data.items.map((item) => {
        const value = form[item.key] || {};
        const buy = value.price === "" ? null : Number(value.price);
        const sell = value.sell === "" ? null : Number(value.sell);
        const perUnit = buy != null && sell ? sell - buy : null;
        const marginTotal = perUnit != null && Number(value.qty) > 0 ? perUnit * Number(value.qty) : null;
        return (
          <div key={item.key} className={`po-card pb-item ${item.bought ? "is-done" : ""}`}>
            <div className="pb-item-head">
              <div>
                <b>{item.name}</b>
                <small>{item.for.map((place) => `${place.name} ${qtyText(place.qty)}`).join(" · ")}</small>
              </div>
              <div className="pb-need"><span>Need</span><b>{qtyText(item.need)} {item.unit}</b></div>
            </div>
            {!item.product_id ? <p className="po-note">This name is being checked at the office. You can fill it once it's confirmed.</p> : <>
              {item.last && <small className="pb-last">Last price: {money(item.last.price)}/{item.unit} at {item.last.place}</small>}
              <div className="pb-fields">
                <label>Bought ({item.unit})
                  <div className="pb-with-btn">
                    <input inputMode="decimal" value={value.qty} placeholder={qtyText(item.need)} onChange={(event) => set(item.key, { qty: number(event.target.value) })} />
                    {value.qty === "" && <button type="button" onClick={() => set(item.key, { qty: qtyText(item.need) })}>All</button>}
                  </div>
                </label>
                <label>Purchase price / {item.unit} (₹)<input inputMode="decimal" value={value.price} placeholder="0" onChange={(event) => set(item.key, { price: number(event.target.value), ...(value.qty === "" ? { qty: qtyText(item.need) } : {}) })} /></label>
                <label>Selling price / {item.unit} (₹)<input inputMode="decimal" value={value.sell} placeholder="0" onChange={(event) => set(item.key, { sell: number(event.target.value) })} /></label>
                <div className={`pb-margin ${perUnit != null && perUnit < 0 ? "is-loss" : ""}`}>
                  <span>Margin</span>
                  {perUnit != null ? <>
                    <b>{money(Math.round(perUnit * 100) / 100)}/{item.unit} · {Math.round((perUnit / sell) * 1000) / 10}%</b>
                    {marginTotal != null && <small>{money(Math.round(marginTotal))} on {qtyText(value.qty)} {item.unit}</small>}
                  </> : <b>—</b>}
                </div>
                <label>Mfg. date<input value={value.mfg} placeholder="dd/mm/yyyy" inputMode="numeric" onChange={(event) => set(item.key, { mfg: dateInput(event.target.value) })} /></label>
                <label>Exp. date<input value={value.exp} placeholder="dd/mm/yyyy" inputMode="numeric" onChange={(event) => set(item.key, { exp: dateInput(event.target.value) })} /></label>
                <label className="pb-wide">Where you bought it (optional)<input list="pb-places" value={value.place} placeholder="e.g. KR Market" onChange={(event) => set(item.key, { place: event.target.value })} /></label>
              </div>
              {Number(value.qty) > 0 && Number(value.qty) < item.need && <small className="pb-short">Short by {qtyText(item.need - Number(value.qty))} {item.unit}</small>}
              {item.bought && !isChanged(item) && <small className="pb-saved">✓ Saved</small>}
            </>}
          </div>
        );
      })}

      {error && <div className="po-card po-error">{error}</div>}
      <div className="po-bar">
        <span>{changed.length ? `${changed.length} item${changed.length === 1 ? "" : "s"} to save` : note || "Fill items above"}</span>
        <button type="button" disabled={!changed.length || busy === "save"} onClick={save}>{busy === "save" ? "Saving…" : "Save"}</button>
      </div>
    </div>
  );
}
