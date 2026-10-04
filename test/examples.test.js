import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLEAN, EXPECTED, MESSY, UNWANTED, run } from '../tools/example.mjs';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');
const saved = (name) => readFile(resolve(root, 'examples/output', name), 'utf8');

test('examples: the messy inventory fails with the report that is saved in examples/output', async () => {
  const r = await run(MESSY);
  assert.equal(r.code, 1);
  assert.equal(r.err, '');
  assert.equal(r.out, await saved('messy.txt'));
  for (const e of EXPECTED) assert.ok(r.out.includes(e), e);
  for (const u of UNWANTED) assert.ok(!r.out.includes(u), u);
});

test('examples: the clean inventory passes with the report that is saved', async () => {
  const r = await run(CLEAN);
  assert.equal(r.code, 0);
  assert.equal(r.out, await saved('clean.txt'));
  assert.match(r.out, /\nfindings: 0\n/);
  assert.equal((await run([...CLEAN, '--fail-on', 'info'])).code, 0);
});

test('examples: --explain, JSON, CSV, the GitHub commands and the defaults are the reports that are saved', async () => {
  assert.equal((await run([...MESSY, '--explain'])).out, await saved('messy-explain.txt'));
  assert.equal((await run([...MESSY, '--json', '--explain'])).out, await saved('messy.json'));
  assert.equal((await run([...MESSY, '--format', 'csv'])).out, await saved('messy-waves.csv'));
  assert.equal((await run([...MESSY, '--format', 'github'])).out, await saved('messy-github.txt'));
  assert.equal((await run(['--print-defaults'])).out, await saved('defaults.json'));
});

test('examples: the rules that fire on the messy inventory, each on the line built for it', async () => {
  const report = JSON.parse((await run([...MESSY, '--json'])).out);
  const lines = (await readFile(resolve(root, 'examples/messy/inventory.csv'), 'utf8')).split('\n');
  // The line of the first row that starts with id, after the row that starts with after.
  const at = (id, after = null) => {
    const from = after === null ? 0 : lines.findIndex((l) => l.startsWith(`${after},`)) + 1;
    return `examples/messy/inventory.csv:${lines.findIndex((l, i) => i >= from && l.startsWith(`${id},`)) + 1}`;
  };
  const byRule = {};
  for (const f of report.findings) (byRule[f.rule] ??= []).push(f.at);
  assert.deepEqual(byRule, {
    'unknown-dependency': [at('billing')],
    'retired-dependency': [at('fax-gateway')],
    'unknown-path': [at('report-portal')],
    'missing-path': [at('dev-sandbox')],
    'duplicate-id': [at('auth-svc', 'test-runner')],
    'invalid-record': [at('monitoring')],
    'circular-dependency': [at('orders-api'), at('test-runner')],
    'missing-owner': [at('rates-cache')],
    'retained-dependency': [at('mainframe-batch')]
  });
  assert.deepEqual(report.plan.waves.map((w) => w.groups.flatMap((g) => g.workloads.map((x) => x.id))), [['dns-core', 'billing', 'dev-sandbox'], ['test-runner'], ['auth-svc', 'orders-db', 'rates-cache'], ['ledger-db'], ['orders-api', 'pricing-svc', 'report-portal'], ['web-shop']]);
  assert.deepEqual(report.plan.notMoving.map((w) => w.id), ['fax-gateway', 'mainframe-batch', 'old-intranet']);
});

test('examples: the same files written with CRLF line ends give the same output', async () => {
  const dir = await mkdtemp(resolve(tmpdir(), 'migration-wave-planner-crlf-'));
  try {
    await cp(resolve(root, 'examples'), resolve(dir, 'examples'), { recursive: true });
    const walk = async (sub) => {
      for (const e of await readdir(resolve(dir, sub), { withFileTypes: true })) {
        const rel = `${sub}/${e.name}`;
        if (e.isDirectory()) {
          if (e.name !== 'output') await walk(rel);
        } else if (!e.name.endsWith('.md')) {
          const t = (await readFile(resolve(dir, rel), 'utf8')).split('\r\n').join('\n');
          await writeFile(resolve(dir, rel), t.split('\n').join('\r\n'));
        }
      }
    };
    await walk('examples');
    assert.equal((await run([...MESSY, '--explain'], dir)).out, await saved('messy-explain.txt'));
    assert.equal((await run(CLEAN, dir)).out, await saved('clean.txt'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
