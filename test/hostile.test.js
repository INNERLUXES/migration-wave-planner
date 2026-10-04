import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdir, symlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { CsvError, FILE_LIMITS, JsonError, LIMITS, MAX_PROBLEMS, parseCsv, parseJson } from '../src/index.js';
import { HEADER, cli, csv, json, reportOf, rulesOf, run, withFiles } from './helpers.js';

// Hostile input: files built to exhaust the memory or the time, to make the tool follow a link, to rewrite the
// terminal, to start a second workflow command, to slip a formula into a spreadsheet or to change how objects behave.
// Each heavy test also checks the time, because work that grows faster than the input is a failure even when the
// answer is right. Tests that need a symbolic link, a device or file permissions are guarded with process.platform,
// and none of them asserts a line: lines are asserted in the tests that run everywhere.

const LIMIT = { timeout: 180000 };
// Coverage counting slows every line of the tool several times over, so a run with --experimental-test-coverage gets a
// wider time limit. A plain `npm test` keeps the tight one, and that is the run that guards against slow growth.
// The runner sets NODE_V8_COVERAGE for its test processes only when coverage is on.
const COVERAGE = Boolean(process.env.NODE_V8_COVERAGE);
const fast = async (fn, ms = 5000) => {
  const limit = COVERAGE ? ms * 4 : ms;
  const start = Date.now();
  const result = await fn();
  assert.ok(Date.now() - start < limit, `took ${Date.now() - start} ms`);
  return result;
};

const GOOD = { 'inv.csv': csv(['a', 'o', 'rehost']) };

test('hostile: a file over its size limit is an error finding, a configuration over its limit stops the run', LIMIT, async () => {
  const big = await fast(() => run({ ...GOOD, 'big.csv': `${HEADER}\n${' '.repeat(FILE_LIMITS.maxFileBytes)}` }, ['inv.csv', 'big.csv']));
  assert.equal(big.code, 1);
  assert.match(big.out, /big\.csv:1\n {11}the file cannot be read: [\d,]+ bytes is over the 32 MB limit; nothing in it is planned/);
  const config = await run({ ...GOOD, 'c.json': ' '.repeat(FILE_LIMITS.maxConfigBytes + 1) }, ['inv.csv', '--config', 'c.json']);
  assert.equal(config.code, 2);
  assert.match(config.err, /c\.json: [\d,]+ bytes is over the 1 MB limit/);
});

test('hostile: a hundred thousand workloads in a chain and in a ring, and a star of five thousand, are planned in seconds', LIMIT, async () => {
  const n = 100000;
  const chain = csv(...Array.from({ length: n }, (_, i) => [`w${i}`, 'o', 'rehost', i ? `w${i - 1}` : '']));
  const r = await fast(() => reportOf({ 'c.csv': chain }), 20000);
  assert.equal(r.plan.waves.length, n);
  assert.equal(r.findings.length, 0);
  const ring = csv(...Array.from({ length: n }, (_, i) => [`w${i}`, 'o', 'rehost', `w${(i + 1) % n}`]));
  const one = await fast(() => reportOf({ 'r.csv': ring }), 20000);
  assert.equal(one.plan.waves.length, 1);
  assert.deepEqual(rulesOf(one), ['circular-dependency']);
  const spokes = 5000;
  const star = csv(['hub', 'o', 'rehost', Array.from({ length: spokes }, (_, i) => `s${i}`).join(';')], ...Array.from({ length: spokes }, (_, i) => [`s${i}`, 'o', 'rehost']));
  const s = await fast(() => reportOf({ 's.csv': star }), 20000);
  assert.deepEqual(s.plan.waves.map((w) => w.size), [spokes, 1]);
});

test('hostile: a dense graph and many unknown ids stay fast, and each rule lists at most its limit', LIMIT, async () => {
  const n = 1500;
  const dense = csv(...Array.from({ length: n }, (_, i) => [`d${i}`, 'o', 'rehost', Array.from({ length: 200 }, (_, j) => `d${(i + j + 1) % n}`).join(';')]));
  const r = await fast(() => reportOf({ 'd.csv': dense }), 20000);
  assert.equal(r.plan.groups, 1);
  const unknown = csv(...Array.from({ length: 3000 }, (_, i) => [`node-${i}`, 'o', 'rehost', `gone-${i};lost-${i}`]));
  const u = await fast(() => reportOf({ 'u.csv': unknown }), 20000);
  assert.equal(u.findings.length, LIMITS.maxFindingsPerRule);
  assert.equal(u.totals.findings, 6000);
  assert.ok(u.notes.some((x) => /findings past the limit of 500 per rule are counted but not listed/.test(x)));
});

test('hostile: long runs of quotes, commas, line breaks, brackets and escapes are read or refused in one pass', LIMIT, async () => {
  for (const text of [
    '"'.repeat(500001),
    `"${'""'.repeat(30000)}"`,
    ','.repeat(999),
    '\n'.repeat(500000),
    '\r'.repeat(500000),
    `a${'"'.repeat(500000)}`,
    `"a"${'x'.repeat(500000)}`
  ]) {
    await fast(() => {
      try {
        parseCsv(text);
      } catch (error) {
        assert.ok(error instanceof CsvError, error.message);
      }
    });
  }
  for (const text of ['['.repeat(500000), `[${'1,'.repeat(200000)}1]`, `"${'\\"'.repeat(200000)}"`, `{${'"a":1,'.repeat(10)}`, '{"a":'.repeat(100000)]) {
    await fast(() => {
      try {
        parseJson(text, { maxValues: 5000000, maxStringLength: 1000000 });
      } catch (error) {
        assert.ok(error instanceof JsonError, error.message);
      }
    });
  }
});

test('hostile: a set of a hundred files of no kind the tool reads lists twenty problems and a count', LIMIT, async () => {
  const files = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`f${String(i).padStart(3, '0')}.txt`, 'x']));
  const r = await fast(() => run(files, Object.keys(files)));
  assert.equal(r.code, 2);
  assert.match(r.err, /the input has problems:/);
  assert.match(r.err, /\n {2}and 80 more\n$/);
  assert.equal(r.err.split('\n').filter((l) => l.startsWith('  f')).length, MAX_PROBLEMS);
});

test('hostile: CRLF, CR and a byte order mark give the same report as LF', async () => {
  const files = {
    'a.csv': `${HEADER}\na,"Name, with comma",server,o,production,rehost,high,"b;\nc"\nb,B,server,,production,rehoist,low,a\nc,C,server,o,production,retire,low,\n`,
    'b.json': '{\n  "workloads": [\n    {"id": "d", "owner": "o", "path": "rehost", "dependencies": ["a", "zz"]}\n  ]\n}\n'
  };
  const lf = await run(files, ['a.csv', 'b.json', '--json']);
  assert.equal(lf.code, 1, lf.err);
  assert.equal(JSON.parse(lf.out).totals.findings, 5);
  for (const eol of ['\r\n', '\r']) {
    const changed = Object.fromEntries(Object.entries(files).map(([k, v]) => [k, `${String.fromCharCode(0xfeff)}${v.split('\n').join(eol)}`]));
    const r = await run(changed, ['a.csv', 'b.json', '--json']);
    assert.equal(r.out, lf.out, JSON.stringify(eol));
  }
});

test('hostile: control, escape and direction characters in file names, ids, names and paths never reach the reports', async () => {
  const esc = String.fromCharCode(27);
  const rlo = String.fromCharCode(0x202e);
  const ls = String.fromCharCode(0x2028);
  const name = `p${rlo}.csv`;
  const files = { [name]: `${HEADER}\nx${esc}[2J,N${rlo}ame,t,o${ls},e,re${esc}host,c,y${esc}\ny${esc},n,t,,e,rehost,c,x${esc}[2J\n` };
  for (const format of ['text', 'json', 'csv', 'github']) {
    const r = await run(files, [name, '--format', format, ...(format === 'text' || format === 'json' ? ['--explain'] : [])]);
    assert.equal(r.code, 1, r.err);
    for (const c of [esc, rlo, ls]) assert.ok(!r.out.includes(c) && !r.err.includes(c), `${format}: ${c.charCodeAt(0)}`);
  }
  const bad = await run({ [`bad${rlo}.txt`]: 'x' }, [`bad${rlo}.txt`]);
  assert.equal(bad.code, 2);
  assert.ok(!bad.err.includes(rlo));
});

test('hostile: a text cannot start a second workflow command', async () => {
  const r = await run({ 'inv.csv': `${HEADER}\n"%0A::error::x",n,t,,e,"::error file=x::y",c,"a&#10;::error"\n` }, ['inv.csv', '--format', 'github']);
  const lines = r.out.trimEnd().split('\n');
  assert.ok(lines.every((l) => l.startsWith('::error ') || l.startsWith('::warning ') || l.startsWith('migration-wave-planner: ')), r.out);
  assert.ok(r.out.includes('%250A::error::x'));
  assert.equal(lines.length, 5, 'four findings and the summary line');
});

test('hostile: a value that starts with a formula character is not a formula in the CSV wave plan', async () => {
  const r = await run({ 'inv.csv': `${HEADER}\n"=HYPERLINK(""x"")",+n,-t,@o,"\te",rehost,c,\n` }, ['inv.csv', '--format', 'csv']);
  assert.equal(r.code, 0, r.err);
  const row = r.out.split('\r\n')[1];
  assert.equal(row, `1,1,"'=HYPERLINK(""x"")",'+n,'-t,e,'@o,rehost,c,,move,inv.csv,2`, 'a tab at the start is trimmed with the other white space');
});

test('hostile: constructor, toString and __proto__ as ids, columns, keys and paths are only data', async () => {
  const r = reportOf({
    'a.csv': `id,__proto__,constructor,owner,path,dependencies\n__proto__,x,y,o,toString,constructor\nconstructor,x,y,o,rehost,__proto__\ntoString,x,y,o,retire,hasOwnProperty\n`,
    'b.json': json({ id: 'valueOf', owner: 'o', path: '__proto__', __proto__: 'x', dependencies: ['toString'] })
  });
  assert.deepEqual(rulesOf(r).sort(), ['circular-dependency', 'retired-dependency', 'unknown-dependency', 'unknown-path', 'unknown-path']);
  assert.equal(Object.getPrototypeOf({}), Object.prototype);
  assert.equal({}.o, undefined);
  const cfg = await run({ ...GOOD, 'c.json': '{"rules": {"toString": "off"}, "aliases": {"__proto__": "x"}}' }, ['inv.csv', '--config', 'c.json']);
  assert.equal(cfg.code, 2);
  assert.match(cfg.err, /"toString" is not a key of rules/);
  assert.match(cfg.err, /aliases\.__proto__ must be one of retire/);
});

test('hostile: empty files of both kinds are reported as files the readers refuse, without a crash', async () => {
  const r = await run({ 'a.csv': '', 'b.json': '', 'c.csv': '\n\n' }, ['a.csv', 'b.json', 'c.csv']);
  assert.equal(r.code, 1, r.err);
  assert.match(r.out, /\(3 files: 2 CSV inventories, 1 JSON inventory; 0 records\)/);
  assert.match(r.out, /the file is empty; a header line that names an id column was expected/);
  assert.match(r.out, /line 1, column 1: the text ends where a value was expected; nothing in the file is read/);
  assert.match(r.out, /the header line names no id column \(it names ""\)/);
});

test('hostile: a file named through a symbolic link is refused, and so is a configuration', async (t) => {
  if (process.platform === 'win32') {
    t.skip('Windows needs extra rights to make a symbolic link');
    return;
  }
  await withFiles({ 'real/inv.csv': csv(['a', 'o', 'rehost']), 'c.json': '{}' }, async (dir) => {
    await symlink(resolve(dir, 'real/inv.csv'), resolve(dir, 'linked.csv'));
    await symlink(resolve(dir, 'c.json'), resolve(dir, 'c-link.json'));
    await mkdir(resolve(dir, 'via'));
    await symlink(resolve(dir, 'real'), resolve(dir, 'via/dir'));
    const r = await cli(['linked.csv'], dir);
    assert.equal(r.code, 2);
    assert.match(r.err, /linked\.csv: is a symbolic link, which is not followed/);
    const c = await cli(['real/inv.csv', '--config', 'c-link.json'], dir);
    assert.equal(c.code, 2);
    assert.match(c.err, /c-link\.json: is a symbolic link/);
    const d = await cli(['via/dir'], dir);
    assert.equal(d.code, 2);
    assert.match(d.err, /is a symbolic link, which is not followed/);
  });
});

test('hostile: a device named as an inventory or the configuration is refused', LIMIT, async (t) => {
  if (process.platform === 'win32') {
    t.skip('Windows has no /dev/zero to name as an input');
    return;
  }
  await withFiles(GOOD, async (dir) => {
    const config = await fast(() => cli(['inv.csv', '--config', '/dev/zero'], dir));
    assert.equal(config.code, 2);
    assert.match(config.err, /is not a regular file/);
    const input = await fast(() => cli(['/dev/zero'], dir));
    assert.equal(input.code, 2);
    assert.match(input.err, /is not a regular file|not a kind of file/);
  });
});

test('hostile: a file without read access is an error finding, and the rest is still planned', async (t) => {
  if (process.platform === 'win32') {
    t.skip('Windows does not take away read access with chmod');
    return;
  }
  if (typeof process.getuid === 'function' && process.getuid() === 0) {
    t.skip('the root user can read a file without read access');
    return;
  }
  await withFiles({ 'a.csv': csv(['a', 'o', 'rehost']), 'b.csv': csv(['b', 'o', 'rehost']) }, async (dir) => {
    await chmod(resolve(dir, 'a.csv'), 0o000);
    try {
      const r = await cli(['a.csv', 'b.csv'], dir);
      assert.equal(r.code, 1);
      assert.match(r.out, /the file cannot be read: cannot be read \(EACCES\)/);
      assert.match(r.out, /plan: 1 workload: 1 moves in 1 wave/);
    } finally {
      await chmod(resolve(dir, 'a.csv'), 0o644);
    }
  });
});
