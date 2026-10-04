# Threat model

## What the tool touches

- It reads the inventory files named on the command line and the configuration file named with `--config`. Nothing
  else is opened; no folder is walked.
- It writes the report to standard output and its errors to standard error. It writes nothing to disk.
- It opens no network connection, follows no symbolic link, evaluates nothing it reads, starts no program and reads no
  clock.

## What the input may hold

An inventory is often a sheet exported by many hands, and in a pipeline that checks every pull request, the inventory
and the configuration may both be written by whoever opened the pull request. Through them, a person can try to:

- make the tool read another file: a file or a configuration named through a symbolic link, a file swapped for a link
  between the check and the read, a path written as a web address;
- exhaust the memory or the time: a file of megabytes, a hundred thousand workloads in one long chain, one ring or a
  dense graph, a field of hundreds of thousands of quotes or commas, JSON nested very deep;
- move the result: a repeated JSON name with two values, a CSV column named twice, an id given twice, a rule set to off,
  an alias that turns an unknown path into a known one, a `failOn` raised to `error`;
- slip in something that is not text: a binary sheet renamed to `.csv`, a file in UTF-16, bytes that are not UTF-8;
- rewrite the terminal or break the output: control characters, ANSI escapes, direction controls and line separators
  in a file name, an id, a name, an owner or a path;
- start a second workflow command: a text that holds `::error`, `%`, a comma, a colon or a line break, which the GitHub
  format writes into a command;
- hide a formula in the CSV wave plan: an id, a name or an owner that starts with `=`, `+`, `-` or `@`, which a
  spreadsheet may run when the plan is opened;
- change how objects behave: an id, a column, a key or an alias named `__proto__`, `constructor` or `toString`.

## What could go wrong, and what stops it

| Risk | Control |
| --- | --- |
| A symbolic link makes the tool read another file | A path named on the command line is looked at without following a link, and a link is refused; each file is opened with `O_NOFOLLOW` where the system has it and its type is taken from the open handle, so a file swapped for a link is refused. Tests name a file, a folder and a configuration through links |
| The tool fetches or runs something | No module of the network or of child processes is imported, nothing is evaluated, and a path that looks like an address is refused. A test checks the imports of src |
| The memory or the time is exhausted | Files have size limits checked on the open handle before they are read, and a run has a limit on its bytes; the CSV reader reads each character once and finds the end of a quoted field with one search; the JSON reader limits its depth, values and strings; the graph is walked without recursion in time linear in the workloads and dependencies; near ids are suggested only within fixed limits; findings are capped per rule. Tests check the time, with limits that widen under coverage only |
| A pattern from the input is slow | No regular expression is built from the input or the configuration; a test looks for `new RegExp` in src |
| The result is moved through the input | A repeated JSON name is refused, as RFC 8259 leaves its meaning open; a CSV column named twice is refused; a repeated id is a finding; a record that cannot be read is an error finding that cannot be set off; unknown columns and keys are named in a note; a rule set to off is named in a note. Review a change to the configuration like a change to code (docs/secure-defaults.md) |
| A binary or UTF-16 file is read as text | A null byte, a UTF-16 byte order mark or bytes that are not valid UTF-8 make the file an error finding; nothing in it is planned |
| Text from the input rewrites the terminal | Every text, file names included, goes through `safeText`, which removes control, line separator and direction characters and caps the length. A test puts ANSI escapes and direction controls in a file name, an id, a name, an owner and a path, in every format |
| A text starts a second workflow command | The GitHub format escapes `%`, CR and LF in a message and `:` and `,` in a property; a line break never reaches a command. A test writes `%0A::error::` and `::error file=` into an id, a path and the dependencies |
| A formula runs when the CSV wave plan is opened | A field that starts with `=`, `+`, `-`, `@`, a tab or a carriage return gets a single quote in front. The OWASP page on CSV injection says no one escape is safe in every program, so treat a plan built from an inventory you do not trust as untrusted data, and open it with formulas off |
| `__proto__` changes how objects behave | The JSON reader defines own properties, ids are kept in a `Map`, and the names of columns, keys and aliases are looked up with `Object.hasOwn`. A test uses `__proto__`, `constructor` and `toString` as ids, columns, keys, paths and aliases |
| A device or a pipe hangs the tool | A path that is not a regular file is refused before it is read |
| The tool leaves files behind | Nothing is written to disk; there is no cache, no temporary file and no log. A test checks that a run leaves the folder as it was |

## Out of scope

Whether the inventory is true to the estate, the dependencies it does not list, the forms docs/limits.md says the tool
does not read, who may change the inventory or the configuration in your repository, and where your pipeline keeps the
output.
