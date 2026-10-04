// An inventory file read into workloads. A CSV inventory has a header line that names its columns; a JSON inventory is
// a list of records, or an object whose "workloads" key holds that list. The names of the columns and keys are
// compared in one form (src/words.js fieldForm), so "Migration Path", "migration_path" and "migrationPath" all name
// the migration path. Columns and keys the tool does not read are kept out and named in a note. Every value is trimmed
// of white space at both ends. A record that cannot be read (no id, a CSV row with a different number of fields than
// the header, a JSON record that is not an object) is an invalid-record finding and is not part of the plan; a file
// that cannot be read at all is an unreadable-file or unparsable-file finding.

import { CsvError, csvProblem, parseCsv } from './csv.js';
import { JsonError, jsonProblem, parseJson } from './json.js';
import { fieldForm } from './words.js';

export const INVENTORY_LIMITS = { maxWorkloads: 200000, maxValues: 5000000, maxStringLength: 65536 };

// The fields of a workload, in the order the reports show them.
export const FIELDS = ['id', 'name', 'type', 'owner', 'environment', 'path', 'criticality', 'dependencies'];

// The names of a column or key that give each field, in the form they are compared in.
export const FIELD_NAMES = {
  id: 'id',
  name: 'name',
  type: 'type',
  owner: 'owner',
  environment: 'environment',
  env: 'environment',
  path: 'path',
  migrationpath: 'path',
  strategy: 'path',
  migrationstrategy: 'path',
  criticality: 'criticality',
  dependencies: 'dependencies',
  dependson: 'dependencies'
};

// The field a column or key names, or null.
export const fieldOf = (name) => (Object.hasOwn(FIELD_NAMES, fieldForm(name)) ? FIELD_NAMES[fieldForm(name)] : null);

// The ids of a dependencies value written as text: separated by semicolons, commas or white space, each named once,
// in the order written.
export function splitIds(text) {
  const out = [];
  for (const part of String(text).split(/[;,\s]+/)) if (part && !out.includes(part)) out.push(part);
  return out;
}

const blank = () => ({ id: '', name: '', type: '', owner: '', environment: '', path: '', criticality: '', dependencies: [] });

// An inventory that could not be read: one finding of rule, and no workload.
export function unreadableInventory(file, kind, rule, line, column, found) {
  return { file, kind, read: false, records: 0, workloads: [], problems: [{ rule, file, line, column, found }], ignored: [] };
}

function fromCsv(text, file, limits) {
  let records;
  try {
    records = parseCsv(text, { maxRecords: limits.maxWorkloads + 1, maxFieldLength: limits.maxStringLength });
  } catch (error) {
    if (!(error instanceof CsvError)) throw error;
    const p = csvProblem(error, text);
    return unreadableInventory(file, 'csv', 'unparsable-file', p.line, p.column, `${p.text}; nothing in the file is read`);
  }
  if (!records.length) return unreadableInventory(file, 'csv', 'unparsable-file', 1, 1, 'the file is empty; a header line that names an id column was expected; nothing in the file is read');
  const header = records[0];
  const columns = [];
  const ignored = [];
  const taken = new Map();
  for (const [i, f] of header.fields.entries()) {
    const name = f.value.trim();
    const field = fieldOf(name);
    if (field === null) {
      ignored.push(name === '' ? `(column ${i + 1}, no name)` : name);
      columns.push(null);
    } else if (taken.has(field)) {
      return unreadableInventory(file, 'csv', 'unparsable-file', f.line, f.column, `the header names the ${field} twice, as "${taken.get(field)}" and "${name}"; nothing in the file is read`);
    } else {
      taken.set(field, name);
      columns.push(field);
    }
  }
  if (!taken.has('id')) return unreadableInventory(file, 'csv', 'unparsable-file', header.line, header.column, `the header line names no id column (it names ${header.fields.map((f) => `"${f.value.trim()}"`).join(', ')}); nothing in the file is read`);
  const workloads = [];
  const problems = [];
  let count = 0;
  for (const rec of records.slice(1)) {
    if (rec.fields.every((f) => f.value.trim() === '')) continue;
    count += 1;
    if (rec.fields.length !== columns.length) {
      problems.push({ rule: 'invalid-record', file, line: rec.line, column: rec.column, found: `this row has ${rec.fields.length} ${rec.fields.length === 1 ? 'field' : 'fields'} and the header has ${columns.length}; the row is not read` });
      continue;
    }
    const w = { ...blank(), file, line: rec.line, column: rec.column, at: {}, record: count };
    for (const [i, f] of rec.fields.entries()) {
      const field = columns[i];
      if (field === null) continue;
      w.at[field] = { line: f.line, column: f.column };
      if (field === 'dependencies') w.dependencies = splitIds(f.value);
      else w[field] = f.value.trim();
    }
    if (!w.id) {
      problems.push({ rule: 'invalid-record', file, line: w.at.id.line, column: w.at.id.column, found: 'this row has no id; the row is not read' });
      continue;
    }
    workloads.push(w);
  }
  return { file, kind: 'csv', read: true, records: count, workloads, problems, ignored };
}

const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'a list' : typeof v === 'object' ? 'an object' : `a ${typeof v}`);

function fromJson(text, file, limits) {
  let parsed;
  try {
    parsed = parseJson(text, { maxDepth: 32, maxValues: limits.maxValues, maxStringLength: limits.maxStringLength, linesUpTo: 3 });
  } catch (error) {
    if (!(error instanceof JsonError)) throw error;
    const p = jsonProblem(error, text);
    const [, line, column] = /^line (\d+), column (\d+)/.exec(p);
    return unreadableInventory(file, 'json', 'unparsable-file', Number(line), Number(column), `${p}; nothing in the file is read`);
  }
  const { value, lines, columns } = parsed;
  const ignored = [];
  let list;
  let prefix;
  if (Array.isArray(value)) {
    list = value;
    prefix = '';
  } else if (value !== null && typeof value === 'object' && Array.isArray(value.workloads)) {
    list = value.workloads;
    prefix = 'workloads';
    for (const k of Object.keys(value)) if (k !== 'workloads') ignored.push(k);
  } else {
    return unreadableInventory(file, 'json', 'unparsable-file', 1, 1, `the file holds ${typeOf(value)}; a list of workloads, or an object with a "workloads" list, was expected; nothing in the file is read`);
  }
  if (list.length > limits.maxWorkloads) return unreadableInventory(file, 'json', 'unparsable-file', lines.get(prefix) ?? 1, columns.get(prefix) ?? 1, `more than ${limits.maxWorkloads.toLocaleString('en-US')} workloads; nothing in the file is read`);
  const workloads = [];
  const problems = [];
  const where = (path) => ({ line: lines.get(path) ?? 1, column: columns.get(path) ?? 1 });
  for (const [i, item] of list.entries()) {
    const path = `${prefix}[${i}]`;
    const at = where(path);
    const bad = (found, place = at) => problems.push({ rule: 'invalid-record', file, line: place.line, column: place.column, found });
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      bad(`${path} is ${typeOf(item)}, not an object; the record is not read`);
      continue;
    }
    const w = { ...blank(), file, line: at.line, column: at.column, at: {}, record: i + 1 };
    const taken = new Map();
    let refused = false;
    for (const key of Object.keys(item)) {
      const field = fieldOf(key);
      if (field === null) {
        if (!ignored.includes(key)) ignored.push(key);
        continue;
      }
      const kp = `${path}.${key}`;
      const place = where(kp);
      if (taken.has(field)) {
        bad(`${path} names the ${field} twice, as "${taken.get(field)}" and "${key}"; the record is not read`, place);
        refused = true;
        break;
      }
      taken.set(field, key);
      w.at[field] = place;
      const v = item[key];
      if (field === 'dependencies') {
        if (v === null) continue;
        if (typeof v === 'string') w.dependencies = splitIds(v);
        else if (Array.isArray(v) && v.every((x) => typeof x === 'string' || (typeof x === 'number' && Number.isInteger(x)))) w.dependencies = splitIds(v.map(String).join(' '));
        else bad(`${kp} is ${typeOf(v)}${Array.isArray(v) ? ' that holds a value that is not a text or a whole number' : ''}; a list of ids or a text of ids was expected; it is taken as empty`, place);
      } else if (typeof v === 'string') w[field] = v.trim();
      else if (typeof v === 'number' && Number.isInteger(v)) w[field] = String(v);
      else if (v !== null) bad(`${kp} is ${typeOf(v)}, not a text; it is taken as empty`, place);
    }
    if (refused) continue;
    if (!w.id) {
      bad(`${path} has no id; the record is not read`, w.at.id ?? at);
      continue;
    }
    workloads.push(w);
  }
  return { file, kind: 'json', read: true, records: list.length, workloads, problems, ignored };
}

// Reads the text of an inventory file of a kind: { file, kind, read, records, workloads, problems, ignored }.
export function readInventory(text, file, kind, limits = INVENTORY_LIMITS) {
  const lim = { ...INVENTORY_LIMITS, ...limits };
  return kind === 'csv' ? fromCsv(text, file, lim) : fromJson(text, file, lim);
}
