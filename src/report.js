// The reports: text for a terminal, JSON for other tools, and GitHub workflow commands that turn each finding into an
// annotation on the file, line and column. The CSV wave plan is in src/csv.js. Every text from the input (a file name,
// an id, a name, an owner or a path) was cleaned by safeText before it reached the report object. The GitHub commands
// also escape the characters a command gives a meaning to, so a text in the input cannot end a command early or start
// another one.

import { KINDS } from './kinds.js';
import { grouped, listText, plural } from './size.js';
import { safeText } from './text.js';

const clean = (t, max = 200) => safeText(t, max);
const pathsText = (r) => r.input.paths.join(', ');

// The kinds of files as the report names them, one and many.
export const KIND_NAMES = { csv: ['CSV inventory', 'CSV inventories'], json: ['JSON inventory', 'JSON inventories'] };

function inputLine(r) {
  const n = r.input.byKind;
  const kinds = KINDS.filter((k) => n[k]).map((k) => `${grouped(n[k])} ${KIND_NAMES[k][n[k] === 1 ? 0 : 1]}`).join(', ');
  const records = r.input.files.reduce((a, f) => a + f.records, 0);
  return `${pathsText(r)} (${plural(r.input.files.length, 'file')}${kinds ? `: ${kinds}` : ''}; ${plural(records, 'record')})`;
}

function configLine(r) {
  const c = r.config;
  const where = c.file ? `${c.file}${c.name ? ` (${clean(c.name, 120)})` : ''}` : 'built-in defaults';
  return `${where}: ${plural(Object.keys(c.aliases).length, 'alias', 'aliases')}; largest wave ${c.maxWaveSize === null ? 'no limit' : grouped(c.maxWaveSize)}; minimum severity ${c.minSeverity}; fail on ${c.failOn}`;
}

const rulesLine = (r) => r.config.rules.map((x) => `${x.id} (${x.level})`).join('; ');

function planLine(r) {
  const p = r.plan;
  return `${plural(p.workloads, 'workload')}: ${grouped(p.moving)} ${p.moving === 1 ? 'moves' : 'move'} in ${plural(p.waves.length, 'wave')} (${plural(p.groups, 'move group')}, ${grouped(p.circular)} circular), ${grouped(p.retained)} retained, ${grouped(p.retired)} retired`;
}

const pathsLine = (r) => Object.entries(r.plan.byPath).filter(([, n]) => n).map(([k, n]) => `${k} ${grouped(n)}`).join(', ') || 'none';

function findingsLine(r) {
  const b = r.totals.byLevel;
  const parts = ['error', 'warning', 'info'].filter((l) => b[l]).map((l) => `${grouped(b[l])} ${l}`);
  return `${grouped(r.totals.findings)}${parts.length ? ` (${parts.join(', ')})` : ''}${r.totals.hidden ? `; ${grouped(r.totals.hidden)} below ${r.config.minSeverity} not shown` : ''}`;
}

// A table with a header row and its columns padded to the widest cell.
function table(head, rows, indent = '  ') {
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((row) => row[i].length)));
  const line = (cells) => `${indent}${cells.map((c, i) => (i === cells.length - 1 ? c : c.padEnd(widths[i]))).join('  ')}`.trimEnd();
  return [line(head), ...rows.map(line)];
}

const cell = (t, max = 40) => (t === '' || t === null || t === undefined ? '-' : clean(t, max));

// The path of a workload as the tables show it: the strategy, with the name as written when it was an alias; the text
// as written when it is unknown; none when it is empty.
export function pathText(w) {
  if (w.strategy) return w.alias ? `${w.strategy} (${clean(w.path, 30)})` : w.strategy;
  return w.path ? `"${clean(w.path, 30)}" (unknown)` : 'none';
}

const depsText = (w) => (w.dependencies.length ? listText(w.dependencies.map((d) => clean(d, 40)), 4) : '-');

function waveLines(r) {
  const out = [];
  for (const wave of r.plan.waves) {
    out.push(`  Wave ${wave.wave}: ${plural(wave.size, 'workload')} in ${plural(wave.groups.length, 'move group')}`, '');
    const rows = [];
    for (const g of wave.groups) for (const w of g.workloads) rows.push([String(g.group), cell(w.id), cell(w.name), cell(w.type, 20), cell(w.environment, 20), pathText(w), cell(w.owner), cell(w.criticality, 20), depsText(w)]);
    out.push(...table(['group', 'id', 'name', 'type', 'environment', 'path', 'owner', 'criticality', 'depends on'], rows, '    '));
    for (const g of wave.groups.filter((x) => x.circular)) out.push('', `    move group ${g.group} moves together, a circle: ${g.cycle.join(' -> ')}`);
    out.push('');
  }
  if (!r.plan.waves.length) out.push('  none', '');
  return out;
}

function notMovingLines(r) {
  if (!r.plan.notMoving.length) return ['  none', ''];
  const rows = r.plan.notMoving.map((w) => [cell(w.id), cell(w.name), cell(w.type, 20), cell(w.environment, 20), w.strategy, cell(w.owner), w.dependents.length ? listText(w.dependents, 4) : '-']);
  return [...table(['id', 'name', 'type', 'environment', 'path', 'owner', 'needed by'], rows), ''];
}

export function toText(r, { explain = false } = {}) {
  const out = [];
  out.push(`migration-wave-planner: ${pathsText(r)}`);
  out.push(`input: ${inputLine(r)}`);
  out.push(`config: ${configLine(r)}`);
  out.push(`rules: ${rulesLine(r)}`);
  out.push(`plan: ${planLine(r)}`);
  out.push(`paths: ${pathsLine(r)}`);
  out.push(`findings: ${findingsLine(r)}`);
  out.push('', `Waves (${grouped(r.plan.waves.length)})`, '');
  out.push(...waveLines(r));
  out.push(`Not moving (${grouped(r.plan.notMoving.length)})`, '');
  out.push(...notMovingLines(r));
  out.push(`Findings (${grouped(r.findings.length)})`, '');
  if (!r.findings.length) out.push('  none', '');
  const width = Math.max(...r.config.rules.map((x) => x.id.length));
  const pad = ' '.repeat(11);
  for (const f of r.findings) {
    out.push(`  ${f.level.toUpperCase().padEnd(8)} ${f.rule.padEnd(width)}  ${f.at}`);
    out.push(`${pad}${f.found}`);
    out.push(`${pad}fix: ${f.fix}`);
    if (explain) {
      out.push(`${pad}rule: ${r.config.rules.find((x) => x.id === f.rule).rule}`);
      for (const b of f.basis) out.push(`${pad}basis: ${b.text} (${b.source}, ${b.url})`);
      if (f.own) out.push(`${pad}the tool's own choice: ${f.own}`);
    }
    out.push('');
  }
  for (const n of r.notes) out.push(`note: ${n}`);
  if (r.notes.length) out.push('');
  out.push(r.notice, '');
  out.push(`RESULT: ${r.result.text}`);
  return `${out.join('\n')}\n`;
}

export function toJson(r, { explain = false } = {}) {
  const out = { ...r, findings: r.findings.map((f) => (explain ? f : { ...f, basis: undefined, own: undefined })) };
  return `${JSON.stringify(out, null, 2)}\n`;
}

// The message of a workflow command: %, CR and LF escaped.
export const escapeData = (t) => String(t).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');

// A property of a workflow command: also : and , escaped.
export const escapeProperty = (t) => escapeData(t).replace(/:/g, '%3A').replace(/,/g, '%2C');

const COMMANDS = { error: 'error', warning: 'warning', info: 'notice' };

export function toGithub(r) {
  const out = [];
  for (const f of r.findings) {
    const props = [`file=${escapeProperty(f.file)}`, `line=${f.line}`, ...(f.column ? [`col=${f.column}`] : []), `title=${escapeProperty(`migration-wave-planner ${f.rule}`)}`];
    out.push(`::${COMMANDS[f.level]} ${props.join(',')}::${escapeData(`${f.found}; fix: ${f.fix}`)}`);
  }
  out.push(`migration-wave-planner: ${pathsText(r)}: ${plural(r.plan.workloads, 'workload')}, ${plural(r.plan.waves.length, 'wave')}, ${grouped(r.totals.findings)} ${r.totals.findings === 1 ? 'finding' : 'findings'}; RESULT: ${r.result.text}`);
  return `${out.join('\n')}\n`;
}
