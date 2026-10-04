// Shared test helpers: inventories built inline, planned in memory or written into a temporary folder that is removed
// after the test. Paths are built with resolve() from forward-slash names, so the same test runs on Linux, macOS and
// Windows. The line a test expects is found with lineOf(), which counts lines the way the tool does, so a test never
// holds a line number worked out by hand for one system only. No test reads the clock, the time zone or the locale.

import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { buildReport, defaultConfig, fileKind, lineStarts, main, positionOf, readConfig, readInventory } from '../src/index.js';

export async function withFiles(files, fn) {
  const dir = await mkdtemp(resolve(tmpdir(), 'migration-wave-planner-'));
  try {
    for (const [rel, content] of Object.entries(files)) {
      await mkdir(dirname(resolve(dir, rel)), { recursive: true });
      await writeFile(resolve(dir, rel), content);
    }
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function offsetOf(text, needle, n) {
  let at = -1;
  for (let i = 0; i < n; i += 1) {
    at = text.indexOf(needle, at + 1);
    if (at < 0) throw new Error(`${needle} is not in the text ${n} times`);
  }
  return at;
}

// The line (from 1) of the n-th place where needle starts in text.
export const lineOf = (text, needle, n = 1) => positionOf(lineStarts(text), offsetOf(text, needle, n)).line;

// The column (from 1) of the n-th place where needle starts in text.
export const columnOf = (text, needle, n = 1) => positionOf(lineStarts(text), offsetOf(text, needle, n)).column;

// The configuration of a configuration object, through the real reader, or the defaults.
export const configOf = (object = null) => (object === null ? defaultConfig() : readConfig(JSON.stringify(object), 'config.json'));

// The header every inventory of the tests uses.
export const HEADER = 'id,name,type,owner,environment,path,criticality,dependencies';

// A CSV inventory with the header and these rows, each written as [id, owner, path, dependencies] and filled in with a
// name, a type, an environment and a criticality.
export const csv = (...rows) => `${HEADER}\n${rows.map(([id, owner, path, deps = '']) => `${id},Name of ${id},server,${owner},production,${path},medium,${deps}`).join('\n')}\n`;

// A JSON inventory of these records.
export const json = (...records) => `${JSON.stringify({ workloads: records }, null, 2)}\n`;

// The report object of inventories planned in memory: an object of path to text, with a configuration object or none.
export function reportOf(sources, config = null, { minSeverity = 'info', failOn = 'error', maxWaveSize } = {}) {
  let cfg = configOf(config);
  if (maxWaveSize !== undefined) cfg = { ...cfg, maxWaveSize };
  const files = Object.entries(sources).map(([file, text]) => readInventory(text, file, fileKind(file)));
  return buildReport({ input: { paths: Object.keys(sources) }, files, config: cfg, minSeverity, failOn, version: 'test' });
}

// The report object of one CSV inventory of these rows.
export const planOf = (rows, options = {}, config = null) => reportOf({ 'inventory.csv': csv(...rows) }, config, options);

// The findings of a report, of one rule or of all.
export const findingsOf = (r, rule) => r.findings.filter((f) => !rule || f.rule === rule);

// The rule ids of the findings of a report, in order.
export const rulesOf = (r) => r.findings.map((f) => f.rule);

// The rule ids of the findings of a report, sorted.
export const sortedRules = (r) => rulesOf(r).sort();

// The waves of a report as lists of ids.
export const wavesOf = (r) => r.plan.waves.map((w) => w.groups.flatMap((g) => g.workloads.map((x) => x.id)));

// Writes the files and runs the command line with these arguments (paths relative to the folder).
export async function run(files, args = [], limits) {
  return withFiles(files, async (dir) => {
    let out = '';
    let err = '';
    const code = await main(args, { out: (t) => { out += t; }, err: (t) => { err += t; } }, limits, dir);
    return { code, out, err, dir };
  });
}

// Runs the command line with exactly these arguments, in a folder.
export async function cli(argv, dir) {
  let out = '';
  let err = '';
  const code = await main(argv, { out: (t) => { out += t; }, err: (t) => { err += t; } }, undefined, dir);
  return { code, out, err };
}
