// Runs the README examples, checks that they report what the README shows, and writes the reports of the two made-up
// inventories to examples/output. CI runs it and then fails if those files changed, so the example output in the
// repository is always the real output.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from '../src/index.js';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');

// The arguments of the examples; every path is relative to the root of the repository.
export const MESSY = ['examples/messy/inventory.csv', '--config', 'examples/config.json'];
export const CLEAN = ['examples/clean/inventory.json'];

// Runs the tool on files of the repository; the paths shown in the report are relative to the root of the repository.
export async function run(argv, base = root) {
  let out = '';
  let err = '';
  const code = await main(argv, { out: (t) => { out += t; }, err: (t) => { err += t; } }, undefined, base);
  return { code, out, err };
}

// What the README says of the messy inventory: the counts, the waves, one finding of every rule that fires, the notes
// and the result.
export const EXPECTED = [
  'input: examples/messy/inventory.csv (1 file: 1 CSV inventory; 17 records)',
  'config: examples/config.json (Quillmoor estate): 7 aliases; largest wave 3; minimum severity info; fail on warning',
  'plan: 15 workloads: 12 move in 6 waves (11 move groups, 2 circular), 1 retained, 2 retired',
  'paths: retire 2, retain 1, rehost 4, relocate 1, repurchase 1, replatform 3, refactor 1, none 1, unknown 1',
  'findings: 10 (6 error, 4 warning)',
  'move group 9 moves together, a circle: orders-api -> pricing-svc -> orders-api',
  'move group 4 moves together, a circle: test-runner -> test-runner',
  'rehost (move as is)',
  'rehost (Lift and Shift)',
  '"rehoist" (unknown)',
  'workload "billing" depends on "ledger-db2", which is not an id of the inventory; did you mean "ledger-db"?',
  'workload "fax-gateway" is marked retire, but "billing" still depends on it',
  'workload "report-portal" has the migration path "rehoist", which is not one of the 7 Rs or a known alias',
  'workload "dev-sandbox" has no migration path',
  'the id "auth-svc" is used again; the first record with it is at examples/messy/inventory.csv:3',
  'this row has 4 fields and the header has 9; the row is not read',
  'workloads "orders-api" and "pricing-svc" depend on each other (orders-api -> pricing-svc -> orders-api)',
  'workload "rates-cache" (Rates cache) has no owner',
  'workload "mainframe-batch" is marked retain and stays in the source environment, but "billing" (wave 1) moves and depends on it',
  'workload "test-runner" depends on itself',
  'note: examples/messy/inventory.csv: 1 column the tool does not read was left out: "notes"',
  'note: 2 migration paths were written as another name of a strategy and read as that strategy',
  'RESULT: FAIL - 10 findings at or above warning (6 error, 4 warning)'
];
// Both retired, the old intranet and the fax gateway are not a conflict; the staging copy of the sign-in service is
// not planned; a move group is never larger than the wave size here.
export const UNWANTED = ['RESULT: PASS', '"old-intranet" still', 'Sign-in service (staging)', 'move-group-too-big  ', 'did you mean "auth-svc"'];

const problems = [];
function expect(name, result, code, expected, unwanted, stream = 'out') {
  const text = result[stream];
  const missing = expected.filter((e) => !text.includes(e));
  const wrong = unwanted.filter((e) => text.includes(e));
  if (result.code !== code || missing.length || wrong.length) {
    problems.push(`${name}: unexpected report (exit code ${result.code}, expected ${code}; missing: ${missing.join(' / ') || 'none'}; should not appear: ${wrong.join(' / ') || 'none'})${result.err ? `\n${result.err}` : ''}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const messy = await run(MESSY);
  process.stdout.write(messy.out);
  expect('messy inventory', messy, 1, EXPECTED, UNWANTED);

  const clean = await run(CLEAN);
  expect('clean inventory', clean, 0, ['input: examples/clean/inventory.json (1 file: 1 JSON inventory; 8 records)', 'plan: 8 workloads: 6 move in 4 waves (6 move groups, 0 circular), 1 retained, 1 retired', 'findings: 0', 'note: examples/clean/inventory.json: 1 key the tool does not read was left out: "estate"', 'RESULT: PASS - no finding at or above error'], ['  WARNING  ', '  ERROR  ', 'RESULT: FAIL']);

  // Without the configuration "move as is" is not a known path, and only errors fail the run.
  expect('messy, built-in configuration', await run(['examples/messy/inventory.csv']), 1, ['config: built-in defaults:', 'workload "dns-core" has the migration path "move as is"', 'RESULT: FAIL - 7 findings at or above error'], []);
  // The clean inventory passes when every level fails the run, and waves of two change nothing, as no layer is larger.
  expect('clean, fail on info', await run([...CLEAN, '--fail-on', 'info']), 0, ['RESULT: PASS - no finding at or above info'], []);
  expect('clean, waves of two', await run([...CLEAN, '--max-wave-size', '2', '--fail-on', 'info']), 0, ['plan: 8 workloads: 6 move in 4 waves'], []);
  // A wave size of one makes the circle of two a wave of its own, with a warning.
  expect('messy, waves of one', await run([...MESSY, '--max-wave-size', '1']), 1, ['move group 9 holds 2 workloads ("orders-api" and "pricing-svc"), more than the largest wave size of 1'], []);
  // Only the errors can be shown.
  expect('messy, errors only', await run([...MESSY, '--min-severity', 'error']), 1, ['findings: 6 (6 error); 4 below error not shown'], ['  WARNING  ']);
  // A file of no kind the tool reads stops the run.
  expect('messy, a README named', await run(['examples/messy/README.md']), 2, ['examples/messy/README.md: not a kind of file the tool reads'], [], 'err');

  // The README shows the whole report of the messy inventory, the --explain lines of one finding, the GitHub
  // annotations of two findings, the start of the CSV wave plan and the report of the clean inventory.
  const readme = (await readFile(resolve(root, 'README.md'), 'utf8')).split('\r\n').join('\n');
  if (!readme.includes(messy.out)) problems.push('README: the sample output of the messy inventory differs from a real run');
  if (!readme.includes(clean.out)) problems.push('README: the sample output of the clean inventory differs from a real run');

  await mkdir(resolve(root, 'examples/output'), { recursive: true });
  await writeFile(resolve(root, 'examples/output/messy.txt'), messy.out);
  await writeFile(resolve(root, 'examples/output/clean.txt'), clean.out);
  const explain = await run([...MESSY, '--explain']);
  if (explain.code !== 1) problems.push(`explain: exit code ${explain.code}, expected 1`);
  const lines = explain.out.split('\n');
  const at = lines.findIndex((l) => l.includes('retained-dependency') && l.includes('inventory.csv:'));
  const sample = lines.slice(at, at + 7).join('\n');
  if (at < 0 || !readme.includes(sample)) problems.push('README: the --explain sample of the retained dependency differs from a real run');
  await writeFile(resolve(root, 'examples/output/messy-explain.txt'), explain.out);
  const github = await run([...MESSY, '--format', 'github']);
  if (github.code !== 1) problems.push(`github: exit code ${github.code}, expected 1`);
  const picked = github.out.split('\n').filter((x) => x.includes('title=migration-wave-planner retired-dependency::') || x.includes('title=migration-wave-planner circular-dependency::workloads'));
  if (picked.length !== 2) problems.push('github: the sample lines are not in the output');
  for (const l of picked) if (!readme.includes(l)) problems.push('README: the GitHub sample differs from a real run');
  await writeFile(resolve(root, 'examples/output/messy-github.txt'), github.out);
  const csv = await run([...MESSY, '--format', 'csv']);
  if (csv.code !== 1) problems.push(`csv: exit code ${csv.code}, expected 1`);
  const head = csv.out.split('\r\n').slice(0, 6).join('\n');
  if (!readme.includes(head)) problems.push('README: the CSV sample differs from a real run');
  await writeFile(resolve(root, 'examples/output/messy-waves.csv'), csv.out);
  const json = await run([...MESSY, '--json', '--explain']);
  if (json.code !== 1) problems.push(`json: exit code ${json.code}, expected 1`);
  await writeFile(resolve(root, 'examples/output/messy.json'), json.out);
  const defaults = await run(['--print-defaults']);
  if (defaults.code !== 0) problems.push(`--print-defaults: exit code ${defaults.code}, expected 0`);
  await writeFile(resolve(root, 'examples/output/defaults.json'), defaults.out);

  if (problems.length) {
    for (const p of problems) console.error(`example: ${p}`);
    process.exit(1);
  }
}
