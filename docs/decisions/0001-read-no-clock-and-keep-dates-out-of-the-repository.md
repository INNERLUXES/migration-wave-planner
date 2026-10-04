# 1. Read no clock, and keep dates out of the repository

## Status

Accepted

## Context

A wave planner is tempting to tie to the calendar: a start date for each wave, a deadline after which a workload
without a path becomes an error, a report that says how many days are left before a data center contract ends. Each of
these would make the same inventory give a different result on a different day, so a pipeline that passed yesterday
could fail today with no change to the repository, and two people planning the same commit could see two plans. The
output could never be saved and compared.

The plan does not need a date. Which workloads depend on which, which ones stay behind and which order the waves take
can all be read from the inventory as it is. The dates of the waves belong to the team that runs the migration, in its
own schedule, after the order is known.

## Decision

1. The tool reads no clock, no time zone and no locale. The same inventory and configuration give the same output on
   every machine and on every day.
2. The configuration and the inventory have no key or column that holds a date. A team that wants a deadline raises
   `failOn` or a rule in a commit of its own, where the change can be reviewed.
3. No file of this repository holds a date or a number that reads like a year: not the licence, not the changelog,
   not the examples, not the documents, not the comments of the code. `npm run check` and a test fail on any number
   that reads like a year. Version numbers such as Node 22, RFC 4180 or 1.0.0 are not years and are fine.

## Consequences

- The output of a run can be saved in the repository (`examples/output`) and compared on every change, because it
  does not move with the calendar.
- The waves are numbered, not dated. A team turns wave 1, wave 2 and wave 3 into dates in its own schedule, with the
  buffer time and freeze windows the Cloud Adoption Framework describes.
- The README, the documents and the examples can be read at any time without being out of date about a date.
