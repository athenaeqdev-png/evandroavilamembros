import { pbkdf2Sync, randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const productionDatabase = "membros-producao";
const productionDatabaseId = "21fcb86e-cf42-473e-bced-91b5f8228cfd";
const config = JSON.parse(readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
const productionBinding = config.d1_databases?.find(({ binding }) => binding === "DB");
const previewBinding = config.env?.preview?.d1_databases?.find(({ binding }) => binding === "DB");

if (productionBinding?.database_name !== productionDatabase || productionBinding?.database_id !== productionDatabaseId) {
  throw new Error("O binding DB de produção não corresponde ao banco de produção esperado.");
}
if (previewBinding?.database_name === productionDatabase || previewBinding?.database_id === productionDatabaseId) {
  throw new Error("O banco de preview não está isolado do banco de produção.");
}

const phoneInput = process.env.ADMIN_PHONE?.trim() || "";
const phoneDigits = phoneInput.replace(/\D/g, "");
const phone = !phoneInput ? null : phoneDigits.length === 11 ? `+55${phoneDigits}` : phoneDigits.startsWith("55") ? `+${phoneDigits}` : "";
const email = process.env.ADMIN_EMAIL?.trim().toLowerCase() || "";
const password = process.env.ADMIN_PASSWORD;
const name = process.env.ADMIN_NAME?.trim() || "Administrador";
const pepper = process.env.PASSWORD_PEPPER;

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Defina ADMIN_EMAIL com um endereço válido.");
if (phoneInput && !phone) throw new Error("ADMIN_PHONE deve conter um telefone brasileiro válido quando informado.");
if (!password || password.length < 12 || password.length > 128) throw new Error("Defina ADMIN_PASSWORD com 12 a 128 caracteres.");
if (!pepper) throw new Error("Defina PASSWORD_PEPPER com o mesmo secret configurado no Worker de produção.");

const salt = randomBytes(16);
// Keep this within the Cloudflare Workers Web Crypto PBKDF2 limit.
const iterations = 100000;
const hash = pbkdf2Sync(password + pepper, salt, iterations, 32, "sha256").toString("base64");
const parameters = JSON.stringify({ iterations, salt: salt.toString("base64") });
const now = new Date().toISOString();
const quote = (value) => value === null ? "NULL" : `'${String(value).replaceAll("'", "''")}'`;
const values = [randomUUID(), email, phone, hash, "pbkdf2-sha256", parameters, "admin", "active", 1, name, now, now, now].map(quote).join(",");
const sql = `INSERT INTO users(id,email,phone,password_hash,password_algorithm,password_parameters,role,status,must_change_password,display_name,email_verified_at,created_at,updated_at) VALUES (${values})
ON CONFLICT(email) DO UPDATE SET
  phone=COALESCE(excluded.phone,users.phone),
  password_hash=excluded.password_hash,
  password_algorithm=excluded.password_algorithm,
  password_parameters=excluded.password_parameters,
  role='admin',
  status='active',
  must_change_password=1,
  display_name=excluded.display_name,
  email_verified_at=COALESCE(users.email_verified_at,excluded.email_verified_at),
  updated_at=excluded.updated_at,
  deleted_at=NULL;\n`;

const directory = mkdtempSync(join(tmpdir(), "membros-production-admin-"));
const file = join(directory, "provision.sql");
writeFileSync(file, sql, { mode: 0o600 });

// Do not expose either secret to Wrangler or its subprocesses. Only the derived hash
// is written to a permission-restricted temporary file, which is always removed.
const childEnvironment = { ...process.env };
delete childEnvironment.ADMIN_PASSWORD;
delete childEnvironment.PASSWORD_PEPPER;

try {
  execFileSync("npx", ["wrangler", "d1", "execute", productionDatabase, "--env=", "--remote", "--file", file], {
    env: childEnvironment,
    stdio: "inherit",
  });
} finally {
  rmSync(directory, { recursive: true, force: true });
}
