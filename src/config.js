// The configuration file: the settings of the tool, in one strict JSON object over the built-in defaults. Every key the
// tool does not know is an error with its line and a suggestion, so a typo cannot leave a default in place unnoticed;
// the JSON reader refuses a name given twice in one object. The configuration is optional: with none, the defaults
// apply.

import { LEVELS, PATH_NAMES } from './data.js';
import { DEFAULT_ALIASES, DEFAULT_FAIL_ON, DEFAULT_MAX_WAVE_SIZE, DEFAULT_MIN_SEVERITY, DEFAULT_RULES } from './defaults.js';
import { JsonError, jsonProblem, parseJson } from './json.js';
import { asciiLower, pathForm } from './words.js';

export const CONFIG_LIMITS = { maxAliases: 500, maxAliasLength: 100, maxWaveSize: 100000 };

// Every key of the configuration file, with the kind of its value. docs/inputs.md describes each of them.
export const KEYS = {
  name: 'text',
  rules: Object.fromEntries(Object.keys(DEFAULT_RULES).map((k) => [k, 'level or off'])),
  aliases: 'object of texts to migration paths',
  maxWaveSize: 'whole number or null',
  minSeverity: 'level',
  failOn: 'level'
};

export class ConfigError extends Error {
  constructor(problems) {
    super(problems.join('; '));
    this.problems = problems;
  }
}

// The edit distance of two short names, for a suggestion: an insertion, a deletion, a change or two neighbours swapped
// ("nmae" for "name") each count one.
export function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

// The closest of the known names, when it is close enough to be a typo: '; did you mean "..."?' or nothing. A name that
// differs in length from a known name by more than three characters, or that is longer than 64 characters, is not
// compared with it.
export function suggestion(name, known) {
  if (name.length > 64) return '';
  let best = null;
  for (const k of known) {
    if (Math.abs(name.length - k.length) > 3 || k.length > 64) continue;
    const d = distance(asciiLower(name), asciiLower(k));
    if (d <= Math.max(1, Math.floor(k.length / 3)) && (!best || d < best.d)) best = { k, d };
  }
  return best ? `; did you mean "${best.k}"?` : '';
}

export function kindOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'a list';
  if (typeof value === 'object') return 'an object';
  return `a ${typeof value}`;
}

export const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// The built-in configuration, as the plan and the checks use it.
export function defaultConfig() {
  return {
    file: null,
    name: null,
    rules: { ...DEFAULT_RULES },
    aliases: { ...DEFAULT_ALIASES },
    maxWaveSize: DEFAULT_MAX_WAVE_SIZE,
    minSeverity: DEFAULT_MIN_SEVERITY,
    failOn: DEFAULT_FAIL_ON
  };
}

// The built-in configuration written as a configuration file, for --print-defaults. Read back, it gives the defaults.
export function defaultsAsConfig() {
  const d = defaultConfig();
  return { name: 'built-in defaults', rules: d.rules, aliases: d.aliases, maxWaveSize: d.maxWaveSize, minSeverity: d.minSeverity, failOn: d.failOn };
}

// Checks a parsed configuration and builds the configuration the plan uses, or throws ConfigError with every problem.
export function validateConfig(value, lines = new Map(), file = 'config') {
  const problems = [];
  const lineOf = (path) => {
    for (let p = path, prev = null; p && p !== prev; prev = p, p = p.replace(/(?:\.[^.[]+|\[\d+\])$/, '')) if (lines.has(p)) return lines.get(p);
    return 1;
  };
  const fail = (path, message) => problems.push({ line: lineOf(path), text: `${file}: line ${lineOf(path)}: ${message}` });
  const config = defaultConfig();
  config.file = file;
  if (!isObject(value)) throw new ConfigError([`${file}: line 1: the configuration must be a JSON object, not ${kindOf(value)}`]);

  const top = Object.keys(KEYS);
  for (const k of Object.keys(value)) if (!top.includes(k)) fail(k, `"${k.slice(0, 60)}" is not a key of the configuration${suggestion(k, top)}`);

  if (Object.hasOwn(value, 'name')) {
    if (typeof value.name !== 'string' || value.name.length === 0 || value.name.length > 120) fail('name', 'name must be a text of 1 to 120 characters');
    else config.name = value.name;
  }

  if (Object.hasOwn(value, 'rules')) {
    const v = value.rules;
    const keys = Object.keys(DEFAULT_RULES);
    if (!isObject(v)) fail('rules', `rules must be an object, not ${kindOf(v)}`);
    else {
      for (const k of Object.keys(v)) {
        const path = `rules.${k}`;
        if (!keys.includes(k)) fail(path, `"${k.slice(0, 60)}" is not a key of rules${suggestion(k, keys)}`);
        else if (typeof v[k] !== 'string' || ![...LEVELS, 'off'].includes(v[k])) fail(path, `${path} must be one of ${[...LEVELS, 'off'].join(', ')}, not ${typeof v[k] === 'string' ? `"${v[k].slice(0, 40)}"` : kindOf(v[k])}`);
        else config.rules[k] = v[k];
      }
    }
  }

  // aliases: an object of other names of the migration paths. Each name is compared in its path form; its value is one
  // of the seven paths, which adds the name or changes it, or "off", which takes a built-in name away.
  if (Object.hasOwn(value, 'aliases')) {
    const v = value.aliases;
    if (!isObject(v)) fail('aliases', `aliases must be an object of names to migration paths, not ${kindOf(v)}`);
    else if (Object.keys(v).length > CONFIG_LIMITS.maxAliases) fail('aliases', `aliases holds more than ${CONFIG_LIMITS.maxAliases} names`);
    else {
      const seen = new Map();
      for (const k of Object.keys(v)) {
        const path = `aliases.${k}`;
        const form = pathForm(k);
        if (form === '' || k.length > CONFIG_LIMITS.maxAliasLength) fail(path, `"${k.slice(0, 60)}" must hold 1 to ${CONFIG_LIMITS.maxAliasLength} characters with a letter or a digit`);
        else if (PATH_NAMES.includes(form)) fail(path, `"${k.slice(0, 60)}" is already the name of a migration path`);
        else if (seen.has(form)) fail(path, `"${k.slice(0, 60)}" is the same name as "${seen.get(form)}" once compared (${form})`);
        else if (typeof v[k] !== 'string' || ![...PATH_NAMES, 'off'].includes(v[k])) fail(path, `${path} must be one of ${[...PATH_NAMES, 'off'].join(', ')}, not ${typeof v[k] === 'string' ? `"${v[k].slice(0, 40)}"` : kindOf(v[k])}`);
        else if (v[k] === 'off' && !Object.hasOwn(config.aliases, form)) fail(path, `"${k.slice(0, 60)}" is not a built-in alias, so it cannot be set off`);
        else {
          seen.set(form, k);
          if (v[k] === 'off') delete config.aliases[form];
          else config.aliases[form] = v[k];
        }
      }
    }
  }

  if (Object.hasOwn(value, 'maxWaveSize')) {
    const v = value.maxWaveSize;
    if (v !== null && (!Number.isInteger(v) || v < 1 || v > CONFIG_LIMITS.maxWaveSize)) fail('maxWaveSize', `maxWaveSize must be a whole number from 1 to ${CONFIG_LIMITS.maxWaveSize.toLocaleString('en-US')}, or null for no limit`);
    else config.maxWaveSize = v;
  }

  for (const key of ['minSeverity', 'failOn']) {
    if (!Object.hasOwn(value, key)) continue;
    if (!LEVELS.includes(value[key])) fail(key, `${key} must be one of ${LEVELS.join(', ')}`);
    else config[key] = value[key];
  }
  // The problems in the order of their lines, so the list reads like the file.
  if (problems.length) throw new ConfigError(problems.sort((a, b) => a.line - b.line).map((p) => p.text));
  return config;
}

// Reads the text of a configuration file.
export function readConfig(text, file) {
  let parsed;
  try {
    parsed = parseJson(text, { linesUpTo: 3 });
  } catch (error) {
    if (error instanceof JsonError) throw new ConfigError([`${file}: ${jsonProblem(error, text)}`]);
    throw error;
  }
  return validateConfig(parsed.value, parsed.lines, file);
}
