/* Direct Supply: every section is an always-open box with a short guide
   (two "how to use" points and a real use case) under its title. */

export function Guide({ how, use }) {
  return (
    <div className="ds-guide">
      <div className="ds-guide-how">
        <b>How to use</b>
        <ol>{how.map((point) => <li key={point}>{point}</li>)}</ol>
      </div>
      <div className="ds-guide-use">
        <b>Use case</b>
        <p>{use}</p>
      </div>
    </div>
  );
}

export function Box({ id, icon, tone = "slate", title, sub, guide, actions, foot, className = "", scroll = false, children }) {
  return (
    <section id={id} className={`audit-card ds-box ds-tone-${tone} ${className}`}>
      <header className="ds-box-head">
        <div className="ds-box-title">
          {icon && <span className="ds-box-icon" aria-hidden="true">{icon}</span>}
          <div><h3>{title}</h3>{sub && <p>{sub}</p>}</div>
        </div>
        {actions && <div className="ds-box-actions">{actions}</div>}
      </header>
      {guide && <Guide {...guide} />}
      <div className={`ds-box-body ${scroll ? "is-scroll" : ""}`}>{children}</div>
      {foot && <div className="ds-box-foot">{foot}</div>}
    </section>
  );
}
