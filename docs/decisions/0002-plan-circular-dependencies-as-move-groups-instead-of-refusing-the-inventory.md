# 2. Plan circular dependencies as move groups instead of refusing the inventory

## Status

Accepted

## Context

An order of waves where every workload moves after what it depends on exists only when the dependencies have no
circle. Real inventories often have one: two services that call each other, an application and the database that
pushes events back to it, a workload whose own id was typed into its dependencies. A planner can stop at the first
circle and give no plan, pick one edge of the circle and drop it, or treat the workloads of the circle as one unit.

Stopping gives the team nothing to work with until the inventory is perfect, and the circle may well be real. Dropping
an edge makes the tool decide which dependency does not matter, which it cannot know. The Cloud Adoption Framework says
that workloads that communicate belong in the same wave, and that when in doubt the components are grouped together.

## Decision

1. The workloads that move are the nodes of a graph with an edge from a workload to each moving workload it depends
   on. Its strongly connected components are the move groups: a group of one workload when it is in no circle, and a
   group of all the workloads of a circle when it is.
2. A move group moves in one wave and is never cut, also not by a largest wave size; a group larger than that size is
   a wave of its own and a `move-group-too-big` finding.
3. Every circle is a `circular-dependency` finding, a warning by default, at its first workload, with a shortest cycle
   through it written out (`a -> b -> a`), so the team can check each dependency of the circle.
4. A circle through a workload that does not move (retain or retire) is not a move group: that workload is not in the
   graph, and the dependency is reported by `retained-dependency` or `retired-dependency` instead.

## Consequences

- An inventory with circles still gives a full plan, and the circle is shown where it is planned.
- A move group can be large: a wrong dependency can pull many workloads into one wave. The finding names the group and
  its wave, and the `--max-wave-size` option makes a group too large for a wave visible.
- The order of the waves rests on the dependencies the inventory lists and on nothing else; docs/limits.md says what
  that cannot see.
