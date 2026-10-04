# migration-wave-planner

Cloud migration wave planning from an inventory. Give it the list of workloads you plan to move (servers,
applications, databases) as CSV or JSON, with their owner, environment, migration path and dependencies, and it builds
the dependency graph, groups the workloads that depend on each other in a circle into move groups that must move
together, and orders the groups into waves so that every workload moves after what it depends on. Retained and retired
workloads stay out of the waves and are listed with the workloads that still need them. It reports what makes the plan
wrong: circular dependencies, dependencies on ids that are not in the inventory, duplicate ids, workloads with no owner,
a missing or unknown migration path, a workload marked retire that others still depend on, and a workload marked retain
that a moving workload needs. The run exits with a code a pipeline can act on.

A migration inventory is usually a sheet that many people edit. It decides the order in which systems move, and its
mistakes do not show until a cutover fails: an id typed wrong, so a database moves after the application that needs it;
two services that call each other split across two waves; a fax gateway switched off while billing still sends to it.
The AWS Prescriptive Guidance names the seven migration strategies, the 7 Rs
(https://docs.aws.amazon.com/prescriptive-guidance/latest/large-migration-guide/migration-strategies.html), and the
Microsoft Cloud Adoption Framework (https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/migrate/) says to
group dependent workloads into the same wave and to plan the links to what stays behind. This tool reads the inventory
on every change and does both, the same way for AWS, Azure, Google Cloud or any other target.

- **Waves.** Move groups from the strongly connected components of the dependency graph, ordered into waves with
  dependencies first, each as early as it can move; `--max-wave-size` cuts the waves without ever cutting a group.
- **The 7 Rs.** Retire, retain, rehost, relocate, repurchase, replatform and refactor, with the other names the AWS
  guide gives (lift and shift, lift and reshape, drop and shop, re-architect) and your own in the configuration.
- **Problems.** Every finding has its file, line and column, what was found and what to change; `--explain` adds the
  points of the public pages it rests on.
- **Honest about input.** A file or a record it cannot read is an error finding with its line, never passed over, and a
  near id is suggested, never used. [docs/limits.md](docs/limits.md) says what an inventory cannot show.
- Reports as text, JSON, a CSV wave plan and GitHub workflow annotations, with an exit code for a pipeline: `0` no
  finding at or above the `--fail-on` level, `1` a finding at or above it, `2` usage or input error.
- Plain JavaScript, no dependencies and no network; the same inventory always gives the same plan.

```
npm test
```

```
tests 125
pass 122
fail 0
skipped 3
```

These are the summary lines that `npm test` prints at the end on Windows. The skipped tests are the ones that need a
symbolic link, a device or file permissions (a file, a folder and a configuration named through a symbolic link,
`/dev/zero` named as an input, and a file with no read access); they are guarded with `process.platform`, run on Linux
and macOS, and none of them asserts a line. `npm run test:coverage` runs the same tests with coverage; their time limits
are four times wider when coverage is on.

## Quick start

Requires Node 22 or newer. There is nothing to install.

```
git clone https://github.com/INNERLUXES/migration-wave-planner.git
cd migration-wave-planner
node bin/migration-wave-planner.js examples/messy/inventory.csv --config examples/config.json
```

Or without a clone, on your own inventory:

```
npx --yes github:INNERLUXES/migration-wave-planner inventory.csv
```

`examples/` holds two made-up inventories: `examples/messy/inventory.csv`, an online shop with one problem of every kind
(two services that depend on each other and a test runner that depends on itself, a typo in an id, a billing service
that still needs a retired fax gateway and retained mainframe jobs, a missing owner, a misspelled path and a missing
one, an id listed twice and a row that is too short), and `examples/clean/inventory.json`, a clinic whose inventory is
ready to plan. The messy inventory also holds what must not be reported: a retired intranet that depends on the retired
fax gateway, a path written in the team's own words that `examples/config.json` adds as an alias, and a quoted name that
holds a comma. `examples/config.json` adds that alias, sets waves of at most three workloads and fails the run on
warnings.

## Usage

```
migration-wave-planner <inventory>... [--config <file>] [options]
```

```
--config <file>           settings in strict JSON: rules, aliases, maxWaveSize, minSeverity and failOn
                          (--print-defaults shows them)
--format <name>           text, json, csv or github (default: text); csv writes the wave plan, github writes
                          workflow commands that GitHub shows as annotations
--json                    the same as --format json
--max-wave-size <n>       the largest number of workloads in one wave, 1 to 100,000 (default: maxWaveSize of the
                          configuration, else no limit); a move group is never split
--min-severity <level>    the lowest level of a finding that is shown: info, warning, error (default: minSeverity of
                          the configuration, else info)
--fail-on <level>         the lowest level of a finding that fails the run: info, warning, error (default: failOn of
                          the configuration, else error)
--explain                 show the rule, the public sources and the tool's own choice behind each finding
--print-defaults          print the built-in configuration and exit
--help                    show the usage
--version                 show the version
```

The files are read in the order named and planned as one inventory, so a dependency may name a workload of another
file. The path in the report is relative to the folder you run the command in, with forward slashes on every system,
followed by the line.

The report of the messy example starts with what was read, the configuration, the rules, the plan in one line, the
count of each path and the count of findings; then the waves, each as a table, with every circle written out; then the
workloads that do not move, with the workloads that still need them; then the findings, errors first, each with what to
change:

```
migration-wave-planner: examples/messy/inventory.csv
input: examples/messy/inventory.csv (1 file: 1 CSV inventory; 17 records)
config: examples/config.json (Quillmoor estate): 7 aliases; largest wave 3; minimum severity info; fail on warning
rules: circular-dependency (warning); unknown-dependency (error); duplicate-id (error); missing-owner (warning); missing-path (error); unknown-path (error); retired-dependency (error); retained-dependency (warning); move-group-too-big (warning); invalid-record (error); unreadable-file (error); unparsable-file (error)
plan: 15 workloads: 12 move in 6 waves (11 move groups, 2 circular), 1 retained, 2 retired
paths: retire 2, retain 1, rehost 4, relocate 1, repurchase 1, replatform 3, refactor 1, none 1, unknown 1
findings: 10 (6 error, 4 warning)

Waves (6)

  Wave 1: 3 workloads in 3 move groups

    group  id           name               type         environment  path                 owner          criticality  depends on
    1      dns-core     Internal DNS       server       production   rehost (move as is)  network-team   high         -
    2      billing      Billing            application  production   replatform           finance-team   high         ledger-db2, fax-gateway and mainframe-batch
    3      dev-sandbox  Developer sandbox  server       development  none                 platform-team  low          -

  Wave 2: 1 workload in 1 move group

    group  id           name         type    environment  path        owner          criticality  depends on
    4      test-runner  Test runner  server  development  repurchase  platform-team  low          test-runner

    move group 4 moves together, a circle: test-runner -> test-runner

  Wave 3: 3 workloads in 3 move groups

    group  id           name             type         environment  path                     owner          criticality  depends on
    5      auth-svc     Sign-in service  application  production   replatform               identity-team  high         dns-core
    6      orders-db    Orders database  database     production   replatform               data-team      high         dns-core
    7      rates-cache  Rates cache      server       production   rehost (Lift and Shift)  -              medium       dns-core

  Wave 4: 1 workload in 1 move group

    group  id         name             type      environment  path      owner         criticality  depends on
    8      ledger-db  Ledger database  database  production   relocate  finance-team  high         dns-core

  Wave 5: 3 workloads in 2 move groups

    group  id             name                type         environment  path                 owner          criticality  depends on
    9      orders-api     Orders API, public  application  production   refactor             commerce-team  high         orders-db, pricing-svc and auth-svc
    9      pricing-svc    Pricing service     application  production   rehost               commerce-team  medium       orders-api and rates-cache
    10     report-portal  Reports portal      application  production   "rehoist" (unknown)  data-team      low          orders-db

    move group 9 moves together, a circle: orders-api -> pricing-svc -> orders-api

  Wave 6: 1 workload in 1 move group

    group  id        name      type         environment  path    owner     criticality  depends on
    11     web-shop  Web shop  application  production   rehost  web-team  high         orders-api and auth-svc

Not moving (3)

  id               name                  type         environment  path    owner         needed by
  fax-gateway      Fax gateway           server       production   retire  ops-team      billing and old-intranet
  mainframe-batch  Mainframe batch jobs  server       production   retain  finance-team  billing
  old-intranet     Old intranet          application  production   retire  web-team      -

Findings (10)

  ERROR    unknown-dependency   examples/messy/inventory.csv:9
           workload "billing" depends on "ledger-db2", which is not an id of the inventory; did you mean "ledger-db"?
           fix: correct the id, or add the workload it names to the inventory with its migration path

  ERROR    retired-dependency   examples/messy/inventory.csv:11
           workload "fax-gateway" is marked retire, but "billing" still depends on it
           fix: move the dependents off the workload first, or change its path to one that keeps it running

  ERROR    unknown-path         examples/messy/inventory.csv:13
           workload "report-portal" has the migration path "rehoist", which is not one of the 7 Rs or a known alias; it is planned as a workload that moves
           fix: write one of the 7 Rs, or add the word your team uses to aliases in the configuration

  ERROR    missing-path         examples/messy/inventory.csv:14
           workload "dev-sandbox" has no migration path; it is planned as a workload that moves
           fix: choose one of the 7 Rs for the workload: retire, retain, rehost, relocate, repurchase, replatform or refactor

  ERROR    duplicate-id         examples/messy/inventory.csv:16
           the id "auth-svc" is used again; the first record with it is at examples/messy/inventory.csv:3, and this record is left out of the plan
           fix: give each workload its own id, or merge the two records into one

  ERROR    invalid-record       examples/messy/inventory.csv:18
           this row has 4 fields and the header has 9; the row is not read
           fix: correct the record at the line named

  WARNING  circular-dependency  examples/messy/inventory.csv:5
           workloads "orders-api" and "pricing-svc" depend on each other (orders-api -> pricing-svc -> orders-api); they are move group 9 and move together in wave 5
           fix: check each dependency of the circle; remove the one that is not real, or plan the group as one move with one cutover

  WARNING  missing-owner        examples/messy/inventory.csv:7
           workload "rates-cache" (Rates cache) has no owner
           fix: name the person or team who decides on the move and signs off the cutover

  WARNING  retained-dependency  examples/messy/inventory.csv:12
           workload "mainframe-batch" is marked retain and stays in the source environment, but "billing" (wave 1) moves and depends on it: a link between the two environments to plan
           fix: plan the connection between the cloud and the source environment (network, latency, security), or move the retained workload too

  WARNING  circular-dependency  examples/messy/inventory.csv:15
           workload "test-runner" depends on itself; it is move group 4 and moves in wave 2
           fix: check each dependency of the circle; remove the one that is not real, or plan the group as one move with one cutover

note: examples/messy/inventory.csv: 1 column the tool does not read was left out: "notes"
note: 2 migration paths were written as another name of a strategy and read as that strategy

This plan is built from the inventory as it is written. It does not discover dependencies, read network traffic, size machines or check a target service, so a dependency the inventory does not list is not seen and the waves are only as right as the dependencies in the file (docs/limits.md).

RESULT: FAIL - 10 findings at or above warning (6 error, 4 warning)
```

With `--explain`, each finding also shows the rule, the points of the public pages it rests on and the tool's own
choice:

```
  WARNING  retained-dependency  examples/messy/inventory.csv:12
           workload "mainframe-batch" is marked retain and stays in the source environment, but "billing" (wave 1) moves and depends on it: a link between the two environments to plan
           fix: plan the connection between the cloud and the source environment (network, latency, security), or move the retained workload too
           rule: a workload with the path retain that a workload that moves depends on
           basis: retain keeps an application in the source environment, for example because it is not ready to move or because other applications must move first (About the migration strategies (AWS Prescriptive Guidance, Guide for AWS large migrations), https://docs.aws.amazon.com/prescriptive-guidance/latest/large-migration-guide/migration-strategies.html)
           basis: components that must stay in the source environment need their connections and data flows written down, and the time a workload runs across both environments should be kept short (Plan your migration (Microsoft Cloud Adoption Framework, Migrate), https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/migrate/plan-migration)
           the tool's own choice: one finding per retained workload, listing the moving workloads that depend on it with their waves; a warning, because a link between the two environments can be planned: it names a connection to design, not a mistake
```

The clean example passes:

```
migration-wave-planner: examples/clean/inventory.json
input: examples/clean/inventory.json (1 file: 1 JSON inventory; 8 records)
config: built-in defaults: 6 aliases; largest wave no limit; minimum severity info; fail on error
rules: circular-dependency (warning); unknown-dependency (error); duplicate-id (error); missing-owner (warning); missing-path (error); unknown-path (error); retired-dependency (error); retained-dependency (warning); move-group-too-big (warning); invalid-record (error); unreadable-file (error); unparsable-file (error)
plan: 8 workloads: 6 move in 4 waves (6 move groups, 0 circular), 1 retained, 1 retired
paths: retire 1, retain 1, rehost 2, relocate 1, repurchase 1, replatform 2
findings: 0

Waves (4)

  Wave 1: 1 workload in 1 move group

    group  id       name               type    environment  path    owner       criticality  depends on
    1      dir-svc  Directory service  server  production   rehost  infra-team  high         -

  Wave 2: 2 workloads in 2 move groups

    group  id           name                      type      environment  path        owner         criticality  depends on
    2      files-share  File share                server    production   replatform  infra-team    medium       dir-svc
    3      records-db   Patient records database  database  production   replatform  records-team  high         dir-svc

  Wave 3: 1 workload in 1 move group

    group  id           name             type         environment  path    owner         criticality  depends on
    4      records-app  Patient records  application  production   rehost  records-team  high         records-db and dir-svc

  Wave 4: 2 workloads in 2 move groups

    group  id           name                 type         environment  path        owner            criticality  depends on
    5      booking      Appointment booking  application  production   repurchase  front-desk-team  medium       records-app
    6      lab-gateway  Lab results gateway  server       production   relocate    lab-team         high         records-app

Not moving (2)

  id               name             type    environment  path    owner       needed by
  imaging-archive  Imaging archive  server  production   retain  lab-team    -
  old-fax          Fax server       server  production   retire  infra-team  -

Findings (0)

  none

note: examples/clean/inventory.json: 1 key the tool does not read was left out: "estate"

This plan is built from the inventory as it is written. It does not discover dependencies, read network traffic, size machines or check a target service, so a dependency the inventory does not list is not seen and the waves are only as right as the dependencies in the file (docs/limits.md).

RESULT: PASS - no finding at or above error
```

## How the waves are built

1. The first record with an id is planned; a later record with the same id is reported and left out.
2. A workload with the path retire or retain does not move. Every other workload moves, also one with no path or an
   unknown path, which is reported.
3. The moving workloads are the nodes of a graph, with an edge to every moving workload each one depends on. A
   dependency on an unknown id is reported and is not an edge.
4. The strongly connected components of the graph are the move groups: a workload in no circle is a group of one, and
   the workloads of a circle, or a workload that depends on itself, are one group that moves in one wave.
5. A group that depends on no other group is in layer 1; any other group is in the layer after the highest layer of the
   groups it depends on. Each layer is a wave, so every workload moves after what it depends on, as early as it can.
6. With `--max-wave-size`, each layer is cut into waves of at most that many workloads, in the order of the inventory.
   A wave never mixes two layers, and a group is never cut; one larger than the size is a wave of its own and a
   `move-group-too-big` finding.

[docs/method.md](docs/method.md) gives the details, and
[decision 2](docs/decisions/0002-plan-circular-dependencies-as-move-groups-instead-of-refusing-the-inventory.md) says
why a circle becomes a move group instead of stopping the plan.

## What it reports

| Rule | Key | Default level | Finds |
| --- | --- | --- | --- |
| `circular-dependency` | `rules.circularDependency` | warning | moving workloads that depend on each other in a circle, or one that depends on itself; shown as the move group, with a shortest cycle |
| `unknown-dependency` | `rules.unknownDependency` | error | a dependency on an id that is not in the inventory, with a near id suggested |
| `duplicate-id` | `rules.duplicateId` | error | a record whose id an earlier record already has |
| `missing-owner` | `rules.missingOwner` | warning | a workload with no owner |
| `missing-path` | `rules.missingPath` | error | a workload with no migration path |
| `unknown-path` | `rules.unknownPath` | error | a migration path that is not one of the 7 Rs or an alias |
| `retired-dependency` | `rules.retiredDependency` | error | a workload marked retire that a workload with another path still depends on |
| `retained-dependency` | `rules.retainedDependency` | warning | a workload marked retain that a moving workload depends on: a link between the two environments to plan |
| `move-group-too-big` | `rules.moveGroupTooBig` | warning | with a largest wave size, a move group larger than a wave |
| `invalid-record` | none | error | a record with no id, the wrong number of fields or a value of the wrong kind |
| `unreadable-file` | none | error | a file that cannot be read as UTF-8 text |
| `unparsable-file` | none | error | a file the CSV or JSON reader refuses, or that is not an inventory |

The three rules of input problems are always errors. [docs/method.md](docs/method.md) says exactly what each rule looks
at and what it cannot see, and [docs/rules-and-sources.md](docs/rules-and-sources.md) gives the points of the public
pages each rule rests on.

## The 7 Rs

The seven migration paths of the AWS Prescriptive Guidance page on migration strategies, in its order. The path is
compared with the letters A to Z lowered and runs of spaces, hyphens, underscores and commas made one space.

| Path | Moves | Built-in aliases | What it means |
| --- | --- | --- | --- |
| `retire` | no | | the application is decommissioned or archived |
| `retain` | no | | the application stays in the source environment for now |
| `rehost` | yes | lift and shift | moved without changes |
| `relocate` | yes | | moved to a cloud version of the same platform, or to another network, Region or account |
| `repurchase` | yes | drop and shop | replaced by another version or product, often one sold as a service |
| `replatform` | yes | lift, tinker and shift; lift and reshape | moved with some changes, such as a managed database |
| `refactor` | yes | re-architect, rearchitect | rebuilt to use cloud-native features |

The `aliases` key of the configuration adds your team's own words, or takes a built-in alias away.

## What is not checked

The tool plans what the inventory says and never guesses. It does not:

- discover workloads or dependencies from network traffic, a discovery tool or a configuration management database:
  a dependency the inventory does not list is not seen;
- tell direct, indirect and business dependencies apart: every dependency must move first;
- size machines, estimate the time or cost of a wave, or use the criticality and environment to order the waves;
- check that a path is the right strategy for a workload, or that an owner exists;
- match ids that differ in case or by a typo, or merge two records with one id;
- read a spreadsheet file (`.xlsx`, `.ods`): export it as UTF-8 CSV.

So a clean run means the inventory holds none of the problems the rules look for, and every report says so.

## The inventory

```
id,name,type,owner,environment,migration path,criticality,depends on
dns-core,Internal DNS,server,network-team,production,rehost,high,
orders-db,Orders database,database,data-team,production,replatform,high,dns-core
orders-api,Orders API,application,commerce-team,production,refactor,high,orders-db;dns-core
```

A CSV file has a header line; a JSON file is a list of records, or an object with a `workloads` list. Only `id` is
required. Columns and keys are matched by name in any case and order, with spaces, hyphens and underscores ignored, so
`migration path`, `migration_path`, `migrationPath` and `strategy` all name the path, and `depends on` or
`dependencies` the dependencies, which are separated by semicolons, commas or white space. Columns the tool does not
read are named in a note. [docs/inputs.md](docs/inputs.md) describes every field.

## The configuration file

```json
{
  "name": "Quillmoor estate",
  "aliases": { "move as is": "rehost" },
  "maxWaveSize": 3,
  "failOn": "warning"
}
```

Every key is optional, and without `--config` the defaults apply. `rules` sets the level of each rule (`info`,
`warning`, `error` or `off`), `aliases` adds other names for the paths or takes one away with `off`, `maxWaveSize` sets
the largest wave, `minSeverity` the lowest level shown and `failOn` the lowest level that fails the run. A key the tool
does not know is an error with its line and a suggestion, and a key named twice is refused.
[docs/inputs.md](docs/inputs.md) describes every key, and `--print-defaults` writes the whole default configuration
out.

## Formats

- `text`: for a terminal: what was read, the configuration, the rules, the plan, the waves as tables, the workloads
  that do not move, the findings with the file and line and what to change, the notes, the notice and the result. With
  `--explain` also the rule, the points of the public pages and the tool's own choice behind each finding.
- `json` (or `--json`): the whole report: the input, the configuration, the plan with every wave, move group and
  workload, the workloads that do not move with the ones that need them, every finding with its file, line and column,
  the totals, the result, the notes and the notice.
- `csv`: the wave plan, one record per workload, ready for a sheet: the wave, the move group, the fields of the
  workload with its path as a strategy, and `move`, `retain` or `retire`, with CRLF line ends as RFC 4180 writes. A
  field that a spreadsheet could read as a formula gets a single quote in front. The start of the messy example:

```
wave,group,id,name,type,environment,owner,path,criticality,dependencies,status,file,line
1,1,dns-core,Internal DNS,server,production,network-team,rehost,high,,move,examples/messy/inventory.csv,2
1,2,billing,Billing,application,production,finance-team,replatform,high,ledger-db2 fax-gateway mainframe-batch,move,examples/messy/inventory.csv,9
1,3,dev-sandbox,Developer sandbox,server,development,platform-team,,low,,move,examples/messy/inventory.csv,14
2,4,test-runner,Test runner,server,development,platform-team,repurchase,low,test-runner,move,examples/messy/inventory.csv,15
3,5,auth-svc,Sign-in service,application,production,identity-team,replatform,high,dns-core,move,examples/messy/inventory.csv,3
```

- `github`: one workflow command per finding, `::error`, `::warning` or `::notice` (for info) with the file, line and
  column, which GitHub shows as an annotation in the pull request, then a summary line. The characters a command gives
  a meaning to are escaped. Two findings of the messy example:

```
::error file=examples/messy/inventory.csv,line=11,col=52,title=migration-wave-planner retired-dependency::workload "fax-gateway" is marked retire, but "billing" still depends on it; fix: move the dependents off the workload first, or change its path to one that keeps it running
::warning file=examples/messy/inventory.csv,line=5,col=84,title=migration-wave-planner circular-dependency::workloads "orders-api" and "pricing-svc" depend on each other (orders-api -> pricing-svc -> orders-api); they are move group 9 and move together in wave 5; fix: check each dependency of the circle; remove the one that is not real, or plan the group as one move with one cutover
```

## Exit codes

`0`: no finding at or above the fail-on level (`error` by default). `1`: at least one finding at or above it; with the
default, an unknown dependency, a duplicate id, a missing or unknown path, a retired workload that is still needed, or
a file or record the tool could not read; with `--fail-on warning`, circles, missing owners, retained workloads that
moving ones need and move groups larger than a wave too. `2`: a usage or input error: no file, an unknown option, an
option given twice, `--explain` with the csv or github format, a wave size that is not a whole number from 1 to
100,000, a URL in place of a path, a path that cannot be read, a symbolic link or a folder named on the command line, a
file whose name does not end in `.csv` or `.json`, input past the limit of a run, or a configuration with an unknown
key, a key named twice or a value of the wrong kind. With exit code `2` the tool gives no result and prints the problems
on standard error.

## Limits

The tool reads files; it does not discover the estate, size it, or schedule the waves in time. A run reports what the
inventory holds in the forms of docs/method.md. [docs/limits.md](docs/limits.md) lists what it cannot see, with the
size limits: 32 MB for a file, 256 MB for a run, 200,000 workloads in a file, 500 findings listed per rule.
[docs/threat-model.md](docs/threat-model.md) lists the risks of reading an inventory from a pull request and their
controls, and [docs/secure-defaults.md](docs/secure-defaults.md) the defaults and how to run the tool in a pipeline.

## Architecture

Plain ES modules in `src/`, with no dependencies.

| File | Job |
| --- | --- |
| `src/cli.js` | the command line, the usage and the exit codes |
| `src/check.js` | reads the configuration and the inventories, and builds the report of the run |
| `src/files.js`, `src/kinds.js` | the bounded reading of files with no link followed, and the kind of each file |
| `src/csv.js`, `src/json.js` | the CSV reader and the CSV wave plan, and the strict JSON reader |
| `src/inventory.js` | the fields of a workload from a CSV header or JSON keys, and the records that cannot be read |
| `src/graph.js` | the strongly connected components, a shortest cycle and the layers, without recursion |
| `src/plan.js` | the paths, the move groups, the waves, the workloads that stay, and the findings of the plan |
| `src/config.js`, `src/defaults.js` | the configuration file over the defaults |
| `src/rules.js` | the rules, their levels and the result |
| `src/report.js`, `src/text.js`, `src/size.js`, `src/words.js` | the text, JSON and GitHub output, the cleaning of text from the input, number formats and compared words |
| `src/data.js` | the public pages and the points the rules rest on, in this project's own words |
| `tools/check.mjs`, `tools/example.mjs` | the repository checks, and the examples with their real output |

## Where the facts come from

| Fact | Source |
| --- | --- |
| The seven migration strategies, their meaning and their other names | AWS Prescriptive Guidance, https://docs.aws.amazon.com/prescriptive-guidance/latest/large-migration-guide/migration-strategies.html |
| The migration sequence, dependencies that move together, workloads that stay in the source environment, and the owner of each workload | Microsoft Cloud Adoption Framework, https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/migrate/plan-migration |
| Waves of workloads that move together, grouping dependent workloads, and a unique id for each group | Microsoft Cloud Adoption Framework, https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/migrate/migration-wave-planning |
| Keeping the source environment as a fallback after the cutover | Microsoft Cloud Adoption Framework, https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/migrate/execute-migration |
| The CSV format | RFC 4180, https://www.rfc-editor.org/rfc/rfc4180 |
| Repeated names in a JSON object, and UTF-8 | RFC 8259, https://www.rfc-editor.org/rfc/rfc8259 |
| Formulas hidden in CSV files | OWASP, https://community.owasp.org/attacks/CSV_Injection |
| Annotations from workflow commands | GitHub Docs, https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands |

[research/sources.md](research/sources.md) has a note on each page, in this project's own words.

## Background

A cloud migration is planned in waves because nobody moves a whole estate in one night, and the order of the waves is
only as good as the inventory behind it. The mistakes that break a cutover are small and written down long before it:
a dependency typed with the wrong id, two services that call each other planned a month apart, a server marked for
retirement that a billing job still calls. A check that turns the inventory into waves on every change, and says what
is wrong with it, finds them while they are still one line in a file. How cloud migrations are assessed, planned and
run is described on the page [Cloud Migration Services](https://innerluxes.dev/cloud/migration).

## License

MIT
