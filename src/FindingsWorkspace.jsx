import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { parseCsv } from "./csv.js";

const API = axios.create({ baseURL: "https://whatsapp-bot-backend-b3nb.onrender.com" });

const RISKS = [
  ["Critical", "Immediate safety, legal or customer impact"],
  ["Major", "Significant process deviation or quality loss"],
  ["Minor", "Isolated lapse or paperwork gap"],
  ["Observation", "Improvement opportunity"],
];
const STATUSES = [
  ["Open", "Pending root cause & action plan"],
  ["In Progress", "Actions being carried out"],
  ["Under Review", "Waiting for auditor verification"],
  ["Closed", "Verified effective & signed off"],
];
const RISK_TONE = { Critical: "bad", Major: "orange", Minor: "warn", Observation: "blue" };
const STATUS_TONE = { Open: "warn", "In Progress": "blue", "Under Review": "purple", Closed: "good" };

// Today's date on this device (not UTC, which is still "yesterday" in India before 5:30 am).
const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};
const dateOnly = (value) => (value ? String(value).slice(0, 10) : "");
const formatDate = (value) => {
  if (!value) return "—";
  const date = new Date(`${dateOnly(value)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};
const isOverdue = (finding) => finding.status !== "Closed" && finding.due_date && dateOnly(finding.due_date) < today();

function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

// CSV headers we understand (Export CSV's own columns plus common alternatives), matched ignoring case and spaces.
const IMPORT_COLUMNS = {
  ref: ["ref", "refid", "reference", "auditid", "findingid", "id"],
  department: ["department", "dept", "area", "departmentprocessarea"],
  observed_on: ["observed", "observedon", "observationdate", "dateobserved", "date"],
  title: ["finding", "title", "findingtitle", "nonconformance", "auditfindingtitle"],
  description: ["evidence", "description", "observation", "detailedobservation", "whatwasobserved"],
  risk: ["risk", "risklevel", "severity"],
  status: ["status", "lifecyclestatus"],
  root_cause: ["rootcause", "rca"],
  action_plan: ["actionplan", "capa", "capaplan", "correctiveaction"],
  assignee_name: ["actionowner", "owner", "assignee", "responsible"],
  due_date: ["due", "duedate", "targetdate", "targetcompletionduedate"],
  created_by: ["loggedby", "createdby"],
};
const TEMPLATE_HEADER = ["Ref", "Department", "Observed", "Finding", "Evidence", "Risk", "Status", "Root cause", "Action plan", "Action owner", "Due"];

function findingRowsFromCsv(text) {
  const [header, ...lines] = parseCsv(text.replace(/^\uFEFF/, ""));
  if (!header) return [];
  const keys = header.map((cell) => {
    const name = cell.toLowerCase().replace(/[^a-z]/g, "");
    return Object.keys(IMPORT_COLUMNS).find((key) => IMPORT_COLUMNS[key].includes(name)) || null;
  });
  if (!keys.includes("title")) throw new Error('The file needs a "Finding" (title) column. Download the template to see the columns.');
  return lines.map((cells) => Object.fromEntries(keys.map((key, i) => [key, cells[i]]).filter(([key]) => key)));
}

const emptyForm = (department) => ({
  department: department || "Operations",
  observed_on: today(),
  title: "",
  description: "",
  risk: "Major",
  status: "Open",
  root_cause: "",
  action_plan: "",
  assignee_id: "",
  due_date: "",
});

/* ---------- Log / edit a finding ---------- */
function FindingForm({ initial, departments, employees, saving, error, onSave, onClose }) {
  const [form, setForm] = useState(initial);
  const set = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));
  const editing = Boolean(initial.id);

  return (
    <div className="fnd-backdrop" onClick={onClose}>
      <form className="fnd-modal" onClick={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); onSave(form); }}>
        <div className="fnd-modal-head">
          <h3>{editing ? `Edit ${initial.ref}` : "Log audit observation"}</h3>
          <button type="button" className="fnd-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="fnd-modal-body">
          <div className="fnd-grid fnd-grid-3">
            <label>Department *
              <select value={form.department} onChange={set("department")} required>
                {departments.map((department) => <option key={department}>{department}</option>)}
              </select>
            </label>
            <label>Observation date *
              <input type="date" value={dateOnly(form.observed_on)} onChange={set("observed_on")} required />
            </label>
            <label>Risk level *
              <select value={form.risk} onChange={set("risk")} required>
                {RISKS.map(([value, hint]) => <option key={value} value={value}>{value}: {hint}</option>)}
              </select>
            </label>
          </div>
          <label>Finding / non-conformance *
            <input value={form.title} onChange={set("title")} placeholder="Short statement of what's wrong" required />
          </label>
          <label>What was observed (evidence) *
            <textarea rows={3} value={form.description} onChange={set("description")} placeholder="What you saw, where, which SOP was missed, photos or records checked…" required />
          </label>
          <label>Root cause
            <textarea rows={2} value={form.root_cause || ""} onChange={set("root_cause")} placeholder="Why did it happen? e.g. no training, missed schedule, unclear SOP" />
          </label>
          <label>Corrective & preventive action plan *
            <textarea rows={3} value={form.action_plan} onChange={set("action_plan")} placeholder="Steps to fix it now and stop it happening again" required />
          </label>
          <div className="fnd-grid fnd-grid-3">
            <label>Action owner *
              <select value={form.assignee_id || ""} onChange={set("assignee_id")} required>
                <option value="">Choose an employee</option>
                {departments.map((department) => {
                  const people = employees.filter((user) => user.department === department);
                  return people.length ? (
                    <optgroup key={department} label={department}>
                      {people.map((user) => <option key={user.id} value={String(user.id)}>{user.name} · {user.role}</option>)}
                    </optgroup>
                  ) : null;
                })}
              </select>
            </label>
            <label>Due date *
              <input type="date" value={dateOnly(form.due_date)} onChange={set("due_date")} required />
            </label>
            <label>Status *
              <select value={form.status} onChange={set("status")} required>
                {STATUSES.map(([value, hint]) => <option key={value} value={value}>{value}: {hint}</option>)}
              </select>
            </label>
          </div>
          {!editing && <p className="fnd-hint">The action owner gets a notification on their phone.</p>}
          {error && <div className="audit-error">{error}</div>}
        </div>
        <div className="fnd-modal-foot">
          <button type="button" className="audit-btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="audit-btn audit-btn-primary" disabled={saving}>{saving ? "Saving…" : editing ? "Save changes" : "Save finding"}</button>
        </div>
      </form>
    </div>
  );
}

/* ---------- Follow-up trail ---------- */
function FollowUps({ finding, currentUserName, onAdd, onClose }) {
  const [entry, setEntry] = useState({ date: today(), auditor: currentUserName || "", status: finding.status === "Open" ? "In Progress" : finding.status, notes: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const trail = [...(finding.follow_ups || [])].reverse();

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await onAdd(finding, entry);
      setEntry((prev) => ({ ...prev, notes: "" }));
    } catch (err) {
      setError(err.response?.data?.error || "Could not save the follow-up");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fnd-backdrop" onClick={onClose}>
      <div className="fnd-modal" onClick={(event) => event.stopPropagation()}>
        <div className="fnd-modal-head">
          <div>
            <span className="fnd-ref">{finding.ref}</span>
            <h3>Follow-up & verification</h3>
            <p className="fnd-sub">{finding.title}</p>
          </div>
          <button type="button" className="fnd-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="fnd-modal-body">
          <div className="fnd-snapshot">
            <div><span>Department</span><b>{finding.department}</b></div>
            <div><span>Action owner</span><b>{finding.assignee_name || "—"}</b></div>
            <div><span>Due</span><b className={isOverdue(finding) ? "fnd-overdue-text" : ""}>{formatDate(finding.due_date)}{isOverdue(finding) ? " · overdue" : ""}</b></div>
            <div><span>Status</span><b><span className={`audit-pill fnd-tone-${STATUS_TONE[finding.status]}`}>{finding.status}</span></b></div>
            <p><span>Action plan</span>{finding.action_plan}</p>
          </div>

          <form className="fnd-followup-form" onSubmit={submit}>
            <h4>Record a follow-up check</h4>
            <div className="fnd-grid fnd-grid-3">
              <label>Check date<input type="date" value={entry.date} onChange={(e) => setEntry((p) => ({ ...p, date: e.target.value }))} required /></label>
              <label>Checked by<input value={entry.auditor} onChange={(e) => setEntry((p) => ({ ...p, auditor: e.target.value }))} placeholder="Your name" /></label>
              <label>Outcome
                <select value={entry.status} onChange={(e) => setEntry((p) => ({ ...p, status: e.target.value }))}>
                  <option value="Open">Still open (no action yet)</option>
                  <option value="In Progress">Progressing</option>
                  <option value="Under Review">Under review / testing</option>
                  <option value="Closed">Closed (verified)</option>
                </select>
              </label>
            </div>
            <label>What was checked
              <textarea rows={2} value={entry.notes} onChange={(e) => setEntry((p) => ({ ...p, notes: e.target.value }))} placeholder="Site visit, photo checked, SOP updated, staff trained…" required />
            </label>
            {error && <div className="audit-error">{error}</div>}
            <button type="submit" className="audit-btn audit-btn-primary" disabled={saving}>{saving ? "Saving…" : "Add follow-up"}</button>
          </form>

          <h4 className="fnd-timeline-title">History</h4>
          {trail.length ? (
            <ol className="fnd-timeline">
              {trail.map((item, index) => (
                <li key={`${item.recordedAt || item.date}-${index}`}>
                  <div className="fnd-timeline-head">
                    <span className={`audit-pill fnd-tone-${STATUS_TONE[item.status]}`}>{item.status}</span>
                    <b>{item.auditor}</b>
                    <span>{formatDate(item.date)}</span>
                  </div>
                  <p>{item.notes}</p>
                  {item.recordedBy && item.recordedBy !== item.auditor && <small>Recorded by {item.recordedBy}</small>}
                </li>
              ))}
            </ol>
          ) : <p className="audit-empty">No follow-up checks yet.</p>}
        </div>
      </div>
    </div>
  );
}

/* ---------- Page ---------- */
export default function FindingsWorkspace({ token, isAdmin, currentUserName, currentUserId, internalUsers, departments }) {
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);
  const [findings, setFindings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [toast, setToast] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [riskFilter, setRiskFilter] = useState("ALL");
  const [deptFilter, setDeptFilter] = useState("ALL");
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [onlyMine, setOnlyMine] = useState(false);
  const [editing, setEditing] = useState(null);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [followUpId, setFollowUpId] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);

  const notify = useCallback((message, isError = false) => {
    setToast({ message, isError });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const load = useCallback(async () => {
    try {
      const response = await API.get("/findings", { headers });
      setFindings(Array.isArray(response.data) ? response.data : []);
      setLoadError("");
    } catch (err) {
      setLoadError(err.response?.data?.error || "Could not load audit findings.");
    } finally {
      setLoading(false);
    }
  }, [headers]);

  useEffect(() => {
    let active = true;
    API.get("/findings", { headers })
      .then((response) => { if (active) setFindings(Array.isArray(response.data) ? response.data : []); })
      .catch((err) => { if (active) setLoadError(err.response?.data?.error || "Could not load audit findings."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [headers]);

  const replace = (finding) => setFindings((prev) => {
    const exists = prev.some((item) => item.id === finding.id);
    return exists ? prev.map((item) => (item.id === finding.id ? finding : item)) : [finding, ...prev];
  });

  const counts = useMemo(() => {
    const by = (key, value) => findings.filter((f) => f[key] === value).length;
    const closed = by("status", "Closed");
    return {
      total: findings.length,
      open: by("status", "Open"),
      progress: by("status", "In Progress"),
      review: by("status", "Under Review"),
      closed,
      rate: findings.length ? Math.round((closed / findings.length) * 100) : 0,
      overdue: findings.filter(isOverdue).length,
      risk: Object.fromEntries(RISKS.map(([risk]) => [risk, by("risk", risk)])),
    };
  }, [findings]);

  const query = search.trim().toLowerCase();
  const filtered = findings.filter((f) =>
    (!query || [f.ref, f.department, f.title, f.description, f.assignee_name, f.root_cause, f.action_plan].some((v) => String(v || "").toLowerCase().includes(query)))
    && (statusFilter === "ALL" || f.status === statusFilter)
    && (riskFilter === "ALL" || f.risk === riskFilter)
    && (deptFilter === "ALL" || f.department === deptFilter)
    && (!onlyOverdue || isOverdue(f))
    && (!onlyMine || String(f.assignee_id) === String(currentUserId))
  );
  const filtersOn = query || statusFilter !== "ALL" || riskFilter !== "ALL" || deptFilter !== "ALL" || onlyOverdue || onlyMine;
  const clearFilters = () => { setSearch(""); setStatusFilter("ALL"); setRiskFilter("ALL"); setDeptFilter("ALL"); setOnlyOverdue(false); setOnlyMine(false); };

  const save = async (form) => {
    setSaving(true);
    setFormError("");
    try {
      const payload = {
        department: form.department, observed_on: dateOnly(form.observed_on), title: form.title, description: form.description,
        risk: form.risk, status: form.status, root_cause: form.root_cause || "", action_plan: form.action_plan,
        assignee_id: form.assignee_id, due_date: dateOnly(form.due_date),
      };
      const response = form.id
        ? await API.patch(`/findings/${form.id}`, payload, { headers })
        : await API.post("/findings", payload, { headers });
      replace(response.data);
      setEditing(null);
      notify(form.id ? `${response.data.ref} updated` : `${response.data.ref} logged · ${response.data.assignee_name} notified`);
    } catch (err) {
      setFormError(err.response?.data?.error || "Could not save. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  const addFollowUp = async (finding, entry) => {
    const response = await API.post(`/findings/${finding.id}/follow-ups`, entry, { headers });
    replace(response.data);
    notify(`Follow-up added to ${finding.ref}`);
  };

  const quickStatus = async (finding, status) => {
    try {
      const notes = status === "Closed" ? "Verified and closed." : "Re-opened for further action.";
      const response = await API.post(`/findings/${finding.id}/follow-ups`, { status, notes, date: today(), auditor: currentUserName }, { headers });
      replace(response.data);
      notify(status === "Closed" ? `${finding.ref} closed` : `${finding.ref} re-opened`);
    } catch (err) {
      notify(err.response?.data?.error || "Could not update", true);
    }
  };

  const remove = async (finding) => {
    if (!window.confirm(`Delete ${finding.ref} "${finding.title}"? This can't be undone.`)) return;
    try {
      await API.delete(`/findings/${finding.id}`, { headers });
      setFindings((prev) => prev.filter((item) => item.id !== finding.id));
      notify(`${finding.ref} deleted`);
    } catch (err) {
      notify(err.response?.data?.error || "Could not delete", true);
    }
  };

  const exportCsv = () => downloadCsv(`Snackit_Audit_Findings_${today()}.csv`, [
    ["Ref", "Department", "Observed", "Finding", "Evidence", "Risk", "Status", "Root cause", "Action plan", "Action owner", "Due", "Overdue", "Follow-ups", "Logged by"],
    ...filtered.map((f) => [f.ref, f.department, dateOnly(f.observed_on), f.title, f.description, f.risk, f.status, f.root_cause, f.action_plan, f.assignee_name, dateOnly(f.due_date), isOverdue(f) ? "YES" : "NO", (f.follow_ups || []).length, f.created_by]),
  ]);

  const importCsv = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    try {
      const rows = findingRowsFromCsv(await file.text());
      if (!rows.length) throw new Error("The file has no finding rows.");
      const response = await API.post("/findings/import", { rows }, { headers });
      setImportResult(response.data);
      if (response.data.inserted) notify(`Imported ${response.data.inserted} finding${response.data.inserted === 1 ? "" : "s"}`);
      load();
    } catch (err) {
      setImportResult({ inserted: 0, skipped: 0, errors: [err.response?.data?.error || err.message || "Import failed"] });
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = () => downloadCsv("Snackit_Audit_Findings_Template.csv", [
    TEMPLATE_HEADER,
    ["", "Accounts", today(), "Refunds approved without UPI proof", "7 of 20 September refunds had no proof attached", "Major", "Open", "No checklist in refund SOP", "Add proof upload step; retrain team", "Deepika", today()],
  ]);

  const followUpFinding = findings.find((f) => f.id === followUpId);

  return (
    <div className="audit-workspace fnd-workspace">
      {toast && <div className={`audit-toast ${toast.isError ? "is-error" : ""}`}>{toast.message}</div>}

      <div className="fnd-print-head">
        <h2>Snackit · Internal Audit Findings & CAPA</h2>
        <p>Printed {new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} · {filtered.length} findings{filtersOn ? " (filtered)" : ""}</p>
      </div>

      <div className="fnd-kpis">
        <div><span>Total findings</span><b>{counts.total}</b><small>Recorded</small></div>
        <div className="fnd-kpi-warn"><span>Open</span><b>{counts.open}</b><small>Pending action</small></div>
        <div className="fnd-kpi-blue"><span>In progress</span><b>{counts.progress}</b><small>Actions ongoing</small></div>
        <div className="fnd-kpi-purple"><span>Under review</span><b>{counts.review}</b><small>Auditor check</small></div>
        <div className="fnd-kpi-good"><span>Closed</span><b>{counts.closed}</b><small>{counts.rate}% resolved</small></div>
        <button type="button" className={`fnd-kpi-bad ${onlyOverdue ? "is-active" : ""}`} onClick={() => setOnlyOverdue((v) => !v)}>
          <span>Overdue</span><b>{counts.overdue}</b><small>{onlyOverdue ? "Showing overdue · tap to clear" : "Tap to show"}</small>
        </button>
      </div>

      <section className="audit-card fnd-controls">
        <div className="audit-toolbar">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search finding, department, owner, root cause or ref" />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Status">
            <option value="ALL">All statuses</option>
            {STATUSES.map(([value]) => <option key={value}>{value}</option>)}
          </select>
          <select value={riskFilter} onChange={(e) => setRiskFilter(e.target.value)} aria-label="Risk">
            <option value="ALL">All risk levels</option>
            {RISKS.map(([value]) => <option key={value}>{value}</option>)}
          </select>
          <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} aria-label="Department">
            <option value="ALL">All departments</option>
            {departments.map((department) => <option key={department}>{department}</option>)}
          </select>
          {!isAdmin && (
            <label className="audit-check fnd-mine"><input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} /> Assigned to me</label>
          )}
          {filtersOn && <button type="button" className="audit-btn" onClick={clearFilters}>Clear</button>}
        </div>
        <div className="fnd-controls-foot">
          <div className="fnd-risk-matrix">
            <span>Risk:</span>
            {RISKS.map(([risk]) => (
              <button type="button" key={risk} className={`audit-pill fnd-tone-${RISK_TONE[risk]} ${riskFilter === risk ? "is-active" : ""}`} onClick={() => setRiskFilter(riskFilter === risk ? "ALL" : risk)}>
                {risk} {counts.risk[risk]}
              </button>
            ))}
          </div>
          <div className="fnd-actions">
            <button type="button" className="audit-btn" onClick={exportCsv} disabled={!filtered.length}>Export CSV</button>
            {isAdmin && (
              <>
                <label className={`audit-btn ${importing ? "is-busy" : ""}`}>
                  {importing ? "Importing…" : "Import CSV"}
                  <input type="file" accept=".csv,text/csv" onChange={importCsv} disabled={importing} hidden />
                </label>
                <button type="button" className="audit-btn fnd-template-btn" onClick={downloadTemplate} title="Download a CSV with the right columns">Template</button>
              </>
            )}
            <button type="button" className="audit-btn" onClick={() => window.print()} disabled={!filtered.length}>Print</button>
            <button type="button" className="audit-btn audit-btn-primary" onClick={() => { setFormError(""); setEditing(emptyForm(deptFilter !== "ALL" ? deptFilter : undefined)); }}>+ Log finding</button>
          </div>
        </div>
      </section>

      {importResult && (
        <div className={importResult.errors.length ? "audit-error audit-import-result" : "audit-import-result audit-import-ok"}>
          <b>Import finished:</b> {importResult.inserted} added, {importResult.skipped} already existed (skipped){importResult.errors.length ? `, ${importResult.errors.length} not imported:` : "."}
          {importResult.errors.length > 0 && <ul>{importResult.errors.slice(0, 20).map((e) => <li key={e}>{e}</li>)}</ul>}
          <button type="button" className="audit-link-danger" onClick={() => setImportResult(null)}>Dismiss</button>
        </div>
      )}

      <section className="audit-card">
        <div className="audit-card-head">
          <div><h3>Findings & follow-up register</h3><p>Showing {filtered.length} of {findings.length}</p></div>
        </div>
        {loading ? <p className="audit-empty">Loading findings…</p>
          : loadError ? <div className="audit-error">{loadError} <button type="button" className="audit-btn" onClick={load}>Retry</button></div>
          : filtered.length ? (
            <div className="fnd-list">
              {filtered.map((f) => {
                const overdue = isOverdue(f);
                return (
                  <article key={f.id} className={`fnd-item fnd-risk-${RISK_TONE[f.risk]} ${overdue ? "is-overdue" : ""}`}>
                    <div className="fnd-item-main">
                      <div className="fnd-item-top">
                        <span className="fnd-ref">{f.ref}</span>
                        <span className={`audit-pill fnd-tone-${RISK_TONE[f.risk]}`}>{f.risk}</span>
                        <span className={`audit-pill fnd-tone-${STATUS_TONE[f.status]}`}>{f.status}</span>
                        {overdue && <span className="audit-pill fnd-tone-bad">Overdue</span>}
                      </div>
                      <button type="button" className="fnd-title" onClick={() => setFollowUpId(f.id)}>{f.title}</button>
                      <p className="fnd-desc">{f.description}</p>
                      {f.root_cause && <p className="fnd-rca"><b>Root cause:</b> {f.root_cause}</p>}
                      <div className="fnd-meta">
                        <span>{f.department}</span>
                        <span>Observed {formatDate(f.observed_on)}</span>
                        <span>Owner <b>{f.assignee_name || "—"}</b></span>
                        <span className={overdue ? "fnd-overdue-text" : ""}>Due {formatDate(f.due_date)}</span>
                      </div>
                    </div>
                    <div className="fnd-item-side">
                      <button type="button" className="audit-btn" onClick={() => setFollowUpId(f.id)}>Follow-ups ({(f.follow_ups || []).length})</button>
                      {f.status !== "Closed"
                        ? <button type="button" className="audit-btn fnd-btn-good" onClick={() => quickStatus(f, "Closed")}>Verify & close</button>
                        : <button type="button" className="audit-btn" onClick={() => quickStatus(f, "Open")}>Re-open</button>}
                      <button type="button" className="audit-btn" onClick={() => { setFormError(""); setEditing({ ...f, assignee_id: String(f.assignee_id || "") }); }}>Edit</button>
                      {isAdmin && <button type="button" className="audit-link-danger" onClick={() => remove(f)}>Delete</button>}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="audit-empty fnd-empty">
              <b>{findings.length ? "No findings match these filters" : "No audit findings yet"}</b>
              <span>{findings.length ? "Clear the filters or search for something else." : "Log the first observation from an internal audit."}</span>
              {findings.length ? <button type="button" className="audit-btn" onClick={clearFilters}>Clear filters</button>
                : <button type="button" className="audit-btn audit-btn-primary" onClick={() => setEditing(emptyForm())}>+ Log finding</button>}
            </div>
          )}
      </section>

      {editing && (
        <FindingForm
          initial={editing}
          departments={departments}
          employees={internalUsers}
          saving={saving}
          error={formError}
          onSave={save}
          onClose={() => setEditing(null)}
        />
      )}
      {followUpFinding && (
        <FollowUps key={followUpFinding.id} finding={followUpFinding} currentUserName={currentUserName} onAdd={addFollowUp} onClose={() => setFollowUpId(null)} />
      )}
    </div>
  );
}
