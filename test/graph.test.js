import { test } from 'node:test';
import assert from 'node:assert/strict';
import { byCode, components, cycleOf, isCycle, layersOf } from '../src/index.js';

// The dependency graph: strongly connected components, a shortest cycle and the layers, worked out by hand on small
// graphs.

const graph = (spec) => new Map(Object.entries(spec));

test('graph: every node is in one component, and a component comes after the components it depends on', () => {
  const edges = graph({ a: ['b'], b: ['c'], c: ['b', 'd'], d: [], e: ['a', 'e'] });
  const comps = components(['a', 'b', 'c', 'd', 'e'], edges);
  assert.deepEqual(comps, [['d'], ['b', 'c'], ['a'], ['e']]);
  assert.deepEqual(comps.map((c) => isCycle(c, edges)), [false, true, false, true]);
});

test('graph: the nodes of a component keep the order of the nodes given', () => {
  const edges = graph({ z: ['y'], y: ['x'], x: ['z'] });
  assert.deepEqual(components(['z', 'y', 'x'], edges), [['z', 'y', 'x']]);
  assert.deepEqual(components(['x', 'y', 'z'], edges), [['x', 'y', 'z']]);
});

test('graph: a shortest cycle through the first node of a component, and a node that depends on itself', () => {
  const edges = graph({ a: ['b', 'c'], b: ['d'], c: ['a'], d: ['a'] });
  assert.deepEqual(cycleOf(['a', 'b', 'c', 'd'], edges), ['a', 'c', 'a']);
  assert.deepEqual(cycleOf(['a', 'b', 'd'], graph({ a: ['b'], b: ['d'], d: ['a'] })), ['a', 'b', 'd', 'a']);
  assert.deepEqual(cycleOf(['s'], graph({ s: ['s'] })), ['s', 's']);
  assert.deepEqual(cycleOf(['n'], graph({ n: [] })), ['n'], 'no cycle');
});

test('graph: the layer of a component is one after the highest layer it depends on', () => {
  const edges = graph({ app: ['db', 'cache'], db: ['dns'], cache: ['dns'], dns: [], web: ['app'], tool: [] });
  const nodes = ['app', 'db', 'cache', 'dns', 'web', 'tool'];
  const comps = components(nodes, edges);
  const layers = layersOf(comps, edges);
  const layerOf = Object.fromEntries(comps.map((c, i) => [c[0], layers[i]]));
  assert.deepEqual(layerOf, { dns: 1, db: 2, cache: 2, app: 3, web: 4, tool: 1 });
});

test('graph: a long chain and a long ring are handled without recursion', () => {
  const n = 100000;
  const nodes = Array.from({ length: n }, (_, i) => `n${i}`);
  const chain = new Map(nodes.map((x, i) => [x, i + 1 < n ? [nodes[i + 1]] : []]));
  const comps = components(nodes, chain);
  assert.equal(comps.length, n);
  assert.equal(layersOf(comps, chain).reduce((a, b) => Math.max(a, b), 0), n);
  const ring = new Map(nodes.map((x, i) => [x, [nodes[(i + 1) % n]]]));
  const one = components(nodes, ring);
  assert.equal(one.length, 1);
  assert.equal(cycleOf(one[0], ring).length, n + 1);
});

test('graph: names compared by code unit', () => {
  assert.deepEqual(['b', 'B', 'a', 'A'].sort(byCode), ['A', 'B', 'a', 'b']);
  assert.equal(byCode('x', 'x'), 0);
});
