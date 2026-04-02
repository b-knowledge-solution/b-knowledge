/**
 * @fileoverview Knex configuration used by the CLI (`npx knex`) and knex-based tooling.
 *
 * Exports a single configuration object that wires PostgreSQL connection
 * settings from the centralized `config` module and resolves migration/seed
 * directories relative to this file so they work in both TypeScript (tsx) and
 * compiled JavaScript (dist/) environments.
 *
 * @module db/knexfile
 */
import { fileURLToPath } from 'url';
import { dirname, join, extname } from 'path';
import { config } from '../config/index.js';

/** ESM-compatible __filename resolution */
const __filename = fileURLToPath(import.meta.url);
/** ESM-compatible __dirname resolution */
const __dirname = dirname(__filename);
/** Detect current file extension to load .ts or .js migrations accordingly */
const ext = extname(__filename).slice(1); // 'ts' or 'js'

/**
 * @description Default Knex configuration for PostgreSQL with migration and seed paths.
 * @type {import('knex').Knex.Config}
 */
const dbConfig = {
  client: 'postgresql',
  connection: {
    host: config.database.host,
    port: config.database.port,
    user: config.database.user,
    password: config.database.password,
    database: config.database.name,
  },
  migrations: {
    directory: join(__dirname, 'migrations'),
    extension: ext,
    loadExtensions: [`.${ext}`],
  },
  seeds: {
    directory: join(__dirname, 'seeds'),
    extension: ext,
    loadExtensions: [`.${ext}`],
  },
};

export default dbConfig;
