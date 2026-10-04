# Sources

The public pages the plan and the checks of this tool are based on, each with a short note in this project's own words
on what the page says and which parts of the tool lean on it. Nothing here is a copy of a page: read the page itself for
its exact wording. src/data.js holds the pages and the points the reports show, and test/data.test.js checks that every
page there is listed here. Each page was fetched and read before it was listed.

## The migration strategies

### About the migration strategies (AWS Prescriptive Guidance, Guide for AWS large migrations)

https://docs.aws.amazon.com/prescriptive-guidance/latest/large-migration-guide/migration-strategies.html

The page that names the seven migration strategies, the 7 Rs, in this order: retire, retain, rehost, relocate,
repurchase, replatform, and refactor or re-architect. The tool takes its seven path names and their order from it, and
its built-in aliases are the other names the page gives:

- **Retire**: the application is decommissioned or archived, and the servers of its stack can be shut down. The page
  lists reasons such as no business value, the cost of keeping it, an operating system that is no longer supported, and
  no use over a long period. The tool keeps a retired workload out of the waves, and `retired-dependency` reports one
  that another workload still needs.
- **Retain**: the application stays in the source environment, because it is not ready, has to wait for others to
  move first, must stay for data residency, depends on hardware with no cloud equivalent, or is due for a later
  refresh. The tool keeps a retained workload out of the waves, and `retained-dependency` reports one that a moving
  workload depends on.
- **Rehost**: also called lift and shift; the application moves without changes. The alias `lift and shift` reads as
  rehost.
- **Relocate**: many servers move at once to a cloud version of the same platform, or resources move to another
  network, Region or account, with the architecture left as it is.
- **Repurchase**: also called drop and shop; the application is replaced by another version or product, often one
  sold as a service. The alias `drop and shop` reads as repurchase.
- **Replatform**: also called lift, tinker and shift, or lift and reshape; the application moves with some changes on
  the way, such as a managed database. The aliases `lift tinker and shift` and `lift and reshape` read as replatform.
- **Refactor or re-architect**: the architecture changes to use cloud-native features. The page calls it the most
  complex strategy and advises, for a large migration, to move first and modernize after. The aliases `re architect`
  and `rearchitect` read as refactor.

The page does not say how to order workloads into waves; the tool takes that from the Cloud Adoption Framework below.
`missing-path` and `unknown-path` rest on this page: a workload whose path is none of the seven has no strategy the
guide names.

## The Microsoft Cloud Adoption Framework, Migrate

https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/migrate/

The Migrate part of the Cloud Adoption Framework. Its address opens the page on planning a migration, which shows the
steps of a migration (plan, prepare the workloads, execute, optimize, decommission the source) and links to the pages on
wave planning and on the execution. Three of its pages were read.

### Plan your migration (Microsoft Cloud Adoption Framework, Migrate)

https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/migrate/plan-migration

The page on the migration plan: the order, timing and approach for each workload. Its section on the migration
sequence says that the sequence decides which workloads move first, so that dependent components move together, and
that a large portfolio is organized into migration waves; it tells the reader to find every dependency first and to
group workloads by the dependencies they share. Its section on split-environment operation says that components that
must stay in the source environment need their connections and data flows written down, and that the time a workload
runs across both environments should be kept short. Its section on stakeholders asks for a plan that shows each
workload with its owner, criticality, migration method and downtime window. The tool leans on it for the order of the
waves (`circular-dependency`, `unknown-dependency`), for `retained-dependency`, and for `missing-owner`.

### Migration wave planning (Microsoft Cloud Adoption Framework, Migrate)

https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/migrate/migration-wave-planning

The page on waves: a large migration is divided into smaller groups of workloads that are migrated together, in
controlled batches, with each wave teaching the team something for the next. It says that workloads that communicate or
share resources belong in the same wave, because a broken dependency disrupts the service, and that when it is not clear
how critical a dependency is, the components should be grouped together. It names three kinds of dependency (direct,
indirect and business) and asks for each dependency group to be written down with a unique identifier and name, its
components, its critical dependencies and its constraints. The tool's move groups follow this advice in the strictest
form: workloads that depend on each other in a circle always move in one wave, and a workload never moves before what
it depends on. `duplicate-id` and `invalid-record` rest on the unique identifier; `move-group-too-big` on the size of a
wave.

### Execute migration to cloud (Microsoft Cloud Adoption Framework, Migrate)

https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/migrate/execute-migration

The page on the cutover itself, with and without downtime: the change freeze, the production environment, the data
replication and the final synchronization, the redirection of traffic and the checks after it. Its section on the
fallback says to keep the source environment after the cutover, so that DNS records and configurations can be reverted
when a problem cannot be solved in time. `retired-dependency` leans on it: a workload marked retire that another
workload still needs cannot be switched off, and it is part of the fallback of the workloads that use it.

## Formats

### RFC 4180, Common Format and MIME Type for Comma-Separated Values (CSV) Files

https://www.rfc-editor.org/rfc/rfc4180

The memo that describes CSV: each record on its own line, ended by CRLF, the last line break optional, an optional
header line first, fields separated by commas, spaces kept as part of a field, and every line with the same number of
fields. A field that holds a comma, a double quote or a line break is put in double quotes, and a double quote inside
such a field is written twice. The reader of the tool follows it, accepts LF and a lone CR as line ends too, and refuses
a quoted field that is not closed or a double quote in a field that does not start with one (`unparsable-file`); a row
with a different number of fields than the header is an `invalid-record` finding. `--format csv` writes the wave plan
this way, with CRLF line ends.

### RFC 8259, The JSON Data Interchange Format

https://www.rfc-editor.org/rfc/rfc8259

The JSON standard. Its section on objects notes that when the names in an object are not unique, programs that read it
behave in different ways; the reader of the tool refuses a repeated name instead of keeping one of the values, so a
workload or a setting never depends on which value a library would keep. Its section on encoding asks for UTF-8 between
systems and lets a reader ignore a byte order mark; the tool reads UTF-8 only, skips a byte order mark, and reports a
UTF-16 file as an `unreadable-file` finding.

### CSV Injection (OWASP)

https://community.owasp.org/attacks/CSV_Injection

The page on formulas hidden in CSV files. A spreadsheet may treat a cell that starts with `=`, `+`, `-`, `@`, a tab or
a line break as a formula, and the page warns that no single escape is safe in every program and for every later
reader. The CSV format of the tool puts a single quote in front of such a field, and docs/threat-model.md says why that
is a help and not a guarantee.

### Workflow commands for GitHub Actions (GitHub Docs)

https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands

The page that describes the `::notice`, `::warning` and `::error` commands with their `file`, `line`, `col` and
`title` properties, which turn a line of output into an annotation on a file. `--format github` writes one such command
per finding, info as a notice, and escapes the characters a command gives a meaning to.
