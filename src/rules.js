// The rules and the result. Each rule names the points of the public pages it rests on (src/data.js), says where it is
// the tool's own choice, and what to change. docs/method.md says exactly what each rule looks at and what it cannot see.
// The checks themselves are in src/inventory.js and src/plan.js.

import { LEVELS } from './data.js';
import { grouped, plural } from './size.js';

export const RULES = [
  {
    id: 'circular-dependency',
    key: 'circularDependency',
    title: 'workloads depend on each other in a circle',
    basis: ['cafGroup', 'cafSequence'],
    own: 'the workloads of a strongly connected component of the graph of moving workloads, or one that depends on itself, become one move group that moves in one wave; one finding per group, at its first workload, with a shortest cycle through it; a warning, because the plan can still be made, but the group is larger than its parts and the circle is often a mistake in the inventory',
    rule: () => 'moving workloads whose dependencies lead back to themselves',
    fix: 'check each dependency of the circle; remove the one that is not real, or plan the group as one move with one cutover'
  },
  {
    id: 'unknown-dependency',
    key: 'unknownDependency',
    title: 'a dependency names an id that is not in the inventory',
    basis: ['cafSequence', 'cafGroup'],
    own: 'one finding per workload and unknown id; the dependency is left out of the plan, so the order it would give is lost; ids are compared exactly, with their case; a near id is suggested for an unknown id of four characters or more when the inventory holds at most 5,000 ids, for the first 100 of them',
    rule: () => 'an id in the dependencies of a workload that no record of the inventory has',
    fix: 'correct the id, or add the workload it names to the inventory with its migration path'
  },
  {
    id: 'duplicate-id',
    key: 'duplicateId',
    title: 'two records have the same id',
    basis: ['cafDocument'],
    own: 'the first record with an id is the one planned, in the order of the files on the command line and of the records in each file; every later record with the same id is reported at its id and left out of the plan',
    rule: () => 'a record whose id an earlier record already has',
    fix: 'give each workload its own id, or merge the two records into one'
  },
  {
    id: 'missing-owner',
    key: 'missingOwner',
    title: 'a workload has no owner',
    basis: ['cafOwner'],
    own: 'an owner that is empty or not given at all; any text counts as an owner, the tool cannot tell whether the person or team is real',
    rule: () => 'a workload with an empty owner, or an inventory with no owner column',
    fix: 'name the person or team who decides on the move and signs off the cutover'
  },
  {
    id: 'missing-path',
    key: 'missingPath',
    title: 'a workload has no migration path',
    basis: ['sevenRs'],
    own: 'a workload with no path is planned as one that moves, so that the order of its dependencies still holds, and is shown with the path none',
    rule: () => 'a workload with an empty migration path, or an inventory with no path column',
    fix: 'choose one of the 7 Rs for the workload: retire, retain, rehost, relocate, repurchase, replatform or refactor'
  },
  {
    id: 'unknown-path',
    key: 'unknownPath',
    title: 'a migration path is not one of the 7 Rs',
    basis: ['sevenRs', 'rehost', 'relocate', 'repurchase', 'replatform', 'refactor'],
    own: 'a path is compared with the letters A to Z lowered and runs of spaces, hyphens, underscores and commas made one space; the names of the AWS guide and the aliases of the configuration (lift and shift, lift and reshape, drop and shop, re-architect and others) are known; a workload with an unknown path is planned as one that moves',
    rule: (config) => `a migration path that is none of retire, retain, rehost, relocate, repurchase, replatform, refactor and the ${plural(Object.keys(config.aliases).length, 'alias', 'aliases')} of the configuration`,
    fix: 'write one of the 7 Rs, or add the word your team uses to aliases in the configuration'
  },
  {
    id: 'retired-dependency',
    key: 'retiredDependency',
    title: 'a workload marked retire is still needed',
    basis: ['retire', 'cafFallback'],
    own: 'one finding per retired workload, listing every workload that depends on it and is not retired itself, the retained ones included',
    rule: () => 'a workload with the path retire that a workload with another path depends on',
    fix: 'move the dependents off the workload first, or change its path to one that keeps it running'
  },
  {
    id: 'retained-dependency',
    key: 'retainedDependency',
    title: 'a moving workload needs a workload that stays behind',
    basis: ['retain', 'cafSplit'],
    own: 'one finding per retained workload, listing the moving workloads that depend on it with their waves; a warning, because a link between the two environments can be planned: it names a connection to design, not a mistake',
    rule: () => 'a workload with the path retain that a workload that moves depends on',
    fix: 'plan the connection between the cloud and the source environment (network, latency, security), or move the retained workload too'
  },
  {
    id: 'move-group-too-big',
    key: 'moveGroupTooBig',
    title: 'a move group is larger than the largest wave',
    basis: ['cafWaves', 'cafGroup'],
    own: 'only with a largest wave size, from --max-wave-size or maxWaveSize; the workloads of a move group are never split, so a group larger than the size is a wave of its own',
    rule: (config) => `a move group with more workloads than the largest wave size${config.maxWaveSize === null ? ' (none is set, so the rule does not report)' : ` of ${grouped(config.maxWaveSize)}`}`,
    fix: 'break the circle that holds the group together, or plan a larger wave for it'
  },
  {
    id: 'invalid-record',
    key: null,
    title: 'a record that cannot be read',
    basis: ['csvSameFields', 'cafDocument'],
    own: 'a record with no id, a CSV row with a different number of fields than the header, a JSON record that is not an object or names a field twice, is not part of the plan; a value of the wrong kind is taken as empty; this rule cannot be set lower or off',
    rule: () => 'a record of the inventory with no id, the wrong number of fields or a value of the wrong kind',
    fix: 'correct the record at the line named'
  },
  {
    id: 'unreadable-file',
    key: null,
    title: 'a file that cannot be read',
    basis: ['jsonUtf8', 'csvRecords'],
    own: 'a file that is over its size limit, binary, UTF-16, not valid UTF-8 or not there to open is an error and nothing in it is planned; this rule cannot be set lower or off',
    rule: () => 'an inventory that the tool could not read as UTF-8 text',
    fix: 'export the inventory as UTF-8 CSV or JSON'
  },
  {
    id: 'unparsable-file',
    key: null,
    title: 'a file that is not CSV or JSON the readers accept, or not an inventory',
    basis: ['csvRecords', 'jsonRepeatedNames'],
    own: 'a quoted CSV field that is not closed, a stray double quote, a header with no id column or a column named twice, JSON that does not parse or repeats a name, or JSON that is not a list of workloads stops the reading of the file, and nothing in it is planned; this rule cannot be set lower or off',
    rule: () => 'an inventory that the CSV or JSON reader refuses, or whose header or shape is not that of an inventory',
    fix: 'correct the file at the line and column named'
  }
];

export const ruleById = (id) => RULES.find((r) => r.id === id);

// True when a level is at or above another.
export const atOrAbove = (level, min) => LEVELS.indexOf(level) >= LEVELS.indexOf(min);

// The result: the run fails when a finding is at or above the level failOn. { pass, failOn, failing, byLevel, text }.
export function decide(findings, failOn) {
  const byLevel = { error: 0, warning: 0, info: 0 };
  for (const f of findings) byLevel[f.level] += 1;
  const failing = findings.filter((f) => atOrAbove(f.level, failOn)).length;
  const counts = ['error', 'warning', 'info'].filter((l) => byLevel[l]).map((l) => `${grouped(byLevel[l])} ${l}`);
  const text = failing
    ? `FAIL - ${plural(failing, 'finding')} at or above ${failOn}${counts.length ? ` (${counts.join(', ')})` : ''}`
    : `PASS - no finding at or above ${failOn}${counts.length ? ` (${counts.join(', ')})` : ''}`;
  return { pass: failing === 0, failOn, failing, byLevel, text };
}
