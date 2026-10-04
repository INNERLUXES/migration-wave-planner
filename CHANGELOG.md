# Changes

## 1.0.0

First release.

- Turns a cloud migration inventory into migration waves: one or more CSV files (RFC 4180) or JSON files (RFC 8259)
  that list workloads with an id, a name, a type, an owner, an environment, a migration path, a criticality and the ids
  they depend on, read as one inventory, with the columns and keys matched by name in any case and order.
- The seven migration paths of the AWS guide (retire, retain, rehost, relocate, repurchase, replatform, refactor) with
  their other names as aliases (lift and shift, lift and reshape, drop and shop, re-architect and others); retired and
  retained workloads are kept out of the waves and listed with the workloads that need them.
- Workloads that depend on each other in a circle become one move group, found as the strongly connected components of
  the dependency graph; the groups are ordered into waves with every workload after what it depends on, as early as the
  dependencies allow, and `--max-wave-size` cuts the waves without ever cutting a group.
- Nine rules in three levels: circular dependencies shown as the group that moves together (`circular-dependency`),
  dependencies on ids that are not in the inventory with a suggestion of a near id (`unknown-dependency`), duplicate
  ids (`duplicate-id`), workloads with no owner (`missing-owner`), no migration path or an unknown one
  (`missing-path`, `unknown-path`), retired workloads that others still need (`retired-dependency`), retained
  workloads that moving ones need (`retained-dependency`), and move groups larger than a wave
  (`move-group-too-big`); and three rules of input problems that cannot be lowered (`invalid-record`,
  `unreadable-file`, `unparsable-file`).
- A configuration file in strict JSON over documented defaults: the level of every rule, the aliases of the paths, the
  largest wave, the minimum severity and the level that fails the run; a key the tool does not know is an error with
  its line and a suggestion, and a key named twice is refused.
- Reports as text with a table per wave, JSON, a CSV wave plan (`--format csv`) and GitHub workflow commands
  (`--format github`) that show each finding as an annotation; `--min-severity`, `--fail-on`, `--explain` with the rule
  and the sources of each finding, and `--print-defaults`. Exit code `0` when no finding is at or above the fail-on
  level, `1` when one is, `2` for a usage or input error, with no result.
- Follows no symbolic link, fetches nothing, runs nothing, writes nothing to disk, reports binary, UTF-16 and invalid
  UTF-8 input as errors, neutralizes formulas in the CSV wave plan, and has a size limit on every input.
- Release packages come with a CycloneDX SBOM, SHA-256 checksums and a build provenance attestation, after the SSDF gate
  of the repository.
