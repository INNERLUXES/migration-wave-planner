// The plan: the workloads of every inventory read, each with its migration path, the move groups of the workloads that
// move, the waves, the workloads that stay behind, and the findings of the rules that look at the whole inventory.
//
// The workloads that move are the ones whose path is not retire or retain; a workload with no path or an unknown path
// is counted with them, so the order of its dependencies still holds. The dependency graph has an edge from a moving
// workload to every moving workload it depends on. Its strongly connected components are the move groups: a group of
// more than one workload, or of one that depends on itself, is a circle, and moves in one wave. A group goes in the
// wave after the last wave of the groups it depends on, so every workload moves after what it needs. With a largest
// wave size, each layer of groups is cut into waves of at most that many workloads, in order, and a group is never cut.

import { PATHS, PATH_NAMES } from './data.js';
import { suggestion } from './config.js';
import { components, cycleOf, isCycle, layersOf } from './graph.js';
import { listText, plural } from './size.js';
import { pathForm } from './words.js';

export const PLAN_LIMITS = { maxSuggestIds: 5000, maxSuggestions: 100 };

const quoted = (ids, max = 4) => listText(ids.map((x) => `"${x}"`), max);

// The migration path of a workload: { strategy, alias, known }. strategy is one of the seven names, or null when the
// path is empty or unknown.
export function resolvePath(path, aliases) {
  const form = pathForm(path);
  if (form === '') return { strategy: null, alias: false, known: false };
  if (PATH_NAMES.includes(form)) return { strategy: form, alias: false, known: true };
  if (Object.hasOwn(aliases, form)) return { strategy: aliases[form], alias: true, known: true };
  return { strategy: null, alias: false, known: false };
}

const moves = (strategy) => strategy === null || PATHS.find((p) => p.name === strategy).moves;

// The place of a field of a workload, or of the workload itself when the field is not in its file.
const placeOf = (w, field) => w.at[field] ?? { line: w.line, column: w.column };

// The workload as the plan shows it.
function itemOf(w) {
  return { id: w.id, name: w.name, type: w.type, owner: w.owner, environment: w.environment, path: w.path, strategy: w.strategy, alias: w.alias, criticality: w.criticality, dependencies: w.dependencies, file: w.file, line: w.line };
}

// Builds the plan from the inventories read: { plan, findings }. Each finding is { rule, file, line, column, found }.
export function buildPlan(inventories, config, limits = PLAN_LIMITS) {
  const lim = { ...PLAN_LIMITS, ...limits };
  const maxWaveSize = config.maxWaveSize;
  const findings = [];
  const add = (rule, w, field, found) => {
    const p = placeOf(w, field);
    findings.push({ rule, file: w.file, line: p.line, column: p.column, found });
  };

  // The records, in the order of the files and of the records in each; the first record with an id is planned.
  const byId = new Map();
  let records = 0;
  for (const inv of inventories) {
    for (const w of inv.workloads) {
      records += 1;
      const first = byId.get(w.id);
      if (first) add('duplicate-id', w, 'id', `the id "${w.id}" is used again; the first record with it is at ${first.file}:${first.line}, and this record is left out of the plan`);
      else byId.set(w.id, { ...w, order: byId.size });
    }
  }
  const all = [...byId.values()];

  // The migration path and the owner of each workload.
  for (const w of all) {
    Object.assign(w, resolvePath(w.path, config.aliases));
    if (!w.owner) add('missing-owner', w, 'owner', `workload "${w.id}"${w.name ? ` (${w.name})` : ''} has no owner`);
    if (!pathForm(w.path)) add('missing-path', w, 'path', `workload "${w.id}" has no migration path; it is planned as a workload that moves`);
    else if (!w.known) add('unknown-path', w, 'path', `workload "${w.id}" has the migration path "${w.path}", which is not one of the 7 Rs or a known alias; it is planned as a workload that moves`);
  }

  // The dependencies: ids that are not in the inventory, and the edges between the workloads that move.
  const edges = new Map();
  const dependents = new Map(all.map((w) => [w.id, []]));
  const ids = [...byId.keys()];
  let suggested = 0;
  let unsuggested = 0;
  for (const w of all) {
    const out = [];
    for (const d of w.dependencies) {
      const target = byId.get(d);
      if (!target) {
        // A near id is suggested for an id of four characters or more, within the limits of the plan.
        let hint = '';
        if (d.length >= 4) {
          if (ids.length <= lim.maxSuggestIds && suggested < lim.maxSuggestions) {
            suggested += 1;
            hint = suggestion(d, ids);
          } else unsuggested += 1;
        }
        add('unknown-dependency', w, 'dependencies', `workload "${w.id}" depends on "${d}", which is not an id of the inventory${hint}`);
        continue;
      }
      dependents.get(d).push(w.id);
      if (moves(w.strategy) && moves(target.strategy)) out.push(d);
    }
    if (moves(w.strategy)) edges.set(w.id, out);
  }

  // The move groups and their layers.
  const moving = all.filter((w) => moves(w.strategy)).map((w) => w.id);
  const comps = components(moving, edges);
  const layers = layersOf(comps, edges);
  const groups = comps.map((c, i) => ({ ids: c, layer: layers[i], circular: isCycle(c, edges), cycle: isCycle(c, edges) ? cycleOf(c, edges) : null, first: byId.get(c[0]).order }));
  groups.sort((a, b) => a.layer - b.layer || a.first - b.first);

  // The waves: one per layer, cut at the largest wave size without cutting a group.
  const waves = [];
  let current = null;
  for (const g of groups) {
    const size = g.ids.length;
    const fits = current && current.layer === g.layer && (maxWaveSize === null || current.size + size <= maxWaveSize);
    if (!fits) {
      current = { layer: g.layer, size: 0, groups: [] };
      waves.push(current);
    }
    current.groups.push(g);
    current.size += size;
    if (maxWaveSize !== null && size > maxWaveSize) current = null;
  }
  const waveOf = new Map();
  let groupNumber = 0;
  const planWaves = waves.map((wave, i) => ({
    wave: i + 1,
    size: wave.size,
    groups: wave.groups.map((g) => {
      groupNumber += 1;
      for (const id of g.ids) waveOf.set(id, i + 1);
      return { group: groupNumber, size: g.ids.length, circular: g.circular, cycle: g.cycle, workloads: g.ids.map((id) => itemOf(byId.get(id))) };
    })
  }));

  // The findings of the circles and of the groups too big for a wave.
  for (const wave of planWaves) {
    for (const g of wave.groups) {
      const first = byId.get(g.workloads[0].id);
      if (g.circular) {
        const members = g.workloads.map((w) => w.id);
        const what = members.length === 1 ? `workload "${first.id}" depends on itself` : `workloads ${quoted(members)} depend on each other (${g.cycle.join(' -> ')})`;
        add('circular-dependency', first, 'dependencies', `${what}; ${members.length === 1 ? 'it is' : 'they are'} move group ${g.group} and ${members.length === 1 ? 'moves' : 'move together'} in wave ${wave.wave}`);
      }
      if (maxWaveSize !== null && g.size > maxWaveSize) {
        add('move-group-too-big', first, 'id', `move group ${g.group} holds ${plural(g.size, 'workload')} (${quoted(g.workloads.map((w) => w.id), 3)}), more than the largest wave size of ${maxWaveSize}; it is wave ${wave.wave} on its own`);
      }
    }
  }

  // The workloads that stay behind, and who still needs them.
  const notMoving = [];
  for (const w of all.filter((x) => !moves(x.strategy))) {
    const users = dependents.get(w.id).filter((id) => id !== w.id);
    notMoving.push({ ...itemOf(w), dependents: users });
    if (w.strategy === 'retire') {
      const live = users.filter((id) => byId.get(id).strategy !== 'retire');
      if (live.length) add('retired-dependency', w, 'path', `workload "${w.id}" is marked retire, but ${quoted(live)} still ${live.length === 1 ? 'depends' : 'depend'} on it`);
    } else {
      const movers = users.filter((id) => moves(byId.get(id).strategy));
      if (movers.length) add('retained-dependency', w, 'path', `workload "${w.id}" is marked retain and stays in the source environment, but ${listText(movers.map((id) => `"${id}" (wave ${waveOf.get(id)})`), 4)} ${movers.length === 1 ? 'moves and depends' : 'move and depend'} on it: a link between the two environments to plan`);
    }
  }

  const count = (s) => all.filter((w) => w.strategy === s).length;
  const plan = {
    workloads: all.length,
    records,
    moving: moving.length,
    retained: count('retain'),
    retired: count('retire'),
    byPath: Object.fromEntries([...PATH_NAMES.map((p) => [p, count(p)]), ['none', all.filter((w) => !pathForm(w.path)).length], ['unknown', all.filter((w) => w.strategy === null && pathForm(w.path)).length]]),
    aliases: all.filter((w) => w.alias).length,
    groups: groupNumber,
    circular: groups.filter((g) => g.circular).length,
    maxWaveSize,
    waves: planWaves,
    notMoving
  };
  return { plan, findings, unsuggested };
}
