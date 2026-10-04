import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG_LIMITS, ConfigError, DEFAULT_ALIASES, DEFAULT_FAIL_ON, DEFAULT_MAX_WAVE_SIZE, DEFAULT_MIN_SEVERITY, DEFAULT_RULES, KEYS, RULES, defaultConfig, defaultsAsConfig, distance, isObject, kindOf, pathForm, readConfig, suggestion, validateConfig } from '../src/index.js';

// The configuration file: every key, the aliases, the errors with their lines and suggestions.

const problems = (text) => {
  try {
    readConfig(text, 'c.json');
  } catch (error) {
    assert.ok(error instanceof ConfigError, error.message);
    return error.problems;
  }
  assert.fail('not refused');
  return [];
};

test('config: the defaults, and --print-defaults read back give the same configuration', () => {
  const d = defaultConfig();
  assert.deepEqual(d.rules, DEFAULT_RULES);
  assert.deepEqual(d.aliases, DEFAULT_ALIASES);
  assert.equal(d.maxWaveSize, DEFAULT_MAX_WAVE_SIZE);
  assert.equal(d.minSeverity, DEFAULT_MIN_SEVERITY);
  assert.equal(d.failOn, DEFAULT_FAIL_ON);
  assert.equal(DEFAULT_MAX_WAVE_SIZE, null);
  assert.equal(DEFAULT_MIN_SEVERITY, 'info');
  assert.equal(DEFAULT_FAIL_ON, 'error');
  const back = validateConfig(defaultsAsConfig(), new Map(), 'd.json');
  assert.deepEqual({ ...back, file: null, name: null }, d);
  assert.deepEqual(Object.keys(defaultsAsConfig()), Object.keys(KEYS));
  for (const [alias, path] of Object.entries(DEFAULT_ALIASES)) assert.equal(pathForm(alias), alias, `${alias} is written in its compared form (${path})`);
});

test('config: every rule but the three of input problems has a key, and every key a rule', () => {
  assert.deepEqual(RULES.filter((r) => r.key !== null).map((r) => r.key).sort(), Object.keys(DEFAULT_RULES).sort());
  assert.deepEqual(RULES.filter((r) => r.key === null).map((r) => r.id), ['invalid-record', 'unreadable-file', 'unparsable-file']);
  assert.deepEqual(RULES.filter((r) => r.key && DEFAULT_RULES[r.key] === 'error').map((r) => r.id), ['unknown-dependency', 'duplicate-id', 'missing-path', 'unknown-path', 'retired-dependency']);
  assert.deepEqual(RULES.filter((r) => r.key && DEFAULT_RULES[r.key] === 'warning').map((r) => r.id), ['circular-dependency', 'missing-owner', 'retained-dependency', 'move-group-too-big']);
});

test('config: every key with a good value', () => {
  const c = readConfig(JSON.stringify({ name: 'Estate', rules: { missingOwner: 'error', circularDependency: 'off', retainedDependency: 'info' }, aliases: { 'Move As-Is': 'rehost', 'drop and shop': 'off', 'lift and shift': 'relocate' }, maxWaveSize: 25, minSeverity: 'warning', failOn: 'warning' }), 'c.json');
  assert.equal(c.name, 'Estate');
  assert.equal(c.file, 'c.json');
  assert.equal(c.rules.missingOwner, 'error');
  assert.equal(c.rules.circularDependency, 'off');
  assert.equal(c.rules.retainedDependency, 'info');
  assert.equal(c.aliases['move as is'], 'rehost');
  assert.equal(c.aliases['lift and shift'], 'relocate');
  assert.ok(!Object.hasOwn(c.aliases, 'drop and shop'));
  assert.equal(c.maxWaveSize, 25);
  assert.equal(c.minSeverity, 'warning');
  assert.equal(c.failOn, 'warning');
  assert.equal(readConfig('{"maxWaveSize": null}', 'c').maxWaveSize, null);
});

test('config: an unknown key is an error with its line and a suggestion, at every level', () => {
  assert.deepEqual(problems('{\n  "maxWaveSise": 3\n}'), ['c.json: line 2: "maxWaveSise" is not a key of the configuration; did you mean "maxWaveSize"?']);
  assert.deepEqual(problems('{\n  "rules": {\n    "missingOwnr": "off"\n  }\n}'), ['c.json: line 3: "missingOwnr" is not a key of rules; did you mean "missingOwner"?']);
  assert.deepEqual(problems('{"alias": {}}'), ['c.json: line 1: "alias" is not a key of the configuration; did you mean "aliases"?']);
  assert.deepEqual(problems('{"failon": "info"}'), ['c.json: line 1: "failon" is not a key of the configuration; did you mean "failOn"?']);
  assert.deepEqual(problems('{"colour": 1}'), ['c.json: line 1: "colour" is not a key of the configuration']);
  assert.deepEqual(problems('{"rules": {"invalidRecord": "off"}}'), ['c.json: line 1: "invalidRecord" is not a key of rules'], 'the rules of input problems have no key');
});

test('config: a key named twice is refused, as RFC 8259 leaves the result open', () => {
  assert.match(problems('{"name": "a", "name": "b"}')[0], /^c\.json: line 1, column 15: the name "name" appears twice in one object/);
});

test('config: values of the wrong kind, each with its line', () => {
  const text = JSON.stringify({ name: '', rules: [], aliases: 'x', maxWaveSize: 0, minSeverity: 'notice', failOn: 3 }, null, 2);
  assert.deepEqual(problems(text), [
    'c.json: line 2: name must be a text of 1 to 120 characters',
    'c.json: line 3: rules must be an object, not a list',
    'c.json: line 4: aliases must be an object of names to migration paths, not a string',
    'c.json: line 5: maxWaveSize must be a whole number from 1 to 100,000, or null for no limit',
    'c.json: line 6: minSeverity must be one of info, warning, error',
    'c.json: line 7: failOn must be one of info, warning, error'
  ]);
  for (const bad of [1.5, -1, 100001, '3', true]) assert.match(problems(JSON.stringify({ maxWaveSize: bad }))[0], /maxWaveSize must be a whole number/, String(bad));
  assert.match(problems('{"rules": {"missingOwner": "fatal"}}')[0], /rules\.missingOwner must be one of info, warning, error, off, not "fatal"/);
  assert.match(problems('{"rules": {"missingOwner": 1}}')[0], /not a number/);
  assert.equal(CONFIG_LIMITS.maxWaveSize, 100000);
});

test('config: the errors of aliases', () => {
  assert.deepEqual(problems('{"aliases": {"rehost": "rehost"}}'), ['c.json: line 1: "rehost" is already the name of a migration path']);
  assert.equal(readConfig('{"aliases": {"Re-Host": "rehost"}}', 'c').aliases['re host'], 'rehost', 'not the same as rehost once compared');
  assert.deepEqual(problems('{"aliases": {"--": "rehost"}}'), ['c.json: line 1: "--" must hold 1 to 100 characters with a letter or a digit']);
  assert.deepEqual(problems('{"aliases": {"as is": "rehost", "AS-IS": "rehost"}}'), ['c.json: line 1: "AS-IS" is the same name as "as is" once compared (as is)']);
  assert.deepEqual(problems('{"aliases": {"as is": "lift"}}'), ['c.json: line 1: aliases.as is must be one of retire, retain, rehost, relocate, repurchase, replatform, refactor, off, not "lift"']);
  assert.deepEqual(problems('{"aliases": {"as is": "off"}}'), ['c.json: line 1: "as is" is not a built-in alias, so it cannot be set off']);
  assert.match(problems(JSON.stringify({ aliases: Object.fromEntries(Array.from({ length: 501 }, (_, i) => [`n${i}`, 'rehost'])) }))[0], /aliases holds more than 500 names/);
  assert.match(problems(JSON.stringify({ aliases: { [`${'a'.repeat(101)}`]: 'rehost' } }))[0], /must hold 1 to 100 characters/);
});

test('config: a name such as __proto__ is an ordinary key and is refused like any other', () => {
  assert.match(problems('{"__proto__": {"rules": {}}}')[0], /"__proto__" is not a key of the configuration/);
  assert.match(problems('{"rules": {"constructor": "off"}}')[0], /"constructor" is not a key of rules/);
  const c = readConfig('{"aliases": {"__proto__": "rehost", "constructor": "retire"}}', 'c');
  assert.equal(c.aliases.proto, 'rehost');
  assert.equal(Object.getPrototypeOf(c.aliases), Object.prototype);
  assert.equal({}.rules, undefined);
});

test('config: the configuration must be an object, and JSON errors have their line and column', () => {
  assert.deepEqual(problems('[]'), ['c.json: line 1: the configuration must be a JSON object, not a list']);
  assert.deepEqual(problems('{\n  "name": "x",\n}'), ['c.json: line 3, column 1: a comma before the closing brace; JSON has no trailing comma']);
  assert.throws(() => validateConfig(null), /must be a JSON object, not null/);
});

test('config: helpers for the suggestions and the kinds of values', () => {
  assert.equal(distance('name', 'nmae'), 1);
  assert.equal(distance('', 'abc'), 3);
  assert.equal(suggestion('failon', ['failOn', 'name']), '; did you mean "failOn"?');
  assert.equal(suggestion('somethingelse', ['name']), '');
  assert.equal(suggestion('x'.repeat(65), ['x'.repeat(65)]), '', 'a long name is not compared');
  assert.deepEqual([null, [], {}, 1, 'x', true].map(kindOf), ['null', 'a list', 'an object', 'a number', 'a string', 'a boolean']);
  assert.equal(isObject({}), true);
  assert.equal(isObject([]), false);
});
