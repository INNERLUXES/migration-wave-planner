import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { KIND_NAMES, NOTICE, USAGE, VERSION, escapeData, escapeProperty, parseArgs, pathText, toGithub, toJson, toText } from '../src/index.js';
import { HEADER, cli, columnOf, csv, json, lineOf, planOf, reportOf, run, withFiles } from './helpers.js';

const CLEAN = { 'inv.csv': csv(['db', 'o', 'replatform'], ['app', 'o', 'rehost', 'db']) };
const WARN = { 'inv.csv': csv(['db', '', 'replatform'], ['app', 'o', 'rehost', 'db']) };
const BROKEN = { 'inv.csv': 'id,name\n"open\n' };

test('cli: exit 0 below the fail-on level, 1 at or above it, from the flag or the configuration', async () => {
  const clean = await run(CLEAN, ['inv.csv']);
  assert.equal(clean.code, 0, clean.err);
  assert.match(clean.out, /^migration-wave-planner: inv\.csv\ninput: inv\.csv \(1 file: 1 CSV inventory; 2 records\)\nconfig: built-in defaults: 6 aliases; largest wave no limit; minimum severity info; fail on error\nrules: circular-dependency \(warning\); /);
  assert.match(clean.out, /\nplan: 2 workloads: 2 move in 2 waves \(2 move groups, 0 circular\), 0 retained, 0 retired\npaths: rehost 1, replatform 1\nfindings: 0\n/);
  assert.match(clean.out, /RESULT: PASS - no finding at or above error\n$/);
  assert.equal(clean.err, '');
  const warn = await run(WARN, ['inv.csv']);
  assert.equal(warn.code, 0, 'a warning does not fail the run by default');
  assert.equal((await run(WARN, ['inv.csv', '--fail-on', 'warning'])).code, 1);
  assert.equal((await run(CLEAN, ['inv.csv', '--fail-on', 'info'])).code, 0, 'nothing at all to report');
  const configured = await run({ ...WARN, 'c.json': '{"failOn": "warning"}' }, ['inv.csv', '--config', 'c.json']);
  assert.equal(configured.code, 1);
  assert.match(configured.out, /RESULT: FAIL - 1 finding at or above warning \(1 warning\)\n$/);
  assert.equal((await run({ ...WARN, 'c.json': '{"failOn": "warning"}' }, ['inv.csv', '--config', 'c.json', '--fail-on', 'error'])).code, 0, 'the flag wins over the configuration');
  const broken = await run(BROKEN, ['inv.csv']);
  assert.equal(broken.code, 1, 'a file that cannot be parsed fails the run at the default level');
  assert.match(broken.out, /ERROR {4}unparsable-file {6}inv\.csv:2\n {11}line 2, column 1: a quoted field that is not closed; a field that starts with a double quote must end with one; nothing in the file is read/);
});

test('cli: several inventories are read together, CSV and JSON, as one plan', async () => {
  const files = { 'a.csv': csv(['web', 'o', 'rehost', 'api']), 'b.json': json({ id: 'api', owner: 'o', path: 'replatform', dependencies: ['db'] }, { id: 'db', owner: 'o', path: 'relocate' }) };
  const r = await run(files, ['a.csv', 'b.json', '--json']);
  assert.equal(r.code, 0, r.err);
  const out = JSON.parse(r.out);
  assert.deepEqual(out.input.paths, ['a.csv', 'b.json']);
  assert.deepEqual(out.input.files, [{ file: 'a.csv', kind: 'csv', read: true, records: 1, workloads: 1 }, { file: 'b.json', kind: 'json', read: true, records: 2, workloads: 2 }]);
  assert.deepEqual(out.input.byKind, { csv: 1, json: 1 });
  assert.deepEqual(out.plan.waves.map((w) => w.groups.flatMap((g) => g.workloads.map((x) => x.id))), [['db'], ['api'], ['web']]);
});

test('cli: --max-wave-size cuts the waves and wins over the configuration', async () => {
  const files = { 'inv.csv': csv(['a', 'o', 'rehost'], ['b', 'o', 'rehost'], ['c', 'o', 'rehost']), 'c.json': '{"maxWaveSize": 1}' };
  const count = (r) => JSON.parse(r.out).plan.waves.length;
  assert.equal(count(await run(files, ['inv.csv', '--json'])), 1);
  assert.equal(count(await run(files, ['inv.csv', '--json', '--config', 'c.json'])), 3);
  assert.equal(count(await run(files, ['inv.csv', '--json', '--config', 'c.json', '--max-wave-size', '2'])), 2);
  const text = await run(files, ['inv.csv', '--max-wave-size', '2']);
  assert.ok(text.out.includes('\nconfig: built-in defaults: 6 aliases; largest wave 2; minimum severity info; fail on error\n'));
  assert.ok(text.out.includes('\n  Wave 2: 1 workload in 1 move group\n'));
});

test('cli: exit 2 for usage errors, with the usage and nothing on standard output', async () => {
  for (const [args, message] of [
    [[], /give the inventory to plan: one or more \.csv or \.json files/],
    [['inv.csv', 'inv.csv'], /inv\.csv is named twice/],
    [['inv.csv', '--bogus'], /unknown argument --bogus/],
    [['inv.csv', '--format', 'xml'], /unknown format xml \(text, json, csv or github\)/],
    [['inv.csv', '--format', 'json', '--format', 'text'], /--format was given twice/],
    [['inv.csv', '--json', '--format', 'csv'], /--json and --format csv ask for two formats; give one/],
    [['inv.csv', '--min-severity', 'notice'], /--min-severity: unknown level notice \(info, warning, error\)/],
    [['inv.csv', '--fail-on', 'fatal'], /--fail-on: unknown level fatal/],
    [['inv.csv', '--fail-on', 'error', '--fail-on', 'info'], /--fail-on was given twice/],
    [['inv.csv', '--max-wave-size', '0'], /--max-wave-size: 0 is not a whole number from 1 to 100,000/],
    [['inv.csv', '--max-wave-size', '2.5'], /--max-wave-size: 2\.5 is not a whole number/],
    [['inv.csv', '--max-wave-size', '100001'], /--max-wave-size: 100001 is not a whole number/],
    [['inv.csv', '--max-wave-size', '2', '--max-wave-size', '3'], /--max-wave-size was given twice/],
    [['inv.csv', '--max-wave-size'], /--max-wave-size needs a value/],
    [['inv.csv', '--config'], /--config needs a value/],
    [['inv.csv', '--config', '--json'], /--config needs a value/],
    [['inv.csv', '--explain', '--format', 'github'], /--explain adds the sources of each finding to the text and JSON reports; the github format has no place for them/],
    [['inv.csv', '--explain', '--format', 'csv'], /the csv format has no place for them/],
    [['-'], /reading from standard input is not supported/],
    [['inv.csv', '--config', '-'], /reading from standard input is not supported/],
    [['https://example.com/inv.csv'], /give a local path; the tool never fetches a URL/],
    [['inv.csv', '--config', 'file://c.json'], /give a local path/]
  ]) {
    const r = await run(CLEAN, args);
    assert.equal(r.code, 2, args.join(' '));
    assert.match(r.err, message, args.join(' '));
    assert.ok(r.err.includes('Usage: migration-wave-planner'), args.join(' '));
    assert.equal(r.out, '');
  }
  assert.throws(() => parseArgs(Array.from({ length: 101 }, (_, i) => `p${i}.csv`)), /more than 100 files/);
});

test('cli: exit 2 for input errors, with the problems and no result', async () => {
  for (const [files, args, message] of [
    [CLEAN, ['missing.csv'], /missing\.csv: no such file/],
    [{ ...CLEAN, 'dir/x.csv': 'id\n' }, ['dir'], /dir: is a folder; give the inventory file itself/],
    [{ 'inv.txt': 'id\n' }, ['inv.txt'], /inv\.txt: not a kind of file the tool reads \(a name ending in \.csv or \.json\)/],
    [{ '.csv': 'id\n' }, ['.csv'], /\.csv: not a kind of file the tool reads/],
    [CLEAN, ['inv.csv', './inv.csv'], /inv\.csv: is named twice/],
    [{ ...CLEAN, 'c.json': '{"maxWaveSise": 3}' }, ['inv.csv', '--config', 'c.json'], /c\.json: line 1: "maxWaveSise" is not a key of the configuration; did you mean "maxWaveSize"\?/],
    [CLEAN, ['inv.csv', '--config', 'nope.json'], /nope\.json: no such file/],
    [{ ...CLEAN, 'd/c.json': '{}' }, ['inv.csv', '--config', 'd'], /d: is a folder; give the inventory file itself/]
  ]) {
    const r = await run(files, args);
    assert.equal(r.code, 2, `${args.join(' ')}: ${r.err}`);
    assert.match(r.err, /^migration-wave-planner: no result, the input has (?:a problem|problems):\n/);
    assert.match(r.err, message);
    assert.equal(r.out, '');
  }
});

test('cli: a binary, UTF-16 or invalid UTF-8 file, or one over its limit, is an error finding, and the rest is still read', async () => {
  const r = await run({ ...WARN, 'j.csv': Buffer.from([0x69, 0, 0x64]), 'k.json': Buffer.from([0xff, 0xfe, 0x5b, 0]), 'l.csv': Buffer.from([0x69, 0x64, 0xe9, 0x0a]) }, ['inv.csv', 'j.csv', 'k.json', 'l.csv']);
  assert.equal(r.code, 1);
  assert.match(r.out, /j\.csv:1\n {11}the file cannot be read: holds binary data \(a null byte\); only text is read; export the sheet as CSV; nothing in it is planned/);
  assert.match(r.out, /the file cannot be read: is UTF-16; only UTF-8 is read/);
  assert.match(r.out, /the file cannot be read: is not valid UTF-8; only UTF-8 text is read/);
  assert.match(r.out, /workload "db" \(Name of db\) has no owner/);
  const big = await run(CLEAN, ['inv.csv'], { maxFileBytes: 10 });
  assert.match(big.out, /the file cannot be read: \d+ bytes is over the 10 byte limit/);
  const one = CLEAN['inv.csv'].length;
  const total = await run({ 'x.csv': CLEAN['inv.csv'], 'y.csv': CLEAN['inv.csv'] }, ['x.csv', 'y.csv'], { maxTotalBytes: one });
  assert.equal(total.code, 2);
  assert.match(total.err, /y\.csv: the files read so far hold more than [\d,]+ bytes, the limit of one run/);
});

test('cli: --help, --version and --print-defaults', async () => {
  const help = await cli(['--help'], '.');
  assert.equal(help.code, 0);
  assert.equal(help.out, USAGE);
  for (const s of ['--fail-on', '--min-severity', '--max-wave-size', '--format', 'github', 'csv', 'missing-owner (rules.missingOwner)', 'unparsable-file (always error)', 'retire, retain, rehost, relocate, repurchase, replatform, refactor', 'Exit codes: 0 no finding at or above the fail-on level']) assert.ok(USAGE.includes(s), s);
  const version = await cli(['--version'], '.');
  assert.equal(version.out, `${VERSION}\n`);
  assert.match(VERSION, /^\d+\.\d+\.\d+$/);
  const defaults = await cli(['--print-defaults'], '.');
  assert.equal(defaults.code, 0);
  assert.deepEqual(Object.keys(JSON.parse(defaults.out)), ['name', 'rules', 'aliases', 'maxWaveSize', 'minSeverity', 'failOn']);
});

test('text: the waves with their tables and circles, the workloads that stay, the findings with the fix, and --explain', () => {
  const text = csv(['a', 'o', 'rehost', 'b'], ['b', '', 'Lift and Shift', 'a'], ['c', 'o', 'retain'], ['d', 'o', 'rehost', 'c']);
  const r = reportOf({ 'inv.csv': text });
  const out = toText(r);
  assert.ok(out.includes('Waves (1)\n\n  Wave 1: 3 workloads in 2 move groups\n\n    group  id  name       type    environment  path                     owner  criticality  depends on\n    1      a   Name of a  server  production   rehost                   o      medium       b\n    1      b   Name of b  server  production   rehost (Lift and Shift)  -      medium       a\n    2      d   Name of d  server  production   rehost                   o      medium       c\n\n    move group 1 moves together, a circle: a -> b -> a\n\n'));
  assert.ok(out.includes('Not moving (1)\n\n  id  name       type    environment  path    owner  needed by\n  c   Name of c  server  production   retain  o      d\n\n'));
  assert.match(out, /\n {2}WARNING {2}circular-dependency {2}inv\.csv:2\n {11}workloads "a" and "b" depend on each other \(a -> b -> a\); they are move group 1 and move together in wave 1\n {11}fix: check each dependency of the circle/);
  assert.ok(out.includes(NOTICE));
  assert.ok(!out.includes('basis:'));
  const explained = toText(r, { explain: true });
  assert.match(explained, /\n {11}rule: moving workloads whose dependencies lead back to themselves\n {11}basis: workloads that communicate or share resources go into the same wave.+ \(Migration wave planning \(Microsoft Cloud Adoption Framework, Migrate\), https:\/\/learn\.microsoft\.com\/en-us\/azure\/cloud-adoption-framework\/migrate\/migration-wave-planning\)\n/);
  assert.match(explained, /the tool's own choice: the workloads of a strongly connected component/);
  const empty = toText(reportOf({ 'x.csv': 'id\n' }));
  assert.ok(empty.includes('Waves (0)\n\n  none\n'));
  assert.ok(empty.includes('Not moving (0)\n\n  none\n'));
  assert.ok(empty.includes('Findings (0)\n\n  none\n'));
  assert.ok(empty.includes('paths: none\n'));
  assert.deepEqual(KIND_NAMES.json, ['JSON inventory', 'JSON inventories']);
  assert.equal(lineOf(text, 'b,Name'), 3);
});

test('text: the path of a workload as the tables show it', () => {
  assert.equal(pathText({ strategy: 'rehost', alias: false, path: 'Rehost' }), 'rehost');
  assert.equal(pathText({ strategy: 'refactor', alias: true, path: 'Re-architect' }), 'refactor (Re-architect)');
  assert.equal(pathText({ strategy: null, alias: false, path: 'rehoist' }), '"rehoist" (unknown)');
  assert.equal(pathText({ strategy: null, alias: false, path: '' }), 'none');
});

test('json: the whole report, without the sources unless --explain', () => {
  const r = planOf([['db', '', 'replatform'], ['app', 'o', 'rehost', 'db']]);
  const out = JSON.parse(toJson(r));
  assert.deepEqual(Object.keys(out), ['tool', 'version', 'input', 'config', 'plan', 'findings', 'totals', 'result', 'notes', 'notice']);
  assert.deepEqual(Object.keys(out.findings[0]), ['rule', 'level', 'file', 'line', 'column', 'at', 'found', 'fix']);
  assert.deepEqual(Object.keys(out.plan), ['workloads', 'records', 'moving', 'retained', 'retired', 'byPath', 'aliases', 'groups', 'circular', 'maxWaveSize', 'waves', 'notMoving']);
  assert.deepEqual(Object.keys(out.plan.waves[0].groups[0].workloads[0]), ['id', 'name', 'type', 'owner', 'environment', 'path', 'strategy', 'alias', 'criticality', 'dependencies', 'file', 'line']);
  assert.ok(JSON.parse(toJson(r, { explain: true })).findings[0].basis.length > 0);
  assert.deepEqual(out.result, { pass: true, failOn: 'error', failing: 0, byLevel: { error: 0, warning: 1, info: 0 }, text: 'PASS - no finding at or above error (1 warning)' });
});

test('github: one workflow command per finding, with its properties and message escaped, then a summary line', () => {
  const row = 'b,n,t,o,e,"100%\n::error",c,';
  const r = reportOf({ 'a,b:c.csv': `${HEADER}\na,n,t,,e,rehost,c,a\n${row}\n` });
  const lines = toGithub(r).trimEnd().split('\n');
  assert.equal(lines[0], `::error file=a%2Cb%3Ac.csv,line=3,col=${columnOf(row, '"100%')},title=migration-wave-planner unknown-path::workload "b" has the migration path "100%25 ::error", which is not one of the 7 Rs or a known alias; it is planned as a workload that moves; fix: write one of the 7 Rs, or add the word your team uses to aliases in the configuration`);
  assert.match(lines[1], /^::warning file=a%2Cb%3Ac\.csv,line=2,col=\d+,title=migration-wave-planner missing-owner::workload "a" \(n\) has no owner; fix: /);
  assert.match(lines[2], /^::warning .+title=migration-wave-planner circular-dependency::workload "a" depends on itself/);
  assert.equal(lines[3], 'migration-wave-planner: a,b:c.csv: 2 workloads, 1 wave, 3 findings; RESULT: FAIL - 1 finding at or above error (1 error, 2 warning)');
  assert.equal(lines.length, 4, 'the line break in the path starts no command');
  assert.equal(escapeData('a%\r\nb'), 'a%25%0D%0Ab');
  assert.equal(escapeProperty('a:b,c'), 'a%3Ab%2Cc');
});

test('cli: a run writes nothing to disk', async () => {
  await withFiles(WARN, async (dir) => {
    const before = await readdir(resolve(dir), { recursive: true });
    for (const format of ['text', 'json', 'csv', 'github']) assert.equal((await cli(['inv.csv', '--format', format], dir)).code, 0);
    assert.deepEqual(await readdir(resolve(dir), { recursive: true }), before);
  });
});
