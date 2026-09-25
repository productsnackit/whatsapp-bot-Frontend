import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";

const API = axios.create({ baseURL: "https://whatsapp-bot-backend-b3nb.onrender.com" });

const SOON_DAYS = 7;

// Local calendar dates as "YYYY-MM-DD" (not UTC, which is still "yesterday" early in the morning in India).
const localDate = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const today = () => localDate(new Date());
const inDays = (days) => { const date = new Date(); date.setDate(date.getDate() + days); return localDate(date); };

const inr = (value) => `₹${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const units = (value) => Number(value || 0).toLocaleString("en-IN");
const formatDate = (value) => {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};

// Expired on the expiry date itself, as in the original tracker; "soon" = within the next week.
function statusOf(batch) {
  if (batch.expiry_date <= today()) return "expired";
  if (batch.expiry_date <= inDays(SOON_DAYS)) return "soon";
  return "active";
}
const STATUS_LABEL = { expired: "Expired", soon: "Expiring soon", active: "Active" };
const totalOf = (batch) => batch.quantity * batch.cost_per_piece;

function nextProductId(batches) {
  const numbers = batches.map((batch) => parseInt(batch.product_code, 10)).filter((n) => !Number.isNaN(n));
  return String(numbers.length ? Math.max(...numbers) + 1 : 1001);
}

function BatchForm({ initial, saving, error, onSave, onClose }) {
  const [form, setForm] = useState(initial);
  const set = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));
  const total = (Number(form.quantity) || 0) * (Number(form.cost_per_piece) || 0);

  return (
    <section className="audit-card exp-form">
      <div className="audit-card-head">
        <div><h3>{initial.id ? `Edit batch ${initial.product_code}` : "Add batch"}</h3><p>Product, dates, quantity and cost per piece.</p></div>
        <button type="button" className="fnd-close exp-close" onClick={onClose} aria-label="Close">×</button>
      </div>
      <form onSubmit={(event) => { event.preventDefault(); onSave(form); }}>
        <div className="exp-form-grid">
          <label>Product ID<input value={form.product_code} onChange={set("product_code")} required placeholder="1001" /></label>
          <label>Product name<input value={form.product_name} onChange={set("product_name")} required placeholder="e.g. Lays Classic 52g" autoFocus /></label>
          <label>Production date<input type="date" value={form.production_date || ""} onChange={set("production_date")} /></label>
          <label>Expiry date<input type="date" value={form.expiry_date} onChange={set("expiry_date")} required /></label>
          <label>Quantity<input type="number" min="0" step="1" inputMode="numeric" value={form.quantity} onChange={set("quantity")} required placeholder="50" /></label>
          <label>Cost per piece (₹)<input type="number" min="0" step="0.01" inputMode="decimal" value={form.cost_per_piece} onChange={set("cost_per_piece")} required placeholder="25.00" /></label>
        </div>
        {error && <div className="audit-error">{error}</div>}
        <div className="exp-form-foot">
          <span>Batch value: <b>{inr(total)}</b></span>
          <button type="button" className="audit-btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="audit-btn audit-btn-primary" disabled={saving}>{saving ? "Saving…" : initial.id ? "Save changes" : "Add batch"}</button>
        </div>
      </form>
    </section>
  );
}

export default function ExpiryWorkspace({ token, isAdmin }) {
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [toast, setToast] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);

  const notify = useCallback((message, isError = false) => {
    setToast({ message, isError });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const load = useCallback(async () => {
    try {
      const response = await API.get("/expiry", { headers });
      setBatches(Array.isArray(response.data) ? response.data : []);
      setLoadError("");
    } catch (err) {
      setLoadError(err.response?.data?.error || "Could not load expiry data.");
    } finally {
      setLoading(false);
    }
  }, [headers]);

  useEffect(() => {
    let active = true;
    API.get("/expiry", { headers })
      .then((response) => { if (active) setBatches(Array.isArray(response.data) ? response.data : []); })
      .catch((err) => { if (active) setLoadError(err.response?.data?.error || "Could not load expiry data."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [headers]);

  // Stat cards always cover every batch; filters only change the table.
  const stats = useMemo(() => {
    const result = { value: 0, units: 0, lossValue: 0, lossUnits: 0, lossBatches: 0, activeValue: 0, activeUnits: 0, soonValue: 0, soonBatches: 0 };
    for (const batch of batches) {
      const total = totalOf(batch);
      const status = statusOf(batch);
      result.value += total;
      result.units += batch.quantity;
      if (status === "expired") {
        result.lossValue += total;
        result.lossUnits += batch.quantity;
        result.lossBatches += 1;
      } else {
        result.activeValue += total;
        result.activeUnits += batch.quantity;
        if (status === "soon") { result.soonValue += total; result.soonBatches += 1; }
      }
    }
    return result;
  }, [batches]);
  const lossPct = stats.value ? ((stats.lossValue / stats.value) * 100).toFixed(1) : "0.0";

  const query = search.trim().toLowerCase();
  const visible = batches.filter((batch) =>
    (!query || batch.product_name.toLowerCase().includes(query) || String(batch.product_code).toLowerCase().includes(query))
    && (filter === "all" || (filter === "active" ? statusOf(batch) !== "expired" : statusOf(batch) === filter))
  );
  const visibleQty = visible.reduce((sum, batch) => sum + batch.quantity, 0);
  const visibleValue = visible.reduce((sum, batch) => sum + totalOf(batch), 0);
  const visibleLoss = visible.filter((batch) => statusOf(batch) === "expired").reduce((sum, batch) => sum + totalOf(batch), 0);

  const openNew = () => {
    setFormError("");
    setEditing({ product_code: nextProductId(batches), product_name: "", production_date: "", expiry_date: "", quantity: "", cost_per_piece: "" });
  };

  const save = async (form) => {
    setSaving(true);
    setFormError("");
    try {
      const payload = { ...form, quantity: Number(form.quantity), cost_per_piece: Number(form.cost_per_piece) };
      const response = form.id
        ? await API.patch(`/expiry/${form.id}`, payload, { headers })
        : await API.post("/expiry", payload, { headers });
      setBatches((prev) => (form.id ? prev.map((batch) => (batch.id === form.id ? response.data : batch)) : [...prev, response.data]));
      setEditing(null);
      notify(form.id ? `${response.data.product_name} updated` : `${response.data.product_name} added`);
    } catch (err) {
      setFormError(err.response?.data?.error || "Could not save. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (batch) => {
    if (!window.confirm(`Delete batch ${batch.product_code} "${batch.product_name}" (${units(batch.quantity)} units)?`)) return;
    try {
      await API.delete(`/expiry/${batch.id}`, { headers });
      setBatches((prev) => prev.filter((item) => item.id !== batch.id));
      notify(`Removed ${batch.product_name}`);
    } catch (err) {
      notify(err.response?.data?.error || "Could not delete", true);
    }
  };

  const exportExcel = async () => {
    setExporting(true);
    try {
      const response = await API.get("/expiry/export.xlsx", { headers, responseType: "blob" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(response.data);
      link.download = `Snackit_Expiry_Tracking_${today()}.xlsx`;
      link.click();
      URL.revokeObjectURL(link.href);
      notify("Excel report downloaded");
    } catch {
      notify("Could not create the Excel file", true);
    } finally {
      setExporting(false);
    }
  };

  const importFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
        reader.onerror = () => reject(new Error("Could not read the file"));
        reader.readAsDataURL(file);
      });
      const response = await API.post("/expiry/import", { file: base64, name: file.name }, { headers });
      setImportResult(response.data);
      if (response.data.inserted) notify(`Imported ${response.data.inserted} batch${response.data.inserted === 1 ? "" : "es"}`);
      load();
    } catch (err) {
      setImportResult({ inserted: 0, skipped: 0, errors: [err.response?.data?.error || err.message || "Import failed"] });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="audit-workspace exp-workspace">
      {toast && <div className={`audit-toast ${toast.isError ? "is-error" : ""}`}>{toast.message}</div>}

      <div className="exp-kpis">
        <div><span>Total stock value</span><b>{inr(stats.value)}</b><small>{units(stats.units)} units tracked</small></div>
        <div className="exp-kpi-bad"><span>Expired loss (write-off)</span><b>{inr(stats.lossValue)}</b><small>{lossPct}% of stock value</small></div>
        <div><span>Expired units</span><b>{units(stats.lossUnits)}</b><small>{stats.lossBatches} expired batch{stats.lossBatches === 1 ? "" : "es"}</small></div>
        <div className="exp-kpi-warn"><span>Expiring in {SOON_DAYS} days</span><b>{stats.soonBatches}</b><small>{inr(stats.soonValue)} at risk</small></div>
        <div className="exp-kpi-good"><span>Active stock</span><b>{units(stats.activeUnits)}</b><small>{inr(stats.activeValue)} serviceable</small></div>
      </div>

      <section className="audit-card exp-controls">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search product ID or name" />
        <div className="exp-segments" role="tablist" aria-label="Show">
          {[["all", "All"], ["expired", "Expired"], ["soon", "Expiring soon"], ["active", "Active"]].map(([value, label]) => (
            <button type="button" key={value} className={filter === value ? "is-active" : ""} onClick={() => setFilter(value)}>{label}</button>
          ))}
        </div>
        <div className="exp-actions">
          <button type="button" className="audit-btn audit-btn-primary" onClick={openNew}>+ Add batch</button>
          <button type="button" className={`audit-btn exp-excel ${exporting ? "is-busy" : ""}`} onClick={exportExcel} disabled={!batches.length}>{exporting ? "Preparing…" : "Export Excel"}</button>
          {isAdmin && (
            <label className={`audit-btn ${importing ? "is-busy" : ""}`}>
              {importing ? "Importing…" : "Import Excel / CSV"}
              <input type="file" accept=".xlsx,.xls,.csv" onChange={importFile} disabled={importing} hidden />
            </label>
          )}
        </div>
      </section>

      {importResult && (
        <div className={importResult.errors.length ? "audit-error audit-import-result" : "audit-import-result audit-import-ok"}>
          <b>Import finished:</b> {importResult.inserted} added, {importResult.skipped} already existed (skipped){importResult.errors.length ? `, ${importResult.errors.length} not imported:` : "."}
          {importResult.errors.length > 0 && <ul>{importResult.errors.slice(0, 20).map((e) => <li key={e}>{e}</li>)}</ul>}
          <button type="button" className="audit-link-danger" onClick={() => setImportResult(null)}>Dismiss</button>
        </div>
      )}

      {editing && <BatchForm key={editing.id || "new"} initial={editing} saving={saving} error={formError} onSave={save} onClose={() => setEditing(null)} />}

      <section className="audit-card exp-table-card">
        {loading ? <p className="audit-empty">Loading batches…</p>
          : loadError ? <div className="audit-error">{loadError} <button type="button" className="audit-btn" onClick={load}>Retry</button></div>
          : visible.length ? (
            <div className="exp-table-scroll">
              <table className="exp-table">
                <thead>
                  <tr>
                    <th>Product ID</th><th>Product</th><th>Production</th><th>Expiry</th>
                    <th className="num">Qty</th><th className="num">Cost / pc</th><th className="num">Total</th><th>Status</th><th />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((batch) => {
                    const status = statusOf(batch);
                    return (
                      <tr key={batch.id} className={`exp-row-${status}`}>
                        <td data-label="Product ID" className="mono">{batch.product_code}</td>
                        <td data-label="Product" className="exp-name">{batch.product_name}</td>
                        <td data-label="Production">{formatDate(batch.production_date)}</td>
                        <td data-label="Expiry" className="exp-expiry">{formatDate(batch.expiry_date)}</td>
                        <td data-label="Qty" className="num">{units(batch.quantity)}</td>
                        <td data-label="Cost / pc" className="num">{inr(batch.cost_per_piece)}</td>
                        <td data-label="Total" className="num exp-total">{inr(totalOf(batch))}</td>
                        <td data-label="Status"><span className={`exp-status exp-status-${status}`}>{STATUS_LABEL[status]}</span></td>
                        <td className="exp-row-actions">
                          <button type="button" className="audit-btn" onClick={() => { setFormError(""); setEditing({ ...batch, production_date: batch.production_date || "" }); }}>Edit</button>
                          {isAdmin && <button type="button" className="audit-link-danger" onClick={() => remove(batch)}>Delete</button>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={4}>{filter === "all" && !query ? "Totals" : `Totals (${visible.length} shown)`}</td>
                    <td className="num">{units(visibleQty)}</td>
                    <td />
                    <td className="num">{inr(visibleValue)}</td>
                    <td colSpan={2} className="exp-foot-loss">Loss: {inr(visibleLoss)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <div className="audit-empty fnd-empty">
              <b>{batches.length ? "No batches match" : "No batches yet"}</b>
              <span>{batches.length ? "Change the search or filter." : "Add a batch, or import your expiry sheet."}</span>
              {!batches.length && <button type="button" className="audit-btn audit-btn-primary" onClick={openNew}>+ Add batch</button>}
            </div>
          )}
      </section>
    </div>
  );
}
