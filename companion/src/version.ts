// Bump alongside package.json's "version" field when cutting a release. Kept
// as a plain constant rather than importing package.json at runtime - the
// packaged .exe bundles this file directly and can't read a package.json
// off disk the way dev mode (`npm start`) can.
export const COMPANION_VERSION = "0.1.4";
