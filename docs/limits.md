# Limits

The tool reads a migration inventory as it is written: CSV or JSON files that list workloads with their paths and
dependencies. It does not discover workloads or dependencies, connect to a server, a cloud account or a discovery tool,
or ask anyone anything. A finding points at something in a file; a run without findings says only that the inventory
holds none of the problems of docs/method.md. Every report ends with a sentence that says so.

## What it cannot see

- **Dependencies the inventory does not list.** The waves are only as right as the dependencies in the file. A tool
  that reads network traffic, a configuration management database or the connection strings of an application can
  discover links that nobody wrote down; this tool cannot. A workload whose dependencies are missing is planned in the
  first wave.
- **The kind of a dependency.** The Cloud Adoption Framework tells direct, indirect and business dependencies apart.
  The tool treats every dependency as one that must move first, and every circle as one that must move together. A
  dependency that tolerates latency, and could run across both environments for a while, is not known as such.
- **Capacity, cost and time.** The tool does not size machines, estimate how long a wave takes, check the capacity of
  the team or of the network, or price the target. The largest wave size is a count of workloads, not of effort.
- **Downtime and cutover.** The criticality and environment are shown but not used to order the waves: the tool does
  not move non-production workloads first, keep critical ones for later waves or plan downtime windows, as the Cloud
  Adoption Framework advises a team to do. Use `--max-wave-size` and the order of the inventory to steer it.
- **Whether a path is the right one.** The tool checks that a path is one of the 7 Rs, not that the strategy fits the
  workload, and it does not check that a target service exists.
- **Whether an owner is real.** Any text counts as an owner.
- **Ids that differ in case or by a typo.** Ids are compared exactly, with their case: `Web-01` and `web-01` are two
  workloads. A near id is suggested, never used.
- **Merged records.** The second record with an id is reported and left out, not merged with the first.
- **Spreadsheet files.** A sheet saved as `.xlsx` or `.ods` is not read; export it as UTF-8 CSV. A CSV file in another
  encoding, or saved as UTF-16, is an `unreadable-file` finding. The separator is always the comma.
- **Dates.** The waves are numbered, not dated
  ([decision 1](decisions/0001-read-no-clock-and-keep-dates-out-of-the-repository.md)).

## The readers

- The CSV reader follows RFC 4180, accepts LF and a lone CR as line ends too, keeps white space inside a field (the
  inventory reader trims it afterwards), and refuses a quoted field that is not closed, a character after a closing
  quote, and a double quote inside an unquoted field. It reads no other separator, no comment lines and no escapes with
  a backslash.
- The JSON reader follows RFC 8259 and refuses comments, trailing commas, single quotes and a name given twice in one
  object.

## Size limits

Past a limit, the input is refused with exit code `2` and no result, the file is an error finding, or, where the limit
is on the work and not the input, the report says so in a note.

| What | Limit |
| --- | --- |
| an inventory file | 32 MB; a larger file is an `unreadable-file` finding |
| all the files of a run | 256 MB |
| files on the command line | 100 |
| workloads in a file | 200,000; more is an `unparsable-file` finding |
| a CSV field or a JSON string | 65,536 characters |
| CSV fields in a record | 1,000 |
| JSON values in a file | 5,000,000, nested 32 deep |
| configuration file | 1 MB; nesting 32 deep; 500 aliases of up to 100 characters; a wave size up to 100,000 |
| suggestions of a near id | for inventories of at most 5,000 ids, the first 100 unknown ids |
| findings of one rule | 500 listed; the rest are counted in a note and still count for the result |
| problems of the input | 20 listed; the rest are counted |

The tests plan a chain and a ring of a hundred thousand workloads, a star of five thousand, a dense graph of fifteen
hundred workloads with two hundred dependencies each, and six thousand unknown ids, and read runs of hundreds of
thousands of quotes, commas, line breaks and brackets, each with a time check.
