// CSV, read and written as RFC 4180 describes it. The reader goes over the text once, left to right: records end at
// CRLF, LF or a lone CR, fields are separated by commas, and a field that starts with a double quote runs to the next
// double quote that is not written twice, line breaks and commas included. It refuses what the memo does not allow, with
// the line and column: a quoted field that is not closed, a character after the closing quote of a field, and a double
// quote inside a field that does not start with one. White space is part of a field, as the memo says; the inventory
// reader trims it afterwards (docs/method.md).
//
// The writer makes the wave plan of --format csv: a header line, records ended by CRLF, and a field that holds a comma,
// a double quote or a line break put in double quotes with every double quote inside written twice. A field that starts
// with =, +, -, @, a tab or a carriage return gets a single quote in front, so a spreadsheet does not read a name from
// the inventory as a formula; docs/threat-model.md says why that is a help and not a guarantee.

import { lineStarts, positionOf } from './json.js';

export const CSV_LIMITS = { maxFields: 1000, maxFieldLength: 65536, maxRecords: 1000000 };

export class CsvError extends Error {
  constructor(reason, offset) {
    super(reason);
    this.reason = reason;
    this.offset = offset;
  }
}

// Reads a CSV text: [{ line, column, fields: [{ value, line, column }] }], one entry per record, the header included.
// A byte order mark at the start is skipped. An empty text gives no record. Throws CsvError with the offset of the
// problem.
export function parseCsv(text, limits = CSV_LIMITS) {
  const lim = { ...CSV_LIMITS, ...limits };
  const starts = lineStarts(text);
  const n = text.length;
  const records = [];
  const fail = (reason, at) => {
    throw new CsvError(reason, at);
  };
  const place = (offset) => positionOf(starts, offset);
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  while (i < n) {
    if (records.length >= lim.maxRecords) fail(`more than ${lim.maxRecords.toLocaleString('en-US')} records`, i);
    const recordAt = place(i);
    const fields = [];
    for (;;) {
      const fieldAt = i;
      let value;
      if (text.charCodeAt(i) === 34) {
        i += 1;
        let out = '';
        let from = i;
        for (;;) {
          const q = text.indexOf('"', i);
          if (q < 0) fail('a quoted field that is not closed; a field that starts with a double quote must end with one', fieldAt);
          if (text.charCodeAt(q + 1) === 34) {
            out += text.slice(from, q + 1);
            i = q + 2;
            from = i;
          } else {
            out += text.slice(from, q);
            i = q + 1;
            break;
          }
          if (out.length > lim.maxFieldLength) fail(`a field longer than ${lim.maxFieldLength.toLocaleString('en-US')} characters`, fieldAt);
        }
        value = out;
        const c = text.charCodeAt(i);
        if (i < n && c !== 44 && c !== 10 && c !== 13) fail('a character after the closing double quote of a field; a double quote inside a quoted field is written twice', i);
      } else {
        let j = i;
        while (j < n) {
          const c = text.charCodeAt(j);
          if (c === 44 || c === 10 || c === 13) break;
          if (c === 34) fail('a double quote inside a field that does not start with one; put the field in double quotes and write the quote twice', j);
          j += 1;
        }
        value = text.slice(i, j);
        i = j;
      }
      if (value.length > lim.maxFieldLength) fail(`a field longer than ${lim.maxFieldLength.toLocaleString('en-US')} characters`, fieldAt);
      const at = place(fieldAt);
      fields.push({ value, line: at.line, column: at.column });
      if (fields.length > lim.maxFields) fail(`a record with more than ${lim.maxFields.toLocaleString('en-US')} fields`, fieldAt);
      if (text.charCodeAt(i) === 44) {
        i += 1;
        continue;
      }
      break;
    }
    if (text.charCodeAt(i) === 13) i += 1;
    if (text.charCodeAt(i) === 10) i += 1;
    records.push({ line: recordAt.line, column: recordAt.column, fields });
  }
  return records;
}

// The reason of a CsvError with its line and column, for a finding.
export function csvProblem(error, text) {
  const pos = positionOf(lineStarts(text), Math.min(error.offset, text.length));
  return { line: pos.line, column: pos.column, text: `line ${pos.line}, column ${pos.column}: ${error.reason}` };
}

// The columns of the wave plan.
export const CSV_COLUMNS = ['wave', 'group', 'id', 'name', 'type', 'environment', 'owner', 'path', 'criticality', 'dependencies', 'status', 'file', 'line'];

const FORMULA = /^[=+\-@\t\r]/;

// One field: text with a leading formula character neutralized, quoted when it must be.
export function csvField(value) {
  if (value === null || value === undefined) return '';
  let s = String(value);
  if (FORMULA.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const record = (cells) => cells.map(csvField).join(',');

// The wave plan as CSV: one record per workload that moves, in the order of the waves, then one per workload that is
// retained or retired. The texts come from the report object, where safeText cleaned them.
export function toCsv(r) {
  const rows = [CSV_COLUMNS.join(',')];
  const row = (values) => rows.push(record(CSV_COLUMNS.map((c) => values[c] ?? null)));
  const common = (w) => ({ id: w.id, name: w.name, type: w.type, environment: w.environment, owner: w.owner, path: w.strategy ?? w.path, criticality: w.criticality, dependencies: w.dependencies.join(' '), file: w.file, line: w.line });
  for (const wave of r.plan.waves) {
    for (const g of wave.groups) for (const w of g.workloads) row({ ...common(w), wave: wave.wave, group: g.group, status: 'move' });
  }
  for (const w of r.plan.notMoving) row({ ...common(w), status: w.strategy });
  return `${rows.join('\r\n')}\r\n`;
}
