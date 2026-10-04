# Rules and sources

Every rule rests on points of public pages, written in this project's own words; this document lists them, with the
choices that are the tool's own and what to change. The same points are in src/data.js and are shown by `--explain`;
research/sources.md has a longer note on each page.

## The 7 Rs

The seven migration paths come from the AWS Prescriptive Guidance page on migration strategies, in its order. A workload
with the path retire or retain does not move and is kept out of the waves.

| Path | Moves | What the page says |
| --- | --- | --- |
| `retire` | no | retire is the strategy for an application that is decommissioned or archived, so the servers of its stack can be shut down |
| `retain` | no | retain keeps an application in the source environment, for example because it is not ready to move or because other applications must move first |
| `rehost` | yes | rehost, also called lift and shift, moves an application to the cloud without changing it |
| `relocate` | yes | relocate moves many servers at once to a cloud version of the same platform, or moves resources to another network, Region or account, without changing the architecture |
| `repurchase` | yes | repurchase, also called drop and shop, replaces an application with another version or product, often one sold as a service |
| `replatform` | yes | replatform, also called lift, tinker and shift or lift and reshape, moves an application and makes some changes on the way, such as a managed database |
| `refactor` | yes | refactor or re-architect changes the architecture of an application to use cloud-native features; it is the most complex strategy, and the guide advises against it for large migrations |

Source: About the migration strategies (AWS Prescriptive Guidance, Guide for AWS large migrations), https://docs.aws.amazon.com/prescriptive-guidance/latest/large-migration-guide/migration-strategies.html

## The rules

| Rule | Default level | Points |
| --- | --- | --- |
| `circular-dependency` | warning | `cafGroup`, `cafSequence` |
| `unknown-dependency` | error | `cafSequence`, `cafGroup` |
| `duplicate-id` | error | `cafDocument` |
| `missing-owner` | warning | `cafOwner` |
| `missing-path` | error | `sevenRs` |
| `unknown-path` | error | `sevenRs`, `rehost`, `relocate`, `repurchase`, `replatform`, `refactor` |
| `retired-dependency` | error | `retire`, `cafFallback` |
| `retained-dependency` | warning | `retain`, `cafSplit` |
| `move-group-too-big` | warning | `cafWaves`, `cafGroup` |
| `invalid-record` | error, always | `csvSameFields`, `cafDocument` |
| `unreadable-file` | error, always | `jsonUtf8`, `csvRecords` |
| `unparsable-file` | error, always | `csvRecords`, `jsonRepeatedNames` |

### `circular-dependency`

Workloads depend on each other in a circle: moving workloads whose dependencies lead back to themselves.

Points:

- `cafGroup`: workloads that communicate or share resources go into the same wave, because a broken dependency disrupts the service; when it is not clear how critical a dependency is, the components are grouped together (Migration wave planning (Microsoft Cloud Adoption Framework, Migrate), https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/migrate/migration-wave-planning)
- `cafSequence`: the migration sequence decides which workloads move first so that dependent components move together, and a large portfolio is organized into migration waves (Plan your migration (Microsoft Cloud Adoption Framework, Migrate), https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/migrate/plan-migration)

The tool's own choice: the workloads of a strongly connected component of the graph of moving workloads, or one that depends on itself, become one move group that moves in one wave; one finding per group, at its first workload, with a shortest cycle through it; a warning, because the plan can still be made, but the group is larger than its parts and the circle is often a mistake in the inventory.

What to change: check each dependency of the circle; remove the one that is not real, or plan the group as one move with one cutover.

### `unknown-dependency`

A dependency names an id that is not in the inventory: an id in the dependencies of a workload that no record of the inventory has.

Points:

- `cafSequence`: the migration sequence decides which workloads move first so that dependent components move together, and a large portfolio is organized into migration waves (Plan your migration (Microsoft Cloud Adoption Framework, Migrate), https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/migrate/plan-migration)
- `cafGroup`: workloads that communicate or share resources go into the same wave, because a broken dependency disrupts the service; when it is not clear how critical a dependency is, the components are grouped together (Migration wave planning (Microsoft Cloud Adoption Framework, Migrate), https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/migrate/migration-wave-planning)

The tool's own choice: one finding per workload and unknown id; the dependency is left out of the plan, so the order it would give is lost; ids are compared exactly, with their case; a near id is suggested for an unknown id of four characters or more when the inventory holds at most 5,000 ids, for the first 100 of them.

What to change: correct the id, or add the workload it names to the inventory with its migration path.

### `duplicate-id`

Two records have the same id: a record whose id an earlier record already has.

Points:

- `cafDocument`: each dependency group is written down with a unique identifier and name, its components, its critical dependencies and its constraints (Migration wave planning (Microsoft Cloud Adoption Framework, Migrate), https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/migrate/migration-wave-planning)

The tool's own choice: the first record with an id is the one planned, in the order of the files on the command line and of the records in each file; every later record with the same id is reported at its id and left out of the plan.

What to change: give each workload its own id, or merge the two records into one.

### `missing-owner`

A workload has no owner: a workload with an empty owner, or an inventory with no owner column.

Points:

- `cafOwner`: the plan records for each workload its name, owner, criticality, migration method and downtime window, and the details of a workload include its owner and its dependencies (Plan your migration (Microsoft Cloud Adoption Framework, Migrate), https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/migrate/plan-migration)

The tool's own choice: an owner that is empty or not given at all; any text counts as an owner, the tool cannot tell whether the person or team is real.

What to change: name the person or team who decides on the move and signs off the cutover.

### `missing-path`

A workload has no migration path: a workload with an empty migration path, or an inventory with no path column.

Points:

- `sevenRs`: the guide names seven migration strategies, the 7 Rs: retire, retain, rehost, relocate, repurchase, replatform, and refactor or re-architect (About the migration strategies (AWS Prescriptive Guidance, Guide for AWS large migrations), https://docs.aws.amazon.com/prescriptive-guidance/latest/large-migration-guide/migration-strategies.html)

The tool's own choice: a workload with no path is planned as one that moves, so that the order of its dependencies still holds, and is shown with the path none.

What to change: choose one of the 7 Rs for the workload: retire, retain, rehost, relocate, repurchase, replatform or refactor.

### `unknown-path`

A migration path is not one of the 7 Rs: a migration path that is none of retire, retain, rehost, relocate, repurchase, replatform, refactor and the 6 aliases of the configuration.

Points:

- `sevenRs`: the guide names seven migration strategies, the 7 Rs: retire, retain, rehost, relocate, repurchase, replatform, and refactor or re-architect (About the migration strategies (AWS Prescriptive Guidance, Guide for AWS large migrations), https://docs.aws.amazon.com/prescriptive-guidance/latest/large-migration-guide/migration-strategies.html)
- `rehost`: rehost, also called lift and shift, moves an application to the cloud without changing it (About the migration strategies (AWS Prescriptive Guidance, Guide for AWS large migrations), https://docs.aws.amazon.com/prescriptive-guidance/latest/large-migration-guide/migration-strategies.html)
- `relocate`: relocate moves many servers at once to a cloud version of the same platform, or moves resources to another network, Region or account, without changing the architecture (About the migration strategies (AWS Prescriptive Guidance, Guide for AWS large migrations), https://docs.aws.amazon.com/prescriptive-guidance/latest/large-migration-guide/migration-strategies.html)
- `repurchase`: repurchase, also called drop and shop, replaces an application with another version or product, often one sold as a service (About the migration strategies (AWS Prescriptive Guidance, Guide for AWS large migrations), https://docs.aws.amazon.com/prescriptive-guidance/latest/large-migration-guide/migration-strategies.html)
- `replatform`: replatform, also called lift, tinker and shift or lift and reshape, moves an application and makes some changes on the way, such as a managed database (About the migration strategies (AWS Prescriptive Guidance, Guide for AWS large migrations), https://docs.aws.amazon.com/prescriptive-guidance/latest/large-migration-guide/migration-strategies.html)
- `refactor`: refactor or re-architect changes the architecture of an application to use cloud-native features; it is the most complex strategy, and the guide advises against it for large migrations (About the migration strategies (AWS Prescriptive Guidance, Guide for AWS large migrations), https://docs.aws.amazon.com/prescriptive-guidance/latest/large-migration-guide/migration-strategies.html)

The tool's own choice: a path is compared with the letters A to Z lowered and runs of spaces, hyphens, underscores and commas made one space; the names of the AWS guide and the aliases of the configuration (lift and shift, lift and reshape, drop and shop, re-architect and others) are known; a workload with an unknown path is planned as one that moves.

What to change: write one of the 7 Rs, or add the word your team uses to aliases in the configuration.

### `retired-dependency`

A workload marked retire is still needed: a workload with the path retire that a workload with another path depends on.

Points:

- `retire`: retire is the strategy for an application that is decommissioned or archived, so the servers of its stack can be shut down (About the migration strategies (AWS Prescriptive Guidance, Guide for AWS large migrations), https://docs.aws.amazon.com/prescriptive-guidance/latest/large-migration-guide/migration-strategies.html)
- `cafFallback`: the source environment is kept as a fallback after the cutover, so that DNS records and configurations can be reverted when a problem cannot be solved in time (Execute migration to cloud (Microsoft Cloud Adoption Framework, Migrate), https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/migrate/execute-migration)

The tool's own choice: one finding per retired workload, listing every workload that depends on it and is not retired itself, the retained ones included.

What to change: move the dependents off the workload first, or change its path to one that keeps it running.

### `retained-dependency`

A moving workload needs a workload that stays behind: a workload with the path retain that a workload that moves depends on.

Points:

- `retain`: retain keeps an application in the source environment, for example because it is not ready to move or because other applications must move first (About the migration strategies (AWS Prescriptive Guidance, Guide for AWS large migrations), https://docs.aws.amazon.com/prescriptive-guidance/latest/large-migration-guide/migration-strategies.html)
- `cafSplit`: components that must stay in the source environment need their connections and data flows written down, and the time a workload runs across both environments should be kept short (Plan your migration (Microsoft Cloud Adoption Framework, Migrate), https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/migrate/plan-migration)

The tool's own choice: one finding per retained workload, listing the moving workloads that depend on it with their waves; a warning, because a link between the two environments can be planned: it names a connection to design, not a mistake.

What to change: plan the connection between the cloud and the source environment (network, latency, security), or move the retained workload too.

### `move-group-too-big`

A move group is larger than the largest wave: a move group with more workloads than the largest wave size (none is set, so the rule does not report).

Points:

- `cafWaves`: wave planning divides a large migration into smaller groups of workloads that are migrated together, in controlled batches (Migration wave planning (Microsoft Cloud Adoption Framework, Migrate), https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/migrate/migration-wave-planning)
- `cafGroup`: workloads that communicate or share resources go into the same wave, because a broken dependency disrupts the service; when it is not clear how critical a dependency is, the components are grouped together (Migration wave planning (Microsoft Cloud Adoption Framework, Migrate), https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/migrate/migration-wave-planning)

The tool's own choice: only with a largest wave size, from --max-wave-size or maxWaveSize; the workloads of a move group are never split, so a group larger than the size is a wave of its own.

What to change: break the circle that holds the group together, or plan a larger wave for it.

### `invalid-record`

A record that cannot be read: a record of the inventory with no id, the wrong number of fields or a value of the wrong kind.

Points:

- `csvSameFields`: every line of a CSV file should hold the same number of fields (RFC 4180, Common Format and MIME Type for Comma-Separated Values (CSV) Files, https://www.rfc-editor.org/rfc/rfc4180)
- `cafDocument`: each dependency group is written down with a unique identifier and name, its components, its critical dependencies and its constraints (Migration wave planning (Microsoft Cloud Adoption Framework, Migrate), https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/migrate/migration-wave-planning)

The tool's own choice: a record with no id, a CSV row with a different number of fields than the header, a JSON record that is not an object or names a field twice, is not part of the plan; a value of the wrong kind is taken as empty; this rule cannot be set lower or off.

What to change: correct the record at the line named.

### `unreadable-file`

A file that cannot be read: an inventory that the tool could not read as UTF-8 text.

Points:

- `jsonUtf8`: JSON text exchanged between systems must be UTF-8, and a reader may ignore a byte order mark at the start (RFC 8259, The JSON Data Interchange Format, https://www.rfc-editor.org/rfc/rfc8259)
- `csvRecords`: each record of a CSV file is on its own line, ended by CRLF, the first line may be a header, and a field that holds a comma, a double quote or a line break is put in double quotes, with a double quote inside it written twice (RFC 4180, Common Format and MIME Type for Comma-Separated Values (CSV) Files, https://www.rfc-editor.org/rfc/rfc4180)

The tool's own choice: a file that is over its size limit, binary, UTF-16, not valid UTF-8 or not there to open is an error and nothing in it is planned; this rule cannot be set lower or off.

What to change: export the inventory as UTF-8 CSV or JSON.

### `unparsable-file`

A file that is not CSV or JSON the readers accept, or not an inventory: an inventory that the CSV or JSON reader refuses, or whose header or shape is not that of an inventory.

Points:

- `csvRecords`: each record of a CSV file is on its own line, ended by CRLF, the first line may be a header, and a field that holds a comma, a double quote or a line break is put in double quotes, with a double quote inside it written twice (RFC 4180, Common Format and MIME Type for Comma-Separated Values (CSV) Files, https://www.rfc-editor.org/rfc/rfc4180)
- `jsonRepeatedNames`: when an object repeats a name the behavior of the software that reads it cannot be predicted, so the reader of this tool refuses a repeated name (RFC 8259, The JSON Data Interchange Format, https://www.rfc-editor.org/rfc/rfc8259)

The tool's own choice: a quoted CSV field that is not closed, a stray double quote, a header with no id column or a column named twice, JSON that does not parse or repeats a name, or JSON that is not a list of workloads stops the reading of the file, and nothing in it is planned; this rule cannot be set lower or off.

What to change: correct the file at the line and column named.

## Points that no rule rests on

- `csvInjection`: a spreadsheet may read a cell that starts with =, +, -, @, a tab or a line break as a formula, and no one escape is safe in every program that opens the file (CSV Injection (OWASP), https://community.owasp.org/attacks/CSV_Injection). Behind the formula guard of `--format csv`.
- `githubAnnotations`: a line of output such as ::warning file=...,line=...::message becomes an annotation on that file and line in the run (Workflow commands for GitHub Actions (GitHub Docs), https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands). Behind `--format github`.

## The pages

- About the migration strategies (AWS Prescriptive Guidance, Guide for AWS large migrations): https://docs.aws.amazon.com/prescriptive-guidance/latest/large-migration-guide/migration-strategies.html
- Plan your migration (Microsoft Cloud Adoption Framework, Migrate): https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/migrate/plan-migration
- Migration wave planning (Microsoft Cloud Adoption Framework, Migrate): https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/migrate/migration-wave-planning
- Execute migration to cloud (Microsoft Cloud Adoption Framework, Migrate): https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/migrate/execute-migration
- RFC 4180, Common Format and MIME Type for Comma-Separated Values (CSV) Files: https://www.rfc-editor.org/rfc/rfc4180
- RFC 8259, The JSON Data Interchange Format: https://www.rfc-editor.org/rfc/rfc8259
- CSV Injection (OWASP): https://community.owasp.org/attacks/CSV_Injection
- Workflow commands for GitHub Actions (GitHub Docs): https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands
