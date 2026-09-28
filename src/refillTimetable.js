/* Reads a refiller's weekly timetable copied from Excel (Monday … Saturday columns,
   one site per cell) and matches the site names to the dashboard's sites. */

const DAY_WORDS = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
const FREQUENCY = /(times?|daily|a\s*day|once|twice|weekly)/i;

function dayOf(cell) {
  const match = String(cell || "").trim().toLowerCase().match(/^(sun|mon|tue|wed|thu|fri|sat)[a-z]*\.?$/);
  return match ? DAY_WORDS[match[1]] : null;
}

export function normaliseName(name) {
  return String(name || "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
}

// "Stonex (2 Times Daily)" → { name: "Stonex", visits: 2 }; "BookMyShow(weekly once)" → 1 visit.
function readCell(raw) {
  let text = String(raw || "").replace(/\s+/g, " ").trim();
  let visits = 1;
  const count = text.match(/(\d+)\s*times?/i);
  if (count) visits = Math.max(1, Math.min(4, Number(count[1])));
  else if (/twice/i.test(text)) visits = 2;
  // Only brackets about how often are removed; "PWC (Bagmane)" keeps its place name.
  text = text.replace(/\(([^)]*)\)/g, (whole, inside) => (FREQUENCY.test(inside) ? "" : whole));
  text = text.replace(/\b\d+\s*times?\s*(a\s*day|daily)?\b/i, "").replace(/\s+/g, " ").replace(/[-,:\s]+$/, "").trim();
  return { name: text, visits };
}

export function parseTimetable(text) {
  const rawLines = String(text || "").split(/\r?\n/);
  const separator = rawLines.some((line) => line.includes("\t")) ? "\t" : rawLines.some((line) => line.includes(",")) ? "," : null;
  if (!separator) return { error: "Copy the table cells from Excel (not a picture), so each day stays in its own column." };
  const rows = rawLines.map((line) => line.split(separator));

  let columns = null;
  let title = "";
  let start = 0;
  for (let index = 0; index < rows.length; index += 1) {
    const days = rows[index].map(dayOf);
    if (days.filter((day) => day !== null).length >= 3) {
      columns = days;
      start = index + 1;
      break;
    }
    const joined = rows[index].join(" ").trim();
    if (joined && !title) title = joined.replace(/\s+/g, " ");
  }
  if (!columns) return { error: "Include the header row (Monday, Tuesday, …) when you copy, so the days can be read." };

  const sites = new Map();
  const allDays = new Set();
  for (const row of rows.slice(start)) {
    row.forEach((cell, index) => {
      const day = columns[index];
      if (day === null || day === undefined || !String(cell || "").trim()) return;
      if (/all\s*locations?/i.test(cell)) {
        allDays.add(day);
        return;
      }
      const { name, visits } = readCell(cell);
      const key = normaliseName(name);
      if (!key) return;
      const site = sites.get(key) || { key, name, days: new Set(), visits: 1 };
      site.days.add(day);
      site.visits = Math.max(site.visits, visits);
      sites.set(key, site);
    });
  }
  // "All locations (Refill & Cleaning)" on Saturday: every site of this refiller that day.
  for (const site of sites.values()) allDays.forEach((day) => site.days.add(day));
  const list = [...sites.values()].map((site) => ({ ...site, days: [...site.days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)) }));
  if (!list.length) return { error: "No site names found under the day columns." };
  return { title: title.replace(/locations?/i, "").trim(), sites: list, allDays: [...allDays] };
}

function editDistance(a, b) {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const above = previous[j];
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return previous[b.length];
}

const wordsOf = (name) => String(name || "").toLowerCase().replace(/&/g, " and ").split(/[^a-z0-9]+/).filter(Boolean);
const numbersOf = (name) => (String(name || "").match(/\d+/g) || []).map(Number).join(",");

export function nameSimilarity(a, b) {
  const x = normaliseName(a);
  const y = normaliseName(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  let score = 1 - editDistance(x, y) / Math.max(x.length, y.length);
  // "Fortis" and "Fortis Hospital": one name inside the other is worth checking.
  const [wa, wb] = [wordsOf(a), wordsOf(b)];
  if (wa.every((word) => wb.includes(word)) || wb.every((word) => wa.includes(word))) score = Math.max(score, 0.8);
  // "Strides 1" is never "Strides 2", nor "NT-3" "NT-4".
  if (numbersOf(a) !== numbersOf(b)) score = Math.min(score, 0.5);
  return score;
}

// Best existing site for each pasted name: "match" when clearly the same, "check" when close.
export function matchSites(parsed, locations) {
  return parsed.map((site) => {
    const ranked = locations
      .map((location) => ({ location, score: nameSimilarity(site.name, location.name) }))
      .sort((a, b) => b.score - a.score);
    const best = ranked[0];
    const status = best && best.score >= 0.85 ? "match" : best && best.score >= 0.6 ? "check" : "new";
    return {
      ...site,
      choice: status === "new" ? "new" : String(best.location.id),
      status,
      score: best?.score || 0,
      suggestions: ranked.slice(0, 5).map((item) => item.location.id),
    };
  });
}

// The refiller named in the table's title ("KARAN KUMAR LOCATIONS" → Karan Kumar).
export function guessRefiller(title, refillers) {
  const words = normaliseName(title) ? String(title).toLowerCase().split(/[^a-z]+/).filter((word) => word.length >= 3) : [];
  if (!words.length) return "";
  const scored = refillers.map((refiller) => {
    const nameWords = String(refiller.name).toLowerCase().split(/[^a-z]+/).filter(Boolean);
    return { refiller, hits: nameWords.filter((word) => words.includes(word)).length };
  }).filter((item) => item.hits > 0).sort((a, b) => b.hits - a.hits);
  return scored[0] ? String(scored[0].refiller.id) : "";
}
