// Words compared as the tool compares them: the letters A to Z lowered whatever the locale. Used for the names of
// files, the columns of a CSV header, the keys of a JSON record, the migration paths and the suggestions of the
// configuration.

// Lowercase for the letters A to Z only, so the result does not depend on the locale.
export const asciiLower = (text) => String(text).replace(/[A-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 32));

// The last part of a path with forward slashes: "a/b/inventory.csv" is "inventory.csv".
export const baseName = (path) => String(path).slice(String(path).lastIndexOf('/') + 1);

// The form a migration path is compared in: the letters A to Z lowered, and every run of white space, hyphens,
// underscores and commas made one space, trimmed. "Lift-and-Shift" is "lift and shift", "Re-architect" is
// "re architect".
export const pathForm = (text) => asciiLower(text).replace(/[\s,_-]+/g, ' ').trim();

// The form the name of a column or of a key is compared in: the letters A to Z lowered, with white space, hyphens and
// underscores taken out. "Migration Path", "migration_path" and "migrationPath" are all "migrationpath".
export const fieldForm = (text) => asciiLower(text).replace(/[\s_-]+/g, '');
