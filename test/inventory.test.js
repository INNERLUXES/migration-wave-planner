import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIELDS, FIELD_NAMES, fieldOf, readInventory, splitIds } from '../src/index.js';
import { HEADER, columnOf, csv, json, lineOf } from './helpers.js';

// Reading an inventory: the columns and keys, the values, the records that cannot be read and the files that are not
// inventories.

const csvOf = (text) => readInventory(text, 'i.csv', 'csv');
const jsonOf = (text) => readInventory(text, 'i.json', 'json');

test('fields: the names of columns and keys in their compared form', () => {
  assert.deepEqual(FIELDS, ['id', 'name', 'type', 'owner', 'environment', 'path', 'criticality', 'dependencies']);
  for (const [name, field] of [['ID', 'id'], ['Migration Path', 'path'], ['migration_path', 'path'], ['migrationPath', 'path'], ['Strategy', 'path'], ['Migration-Strategy', 'path'], ['Depends On', 'dependencies'], ['depends_on', 'dependencies'], ['Env', 'environment'], ['Criticality', 'criticality']]) assert.equal(fieldOf(name), field, name);
  for (const name of ['notes', 'server name', 'constructor', '__proto__', 'toString', '']) assert.equal(fieldOf(name), null, name);
  assert.ok(Object.values(FIELD_NAMES).every((f) => FIELDS.includes(f)));
});

test('ids of dependencies: separated by semicolons, commas or white space, each named once', () => {
  assert.deepEqual(splitIds('a;b, c  d\te'), ['a', 'b', 'c', 'd', 'e']);
  assert.deepEqual(splitIds(' a ; a ;; '), ['a']);
  assert.deepEqual(splitIds(''), []);
});

test('csv inventory: every field read and trimmed, with the place of the record and of each field', () => {
  const text = `${HEADER}\n web-01 , Web server ,server, web-team ,production, Rehost ,high,"db-01; dns"\n`;
  const inv = csvOf(text);
  assert.equal(inv.read, true);
  assert.equal(inv.records, 1);
  assert.deepEqual(inv.problems, []);
  const w = inv.workloads[0];
  assert.deepEqual([w.id, w.name, w.type, w.owner, w.environment, w.path, w.criticality, w.dependencies], ['web-01', 'Web server', 'server', 'web-team', 'production', 'Rehost', 'high', ['db-01', 'dns']]);
  assert.equal(w.line, 2);
  assert.deepEqual(w.at.dependencies, { line: 2, column: columnOf(text, '"db-01') });
  assert.deepEqual(w.at.path, { line: 2, column: columnOf(text, ' Rehost') });
});

test('csv inventory: the columns may come in any order and with other names, and unknown columns are left out and named', () => {
  const inv = csvOf('Notes,Depends On,Migration Path,ID\nx,b,rehost,a\n,,retire,b\n');
  assert.deepEqual(inv.workloads.map((w) => [w.id, w.path, w.dependencies]), [['a', 'rehost', ['b']], ['b', 'retire', []]]);
  assert.deepEqual(inv.ignored, ['Notes']);
  assert.equal(inv.workloads[0].owner, '');
  assert.equal(inv.workloads[0].at.owner, undefined, 'no owner column');
  assert.deepEqual(csvOf('id,,x\na,b,c\n').ignored, ['(column 2, no name)', 'x']);
});

test('csv inventory: blank rows are skipped, a row with another number of fields and a row with no id are invalid records', () => {
  const text = `${HEADER}\n\n,,,,,,,\na,n,t,o,e,rehost,c\n,n,t,o,e,rehost,c,\nb,n,t,o,e,rehost,c,\n`;
  const inv = csvOf(text);
  assert.deepEqual(inv.workloads.map((w) => w.id), ['b']);
  assert.equal(inv.records, 3);
  assert.deepEqual(inv.problems.map((p) => [p.rule, p.line, p.found]), [
    ['invalid-record', lineOf(text, 'a,n'), 'this row has 7 fields and the header has 8; the row is not read'],
    ['invalid-record', lineOf(text, ',n,t,o,e,rehost,c,'), 'this row has no id; the row is not read']
  ]);
  assert.match(csvOf(`${HEADER}\nx\n`).problems[0].found, /this row has 1 field and the header has 8/);
});

test('csv inventory: an empty file, a header with no id column or a field named twice, and a broken quote are unparsable files', () => {
  const one = (text) => {
    const inv = csvOf(text);
    assert.equal(inv.read, false);
    assert.deepEqual(inv.workloads, []);
    assert.equal(inv.problems.length, 1);
    assert.equal(inv.problems[0].rule, 'unparsable-file');
    return inv.problems[0];
  };
  assert.match(one('').found, /^the file is empty; a header line that names an id column was expected; nothing in the file is read$/);
  assert.match(one('name,owner\nx,y\n').found, /^the header line names no id column \(it names "name", "owner"\); nothing in the file is read$/);
  const twice = one('id,path,Strategy\n');
  assert.equal(twice.found, 'the header names the path twice, as "path" and "Strategy"; nothing in the file is read');
  assert.equal(twice.column, 9);
  const open = one(`${HEADER}\na,"open\n`);
  assert.equal(open.found, 'line 2, column 3: a quoted field that is not closed; a field that starts with a double quote must end with one; nothing in the file is read');
  assert.deepEqual([open.line, open.column], [2, 3]);
});

test('json inventory: a list of records, or an object with a workloads list, with the place of each record and value', () => {
  const text = json({ id: 'a', name: 'A', migrationPath: 'rehost', owner: 'o', dependsOn: ['b', 7] }, { ID: 7, Strategy: 'retain', dependencies: 'a; b' });
  const inv = jsonOf(text);
  assert.deepEqual(inv.problems, []);
  assert.deepEqual(inv.workloads.map((w) => [w.id, w.path, w.dependencies]), [['a', 'rehost', ['b', '7']], ['7', 'retain', ['a', 'b']]]);
  assert.equal(inv.workloads[0].line, lineOf(text, '{', 2));
  assert.deepEqual(inv.workloads[0].at.path, { line: lineOf(text, '"migrationPath"'), column: columnOf(text, '"rehost"') });
  const list = jsonOf('[{"id": "x"}]');
  assert.deepEqual(list.workloads.map((w) => w.id), ['x']);
  assert.equal(list.records, 1);
});

test('json inventory: keys and other top-level keys the tool does not read are named', () => {
  const inv = jsonOf('{"estate": "x", "version": 2, "workloads": [{"id": "a", "notes": "n", "tags": []}, {"id": "b", "notes": "m"}]}');
  assert.deepEqual(inv.ignored, ['estate', 'version', 'notes', 'tags']);
});

test('json inventory: records that are not objects, have no id, name a field twice or hold a value of the wrong kind', () => {
  const text = json(7, { name: 'no id' }, { id: '' }, { id: 'a', path: 'rehost', strategy: 'retire' }, { id: 'b', owner: { team: 'x' }, criticality: true, dependencies: [{ id: 'a' }] }, { id: 'c', dependencies: 5 }, { id: 1.5 }, { id: 'd', owner: null, dependencies: null });
  const inv = jsonOf(text);
  assert.deepEqual(inv.workloads.map((w) => [w.id, w.owner, w.criticality, w.dependencies]), [['b', '', '', []], ['c', '', '', []], ['d', '', '', []]]);
  assert.deepEqual(inv.problems.map((p) => p.found), [
    'workloads[0] is a number, not an object; the record is not read',
    'workloads[1] has no id; the record is not read',
    'workloads[2] has no id; the record is not read',
    'workloads[3] names the path twice, as "path" and "strategy"; the record is not read',
    'workloads[4].owner is an object, not a text; it is taken as empty',
    'workloads[4].criticality is a boolean, not a text; it is taken as empty',
    'workloads[4].dependencies is a list that holds a value that is not a text or a whole number; a list of ids or a text of ids was expected; it is taken as empty',
    'workloads[5].dependencies is a number; a list of ids or a text of ids was expected; it is taken as empty',
    'workloads[6].id is a number, not a text; it is taken as empty',
    'workloads[6] has no id; the record is not read'
  ]);
  assert.ok(inv.problems.every((p) => p.rule === 'invalid-record'));
  assert.equal(inv.problems[4].line, lineOf(text, '"owner": {'));
});

test('json inventory: text that is not JSON, or JSON that is not a list of workloads, is an unparsable file', () => {
  const bad = jsonOf('{\n  "workloads": [\n    {"id": "a",}\n  ]\n}');
  assert.equal(bad.read, false);
  assert.equal(bad.problems[0].rule, 'unparsable-file');
  assert.deepEqual([bad.problems[0].line, bad.problems[0].column], [3, 16]);
  assert.match(bad.problems[0].found, /^line 3, column 16: a comma before the closing brace; JSON has no trailing comma; nothing in the file is read$/);
  for (const [text, kind] of [['{"items": []}', 'an object'], ['"x"', 'a string'], ['null', 'null'], ['3', 'a number'], ['{"workloads": {}}', 'an object']]) {
    assert.equal(jsonOf(text).problems[0].found, `the file holds ${kind}; a list of workloads, or an object with a "workloads" list, was expected; nothing in the file is read`, text);
  }
  assert.match(jsonOf('[{"id": "a", "id": "b"}]').problems[0].found, /the name "id" appears twice in one object/);
});

test('inventories: the limit on the number of workloads', () => {
  assert.match(readInventory('[{"id": "a"}, {"id": "b"}]', 'i.json', 'json', { maxWorkloads: 1 }).problems[0].found, /more than 1 workloads; nothing in the file is read/);
  assert.match(readInventory(csv(['a', 'o', 'rehost'], ['b', 'o', 'rehost']), 'i.csv', 'csv', { maxWorkloads: 1 }).problems[0].found, /more than 2 records/);
  assert.equal(readInventory(csv(['a', 'o', 'rehost']), 'i.csv', 'csv', { maxWorkloads: 1 }).workloads.length, 1);
});
