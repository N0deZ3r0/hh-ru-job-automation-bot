#!/usr/bin/env node
/**
 * Lightweight source validation used by CI.
 *
 *   node .github/scripts/validate.mjs js        syntax-check every .js file
 *   node .github/scripts/validate.mjs json      parse every .json file
 *   node .github/scripts/validate.mjs manifest  sanity-check manifest.json
 *
 * No dependencies: it runs on a bare actions/setup-node step.
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { execFileSync } from 'node:child_process';

const IGNORED_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', 'out']);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (IGNORED_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const files = walk('.');
const byExt = (ext) => files.filter((f) => extname(f).toLowerCase() === ext);

let failures = 0;
const fail = (file, message) => {
  failures++;
  console.error(`FAIL  ${file}\n      ${String(message).split('\n')[0]}`);
};

/** Syntax-check a file as a classic script, falling back to module syntax. */
function checkJs(file) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
    return 'script';
  } catch (scriptError) {
    try {
      execFileSync(process.execPath, ['--input-type=module', '--check'], {
        input: readFileSync(file),
        stdio: 'pipe',
      });
      return 'module';
    } catch {
      throw scriptError;
    }
  }
}

function runJs() {
  const targets = byExt('.js');
  if (!targets.length) return console.log('No .js files to check.');
  for (const file of targets) {
    try {
      console.log(`ok  ${file}  (${checkJs(file)})`);
    } catch (error) {
      fail(file, error.stderr ? error.stderr.toString() : error.message);
    }
  }
}

function runJson() {
  const targets = byExt('.json');
  if (!targets.length) return console.log('No .json files to check.');
  for (const file of targets) {
    try {
      JSON.parse(readFileSync(file, 'utf8'));
      console.log(`ok  ${file}`);
    } catch (error) {
      fail(file, error.message);
    }
  }
}

/** Collect every repo-relative path the manifest points at. */
function referencedPaths(manifest) {
  const paths = [];
  const push = (value) => {
    if (typeof value === 'string' && !value.includes('*')) paths.push(value);
  };

  Object.values(manifest.icons ?? {}).forEach(push);
  Object.values(manifest.action?.default_icon ?? {}).forEach(push);
  push(manifest.action?.default_popup);
  push(manifest.background?.service_worker);
  (manifest.background?.scripts ?? []).forEach(push);
  (manifest.content_scripts ?? []).forEach((entry) => {
    (entry.js ?? []).forEach(push);
    (entry.css ?? []).forEach(push);
  });
  (manifest.web_accessible_resources ?? []).forEach((entry) => {
    if (typeof entry === 'string') push(entry);
    else (entry.resources ?? []).forEach(push);
  });
  (manifest.declarative_net_request?.rule_resources ?? []).forEach((rule) => push(rule.path));

  return [...new Set(paths)];
}

function runManifest() {
  if (!existsSync('manifest.json')) {
    console.log('No manifest.json in this repository — nothing to validate.');
    return;
  }

  const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));

  for (const key of ['manifest_version', 'name', 'version']) {
    if (manifest[key] === undefined) fail('manifest.json', `missing required key "${key}"`);
  }

  if (![2, 3].includes(manifest.manifest_version)) {
    fail('manifest.json', `manifest_version must be 2 or 3, got ${manifest.manifest_version}`);
  }

  if (manifest.version !== undefined && !/^\d+(\.\d+){0,3}$/.test(String(manifest.version))) {
    fail('manifest.json', `version "${manifest.version}" is not a valid extension version`);
  }

  for (const path of referencedPaths(manifest)) {
    if (existsSync(path)) console.log(`ok  manifest -> ${path}`);
    else fail('manifest.json', `references a file that does not exist: ${path}`);
  }
}

const task = process.argv[2];
const tasks = { js: runJs, json: runJson, manifest: runManifest };

if (!tasks[task]) {
  console.error(`Usage: validate.mjs <${Object.keys(tasks).join('|')}>`);
  process.exit(2);
}

tasks[task]();

if (failures) {
  console.error(`\n${failures} problem(s) found.`);
  process.exit(1);
}
console.log('\nAll checks passed.');
