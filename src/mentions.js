// @-tagging for Internal Chat. In a department group only that department's people can be tagged.
import { useState } from "react";

// The @word being typed just before the cursor, e.g. "…ask @dee" -> { start, query: "dee" }.
function mentionAt(text, caret) {
  const match = /(^|\s)@([^\s@]*)$/.exec(text.slice(0, caret));
  return match ? { start: caret - match[2].length - 1, caret, query: match[2].toLowerCase() } : null;
}

// Ids of the people whose "@Name" is in the text.
export function mentionIds(text, people) {
  return people.filter((person) => text.includes(`@${person.name}`)).map((person) => String(person.id));
}

// inputRef: the message box's ref (created by the caller).
export function useMentionInput({ inputRef, value, setValue, people, onEnter }) {
  const [active, setActive] = useState(null);
  const suggestions = active
    ? people.filter((person) => person.name.toLowerCase().includes(active.query)).slice(0, 8)
    : [];

  const place = (text, caret) => {
    setValue(text);
    requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) return;
      input.focus();
      input.setSelectionRange(caret, caret);
    });
  };

  const pick = (person) => {
    if (!active) return;
    const insert = `@${person.name} `;
    place(value.slice(0, active.start) + insert + value.slice(active.caret), active.start + insert.length);
    setActive(null);
  };

  return {
    suggestions,
    open: Boolean(active),
    pick,
    close: () => setActive(null),
    // The "@" button: start a tag at the cursor and show everyone who can be tagged.
    openPicker: () => {
      const caret = inputRef.current?.selectionStart ?? value.length;
      const before = value.slice(0, caret);
      const insert = before && !/\s$/.test(before) ? " @" : "@";
      const next = before + insert + value.slice(caret);
      place(next, caret + insert.length);
      setActive({ start: caret + insert.length - 1, caret: caret + insert.length, query: "" });
    },
    onChange: (event) => {
      setValue(event.target.value);
      setActive(mentionAt(event.target.value, event.target.selectionStart ?? event.target.value.length));
    },
    onKeyDown: (event) => {
      if (active && suggestions.length && (event.key === "Enter" || event.key === "Tab")) {
        event.preventDefault();
        pick(suggestions[0]);
      } else if (active && event.key === "Escape") {
        setActive(null);
      } else if (event.key === "Enter") {
        event.preventDefault();
        onEnter();
      }
    },
  };
}
