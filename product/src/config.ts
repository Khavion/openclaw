import { z } from 'zod';

// Central typed view of the environment. Everything optional here is checked
// again at the point of use so offline dev/test works with a minimal env.
const EnvSchema = z.object({
  DATABASE_URL: z.string().default('postgres://localhost:5432/khavion_dev'),
  KHAVION_MASTER_KEY: z
    .string()
    .regex(/^[0-9a-f]{64}$/i, 'KHAVION_MASTER_KEY must be 64 hex chars (32 bytes)'),
  PORT: z.coerce.number().int().positive().default(3000),
  APP_MODE: z.enum(['mock', 'real']).default('mock'),
  HEALTHCHECKS_PING_URL: z.string().url().optional(),
  GHL_CLIENT_ID: z.string().optional(),
  GHL_CLIENT_SECRET: z.string().optional(),
  GHL_REDIRECT_URI: z.string().url().default('http://localhost:3000/oauth/callback')
});

export type AppConfig = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const cleaned = Object.fromEntries(
    Object.entries(env).filter(([, v]) => v !== undefined && v !== '')
  );
  return EnvSchema.parse(cleaned);
}
