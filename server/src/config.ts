import dotenv from 'dotenv'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const moduleDir = dirname(fileURLToPath(import.meta.url))
const candidates = [
  join(moduleDir, '..', '..', '.env'),
  join(moduleDir, '..', '.env'),
  join(moduleDir, '.env'),
  join(process.cwd(), '.env')
]
const envFile = candidates.find((path) => existsSync(path))
if (envFile) dotenv.config({ path: envFile, override: true })

function normalizeUrl(value: string): string {
  return value.replace(/\/+$/, '')
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  clientUrl: normalizeUrl(process.env.CLIENT_URL ?? 'http://localhost:5173'),
  supabaseUrl: process.env.SUPABASE_URL ?? '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  databaseUrl: process.env.DATABASE_URL ?? '',
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? '',
  currency: process.env.STRIPE_CURRENCY ?? 'inr',
  baseCurrency: 'usd',
  idempotencyRetentionSeconds: Number(process.env.IDEMPOTENCY_RETENTION_SECONDS ?? 25 * 60 * 60),
  fraud: {
    flagThreshold: Number(process.env.FRAUD_FLAG_THRESHOLD ?? 40),
    blockThreshold: Number(process.env.FRAUD_BLOCK_THRESHOLD ?? 60),
    largeTransferCents: Number(process.env.FRAUD_LARGE_TRANSFER_CENTS ?? 100000),
    velocityLimit: Number(process.env.FRAUD_VELOCITY_LIMIT ?? 5),
    velocityWindowMinutes: Number(process.env.FRAUD_VELOCITY_WINDOW_MINUTES ?? 10),
    dailyVolumeCents: Number(process.env.FRAUD_DAILY_VOLUME_CENTS ?? 200000),
    newRecipientAgeDays: Number(process.env.FRAUD_NEW_RECIPIENT_AGE_DAYS ?? 7),
    oddHoursStart: Number(process.env.FRAUD_ODD_HOURS_START ?? 1),
    oddHoursEnd: Number(process.env.FRAUD_ODD_HOURS_END ?? 5)
  }
}

export function assertConfig(): void {
  const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'DATABASE_URL', 'STRIPE_SECRET_KEY']
  const missing = required.filter((key) => !process.env[key])
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}. Set them in server/.env.`)
  }
}