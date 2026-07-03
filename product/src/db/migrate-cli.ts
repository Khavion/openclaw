import 'dotenv/config';
import { loadConfig } from '../config.js';
import { migrate } from './migrate.js';

const cfg = loadConfig();
const applied = await migrate(cfg.DATABASE_URL);
console.log(applied.length ? `applied: ${applied.join(', ')}` : 'schema up to date');
