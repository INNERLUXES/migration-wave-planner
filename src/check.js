// A run: read the configuration and the inventories, build the plan, run the checks, and build the report of the run. A
// path on the command line that cannot be used (missing, a link, a folder, a file of no kind the tool reads), a
// configuration with a problem, or input past the limit of a run stops the run with an InputError and no result. A file
// of the input that cannot be read, or that the readers refuse, is an error finding of its own, so the run fails at the
// default level and never passes because a part of the input was passed over.

import { ConfigError, defaultConfig, readConfig } from './config.js';
import { LEVELS, NOTICE, POINTS, pointPage } from './data.js';
import { FILE_LIMITS, inspectPath, readText, readTextFile } from './files.js';
import { INVENTORY_LIMITS, readInventory, unreadableInventory } from './inventory.js';
import { KINDS, fileKind } from './kinds.js';
import { PLAN_LIMITS, buildPlan } from './plan.js';
import { RULES, atOrAbove, decide } from './rules.js';
import { grouped, listText, plural } from './size.js';
import { safeText } from './text.js';

export const LIMITS = { ...FILE_LIMITS, ...INVENTORY_LIMITS, ...PLAN_LIMITS, maxFindingsPerRule: 500 };
export const MAX_PROBLEMS = 20;

export class InputError extends Error {
  constructor(problems) {
    super(problems.join('; '));
    this.problems = problems;
  }
}

// A copy of a value with every text in it cleaned by safeText, for the parts of the report that come from the input.
export function cleanTexts(value) {
  if (typeof value === 'string') return safeText(value, 300);
  if (Array.isArray(value)) return value.map(cleanTexts);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, cleanTexts(v)]));
  return value;
}

// A list of problems for an error message: the first twenty, then a count.
export function capped(problems) {
  return problems.length > MAX_PROBLEMS ? [...problems.slice(0, MAX_PROBLEMS), `and ${grouped(problems.length - MAX_PROBLEMS)} more`] : problems;
}

// The level of a rule under a configuration: the rules of input problems are always errors.
export const levelOf = (rule, config) => (rule.key === null ? 'error' : config.rules[rule.key]);

// The run as a report object, from the inventories that were read and the configuration.
export function buildReport({ input, files, config, minSeverity, failOn, version, limits = LIMITS }) {
  const { plan, findings: planned, unsuggested } = buildPlan(files, config, limits);
  const raw = [...files.flatMap((f) => f.problems), ...planned];
  const ruleOrder = new Map(RULES.map((r, i) => [r.id, i]));
  const fileOrder = new Map(files.map((f, i) => [f.file, i]));
  const level = (id) => levelOf(RULES.find((r) => r.id === id), config);
  const order = (a, b) => LEVELS.indexOf(b.level) - LEVELS.indexOf(a.level) || fileOrder.get(a.file) - fileOrder.get(b.file) || a.line - b.line || a.column - b.column || ruleOrder.get(a.rule) - ruleOrder.get(b.rule);
  const all = raw.filter((f) => level(f.rule) !== 'off').map((f) => ({ ...f, level: level(f.rule) })).sort(order);
  const shown = all.filter((f) => atOrAbove(f.level, minSeverity));
  const hidden = all.length - shown.length;
  const perRule = new Map();
  const findings = [];
  let cut = 0;
  for (const f of shown) {
    const n = (perRule.get(f.rule) ?? 0) + 1;
    perRule.set(f.rule, n);
    if (n > limits.maxFindingsPerRule) cut += 1;
    else {
      const rule = RULES.find((r) => r.id === f.rule);
      const file = safeText(f.file);
      findings.push({
        rule: f.rule,
        level: f.level,
        file,
        line: f.line,
        column: f.column,
        at: `${file}:${f.line}`,
        found: safeText(f.found, 600),
        fix: rule.fix,
        basis: rule.basis.map((k) => ({ text: POINTS[k].text, source: pointPage(k).title, url: pointPage(k).url })),
        own: rule.own
      });
    }
  }
  // The result counts every finding at or above the minimum severity, including the ones past the limit of a rule.
  const result = decide(shown, failOn);
  const notes = [];
  for (const f of files) if (f.ignored.length) notes.push(`${f.file}: ${plural(f.ignored.length, f.kind === 'csv' ? 'column' : 'key')} the tool does not read ${f.ignored.length === 1 ? 'was' : 'were'} left out: ${listText(f.ignored.map((x) => `"${x}"`), 6)}`);
  if (plan.aliases) notes.push(`${plural(plan.aliases, 'migration path')} ${plan.aliases === 1 ? 'was' : 'were'} written as another name of a strategy and read as that strategy`);
  if (unsuggested) notes.push(`${plural(unsuggested, 'unknown id')} got no suggestion of a near id, past the limit of ${grouped(limits.maxSuggestions)} suggestions or of ${grouped(limits.maxSuggestIds)} ids`);
  if (cut) notes.push(`${plural(cut, 'finding')} past the limit of ${grouped(limits.maxFindingsPerRule)} per rule ${cut === 1 ? 'is' : 'are'} counted but not listed`);
  if (hidden) notes.push(`${plural(hidden, 'finding')} below ${minSeverity} ${hidden === 1 ? 'is' : 'are'} not shown`);
  const off = RULES.filter((r) => r.key !== null && config.rules[r.key] === 'off');
  if (off.length) notes.push(`${plural(off.length, 'rule')} ${off.length === 1 ? 'is' : 'are'} off: ${off.map((r) => r.id).join(', ')}`);
  const byLevel = { error: 0, warning: 0, info: 0 };
  for (const f of shown) byLevel[f.level] += 1;
  const byKind = Object.fromEntries(KINDS.map((k) => [k, files.filter((f) => f.kind === k).length]));
  return {
    tool: 'migration-wave-planner',
    version,
    input: { paths: input.paths.map((p) => safeText(p)), files: files.map((f) => ({ file: safeText(f.file), kind: f.kind, read: f.read, records: f.records, workloads: f.workloads.length })), byKind },
    config: {
      file: config.file === null ? null : safeText(config.file),
      name: config.name === null ? null : safeText(config.name, 120),
      aliases: cleanTexts(config.aliases),
      maxWaveSize: config.maxWaveSize,
      minSeverity,
      failOn,
      rules: RULES.map((r) => ({ id: r.id, key: r.key, level: levelOf(r, config), rule: safeText(r.rule(config), 600) }))
    },
    plan: cleanTexts(plan),
    findings,
    totals: { findings: shown.length, byLevel, hidden, notListed: cut },
    result,
    notes: notes.map((n) => safeText(n, 600)),
    notice: NOTICE
  };
}

// Reads the configuration and the inventories named and checks them: the report object of the run.
export async function checkPaths({ inputs, config: configPath = null, minSeverity = null, failOn = null, maxWaveSize = null, version = '0.0.0', limits = LIMITS, base = process.cwd() }) {
  let config;
  try {
    if (configPath) {
      const c = await readTextFile(configPath, base, limits.maxConfigBytes);
      config = readConfig(c.text, c.file);
    } else config = defaultConfig();
  } catch (error) {
    if (error instanceof ConfigError) throw new InputError(capped(error.problems));
    throw new InputError([error.message]);
  }
  if (maxWaveSize !== null) config = { ...config, maxWaveSize };
  const problems = [];
  const named = [];
  const seen = new Set();
  const files = [];
  let total = 0;
  for (const path of inputs) {
    let given;
    try {
      given = await inspectPath(path, base);
    } catch (error) {
      problems.push(error.message);
      continue;
    }
    named.push(given.shown);
    const kind = fileKind(given.shown);
    if (kind === null) {
      problems.push(`${given.shown}: not a kind of file the tool reads (a name ending in .csv or .json)`);
      continue;
    }
    if (seen.has(given.full)) {
      problems.push(`${given.shown}: is named twice`);
      continue;
    }
    seen.add(given.full);
    if (problems.length) continue;
    let read;
    try {
      read = await readText(given.full, given.shown, limits.maxFileBytes);
    } catch (error) {
      files.push(unreadableInventory(given.shown, kind, 'unreadable-file', 1, 1, `the file cannot be read: ${error.reason ?? error.message}; nothing in it is planned`));
      continue;
    }
    total += read.size;
    if (total > limits.maxTotalBytes) {
      problems.push(`${given.shown}: the files read so far hold more than ${grouped(limits.maxTotalBytes)} bytes, the limit of one run`);
      break;
    }
    files.push(readInventory(read.text, given.shown, kind, limits));
  }
  if (problems.length) throw new InputError(capped(problems));
  return buildReport({ input: { paths: named }, files, config, minSeverity: minSeverity ?? config.minSeverity, failOn: failOn ?? config.failOn, version, limits });
}
