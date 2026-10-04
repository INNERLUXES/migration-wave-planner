// The kind of a file, from its name: what the tool reads it as. The path is the one the report shows, with forward
// slashes. A file of no kind is not read: named on the command line, it stops the run, so a file is never passed over
// in silence.

import { asciiLower, baseName } from './words.js';

// The kinds, in the order the report counts them.
export const KINDS = ['csv', 'json'];

// The kind of a path, or null: a name ending in .csv is a CSV inventory and one ending in .json a JSON inventory,
// compared without regard to the case of the letters A to Z.
export function fileKind(path) {
  const name = asciiLower(baseName(path));
  if (name.endsWith('.csv') && name.length > 4) return 'csv';
  if (name.endsWith('.json') && name.length > 5) return 'json';
  return null;
}
