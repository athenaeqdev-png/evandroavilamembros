import { execFileSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";

const database = process.env.ADMIN_DATABASE;
const remote = process.env.ADMIN_REMOTE === "true";

if (database !== "membros-preview" || !remote) {
  throw new Error("Este script só pode atualizar o D1 remoto membros-preview.");
}

const sql = `
CREATE TEMP TABLE preview_admin_guard (valid INTEGER NOT NULL CHECK (valid = 1));
INSERT INTO preview_admin_guard
SELECT CASE WHEN COUNT(*) = 1 AND MIN(status) = 'active' THEN 1 ELSE 0 END
FROM users
WHERE role = 'admin' AND deleted_at IS NULL;

UPDATE users
SET email = 'nutrievandroavila@gmail.com',
    phone = '+5511999332373',
    display_name = 'Evandro Ávila',
    updated_at = CURRENT_TIMESTAMP
WHERE role = 'admin' AND status = 'active' AND deleted_at IS NULL;

DELETE FROM preview_admin_guard;
INSERT INTO preview_admin_guard
SELECT CASE WHEN COUNT(*) = 1 THEN 1 ELSE 0 END
FROM users
WHERE email = 'nutrievandroavila@gmail.com'
  AND phone = '+5511999332373'
  AND display_name = 'Evandro Ávila'
  AND role = 'admin'
  AND status = 'active'
  AND deleted_at IS NULL;
`;

const file = ".update-preview-admin.sql";
writeFileSync(file, sql, { mode: 0o600 });
try {
  execFileSync("npx", ["wrangler", "d1", "execute", database, "--remote", "--file", file], { stdio: "inherit" });
} finally {
  rmSync(file, { force: true });
}
