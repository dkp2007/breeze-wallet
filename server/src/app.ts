import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import { rateLimit } from 'express-rate-limit'
import { config } from './config.js'
import { idempotencyGuard, startKeyCleanup } from './lib/idempotency.js'
import { errorHandler } from './middleware/error.js'
import webhookRouter from './routes/webhooks.js'
import meRouter from './routes/me.js'
import walletRouter from './routes/wallet.js'
import transferRouter from './routes/transfers.js'
import depositRouter from './routes/deposits.js'
import withdrawalRouter from './routes/withdrawals.js'
import bankRouter from './routes/bank.js'
import accountRouter from './routes/account.js'
import alertRouter from './routes/alerts.js'
import analyticsRouter from './routes/analytics.js'
import fxRouter from './routes/fx.js'
import sessionsRouter from './routes/sessions.js'
import exportRouter from './routes/export.js'

let cleanupStarted = false

export function createApp() {
  const app = express()

  app.set('trust proxy', 1)
  app.use(helmet())
  app.use(cors({ origin: config.clientUrl }))

  const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: 'draft-7', legacyHeaders: false })
  const transferLimiter = rateLimit({ windowMs: 60 * 1000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false })

  app.get('/health', (req, res) => {
    res.json({ ok: true })
  })

  app.use('/api/webhooks', webhookRouter)
  app.use(express.json())
  app.use('/api/transfers', transferLimiter)
  app.use(
    '/api',
    apiLimiter,
    meRouter,
    walletRouter,
    transferRouter,
    depositRouter,
    withdrawalRouter,
    bankRouter,
    accountRouter,
    alertRouter,
    analyticsRouter,
    fxRouter,
    sessionsRouter,
    exportRouter
  )

  app.use(errorHandler)

  return app
}

export function startBackgroundJobs(): void {
  if (!cleanupStarted) {
    startKeyCleanup()
    cleanupStarted = true
  }
}