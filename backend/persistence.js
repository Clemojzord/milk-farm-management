const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

function shouldUsePostgres() {
  return Boolean(process.env.POSTGRES_URL || process.env.DATABASE_URL);
}

async function getSql() {
  // Lazy require so local dev without deps still works when not using Postgres.
  // eslint-disable-next-line global-require
  const { sql } = require('@vercel/postgres');
  return sql;
}

async function ensureTables(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS app_state (
      id INT PRIMARY KEY,
      state JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS auth_store (
      id INT PRIMARY KEY,
      store JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;
}

async function ensureStateRow({ createEmptyState }) {
  const sql = await getSql();
  await ensureTables(sql);

  const result = await sql`SELECT state FROM app_state WHERE id = 1;`;
  if (result.rowCount > 0) return;

  await sql`
    INSERT INTO app_state (id, state, updated_at)
    VALUES (1, ${createEmptyState()}, NOW());
  `;
}

async function ensureAuthRow({ createDefaultAuthStore }) {
  const sql = await getSql();
  await ensureTables(sql);

  const result = await sql`SELECT store FROM auth_store WHERE id = 1;`;
  if (result.rowCount > 0) return { created: false };

  const initial = createDefaultAuthStore();
  await sql`
    INSERT INTO auth_store (id, store, updated_at)
    VALUES (1, ${initial}, NOW());
  `;
  return { created: true };
}

async function readStatePostgres({ normalizeState, createEmptyState }) {
  const sql = await getSql();
  await ensureStateRow({ createEmptyState });
  const result = await sql`SELECT state FROM app_state WHERE id = 1;`;
  const raw = result.rows?.[0]?.state ?? createEmptyState();
  return normalizeState(raw);
}

async function writeStatePostgres({ normalizeState }, state) {
  const sql = await getSql();
  const next = normalizeState(state);
  next.updatedAt = new Date().toISOString();

  await ensureTables(sql);
  await sql`
    INSERT INTO app_state (id, state, updated_at)
    VALUES (1, ${next}, NOW())
    ON CONFLICT (id) DO UPDATE SET
      state = EXCLUDED.state,
      updated_at = NOW();
  `;

  return next;
}

async function readAuthPostgres({ normalizeAuthStore, createDefaultAuthStore }) {
  const sql = await getSql();
  await ensureAuthRow({ createDefaultAuthStore });
  const result = await sql`SELECT store FROM auth_store WHERE id = 1;`;
  const raw = result.rows?.[0]?.store ?? createDefaultAuthStore();
  return normalizeAuthStore(raw);
}

async function writeAuthPostgres({ normalizeAuthStore }, store) {
  const sql = await getSql();
  const next = normalizeAuthStore(store);
  next.updatedAt = new Date().toISOString();

  await ensureTables(sql);
  await sql`
    INSERT INTO auth_store (id, store, updated_at)
    VALUES (1, ${next}, NOW())
    ON CONFLICT (id) DO UPDATE SET
      store = EXCLUDED.store,
      updated_at = NOW();
  `;

  return next;
}

function getLocalDataDir() {
  if (process.env.VERCEL) {
    return path.join(os.tmpdir(), 'milk-farm-api-data');
  }
  return path.join(__dirname, 'data');
}

async function ensureLocalJsonFile(filePath, initialValue) {
  try {
    await fs.access(filePath);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(initialValue, null, 2), 'utf8');
  }
}

module.exports = {
  shouldUsePostgres,
  ensureStateRow,
  ensureAuthRow,
  readStatePostgres,
  writeStatePostgres,
  readAuthPostgres,
  writeAuthPostgres,
  getLocalDataDir,
  ensureLocalJsonFile,
};
