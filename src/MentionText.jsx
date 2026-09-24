// Message text with tagged names shown as highlighted @Name, like WhatsApp.
function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export default function MentionText({ text, names }) {
  const value = String(text || "");
  const list = [...new Set(names || [])].filter(Boolean).sort((a, b) => b.length - a.length);
  if (!list.length || !value.includes("@")) return value;
  const pattern = new RegExp(`(@(?:${list.map(escapeRegExp).join("|")}))(?=$|[\\s.,!?:;)])`, "g");
  return value.split(pattern).map((part, index) =>
    index % 2 === 1 ? <span key={index} className="chat-mention">{part}</span> : part
  );
}

// Pick-list shown above the message box while typing "@".
export function MentionSuggestions({ people, onPick, department }) {
  return (
    <div className="mention-suggestions" role="listbox" aria-label="Tag someone">
      <div className="mention-suggestions-head">Tag someone from {department}</div>
      {people.length ? people.map((person) => (
        <button
          type="button"
          key={person.id}
          role="option"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onPick(person)}
        >
          <span className="mention-avatar">{person.name.charAt(0).toUpperCase()}</span>
          <span><b>{person.name}</b><small>{person.role}</small></span>
        </button>
      )) : <p>No one in {department} matches that name.</p>}
    </div>
  );
}

// Under a message that tags people: its status, and buttons for the tagged person.
export function TaskLine({ message, taggedNames, canUpdate, onSetStatus }) {
  const status = message.status || "open";
  const who = message.statusUpdatedBy || "";
  const label = status === "resolved"
    ? `✅ Resolved by ${who || "tagged person"}`
    : status === "in-progress"
      ? `🔄 In progress${who ? ` · ${who}` : ""}`
      : `⏳ Waiting for ${taggedNames.join(", ")}`;
  return (
    <div className={`chat-task chat-task-${status}`}>
      <span className="chat-task-label">{label}</span>
      {canUpdate && (
        <span className="chat-task-actions">
          {status === "open" && <button type="button" onClick={(event) => { event.stopPropagation(); onSetStatus("in-progress"); }}>In progress</button>}
          {status !== "resolved" && <button type="button" className="is-primary" onClick={(event) => { event.stopPropagation(); onSetStatus("resolved"); }}>Resolved</button>}
          {status === "resolved" && <button type="button" onClick={(event) => { event.stopPropagation(); onSetStatus("open"); }}>Reopen</button>}
        </span>
      )}
    </div>
  );
}
