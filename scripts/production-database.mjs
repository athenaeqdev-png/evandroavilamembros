import fs from 'node:fs';

export const PRODUCTION_DATABASE_NAME = 'membros-producao';
export const PRODUCTION_DATABASE_ID = '21fcb86e-cf42-473e-bced-91b5f8228cfd';

export const EXPECTED_TABLES = [
  'announcements',
  'conversation_participants',
  'conversations',
  'courses',
  'email_verifications',
  'enrollments',
  'lesson_materials',
  'lesson_progress',
  'lessons',
  'message_attachments',
  'message_reads',
  'messages',
  'modules',
  'notifications',
  'password_resets',
  'sessions',
  'subscriptions',
  'users',
];

export function assertProductionDatabaseConfig() {
  const config = JSON.parse(fs.readFileSync('wrangler.jsonc', 'utf8'));
  const databases = config.d1_databases ?? [];
  const production = databases.find(({ binding }) => binding === 'DB');

  if (
    databases.length !== 1 ||
    production?.database_name !== PRODUCTION_DATABASE_NAME ||
    production?.database_id !== PRODUCTION_DATABASE_ID
  ) {
    throw new Error(
      `Production DB must point exclusively to ${PRODUCTION_DATABASE_NAME} (${PRODUCTION_DATABASE_ID})`,
    );
  }

  const previewDatabases = config.env?.preview?.d1_databases ?? [];
  if (
    previewDatabases.some(
      ({ database_name, database_id }) =>
        database_name === PRODUCTION_DATABASE_NAME || database_id === PRODUCTION_DATABASE_ID,
    )
  ) {
    throw new Error('Preview must not reference the production D1 database');
  }
}
