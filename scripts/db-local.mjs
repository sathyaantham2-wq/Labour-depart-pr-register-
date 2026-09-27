// Local database helper for plain PostgreSQL (no Docker).
//   node scripts/db-local.mjs reset  -> drop + recreate the local DB, apply shim, migrations, seed
//   node scripts/db-local.mjs test   -> run supabase/tests/local/*.sql (each rolls back)
//   node scripts/db-local.mjs types  -> regenerate src/types/database.ts from the local DB
// Reads LOCAL_DATABASE_URL from .env.local. Only databases named *_dev or *_test are touched.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
process.chdir(root);
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const url = process.env.LOCAL_DATABASE_URL;
if (!url) fail("LOCAL_DATABASE_URL is not set in .env.local");
const dbUrl = new URL(url);
const dbName = dbUrl.pathname.replace(/^\//, "");
if (!/^[a-z0-9_]+_(dev|test)$/.test(dbName)) {
  fail(`Refusing to touch database "${dbName}": name must end in _dev or _test`);
}

const psql = findPsql();
const command = process.argv[2] ?? "reset";

if (command === "reset") {
  const adminUrl = new URL(url);
  adminUrl.pathname = "/postgres";
  run(adminUrl, ["-c", `drop database if exists ${dbName} with (force)`]);
  run(adminUrl, ["-c", `create database ${dbName}`]);
  runFile("supabase/local-shim/supabase_shim.sql");
  for (const f of sqlFiles("supabase/migrations")) runFile(f);
  runFile("supabase/seed.sql");
  console.log(`\n✔ ${dbName} rebuilt`);
} else if (command === "test") {
  const files = sqlFiles("supabase/tests/local");
  // Hide query result tables; test results arrive as NOTICE lines.
  const nullDevice = process.platform === "win32" ? "NUL" : "/dev/null";
  for (const f of files) runFile(f, ["-o", nullDevice]);
  console.log(`\n✔ ${files.length} test file(s) passed`);
} else if (command === "types") {
  const typesUrl = new URL(url);
  typesUrl.searchParams.set("sslmode", "disable"); // default Windows install has no SSL
  const out = "src/types/database.ts";
  // Run the locally installed CLIs through node directly — no shell, so the URL is never re-parsed.
  const res = spawnSync(
    process.execPath,
    ["node_modules/supabase/dist/supabase.js", "gen", "types", "typescript",
     "--db-url", typesUrl.toString(), "--schema", "public"],
    { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
  );
  if (res.status !== 0) fail(`type generation failed:\n${res.stderr}`);
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, res.stdout);
  const fmt = spawnSync(process.execPath, ["node_modules/oxfmt/bin/oxfmt", out], { stdio: "inherit" });
  if (fmt.status !== 0) console.warn("! could not format the types file (it is still valid)");
  console.log(`✔ wrote ${out}`);
} else {
  fail(`Unknown command "${command}". Use reset, test or types.`);
}

function sqlFiles(dir) {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => path.posix.join(dir, f));
}

function runFile(file, extraArgs = []) {
  console.log(`→ ${file}`);
  run(dbUrl, [...extraArgs, "-f", file]);
}

function run(connUrl, args) {
  const res = spawnSync(
    psql,
    [connUrl.toString(), "-X", "-q", "-v", "ON_ERROR_STOP=1", ...args],
    { stdio: "inherit", env: { ...process.env, PGCLIENTENCODING: "UTF8" } },
  );
  if (res.error) fail(res.error.message);
  if (res.status !== 0) process.exit(res.status ?? 1);
}

function findPsql() {
  if (process.env.PSQL_PATH) return process.env.PSQL_PATH;
  const probe = spawnSync("psql", ["--version"], { stdio: "ignore" });
  if (probe.status === 0) return "psql";
  for (const v of ["17", "16", "15"]) {
    const p = `C:\\Program Files\\PostgreSQL\\${v}\\bin\\psql.exe`;
    if (existsSync(p)) return p;
  }
  fail("psql not found. Add PostgreSQL's bin folder to PATH or set PSQL_PATH.");
}

function fail(msg) {
  console.error(`✖ ${msg}`);
  process.exit(1);
}
