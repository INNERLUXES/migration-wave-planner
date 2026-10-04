# Inputs

## The inventory

```
migration-wave-planner <inventory>... [--config <file>] [options]
```

One or more files, up to 100, each a CSV inventory (a name ending in `.csv`) or a JSON inventory (a name ending in
`.json`), compared without regard to case. The files are read in the order they are named and planned together as one
inventory: a dependency may name a workload of another file. Each file may be named once. A folder is not walked; name
the files.

```
migration-wave-planner inventory.csv
migration-wave-planner servers.csv applications.json --max-wave-size 20
migration-wave-planner inventory.csv --config waves.json --format csv
```

### Fields

Every workload has these fields. Only `id` is required; a field that is missing is empty.

| Field | Column or key names (any case; spaces, hyphens and underscores ignored) | Value |
| --- | --- | --- |
| `id` | `id` | the id other workloads name in their dependencies, compared exactly, with its case |
| `name` | `name` | a name for people |
| `type` | `type` | free text, such as server, application or database |
| `owner` | `owner` | the person or team; empty is a `missing-owner` finding |
| `environment` | `environment`, `env` | free text, such as production or development |
| `path` | `path`, `migration path`, `strategy`, `migration strategy` | one of the 7 Rs or an alias (below) |
| `criticality` | `criticality` | free text, such as high, medium or low |
| `dependencies` | `dependencies`, `depends on` | the ids this workload calls or needs |

Every value is trimmed of white space at both ends. The dependencies are separated by semicolons, commas or white
space, and an id named twice counts once. A column or key that is none of these is left out and named in a note.

### CSV

A header line names the columns, in any order, and every later line is a workload. The file is read as RFC 4180
describes it, with LF, CRLF or a lone CR as line ends and a byte order mark skipped. A field that holds a comma, a
double quote or a line break is put in double quotes, with a double quote inside it written twice; in a CSV file a list
of dependencies is easiest written with semicolons (`db-01;dns`), or in double quotes with commas (`"db-01, dns"`).

```
id,name,type,owner,environment,migration path,criticality,depends on
dns-core,Internal DNS,server,network-team,production,rehost,high,
orders-db,Orders database,database,data-team,production,replatform,high,dns-core
orders-api,Orders API,application,commerce-team,production,refactor,high,orders-db;dns-core
```

A line with no text in any field is skipped. A line with a different number of fields than the header, or with no id,
is an `invalid-record` finding and is not planned. A file with no header, a header with no id column or with two
columns for one field, or a quote that breaks the format is an `unparsable-file` finding.

### JSON

A list of workload objects, or an object whose `workloads` key holds that list; other keys of that object are left out
and named in a note. The file is read strictly as RFC 8259 writes JSON: no comments, no trailing comma, and no name
given twice in one object.

```json
{
  "workloads": [
    { "id": "dns-core", "owner": "network-team", "migrationPath": "rehost", "dependencies": [] },
    { "id": "orders-db", "owner": "data-team", "migrationPath": "replatform", "dependencies": ["dns-core"] }
  ]
}
```

A value is a text; a whole number is read as its text, so `"id": 7` is the id `7`. `dependencies` is a list of texts
and whole numbers, or one text of ids. A value of another kind is an `invalid-record` finding and is taken as empty; a
record that is not an object, has no id, or names one field with two keys is an `invalid-record` finding and is not
planned.

### Migration paths

The path is compared with the letters A to Z lowered and every run of spaces, hyphens, underscores and commas made one
space. The seven names are `retire`, `retain`, `rehost`, `relocate`, `repurchase`, `replatform` and `refactor`. The
built-in aliases are the other names the AWS guide gives:

| Alias | Path |
| --- | --- |
| lift and shift | rehost |
| lift, tinker and shift | replatform |
| lift and reshape | replatform |
| drop and shop | repurchase |
| re-architect, rearchitect | refactor |

A workload with the path `retire` or `retain` does not move and is kept out of the waves. Any other workload moves,
also one with no path or an unknown path, which is a finding.

## Options

| Option | Value |
| --- | --- |
| `--config <file>` | the configuration file below; without it the defaults apply |
| `--format <name>` | `text` (the default), `json`, `csv` or `github` |
| `--json` | the same as `--format json` |
| `--max-wave-size <n>` | a whole number from 1 to 100,000: the largest number of workloads in one wave; it wins over `maxWaveSize` of the configuration |
| `--min-severity <level>` | `info`, `warning` or `error`: the lowest level of a finding that is shown; it wins over `minSeverity` of the configuration |
| `--fail-on <level>` | `info`, `warning` or `error`: the lowest level of a finding that fails the run; it wins over `failOn` of the configuration |
| `--explain` | each finding also shows its rule, the points of the public pages it rests on and the tool's own choice; with `--format csv` or `--format github` it is a usage error |
| `--print-defaults` | prints the built-in configuration as a configuration file and exits |
| `--help`, `--version` | the usage, the version |

A path that looks like a web address, an option given twice, `-` for standard input and an unknown option are usage
errors with exit code `2`.

## The configuration file

The configuration is one JSON object, read strictly as RFC 8259 writes JSON: no comments, no trailing comma, and no
name given twice in one object. Every key is optional. A key the tool does not know is an error with its line and, when
it is close to a known key, a suggestion; a run never goes on with a typo left in place.

```json
{
  "name": "Quillmoor estate",
  "rules": { "missingOwner": "error", "retainedDependency": "info" },
  "aliases": { "move as is": "rehost", "drop and shop": "off" },
  "maxWaveSize": 20,
  "minSeverity": "info",
  "failOn": "warning"
}
```

### `name`

A name for the configuration, 1 to 120 characters, shown in the report next to the file.

### `rules`

The level of each rule: `info`, `warning`, `error` or `off`. A rule set to `off` is not reported, and the report names
it in a note. The keys and their defaults:

| Key | Rule | Default |
| --- | --- | --- |
| `rules.circularDependency` | `circular-dependency` | warning |
| `rules.unknownDependency` | `unknown-dependency` | error |
| `rules.duplicateId` | `duplicate-id` | error |
| `rules.missingOwner` | `missing-owner` | warning |
| `rules.missingPath` | `missing-path` | error |
| `rules.unknownPath` | `unknown-path` | error |
| `rules.retiredDependency` | `retired-dependency` | error |
| `rules.retainedDependency` | `retained-dependency` | warning |
| `rules.moveGroupTooBig` | `move-group-too-big` | warning |

`invalid-record`, `unreadable-file` and `unparsable-file` are always errors and have no key.

### `aliases`

An object of other names for the migration paths. Each name is compared in the form of a path (above); its value is one
of the seven paths, which adds the name or changes what it means, or `off`, which takes a built-in alias away. A name
that is one of the seven paths, a name given twice once compared, and `off` for a name that is not a built-in alias are
errors. At most 500 names of up to 100 characters.

### `maxWaveSize`

The largest number of workloads in one wave, a whole number from 1 to 100,000, or `null` for no limit (the default).
Each layer of move groups is cut into waves of at most this many workloads, in order; a move group is never cut, and
one larger than the size is a wave of its own and a `move-group-too-big` finding.

### `minSeverity`

The lowest level of a finding that is shown: `info` (the default), `warning` or `error`. The findings below it are
counted in a note and do not fail the run.

### `failOn`

The lowest level of a finding that fails the run: `info`, `warning` or `error` (the default).

`--print-defaults` writes the whole default configuration; read back, it gives the defaults.
