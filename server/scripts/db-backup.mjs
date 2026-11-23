/**
 * Respaldo PostgreSQL (formato custom .dump).
 * Uso: npm run db:backup  (desde la raíz del proyecto)
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..");
dotenv.config({ path: path.join(projectRoot, "server", ".env") });

const host = process.env.PGHOST ?? "127.0.0.1";
const port = process.env.PGPORT ?? "5432";
const database = process.env.PGDATABASE ?? "gymadmin";
const user = process.env.PGUSER ?? "gymadmin_app";
const password = process.env.PGPASSWORD;

if (!password) {
  console.error("Falta PGPASSWORD en server/.env");
  process.exit(1);
}

const backupsDir = path.join(projectRoot, "backups");
fs.mkdirSync(backupsDir, { recursive: true });

const stamp = new Date();
const pad = (n) => String(n).padStart(2, "0");
const fileName = `gym-${stamp.getFullYear()}-${pad(stamp.getMonth() + 1)}-${pad(stamp.getDate())}-${pad(stamp.getHours())}${pad(stamp.getMinutes())}.dump`;
const outFile = path.join(backupsDir, fileName);

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

const pgDumpBin = resolvePgTool("pg_dump");
if (!pgDumpBin) {
  console.error(
    "No se encontró pg_dump. Instala PostgreSQL o añade su carpeta bin al PATH (ej. C:\\Program Files\\PostgreSQL\\16\\bin)."
  );
  process.exit(1);
}

const pgDump = spawnSync(
  pgDumpBin,
  ["-h", host, "-p", String(port), "-U", user, "-d", database, "-F", "c", "-f", outFile],
  { env: { ...process.env, PGPASSWORD: password }, encoding: "utf8" }
);

if (pgDump.status !== 0) {
  console.error(pgDump.stderr || "pg_dump falló.");
  process.exit(pgDump.status ?? 1);
}

const stat = fs.statSync(outFile);
console.log(`Respaldo listo: ${outFile}`);
console.log(`Tamaño: ${(stat.size / 1024).toFixed(1)} KiB`);
console.log(`Base: ${database} en ${host}:${port}`);