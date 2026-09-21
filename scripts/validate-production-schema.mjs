import { execFileSync } from 'node:child_process';
import {
  EXPECTED_TABLES,
  PRODUCTION_DATABASE_NAME,
  assertProductionDatabaseConfig,
} from './production-database.mjs';

assertProductionDatabaseConfig();

const stdout = execFileSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  [
    'wrangler',
    'd1',
    'execute',
    PRODUCTION_DATABASE_NAME,
    '--env=',
    '--remote',
    '--json',
    '--command',
    "SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name;",
  ],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
);

const response = JSON.parse(stdout);
const rows = response.flatMap(({ results = [] }) => results);
const existingTables = new Set(rows.map(({ name }) => name));
const missingTables = EXPECTED_TABLES.filter((table) => !existingTables.has(table));

if (missingTables.length > 0) {
  throw new Error(`Production D1 is missing expected tables: ${missingTables.join(', ')}`);
}

console.log(`Validated ${EXPECTED_TABLES.length} project tables in ${PRODUCTION_DATABASE_NAME}.`);
