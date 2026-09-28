import { useMemo, useState } from "react";
import { parseTimetable, matchSites, guessRefiller } from "./refillTimetable.js";

/* Refill Schedule → "Paste weekly timetable": a refiller's Excel timetable is pasted,
   matched to the sites, checked in a preview and applied in one go. */

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const STATUS_LABEL = { match: "Matched", check: "Check the match", new: "New site" };

export default function RefillTimetableImport({ api, headers, locations, refillers, onDone, onClose }) {
  const [text, setText] = useState("");
  const [refillerId, setRefillerId] = useState("");
  const [rows, setRows] = useState(null);
  const [parseError, setParseError] = useState("");
  const [pauseOthers, setPauseOthers] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const read = (value) => {
    setText(value);
    setError("");
    if (!value.trim()) { setRows(null); setParseError(""); return; }
    const parsed = parseTimetable(value);
    if (parsed.error) { setRows(null); setParseError(parsed.error); return; }
    setParseError("");
    setRows(matchSites(parsed.sites, locations));
    const guess = guessRefiller(parsed.title, refillers);
    if (guess) setRefillerId(guess);
  };

  const byId = useMemo(() => new Map(locations.map((site) => [String(site.id), site])), [locations]);
  const refiller = refillers.find((item) => String(item.id) === String(refillerId));
  const chosen = (rows || []).filter((row) => row.choice !== "skip");
  const chosenIds = new Set(chosen.filter((row) => row.choice !== "new").map((row) => row.choice));
  const duplicates = chosen.filter((row, index) => row.choice !== "new" && chosen.findIndex((other) => other.choice === row.choice) !== index);
  const others = refiller ? locations.filter((site) => site.refiller_id === refiller.id && !chosenIds.has(String(site.id)) && site.schedule?.active) : [];
  const toCheck = chosen.filter((row) => row.status === "check").length;

  const update = (key, patch) => setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  const toggleDay = (row, day) => update(row.key, { days: row.days.includes(day) ? row.days.filter((d) => d !== day) : [...row.days, day] });

  const apply = async () => {
    if (!refiller) { setError("Choose whose timetable this is."); return; }
    if (duplicates.length) { setError(`Two rows point to ${byId.get(duplicates[0].choice)?.name}. Change one of them.`); return; }
    const moving = chosen.filter((row) => row.choice !== "new" && byId.get(row.choice)?.refiller_id && byId.get(row.choice).refiller_id !== refiller.id);
    const lines = [
      `Apply ${refiller.name}'s timetable: ${chosen.length} site${chosen.length === 1 ? "" : "s"}.`,
      moving.length ? `${moving.length} site${moving.length === 1 ? "" : "s"} move to ${refiller.name} from another refiller.` : "",
      chosen.some((row) => row.choice === "new") ? `${chosen.filter((row) => row.choice === "new").length} new site(s) will be created.` : "",
      pauseOthers && others.length ? `${others.length} of their other site(s) will be paused.` : "",
      "Upcoming visits are rebuilt; refillers already reminded keep those visits.",
    ].filter(Boolean);
    if (!window.confirm(lines.join("\n"))) return;
    setSaving(true);
    setError("");
    try {
      const response = await api.post("/refills/timetable", {
        refiller_id: refiller.id,
        sites: chosen.map((row) => ({ ...(row.choice === "new" ? { new_name: row.name } : { location_id: Number(row.choice) }), days: row.days, visits: row.visits })),
        pause_location_ids: pauseOthers ? others.map((site) => site.id) : [],
      }, { headers });
      const { saved, created, paused } = response.data;
      onDone(`${refiller.name}'s timetable applied: ${saved} site${saved === 1 ? "" : "s"}${created ? `, ${created} new` : ""}${paused ? `, ${paused} paused` : ""}`);
    } catch (err) {
      setError(err.response?.data?.error || "Could not apply the timetable");
      setSaving(false);
    }
  };

  return (
    <div className="upi-scan-backdrop" onClick={onClose}>
      <div className="rf-modal rf-tt" onClick={(event) => event.stopPropagation()}>
        <div className="upi-scan-head">
          <div><h3>Paste weekly timetable</h3><p>One refiller at a time: their sites under Monday … Saturday</p></div>
          <button type="button" className="upi-scan-close" onClick={onClose}>✕</button>
        </div>
        <div className="rf-modal-body">
          <label>
            1. In Excel, select the table (the Monday … Saturday header and every site below it), copy, and paste here
            <textarea className="rf-tt-paste" value={text} onChange={(event) => read(event.target.value)} rows={rows ? 3 : 7} placeholder={"Monday\tTuesday\tWednesday\tThursday\tFriday\tSaturday\nNT-3\tStrides - 2\tNT-3\tStrides - 2\tNT-3\tAll locations (Refill & Cleaning)\n…"} />
          </label>
          {parseError && <div className="ea-error">{parseError}</div>}
          {rows && (
            <>
              <label>
                2. Whose timetable is this?
                <select value={refillerId} onChange={(event) => setRefillerId(event.target.value)}>
                  <option value="">Choose refiller…</option>
                  {refillers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </label>
              <div>
                <div className="rf-label">3. Check each site ({chosen.length} site{chosen.length === 1 ? "" : "s"}{toCheck ? `, ${toCheck} to check` : ""})</div>
                <p className="rf-tt-help">"Saturday: All locations" adds Saturday to every site. Sites with "2 times daily" get a Morning and an Evening visit; everything else is "anytime that day". Pick a different site in the list if a match is wrong.</p>
                <div className="rf-tt-rows">
                  {rows.map((row) => {
                    const site = byId.get(row.choice);
                    const fromOther = site?.refiller_id && refiller && site.refiller_id !== refiller.id;
                    const state = row.choice === "skip" ? "skip" : row.choice === "new" ? "new" : row.status === "check" ? "check" : "match";
                    return (
                      <div key={row.key} className={`rf-tt-row is-${state}`}>
                        <div className="rf-tt-name">
                          <b>{row.name}</b>
                          <span className={`rf-tt-tag is-${state}`}>{state === "skip" ? "Skipped" : STATUS_LABEL[state]}</span>
                          {fromOther && <small>now with {site.refiller_name}, moves to {refiller.name}</small>}
                        </div>
                        <select value={row.choice} onChange={(event) => update(row.key, { choice: event.target.value, status: event.target.value === "new" ? "new" : "match" })} aria-label={`Site for ${row.name}`}>
                          <optgroup label="Closest names">
                            {row.suggestions.map((id) => <option key={id} value={id}>{byId.get(String(id))?.name}{byId.get(String(id))?.refiller_name ? ` · ${byId.get(String(id)).refiller_name}` : ""}</option>)}
                          </optgroup>
                          <optgroup label="All sites">
                            {locations.filter((item) => !row.suggestions.includes(item.id)).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                          </optgroup>
                          <option value="new">➕ Create new site “{row.name}”</option>
                          <option value="skip">Skip this row</option>
                        </select>
                        <div className="rf-tt-days">
                          {WEEK_ORDER.map((day) => <button type="button" key={day} className={row.days.includes(day) ? "on" : ""} onClick={() => toggleDay(row, day)} disabled={row.choice === "skip"}>{DAY_NAMES[day].slice(0, 2)}</button>)}
                          <select value={row.visits} onChange={(event) => update(row.key, { visits: Number(event.target.value) })} disabled={row.choice === "skip"} aria-label="Visits a day">
                            {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}× a day</option>)}
                          </select>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              {refiller && others.length > 0 && (
                <div className="rf-tt-others">
                  <label className="rf-switch"><input type="checkbox" checked={pauseOthers} onChange={(event) => setPauseOthers(event.target.checked)} /> Pause {refiller.name}'s other scheduled sites that aren't in this timetable ({others.length})</label>
                  <p>{others.map((site) => site.name).join(", ")}</p>
                </div>
              )}
            </>
          )}
          {error && <div className="ea-error">{error}</div>}
        </div>
        <div className="rf-modal-foot">
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="button" className="primary" onClick={apply} disabled={saving || !rows || !chosen.length}>{saving ? "Applying…" : `Apply timetable${refiller ? ` for ${refiller.name}` : ""}`}</button>
        </div>
      </div>
    </div>
  );
}
