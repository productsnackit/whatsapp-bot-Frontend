import { useCallback, useEffect, useMemo, useState } from "react";

/* Admin page: each person's login, role and the pages they can open.
   Passwords are never shown; "Reset password" gives a new one once. */

const ROLE_TONES = { admin: "red", support: "blue", quality: "green", operations: "amber", staff: "grey", viewer: "purple" };

function timeAgo(value) {
  if (!value) return "Never logged in";
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (minutes < 1) return "Last login just now";
  if (minutes < 60) return `Last login ${minutes} min ago`;
  if (minutes < 60 * 24) return `Last login ${Math.round(minutes / 60)} h ago`;
  return `Last login ${new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`;
}

function Credentials({ credentials, title, onClose }) {
  const [copied, setCopied] = useState(false);
  const text = `Snackit dashboard login\nUsername: ${credentials.username}\nPassword: ${credentials.password}`;
  const copy = () => {
    navigator.clipboard?.writeText(text).then(() => setCopied(true)).catch(() => {});
  };
  return (
    <div className="ea-credentials">
      <div>
        <strong>{title}</strong>
        <span>Username <b>{credentials.username}</b></span>
        <span>Password <b>{credentials.password}</b></span>
        <small>Shown only once. Share it privately; they can change it under My account.</small>
      </div>
      <div className="ea-credentials-actions">
        <button type="button" onClick={copy}>{copied ? "Copied ✓" : "Copy"}</button>
        <button type="button" onClick={onClose}>Done</button>
      </div>
    </div>
  );
}

function AccessEditor({ person, options, departments, onSave, onCancel }) {
  const [draft, setDraft] = useState(() => ({
    name: person?.name || "",
    department: person?.department || departments[0],
    role: person?.role || "",
    tags: (person?.tags || []).join(", "),
    username: person?.username || "",
    accessRole: person?.accessRole || "staff",
    pages: person?.pages || options.roles.staff.pages,
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const isNew = !person;
  const isAdminRole = draft.accessRole === "admin";

  const pickRole = (accessRole) => setDraft((current) => ({ ...current, accessRole, pages: options.roles[accessRole].pages }));
  const togglePage = (page) => setDraft((current) => ({
    ...current,
    pages: current.pages.includes(page) ? current.pages.filter((item) => item !== page) : [...current.pages, page],
  }));

  const submit = async (event) => {
    event.preventDefault();
    if (!draft.name.trim() || !draft.role.trim()) {
      setError("Name and job title are required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = { name: draft.name, department: draft.department, role: draft.role, tags: draft.tags, accessRole: draft.accessRole, pages: draft.pages };
      if (!isNew) payload.username = draft.username;
      await onSave(payload);
    } catch (err) {
      setError(err.response?.data?.error || "Could not save");
      setSaving(false);
    }
  };

  return (
    <form className="ea-editor" onSubmit={submit}>
      <div className="ea-editor-grid">
        <label>Name<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} autoFocus={isNew} /></label>
        <label>Department<select value={draft.department} onChange={(event) => setDraft({ ...draft, department: event.target.value })}>{departments.map((department) => <option key={department}>{department}</option>)}</select></label>
        <label>Job title<input value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value })} placeholder="e.g. Support executive" /></label>
        <label>Tags<input value={draft.tags} onChange={(event) => setDraft({ ...draft, tags: event.target.value })} placeholder="comma separated" /></label>
        {!isNew && <label>Username<input value={draft.username} onChange={(event) => setDraft({ ...draft, username: event.target.value })} /></label>}
      </div>

      <div className="ea-section-title">Role</div>
      <div className="ea-roles">
        {Object.entries(options.roles).map(([key, role]) => (
          <button type="button" key={key} className={`ea-role ea-tone-${ROLE_TONES[key]} ${draft.accessRole === key ? "selected" : ""}`} onClick={() => pickRole(key)}>
            <b>{role.label}</b>
            <small>{key === "admin" ? "Everything, incl. employees" : role.readOnly ? "Can look at pages, can't change anything" : role.pages.map((page) => options.pages[page]).join(", ")}</small>
          </button>
        ))}
      </div>

      <div className="ea-section-title">Pages they can open {isAdminRole ? "(admins get every page)" : "(tick or untick to adjust)"}</div>
      <div className="ea-pages">
        {Object.entries(options.pages).map(([page, label]) => (
          <label key={page} className={`ea-page ${isAdminRole || draft.pages.includes(page) ? "on" : ""} ${isAdminRole ? "locked" : ""}`}>
            <input type="checkbox" checked={isAdminRole || draft.pages.includes(page)} disabled={isAdminRole} onChange={() => togglePage(page)} />
            {label}
          </label>
        ))}
        <label className="ea-page on locked"><input type="checkbox" checked disabled />Internal Chat (always)</label>
      </div>
      {draft.accessRole === "viewer" && <p className="ea-note">👀 Viewers can open these pages but can't change anything.</p>}

      {error && <div className="ea-error">{error}</div>}
      <div className="ea-editor-actions">
        <button type="button" onClick={onCancel}>Cancel</button>
        <button type="submit" className="primary" disabled={saving}>{saving ? "Saving…" : isNew ? "Add employee" : "Save changes"}</button>
      </div>
    </form>
  );
}

export default function EmployeesAccess({ api, headers, departments, currentUserId, onChanged }) {
  const [people, setPeople] = useState([]);
  const [options, setOptions] = useState(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null); // person id, or "new"
  const [credentials, setCredentials] = useState(null);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const authorization = headers.Authorization;

  const load = useCallback(async () => {
    try {
      const config = { headers: { Authorization: authorization } };
      const [users, access] = await Promise.all([api.get("/internal/users", config), api.get("/internal/access-options", config)]);
      setPeople(users.data || []);
      setOptions(access.data);
      setError("");
    } catch (err) {
      setError(err.response?.data?.error || "Could not load employees");
    }
  }, [api, authorization]);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const config = { headers: { Authorization: authorization } };
  const afterChange = async () => { await load(); onChanged?.(); };

  const save = async (person, payload) => {
    if (person) {
      await api.patch(`/internal/users/${person.id}`, payload, config);
    } else {
      const response = await api.post("/internal/users", payload, config);
      setCredentials({ ...response.data.credentials, title: `${payload.name} can now log in` });
    }
    setEditing(null);
    await afterChange();
  };

  const resetPassword = async (person) => {
    if (!window.confirm(`Give ${person.name} a new password? They'll be logged out everywhere.`)) return;
    const response = await api.post(`/internal/users/${person.id}/reset-password`, {}, config);
    setCredentials({ ...response.data.credentials, title: `New password for ${person.name}` });
  };

  const remove = async (person) => {
    if (!window.confirm(`Delete ${person.name}? They'll lose access immediately. Their chat messages stay.`)) return;
    await api.delete(`/internal/users/${person.id}`, config);
    await afterChange();
  };

  const counts = useMemo(() => people.reduce((acc, person) => ({ ...acc, [person.accessRole]: (acc[person.accessRole] || 0) + 1 }), {}), [people]);
  const q = query.trim().toLowerCase();
  const shown = people.filter((person) => (roleFilter === "all" || person.accessRole === roleFilter) && (!q || `${person.name} ${person.username} ${person.department} ${person.role}`.toLowerCase().includes(q)));

  if (error) return <div className="ea-error">{error} <button type="button" onClick={load}>Retry</button></div>;
  if (!options) return <div className="ea-loading">Loading employees…</div>;

  return (
    <section className="ea">
      <div className="ea-hero">
        <div>
          <span className="employee-eyebrow">Admin workspace</span>
          <h2>Employees & access</h2>
          <p>Everyone logs in with their own account. Their role decides which pages they can open, and every change they make is recorded in the Activity log.</p>
        </div>
        <button type="button" className="ea-add" onClick={() => setEditing("new")}>+ Add employee</button>
      </div>

      {credentials && <Credentials credentials={credentials} title={credentials.title} onClose={() => setCredentials(null)} />}

      {editing === "new" && (
        <div className="ea-card is-editing"><AccessEditor options={options} departments={departments} onSave={(payload) => save(null, payload)} onCancel={() => setEditing(null)} /></div>
      )}

      <div className="ea-toolbar">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, username or department" />
        <div className="ea-filters">
          <button type="button" className={roleFilter === "all" ? "active" : ""} onClick={() => setRoleFilter("all")}>All ({people.length})</button>
          {Object.entries(options.roles).map(([key, role]) => counts[key] ? (
            <button type="button" key={key} className={roleFilter === key ? "active" : ""} onClick={() => setRoleFilter(key)}>{role.label.replace(" (read only)", "")} ({counts[key]})</button>
          ) : null)}
        </div>
      </div>

      <div className="ea-list">
        {shown.map((person) => (
          <div key={person.id} className={`ea-card ${editing === person.id ? "is-editing" : ""}`}>
            {editing === person.id ? (
              <AccessEditor person={person} options={options} departments={departments} onSave={(payload) => save(person, payload)} onCancel={() => setEditing(null)} />
            ) : (
              <>
                <div className="ea-person">
                  <span className="ea-avatar">{person.name.slice(0, 1).toUpperCase()}</span>
                  <div>
                    <h3>{person.name}{String(person.id) === String(currentUserId) ? " (you)" : ""}</h3>
                    <p>{person.role} · {person.department} · <code>{person.username}</code></p>
                    <small>{timeAgo(person.lastLoginAt)}</small>
                  </div>
                  <span className={`ea-badge ea-tone-${ROLE_TONES[person.accessRole]}`}>{person.roleLabel}</span>
                </div>
                <div className="ea-chips">
                  {person.isAdmin ? <span className="ea-chip strong">All pages + employees</span> : person.pages.length ? person.pages.map((page) => <span key={page} className="ea-chip">{options.pages[page]}</span>) : <span className="ea-chip muted">Internal Chat only</span>}
                </div>
                <div className="ea-actions">
                  <button type="button" onClick={() => setEditing(person.id)}>Edit access</button>
                  <button type="button" onClick={() => resetPassword(person)}>Reset password</button>
                  {String(person.id) !== String(currentUserId) && <button type="button" className="danger" onClick={() => remove(person)}>Delete</button>}
                </div>
              </>
            )}
          </div>
        ))}
        {!shown.length && <p className="ea-empty">No one matches.</p>}
      </div>
    </section>
  );
}
