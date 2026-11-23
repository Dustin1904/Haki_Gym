/**
 * Restaura un .dump creado con db:backup (reemplaza datos actuales en la BD).
 * Uso: npm run db:restore -- backups/archivo.dump
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..");
dotenv.config({ path: path.join(projectRoot, "server", ".env") });

const dumpArg = process.argv[2];
if (!dumpArg) {
  console.error("Indica el archivo: npm run db:restore -- backups/gym-....dump");
  process.exit(1);
}

const dumpPath = path.isAbsolute(dumpArg) ? dumpArg : path.resolve(projectRoot, dumpArg);
if (!fs.existsSync(dumpPath)) {
  console.error(`No existe: ${dumpPath}`);
  process.exit(1);
}

const host = process.env.PGHOST ?? "127.0.0.1";
const port = process.env.PGPORT ?? "5432";
const database = process.env.PGDATABASE ?? "gymadmin";
const user = process.env.PGUSER ?? "gymadmin_app";
const password = process.env.PGPASSWORD;

if (!password) {
  console.error("Falta PGPASSWORD en server/.env");
  process.exit(1);
}

console.warn("¡Atención! Esto sobrescribe la base actual. Detén npm run dev antes de continuar.");
console.warn(`Restaurando ${dumpPath} → ${database}`);

function resolvePgTool(name) {
  const quick = spawnSync(name, ["--version"], { encoding: "utf8", shell: process.platform === "win32" });
  if (!quick.error && quick.status === 0) return name;
  if (process.platform === "win32") {
    for (const v of [17, 16, 15, 14, 13]) {
      const exe = path.join("C:", "Program Files", `PostgreSQL`, String(v), "bin", `${name}.exe`);
      if (fs.existsSync(exe)) return exe;
    }
  }
  return null;
}

const pgRestoreBin = resolvePgTool("pg_restore");
if (!pgRestoreBin) {
  console.error("No se encontró pg_restore. Añade PostgreSQL bin al PATH.");
  process.exit(1);
}

const pgRestore = spawnSync(
  pgRestoreBin,
  [
    "-h",
    host,
    "-p",
    String(port),
    "-U",
    user,
    "-d",
    database,
    "--clean",
    "--if-exists",
    "--no-owner",
    dumpPath,
  ],
  { env: { ...process.env, PGPASSWORD: password }, encoding: "utf8" }
);

if (pgRestore.status !== 0) {
  console.error(pgRestore.stderr || "pg_restore terminó con avisos o error (revisa la salida).");
  process.exit(pgRestore.status === 0 ? 0 : pgRestore.status ?? 1);
}

console.log("Restauración completada.");