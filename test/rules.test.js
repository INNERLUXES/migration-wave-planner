import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_ALIASES, LIMITS, PATH_NAMES, buildPlan, buildReport, readInventory, resolvePath } from '../src/index.js';
import { columnOf, configOf, csv, findingsOf, json, lineOf, planOf, reportOf, rulesOf, sortedRules, wavesOf } from './helpers.js';

// Every rule with the form that is reported and the form next to it that is not, and the plan of waves, each small
// enough to work out by hand.

test('paths: the seven names, the aliases of the AWS guide, and the form they are compared in', () => {
  assert.deepEqual(PATH_NAMES, ['retire', 'retain', 'rehost', 'relocate', 'repurchase', 'replatform', 'refactor']);
  const a = DEFAULT_ALIASES;
  assert.deepEqual(resolvePath(' ReHost ', a), { strategy: 'rehost', alias: false, known: true });
  assert.deepEqual(resolvePath('Lift-and-Shift', a), { strategy: 'rehost', alias: true, known: true });
  assert.deepEqual(resolvePath('lift, tinker, and shift', a), { strategy: 'replatform', alias: true, known: true });
  assert.deepEqual(resolvePath('Lift and reshape', a), { strategy: 'replatform', alias: true, known: true });
  assert.deepEqual(resolvePath('drop_and_shop', a), { strategy: 'repurchase', alias: true, known: true });
  assert.deepEqual(resolvePath('Re-architect', a), { strategy: 'refactor', alias: true, known: true });
  assert.deepEqual(resolvePath('rearchitect', a), { strategy: 'refactor', alias: true, known: true });
  assert.deepEqual(resolvePath('rehoist', a), { strategy: null, alias: false, known: false });
  assert.deepEqual(resolvePath('re host', a), { strategy: null, alias: false, known: false });
  assert.deepEqual(resolvePath('  ', a), { strategy: null, alias: false, known: false });
  assert.deepEqual(resolvePath('constructor', a), { strategy: null, alias: false, known: false });
});

test('waves: dependencies first, one wave per layer, and groups in the order of the inventory', () => {
  const r = planOf([['web', 'o', 'rehost', 'app'], ['app', 'o', 'replatform', 'db;cache'], ['db', 'o', 'relocate', 'dns'], ['cache', 'o', 'rehost', 'dns'], ['dns', 'o', 'rehost'], ['tool', 'o', 'repurchase']]);
  assert.deepEqual(wavesOf(r), [['dns', 'tool'], ['db', 'cache'], ['app'], ['web']]);
  assert.deepEqual(r.plan.waves.map((w) => w.groups.map((g) => g.group)), [[1, 2], [3, 4], [5], [6]]);
  assert.equal(r.plan.groups, 6);
  assert.equal(r.findings.length, 0);
});

test('waves: a largest wave size cuts a layer into waves in order, and a group is never cut', () => {
  const rows = [['a', 'o', 'rehost'], ['b', 'o', 'rehost'], ['c', 'o', 'rehost'], ['d', 'o', 'rehost', 'e'], ['e', 'o', 'rehost', 'd'], ['f', 'o', 'rehost', 'a']];
  assert.deepEqual(wavesOf(planOf(rows)), [['a', 'b', 'c', 'd', 'e'], ['f']]);
  assert.deepEqual(wavesOf(planOf(rows, { maxWaveSize: 2 })), [['a', 'b'], ['c'], ['d', 'e'], ['f']]);
  const one = planOf(rows, { maxWaveSize: 1 });
  assert.deepEqual(wavesOf(one), [['a'], ['b'], ['c'], ['d', 'e'], ['f']]);
  assert.deepEqual(rulesOf(one), ['move-group-too-big', 'circular-dependency']);
  assert.match(findingsOf(one, 'move-group-too-big')[0].found, /^move group 4 holds 2 workloads \("d" and "e"\), more than the largest wave size of 1; it is wave 4 on its own$/);
  assert.deepEqual(wavesOf(planOf(rows, { maxWaveSize: 3 })), [['a', 'b', 'c'], ['d', 'e'], ['f']]);
  assert.deepEqual(rulesOf(planOf(rows, { maxWaveSize: 2 })), ['circular-dependency'], 'a group as large as the wave is not reported');
});

test('waves: every workload moves after the workloads it depends on, for every wave size', () => {
  const rows = Array.from({ length: 30 }, (_, i) => [`w${i}`, 'o', 'rehost', [i % 7 ? `w${i - 1}` : '', i % 5 === 0 && i > 0 ? `w${i - 5}` : '', i === 20 ? 'w22' : '', i === 22 ? 'w20' : ''].filter(Boolean).join(';')]);
  for (const size of [undefined, 1, 2, 3, 5, 8]) {
    const r = planOf(rows, size ? { maxWaveSize: size } : {});
    const waveOf = new Map(r.plan.waves.flatMap((w) => w.groups.flatMap((g) => g.workloads.map((x) => [x.id, w.wave]))));
    assert.equal(waveOf.size, 30);
    for (const w of r.plan.waves.flatMap((x) => x.groups.flatMap((g) => g.workloads))) {
      for (const d of w.dependencies) {
        const same = r.plan.waves.some((x) => x.groups.some((g) => g.circular && g.workloads.some((y) => y.id === d) && g.workloads.some((y) => y.id === w.id)));
        if (same) assert.equal(waveOf.get(d), waveOf.get(w.id));
        else assert.ok(waveOf.get(d) < waveOf.get(w.id), `${w.id} after ${d} with size ${size}`);
      }
    }
    if (size) for (const w of r.plan.waves) assert.ok(w.size <= size || w.groups.length === 1, `wave ${w.wave} with size ${size}`);
  }
});

test('circular-dependency: a circle of two, three and one, each one move group in one wave; a chain is not a circle', () => {
  const text = csv(['a', 'o', 'rehost', 'b'], ['b', 'o', 'rehost', 'c'], ['c', 'o', 'rehost', 'a'], ['self', 'o', 'rehost', 'self'], ['x', 'o', 'rehost', 'y'], ['y', 'o', 'rehost', 'x'], ['n', 'o', 'rehost', 'a']);
  const r = reportOf({ 'inventory.csv': text });
  const found = findingsOf(r, 'circular-dependency');
  assert.deepEqual(found.map((f) => f.found), [
    'workloads "a", "b" and "c" depend on each other (a -> b -> c -> a); they are move group 1 and move together in wave 1',
    'workload "self" depends on itself; it is move group 2 and moves in wave 1',
    'workloads "x" and "y" depend on each other (x -> y -> x); they are move group 3 and move together in wave 1'
  ]);
  assert.deepEqual(found.map((f) => [f.line, f.column]), [[lineOf(text, 'a,Name'), columnOf(text, 'b\n')], [lineOf(text, 'self,'), columnOf(text, 'self\n')], [lineOf(text, 'x,Name'), columnOf(text, 'y\n')]]);
  assert.deepEqual(found.map((f) => f.level), ['warning', 'warning', 'warning']);
  assert.deepEqual(wavesOf(r), [['a', 'b', 'c', 'self', 'x', 'y'], ['n']]);
  assert.equal(r.plan.circular, 3);
  assert.deepEqual(rulesOf(planOf([['a', 'o', 'rehost', 'b'], ['b', 'o', 'rehost', 'c'], ['c', 'o', 'rehost']])), []);
});

test('circular-dependency: a circle through a workload that does not move is not a move group', () => {
  const r = planOf([['a', 'o', 'rehost', 'k'], ['k', 'o', 'retain', 'a'], ['b', 'o', 'rehost', 'z'], ['z', 'o', 'retire', 'b']]);
  assert.deepEqual(sortedRules(r), ['retained-dependency', 'retired-dependency']);
  assert.equal(r.plan.circular, 0);
});

test('unknown-dependency: an id that is not in the inventory, with a suggestion when one is near; a known id is not reported', () => {
  const text = csv(['ledger-db', 'o', 'rehost'], ['billing', 'o', 'rehost', 'ledger-db2;ledger-db;zz;ledger-db']);
  const r = reportOf({ 'inventory.csv': text });
  assert.deepEqual(findingsOf(r, 'unknown-dependency').map((f) => [f.found, f.line, f.column]), [
    ['workload "billing" depends on "ledger-db2", which is not an id of the inventory; did you mean "ledger-db"?', 3, columnOf(text, 'ledger-db2')],
    ['workload "billing" depends on "zz", which is not an id of the inventory', 3, columnOf(text, 'ledger-db2')]
  ]);
  assert.deepEqual(wavesOf(r), [['ledger-db'], ['billing']], 'the known dependency still orders the waves');
  assert.deepEqual(rulesOf(planOf([['A', 'o', 'rehost'], ['b', 'o', 'rehost', 'a']])), ['unknown-dependency'], 'ids are compared with their case');
});

test('unknown-dependency: suggestions stay within their limits, and the rest is counted in a note', () => {
  const files = [{ file: 'i.csv', kind: 'csv', read: true, records: 3, ignored: [], problems: [], workloads: ['abcd', 'w1', 'w2'].map((id, i) => ({ id, name: '', type: '', owner: 'o', environment: '', path: 'rehost', criticality: '', dependencies: id === 'abcd' ? [] : ['abce', 'abcf'], file: 'i.csv', line: i + 2, column: 1, at: {} })) }];
  const { findings, unsuggested } = buildPlan(files, configOf(), { maxSuggestions: 1, maxSuggestIds: 5000 });
  assert.equal(findings.filter((f) => f.found.includes('did you mean')).length, 1);
  assert.equal(unsuggested, 3);
  assert.equal(buildPlan(files, configOf(), { maxSuggestions: 100, maxSuggestIds: 2 }).unsuggested, 4);
  const r = reportOf({ 'i.csv': csv(...Array.from({ length: 101 }, (_, i) => [`node-${i}`, 'o', 'rehost', `node-x${i}`])) });
  assert.ok(r.notes.includes('1 unknown id got no suggestion of a near id, past the limit of 100 suggestions or of 5,000 ids'));
});

test('duplicate-id: the first record is planned and every later one is reported at its id, across files too', () => {
  const r = reportOf({ 'a.csv': csv(['web', 'o', 'rehost'], ['web', 'p', 'retire']), 'b.json': json({ id: 'web', owner: 'q', path: 'rehost' }) });
  assert.deepEqual(findingsOf(r, 'duplicate-id').map((f) => [f.file, f.line, f.found]), [
    ['a.csv', 3, 'the id "web" is used again; the first record with it is at a.csv:2, and this record is left out of the plan'],
    ['b.json', 4, 'the id "web" is used again; the first record with it is at a.csv:2, and this record is left out of the plan']
  ]);
  assert.equal(r.plan.workloads, 1);
  assert.equal(r.plan.records, 3);
  assert.deepEqual(wavesOf(r), [['web']]);
  assert.deepEqual(rulesOf(planOf([['web', 'o', 'rehost'], ['Web', 'o', 'rehost']])), [], 'ids differ in case');
});

test('missing-owner: an empty owner, or no owner column; any text counts as an owner', () => {
  const r = planOf([['a', '', 'rehost'], ['b', ' ', 'retire'], ['c', 'x', 'rehost']]);
  assert.deepEqual(findingsOf(r, 'missing-owner').map((f) => f.found), ['workload "a" (Name of a) has no owner', 'workload "b" (Name of b) has no owner']);
  const none = reportOf({ 'i.csv': 'id,path\nweb,rehost\n' });
  assert.deepEqual(findingsOf(none, 'missing-owner').map((f) => [f.found, f.line, f.column]), [['workload "web" has no owner', 2, 1]]);
});

test('missing-path and unknown-path: a workload with no path or an unknown one is reported and still planned as moving', () => {
  const text = csv(['a', 'o', ''], ['b', 'o', 'rehoist', 'a'], ['c', 'o', 'Lift and Shift', 'b'], ['d', 'o', 'REPLATFORM']);
  const r = reportOf({ 'inventory.csv': text });
  assert.deepEqual(rulesOf(r), ['missing-path', 'unknown-path']);
  assert.equal(findingsOf(r, 'missing-path')[0].found, 'workload "a" has no migration path; it is planned as a workload that moves');
  assert.equal(findingsOf(r, 'unknown-path')[0].found, 'workload "b" has the migration path "rehoist", which is not one of the 7 Rs or a known alias; it is planned as a workload that moves');
  assert.equal(findingsOf(r, 'unknown-path')[0].column, columnOf(text, 'rehoist'));
  assert.deepEqual(wavesOf(r), [['a', 'd'], ['b'], ['c']]);
  assert.deepEqual(r.plan.byPath, { retire: 0, retain: 0, rehost: 1, relocate: 0, repurchase: 0, replatform: 1, refactor: 0, none: 1, unknown: 1 });
  assert.equal(r.plan.aliases, 1);
  assert.ok(r.notes.includes('1 migration path was written as another name of a strategy and read as that strategy'));
});

test('unknown-path: aliases of the configuration are known, and a built-in alias can be set off', () => {
  const rows = [['a', 'o', 'move as is'], ['b', 'o', 'lift and shift']];
  assert.deepEqual(rulesOf(planOf(rows)), ['unknown-path']);
  assert.deepEqual(rulesOf(planOf(rows, {}, { aliases: { 'Move As Is': 'rehost' } })), []);
  assert.deepEqual(rulesOf(planOf(rows, {}, { aliases: { 'move as is': 'rehost', 'lift and shift': 'off' } })), ['unknown-path']);
  assert.match(planOf(rows, {}, { aliases: { 'move as is': 'retire' } }).plan.notMoving[0].id, /^a$/);
});

test('retired-dependency: a retired workload that a workload with another path needs; retired dependents do not count', () => {
  const text = csv(['fax', 'o', 'retire'], ['bill', 'o', 'rehost', 'fax'], ['keep', 'o', 'retain', 'fax'], ['old', 'o', 'retire', 'fax'], ['gone', 'o', 'retire'], ['older', 'o', 'retire', 'gone']);
  const r = reportOf({ 'inventory.csv': text });
  assert.deepEqual(findingsOf(r, 'retired-dependency').map((f) => [f.found, f.line, f.column, f.level]), [['workload "fax" is marked retire, but "bill" and "keep" still depend on it', 2, columnOf(text, 'retire'), 'error']]);
  assert.deepEqual(r.plan.notMoving.map((w) => [w.id, w.dependents]), [['fax', ['bill', 'keep', 'old']], ['keep', []], ['old', []], ['gone', ['older']], ['older', []]]);
  assert.deepEqual(rulesOf(planOf([['x', 'o', 'retire', 'x']])), [], 'a retired workload that names itself');
});

test('retained-dependency: a retained workload that a moving workload needs, with the wave of each; a retained or retired dependent does not count', () => {
  const r = planOf([['mf', 'o', 'retain'], ['pay', 'o', 'rehost', 'mf'], ['hr', 'o', 'rehost', 'pay;mf'], ['k2', 'o', 'retain', 'mf'], ['r2', 'o', 'retire', 'mf']]);
  assert.deepEqual(findingsOf(r, 'retained-dependency').map((f) => [f.found, f.level]), [['workload "mf" is marked retain and stays in the source environment, but "pay" (wave 1) and "hr" (wave 2) move and depend on it: a link between the two environments to plan', 'warning']]);
  assert.deepEqual(rulesOf(planOf([['mf', 'o', 'retain'], ['k2', 'o', 'retain', 'mf']])), []);
  assert.equal(r.plan.retained, 2);
  assert.equal(r.plan.retired, 1);
  assert.equal(r.plan.moving, 2);
});

test('rules: a level from the configuration, and a rule set off is not reported and named in a note', () => {
  const rows = [['a', '', 'rehost', 'a']];
  assert.deepEqual(planOf(rows).findings.map((f) => [f.rule, f.level]), [['missing-owner', 'warning'], ['circular-dependency', 'warning']]);
  const r = planOf(rows, {}, { rules: { missingOwner: 'error', circularDependency: 'off' } });
  assert.deepEqual(r.findings.map((f) => [f.rule, f.level]), [['missing-owner', 'error']]);
  assert.ok(r.notes.includes('1 rule is off: circular-dependency'));
  assert.equal(r.result.pass, false);
});

test('findings: errors first, then by file, line, column and rule', () => {
  const r = reportOf({ 'b.csv': csv(['x', '', 'retire'], ['y', 'o', 'rehost', 'x;q']), 'a.csv': csv(['z', '', '']) });
  assert.deepEqual(r.findings.map((f) => `${f.level} ${f.file}:${f.line} ${f.rule}`), [
    'error b.csv:2 retired-dependency',
    'error b.csv:3 unknown-dependency',
    'error a.csv:2 missing-path',
    'warning b.csv:2 missing-owner',
    'warning a.csv:2 missing-owner'
  ]);
});

test('findings: --min-severity hides the lower levels, counts them in a note, and they do not fail the run', () => {
  const rows = [['a', '', 'rehost']];
  const r = planOf(rows, { minSeverity: 'error', failOn: 'warning' });
  assert.equal(r.findings.length, 0);
  assert.equal(r.totals.hidden, 1);
  assert.ok(r.notes.includes('1 finding below error is not shown'));
  assert.equal(r.result.pass, true);
  assert.equal(planOf(rows, { failOn: 'warning' }).result.pass, false);
});

test('findings: a rule lists at most its limit, the rest is counted in a note and still fails the run', () => {
  const files = [readInventory(csv(...Array.from({ length: 12 }, (_, i) => [`w${i}`, '', 'rehost'])), 'i.csv', 'csv')];
  const r = buildReport({ input: { paths: ['i.csv'] }, files, config: configOf(), minSeverity: 'info', failOn: 'warning', version: 'test', limits: { ...LIMITS, maxFindingsPerRule: 5 } });
  assert.equal(findingsOf(r, 'missing-owner').length, 5);
  assert.equal(r.totals.findings, 12);
  assert.equal(r.totals.notListed, 7);
  assert.ok(r.notes.includes('7 findings past the limit of 5 per rule are counted but not listed'));
  assert.equal(r.result.failing, 12);
});
