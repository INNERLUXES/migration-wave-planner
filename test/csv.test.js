import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CSV_COLUMNS, CsvError, csvField, csvProblem, parseCsv, toCsv } from '../src/index.js';
import { planOf } from './helpers.js';

// The CSV reader as RFC 4180 writes the format, every form closed and left open, and the CSV wave plan.

const values = (text) => parseCsv(text).map((r) => r.fields.map((f) => f.value));
const refused = (text) => {
  try {
    parseCsv(text);
  } catch (error) {
    assert.ok(error instanceof CsvError, error.message);
    return csvProblem(error, text).text;
  }
  return assert.fail('not refused');
};

test('csv: records end at CRLF, LF or a lone CR, the last line break is optional, and fields are separated by commas', () => {
  assert.deepEqual(values('a,b\r\nc,d\r\n'), [['a', 'b'], ['c', 'd']]);
  assert.deepEqual(values('a,b\nc,d'), [['a', 'b'], ['c', 'd']]);
  assert.deepEqual(values('a,b\rc,d\r'), [['a', 'b'], ['c', 'd']]);
  assert.deepEqual(values('a,,c,\n'), [['a', '', 'c', '']]);
  assert.deepEqual(values(''), []);
  assert.deepEqual(values('\n'), [['']]);
});

test('csv: a quoted field holds commas, line breaks and double quotes written twice; white space is kept', () => {
  assert.deepEqual(values('"a,b","line\none","say ""hi""", x \n'), [['a,b', 'line\none', 'say "hi"', ' x ']]);
  assert.deepEqual(values('"",""""\n'), [['', '"']]);
  assert.deepEqual(values('"a\r\nb",c\r\n'), [['a\r\nb', 'c']]);
});

test('csv: a byte order mark is skipped, and every field has its line and column', () => {
  const records = parseCsv(`${String.fromCharCode(0xfeff)}id,name\n"x\ny",z\nw,v\n`);
  assert.deepEqual(records[0].fields[0].value, 'id');
  assert.deepEqual(records.map((r) => [r.line, r.column]), [[1, 2], [2, 1], [4, 1]]);
  assert.deepEqual(records[1].fields.map((f) => [f.line, f.column]), [[2, 1], [3, 4]]);
});

test('csv: a quoted field that is not closed, a character after a closing quote and a stray quote are refused with their place', () => {
  assert.equal(refused('id\n"open,field\n'), 'line 2, column 1: a quoted field that is not closed; a field that starts with a double quote must end with one');
  assert.equal(refused('id,x\n"a"b,c\n'), 'line 2, column 4: a character after the closing double quote of a field; a double quote inside a quoted field is written twice');
  assert.equal(refused('id,x\nab"c,d\n'), 'line 2, column 3: a double quote inside a field that does not start with one; put the field in double quotes and write the quote twice');
  assert.equal(refused('"a" ,b'), 'line 1, column 4: a character after the closing double quote of a field; a double quote inside a quoted field is written twice');
});

test('csv: the limits of a field, a record and a file', () => {
  assert.throws(() => parseCsv(`${'x'.repeat(11)}\n`, { maxFieldLength: 10 }), /a field longer than 10 characters/);
  assert.throws(() => parseCsv(`"${'x'.repeat(11)}"\n`, { maxFieldLength: 10 }), /a field longer than 10 characters/);
  assert.throws(() => parseCsv(`"${'""'.repeat(11)}"\n`, { maxFieldLength: 10 }), /a field longer than 10 characters/);
  assert.throws(() => parseCsv(`${','.repeat(5)}\n`, { maxFields: 5 }), /a record with more than 5 fields/);
  assert.throws(() => parseCsv('a\nb\nc\n', { maxRecords: 2 }), /more than 2 records/);
  assert.equal(parseCsv('a\nb\n', { maxRecords: 2 }).length, 2);
});

test('csv field: quoted when it holds a comma, a quote or a line break, and a leading formula character neutralized', () => {
  assert.equal(csvField('plain'), 'plain');
  assert.equal(csvField('a,b'), '"a,b"');
  assert.equal(csvField('say "x"'), '"say ""x"""');
  assert.equal(csvField('two\nlines'), '"two\nlines"');
  assert.equal(csvField('=1+2'), "'=1+2");
  assert.equal(csvField('+x'), "'+x");
  assert.equal(csvField('-x'), "'-x");
  assert.equal(csvField('@x'), "'@x");
  assert.equal(csvField('=a,b'), '"\'=a,b"');
  assert.equal(csvField(null), '');
  assert.equal(csvField(3), '3');
});

test('csv wave plan: one record per moving workload in wave order, then the ones that stay, with CRLF line ends', () => {
  const r = planOf([['app', 't', 'rehost', 'db'], ['db', 't', 'replatform'], ['old', 't', 'retire'], ['keep', 't', 'retain'], ['x', 't', 'lift and shift', 'app']]);
  const out = toCsv(r);
  assert.ok(out.endsWith('\r\n'));
  assert.ok(!out.replace(/\r\n/g, '').includes('\n'));
  const rows = out.trimEnd().split('\r\n');
  assert.equal(rows[0], CSV_COLUMNS.join(','));
  assert.equal(rows[0], 'wave,group,id,name,type,environment,owner,path,criticality,dependencies,status,file,line');
  assert.deepEqual(rows.slice(1).map((x) => x.split(',').slice(0, 3).join(',')), ['1,1,db', '2,2,app', '3,3,x', ',,old', ',,keep']);
  assert.match(rows[3], /,rehost,medium,app,move,inventory\.csv,6$/, 'an alias is written as its strategy');
  assert.match(rows[4], /,retire,medium,,retire,inventory\.csv,4$/);
});

test('csv wave plan: a name that starts with a formula character or holds a comma is written safely', () => {
  const r = planOf([['=cmd', 't', 'rehost'], ['b', '@team', 'rehost']]);
  const rows = toCsv(r).trimEnd().split('\r\n');
  assert.ok(rows[1].startsWith("1,1,'=cmd,Name of =cmd,"));
  assert.ok(rows[2].includes(",'@team,"));
});
