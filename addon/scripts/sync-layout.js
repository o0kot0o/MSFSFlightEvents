#!/usr/bin/env node
/**
 * Regenerates layout.json for a built Community package by scanning its
 * actual files on disk, so the recorded sizes/dates always match reality.
 * Needed because fspackagetool's "Copy" asset group step has proven
 * unreliable about actually overwriting changed files during iterative
 * dev (see addon/README.md) - this script is run against packages that
 * were synced directly from esbuild's dist/ output instead.
 *
 * Usage: node sync-layout.js <path-to-package-root>
 */
const fs = require("fs");
const path = require("path");

const packageRoot = process.argv[2];
if (!packageRoot) {
  console.error("Usage: node sync-layout.js <path-to-package-root>");
  process.exit(1);
}

const FILETIME_EPOCH_DIFF = 116444736000000000n;

function toFileTime(mtimeMs) {
  return Number((BigInt(Math.round(mtimeMs)) * 10000n + FILETIME_EPOCH_DIFF).toString());
}

function walk(dir, base, entries) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, item.name);
    const rel = path.join(base, item.name).split(path.sep).join("/");
    if (item.isDirectory()) {
      walk(abs, rel, entries);
    } else if (item.isFile() && item.name !== "layout.json" && item.name !== "manifest.json") {
      const stat = fs.statSync(abs);
      entries.push({ path: rel.toLowerCase(), size: stat.size, date: toFileTime(stat.mtimeMs) });
    }
  }
}

const entries = [];
walk(packageRoot, "", entries);
entries.sort((a, b) => a.path.localeCompare(b.path));

const layoutPath = path.join(packageRoot, "layout.json");
fs.writeFileSync(layoutPath, JSON.stringify({ content: entries }, null, 2) + "\n");
console.log(`Wrote ${entries.length} entries to ${layoutPath}`);
