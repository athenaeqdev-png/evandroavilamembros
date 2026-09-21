import { execFileSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";

const database = process.env.ADMIN_DATABASE;
const remote = process.env.ADMIN_REMOTE === "true";

if (database !== "membros-preview" || !remote) {
  throw new Error("Este script só pode atualizar o D1 remoto membros-preview.");
}

const sql = `
UPDATE users
SET email = 'nutrievandroavila@gmail.com',
    phone = '+5511999332373',
    display_name = 'Evandro Ávila',
    updated_at = CURRENT_TIMESTAMP
WHERE role = 'admin'
  AND status = 'active'
  AND deleted_at IS NULL
  AND (
    SELECT COUNT(*)
    FROM users
    WHERE role = 'admin' AND status = 'active' AND deleted_at IS NULL
  ) = 1;
`;

const file = ".update-preview-admin.sql";
writeFileSync(file, sql, { mode: 0o600 });
try {
  const output = execFileSync(
    "npx",
    ["wrangler", "d1", "execute", database, "--remote", "--file", file, "--json"],
    { encoding: "utf8", stdio: ["inherit", "pipe", "inherit"] },
  );
  const results = JSON.parse(output);
  const result = Array.isArray(results) ? results[0] : results;

  if (!result?.success || result.meta?.changes !== 1) {
    throw new Error("A atualização exige exatamente um administrador ativo no preview.");
  }
} finally {
  rmSync(file, { force: true });
}
