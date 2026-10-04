// The built-in configuration: the level of every rule, the other names of the migration paths, the largest wave, the
// lowest level shown and the level that fails the run. docs/inputs.md describes every key, and --print-defaults writes
// all of this out.

// The level of every rule that the configuration can set. The three rules of input problems are always errors.
export const DEFAULT_RULES = {
  circularDependency: 'warning',
  unknownDependency: 'error',
  duplicateId: 'error',
  missingOwner: 'warning',
  missingPath: 'error',
  unknownPath: 'error',
  retiredDependency: 'error',
  retainedDependency: 'warning',
  moveGroupTooBig: 'warning'
};

// Other names of the migration paths, in the form they are compared in (src/words.js pathForm). The AWS guide gives
// lift and shift for rehost, lift, tinker and shift and lift and reshape for replatform, drop and shop for repurchase,
// and re-architect for refactor.
export const DEFAULT_ALIASES = {
  'lift and shift': 'rehost',
  'lift tinker and shift': 'replatform',
  'lift and reshape': 'replatform',
  'drop and shop': 'repurchase',
  're architect': 'refactor',
  rearchitect: 'refactor'
};

// The largest number of workloads in one wave, or null for no limit.
export const DEFAULT_MAX_WAVE_SIZE = null;

// The lowest level of a finding that is shown.
export const DEFAULT_MIN_SEVERITY = 'info';

// The lowest level of a finding that fails the run.
export const DEFAULT_FAIL_ON = 'error';
