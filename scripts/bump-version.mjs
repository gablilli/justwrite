/**
 * Version bump: the one place that updates every file release.mjs
 * cross-checks, so they can never drift apart again like EXPECT_VERSION did.
 *
 * release.mjs deliberately hardcodes the version/minAppVersion it expects
 * and refuses to build if manifest.json, package.json, versions.json, or
 * its own EXPECT_VERSION disagree. That guard is only as good as someone
 * remembering to update all four (five, counting package-lock.json) at
 * once — this script is that "someone".
 *
 *   node scripts/bump-version.mjs <version> [minAppVersion]
 *
 * <version>       e.g. 1.5.0 or 1.5.0-beta
 * [minAppVersion] optional; defaults to manifest.json's current
 *                 minAppVersion (the normal case: bumping the plugin
 *                 version without changing the Obsidian API floor).
 *
 * Updates in the CURRENT WORKTREE (does not commit):
 *   - package.json          "version"
 *   - manifest.json         "version" (and "minAppVersion" if given)
 *   - versions.json         adds/overwrites versions[<version>] = minAppVersion
 *   - scripts/release.mjs   EXPECT_VERSION (and EXPECT_MIN_APP if given)
 *   - package-lock.json     regenerated via `npm install --package-lock-only`
 *
 * The caller (a human, or the release workflow) is expected to review and
 * commit the result. This script never touches git.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "..");

const [, , newVersion, newMinAppArg] = process.argv;

if (!newVersion) {
	console.error("usage: node scripts/bump-version.mjs <version> [minAppVersion]");
	process.exit(1);
}
// Loose semver-ish check (allows a -beta/-rc suffix like "1.5.0-beta").
if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(newVersion)) {
	console.error(`FATAL: "${newVersion}" doesn't look like a version (expected e.g. "1.5.0" or "1.5.0-beta").`);
	process.exit(1);
}

function readJson(file) {
	return JSON.parse(fs.readFileSync(file, "utf8"));
}
function writeJson(file, data) {
	// Keep the repo's existing style: tab indent, trailing newline.
	fs.writeFileSync(file, JSON.stringify(data, null, "\t") + "\n", "utf8");
}

const manifestPath = path.join(ROOT, "manifest.json");
const pkgPath = path.join(ROOT, "package.json");
const versionsPath = path.join(ROOT, "versions.json");
const releaseScriptPath = path.join(ROOT, "scripts", "release.mjs");

const manifest = readJson(manifestPath);
const pkg = readJson(pkgPath);
const versions = readJson(versionsPath);

const newMinApp = newMinAppArg || manifest.minAppVersion;
if (!newMinApp) {
	console.error("FATAL: no minAppVersion given and manifest.json has none to default to.");
	process.exit(1);
}

console.log(`bumping ${manifest.version} -> ${newVersion} (minAppVersion ${newMinApp})`);

// ---- package.json / manifest.json ------------------------------------------
pkg.version = newVersion;
manifest.version = newVersion;
manifest.minAppVersion = newMinApp;
writeJson(pkgPath, pkg);
writeJson(manifestPath, manifest);

// ---- versions.json -----------------------------------------------------------
versions[newVersion] = newMinApp;
writeJson(versionsPath, versions);

// ---- scripts/release.mjs: keep its hardcoded expectations in lockstep -------
let releaseSrc = fs.readFileSync(releaseScriptPath, "utf8");
const versionLine = /const EXPECT_VERSION = "[^"]*";/;
const minAppLine = /const EXPECT_MIN_APP = "[^"]*";/;
if (!versionLine.test(releaseSrc) || !minAppLine.test(releaseSrc)) {
	console.error("FATAL: could not find EXPECT_VERSION/EXPECT_MIN_APP in scripts/release.mjs — did its format change?");
	process.exit(1);
}
releaseSrc = releaseSrc
	.replace(versionLine, `const EXPECT_VERSION = "${newVersion}";`)
	.replace(minAppLine, `const EXPECT_MIN_APP = "${newMinApp}";`);
fs.writeFileSync(releaseScriptPath, releaseSrc, "utf8");

// ---- package-lock.json: let npm regenerate it, don't hand-edit a lockfile ---
console.log("refreshing package-lock.json…");
execFileSync("npm", ["install", "--package-lock-only"], { cwd: ROOT, stdio: "inherit" });

console.log(
	`\nDone. Updated: manifest.json, package.json, package-lock.json, versions.json, scripts/release.mjs.\n` +
		"Review the diff and commit before running `npm run release`."
);
