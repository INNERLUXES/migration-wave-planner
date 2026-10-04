# Method

This document says exactly what the tool reads, how it builds the waves, what each rule looks at and cannot see, and
how the report is built. The names used here are the defaults; docs/inputs.md says how the configuration changes them.

## What is read

The input is one or more inventory files and, if given, a configuration file. Each file named on the command line is
read once, in the order named; a folder is not walked. A name ending in `.csv` is read as CSV and a name ending in
`.json` as JSON. Each file is read as UTF-8, with or without a byte order mark, with LF, CR LF or CR line ends.

A CSV file starts with a header line. Its columns are matched to the fields by name, in any order, with the letters A
to Z lowered and spaces, hyphens and underscores taken out, so `Migration Path`, `migration_path` and `migrationPath`
are the same column. A JSON file is a list of records, or an object with a `workloads` list; the keys of a record are
matched the same way. Columns and keys the tool does not read are named in a note. Every value is trimmed of white
space at both ends; the dependencies are split at semicolons, commas and white space. docs/inputs.md lists the fields.

All the files of a run make one inventory, in the order of the files and of the records in each.

## How the plan is built

1. **The records.** The first record with an id is planned; every later record with the same id is a `duplicate-id`
   finding and is left out. Ids are compared exactly, with their case.
2. **The paths.** The path of each workload is compared with the seven names and the aliases (docs/inputs.md). A
   workload with the path `retire` or `retain` does not move. Every other workload moves, also one with no path or an
   unknown path, so that the order of its dependencies still holds.
3. **The graph.** The workloads that move are the nodes of a graph. Each has an edge to every workload that moves and
   that it lists as a dependency. A dependency on an id that is not in the inventory is an `unknown-dependency`
   finding and is not an edge; a dependency on a retained or retired workload is not an edge either, and is looked at
   by `retained-dependency` and `retired-dependency`.
4. **The move groups.** The strongly connected components of the graph (found with Tarjan's method, without
   recursion) are the move groups. A workload in no circle is a move group of one. The workloads of a circle, or a
   workload that depends on itself, make one move group, which is a `circular-dependency` finding.
5. **The layers.** A move group that depends on no other group is in layer 1; any other group is in the layer after the
   highest layer of the groups it depends on. So every workload is in a later layer than everything it depends on,
   and the layers are as few as the dependencies allow: each group moves as early as it can.
6. **The waves.** With no largest wave size, each layer is one wave. With a largest wave size (`--max-wave-size` or
   `maxWaveSize`), the move groups of each layer are put into waves of at most that many workloads, in order: a group
   that does not fit in the current wave starts the next one. A wave never holds groups of two layers, so the order
   still holds. A move group is never cut; one larger than the size is a wave of its own and a `move-group-too-big`
   finding.
7. **The order inside a wave.** The groups of a wave, and the workloads of a group, are in the order of the inventory,
   and the groups are numbered from 1 across all the waves.
8. **The workloads that stay.** The retained and retired workloads are listed after the waves, in the order of the
   inventory, each with the workloads that depend on it.

The same inventory and configuration always give the same plan: no clock, no random number, no locale, and no order
taken from a hash.

## Rules

Each finding has a rule, a level, the file, the line and column of the field it is about (or of the record when the
file has no such field), what was found and what to change. `--explain` adds the rule, the points of the public pages
it rests on, and the tool's own choice. docs/rules-and-sources.md lists the points.

### `circular-dependency`

Moving workloads whose dependencies lead back to themselves: a strongly connected component of more than one
workload, or one workload that lists its own id. One finding per move group, at the dependencies of its first
workload, with a shortest cycle through that workload (`orders-api -> pricing-svc -> orders-api`), the group and its
wave. A warning by default, because the plan can still be made; but a circle pulls every workload in it into one wave,
and it is often a dependency written the wrong way round. A circle that runs through a retained or retired workload is
not a move group (that workload is not in the graph).

### `unknown-dependency`

An id in the dependencies of a workload that no record of the inventory has, after the ids are trimmed. One finding per
workload and unknown id, at the dependencies field. For an unknown id of four characters or more, the closest id of the
inventory is suggested when it differs by a third of its length or less (`ledger-db2` gives `ledger-db`); suggestions
are made while the inventory holds at most 5,000 ids, for the first 100 unknown ids, and the rest are counted in a
note. The suggestion is never used: the dependency is left out of the plan, so the order it would give is lost.

### `duplicate-id`

A record whose id an earlier record already has, in the order of the files and of the records in each. One finding per
later record, at its id, naming the place of the first. The first record is planned and the later one is left out.

### `missing-owner`

A workload whose owner is empty, or an inventory with no owner column or key. Any text is an owner; the tool cannot
tell whether the person or team exists. Reported for every workload, the retained and retired ones included.

### `missing-path`

A workload whose path is empty, or an inventory with no path column or key. The workload is planned as one that moves
and shown with the path `none`.

### `unknown-path`

A path that is none of the seven names and none of the aliases once compared (docs/inputs.md). The workload is planned
as one that moves and shown with its path as written and `(unknown)`.

### `retired-dependency`

A workload with the path `retire` that a workload with another path lists as a dependency. One finding per retired
workload, at its path, listing every such workload; a retired workload that only other retired workloads depend on is
not reported, and neither is one that lists itself.

### `retained-dependency`

A workload with the path `retain` that a moving workload lists as a dependency. One finding per retained workload, at
its path, listing the moving workloads with their waves. A warning by default: the link between the cloud and the
source environment can be planned, but it has to be (network path, latency, security, and how long both sides run).
Retained and retired dependents are not counted.

### `move-group-too-big`

With a largest wave size only: a move group with more workloads than the size. One finding per group, at the id of its
first workload. The group is a wave of its own.

### `invalid-record`

A record of the inventory that cannot be read as a workload: a CSV row with a different number of fields than the
header, a row or record with no id, a JSON record that is not an object or that names one field with two keys. The
record is not planned. A JSON value of the wrong kind (an object, a list, a boolean, a number that is not whole) is also
reported and is taken as empty. Always an error.

### `unreadable-file`

A file that cannot be read as UTF-8 text: over its size limit, holding a null byte, UTF-16, not valid UTF-8, or not
there to open when it is read. Nothing in it is planned. Always an error.

### `unparsable-file`

A file that the readers refuse: a CSV file that is empty, has a quoted field that is not closed, a character after a
closing quote or a double quote inside an unquoted field, a header with no id column or two columns for one field; a
JSON file that does not parse, repeats a name in an object, or is not a list of workloads or an object with a
`workloads` list. Nothing in it is planned. Always an error, with the line and column.

## Input problems

A path named on the command line that is missing, a symbolic link, a folder, a device or a pipe, a file whose name does
not end in `.csv` or `.json`, a file named twice, a configuration with a problem, and input past the limit of a run
(256 MB) stop the run with exit code `2` and no result. The problems are listed on standard error, the first twenty and
then a count.

## The report

The text report shows what was read, the configuration, the rules with their levels, the plan in one line (workloads,
waves, move groups, retained and retired), the count of each path, and the count of findings; then the waves, each as a
table with the group, id, name, type, environment, path, owner, criticality and dependencies of every workload and a
line for each circle; then the workloads that do not move with the workloads that need them; then the findings, errors
first, then by file, line, column and rule; then the notes, the notice and the result. The JSON report holds the same
data. The CSV report is the wave plan, one record per workload. The GitHub report is one workflow command per finding.

The result counts every finding at or above the minimum severity, also the ones past the limit of 500 listed per rule.
