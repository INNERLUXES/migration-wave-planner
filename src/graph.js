// The dependency graph of the workloads that move: the strongly connected components, which become the move groups, a
// cycle inside a component to show in a finding, and the layer of each component, which becomes its wave. An edge runs
// from a workload to a workload it depends on. Every function is iterative, so a long chain cannot overflow the stack,
// and each runs in time linear in the nodes and edges.

// Compares two strings by their UTF-16 code units, so the order does not depend on the locale.
export const byCode = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// The strongly connected components of a graph (Tarjan): [[node, ...]], every node in exactly one, in an order where a
// component comes after every component it depends on. nodes is a list; edges maps a node to the nodes it depends on,
// all of which are nodes. The nodes of a component keep the order of nodes.
export function components(nodes, edges) {
  const order = new Map(nodes.map((n, i) => [n, i]));
  const index = new Map();
  const low = new Map();
  const onStack = new Set();
  const stack = [];
  const out = [];
  let next = 0;
  for (const root of nodes) {
    if (index.has(root)) continue;
    const work = [{ node: root, i: 0 }];
    index.set(root, next);
    low.set(root, next);
    next += 1;
    stack.push(root);
    onStack.add(root);
    while (work.length) {
      const top = work.at(-1);
      const list = edges.get(top.node) ?? [];
      if (top.i < list.length) {
        const to = list[top.i];
        top.i += 1;
        if (!index.has(to)) {
          index.set(to, next);
          low.set(to, next);
          next += 1;
          stack.push(to);
          onStack.add(to);
          work.push({ node: to, i: 0 });
        } else if (onStack.has(to)) low.set(top.node, Math.min(low.get(top.node), index.get(to)));
        continue;
      }
      work.pop();
      if (work.length) {
        const parent = work.at(-1).node;
        low.set(parent, Math.min(low.get(parent), low.get(top.node)));
      }
      if (low.get(top.node) === index.get(top.node)) {
        const component = [];
        for (;;) {
          const n = stack.pop();
          onStack.delete(n);
          component.push(n);
          if (n === top.node) break;
        }
        out.push(component.sort((a, b) => order.get(a) - order.get(b)));
      }
    }
  }
  return out;
}

// True when a component is a cycle: more than one node, or one node that depends on itself.
export const isCycle = (component, edges) => component.length > 1 || (edges.get(component[0]) ?? []).includes(component[0]);

// A shortest cycle through the first node of a component, as a path that ends where it starts: [a, b, a]. Found by a
// breadth-first search that stays inside the component. A node that depends on itself gives [a, a].
export function cycleOf(component, edges) {
  const start = component[0];
  const inside = new Set(component);
  const from = new Map();
  const queue = [start];
  for (let q = 0; q < queue.length; q += 1) {
    const node = queue[q];
    for (const to of edges.get(node) ?? []) {
      if (!inside.has(to)) continue;
      if (to === start) {
        const back = [];
        for (let n = node; n !== start; n = from.get(n)) back.push(n);
        return [start, ...back.reverse(), start];
      }
      if (!from.has(to)) {
        from.set(to, node);
        queue.push(to);
      }
    }
  }
  return [start];
}

// The layer of every component, from 1: a component that depends on nothing is in layer 1, and any other is one layer
// after the highest layer of the components it depends on. comps must come in the order of components(), each after
// the components it depends on. Returns a list of layers, one per component.
export function layersOf(comps, edges) {
  const compOf = new Map();
  comps.forEach((c, i) => {
    for (const n of c) compOf.set(n, i);
  });
  const layer = [];
  comps.forEach((c, i) => {
    let l = 1;
    for (const n of c) {
      for (const to of edges.get(n) ?? []) {
        const j = compOf.get(to);
        if (j !== i) l = Math.max(l, layer[j] + 1);
      }
    }
    layer.push(l);
  });
  return layer;
}
