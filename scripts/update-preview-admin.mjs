import { execFileSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";

const database = process.env.ADMIN_DATABASE;
const remote = process.env.ADMIN_REMOTE === "true";

if (database !== "membros-preview" || !remote) {
  throw new Error("Este script só pode atualizar o D1 remoto membros-preview.");
}

const sql = `
UPDATE users
SET email = 'nutrievandroavila@gmail.com'
WHERE role = 'admin'
  AND deleted_at IS NULL
  AND email <> 'nutrievandroavila@gmail.com'
  AND (SELECT COUNT(*) FROM users WHERE role = 'admin' AND deleted_at IS NULL) = 1;
`;

const file = ".update-preview-admin.sql";
writeFileSync(file, sql, { mode: 0o600 });
try {
  execFileSync("npx", ["wrangler", "d1", "execute", database, "--remote", "--file", file], { stdio: "inherit" });
} finally {
  rmSync(file, { force: true });
}
