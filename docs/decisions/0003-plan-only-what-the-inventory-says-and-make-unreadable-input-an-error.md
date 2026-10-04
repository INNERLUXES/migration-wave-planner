# 3. Plan only what the inventory says, and make unreadable input an error

## Status

Accepted

## Context

An inventory is usually a spreadsheet that many people edit. It has typos in ids, paths written in a team's own words,
rows with a missing cell, columns that were added for another purpose, and sometimes a file that was saved as UTF-16 or
in a binary format. A planner could guess: match an id by its closest neighbour, read an unknown path as rehost, skip a
row it cannot read, fill a missing owner from the row above. Each guess would make the plan look complete and be wrong
in a way nobody sees.

A plan is only as good as the dependencies and paths it is built from, and a migration that moves a workload in the
wrong wave fails on the night of the cutover.

## Decision

1. The tool plans what the inventory says. An unknown id is an `unknown-dependency` finding, and a near id is only
   suggested, never used. An unknown path is an `unknown-path` finding; the workload is planned as one that moves so
   that the order of its dependencies still holds, and it is shown as unknown. Only the seven names of the AWS guide and
   the aliases of the configuration are paths.
2. A record that cannot be read (no id, the wrong number of fields, a JSON record that is not an object) is an
   `invalid-record` finding and is not part of the plan; a file that cannot be read or parsed is an `unreadable-file` or
   `unparsable-file` finding. These three rules are always errors and have no key in the configuration, so a run never
   passes because a part of the input was passed over.
3. The second record with an id is a `duplicate-id` finding and is left out; the first record is planned. The tool does
   not merge records.
4. A column or key the tool does not read is named in a note, so a column called `Depends` that the tool did not
   recognize is visible.

## Consequences

- A clean run means the inventory holds what a plan needs in the forms docs/method.md describes, and every report ends
  with a sentence that says what a plan from an inventory cannot see.
- A team that uses its own words for the 7 Rs adds them as aliases in the configuration, where a reviewer sees them.
- An inventory with many problems gives a long report on the first run; `--min-severity error` and the levels of the
  rules let a team work through it in steps.
