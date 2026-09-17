import 'dotenv/config'
import { pool, supabaseAdmin } from '../src/db.js'

async function ensureUser(email: string, password: string, name: string) {
  const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: name }
  })
  if (error) {
    const { data: users } = await supabaseAdmin.auth.admin.listUsers()
    const existing = users.users.find((user) => user.email === email)
    if (!existing) {
      throw error
    }
    return existing
  }
  return created.user
}

async function seedHistory(userId: string) {
  const { rows } = await pool.query('select count(*)::int as n from transactions where user_id = $1', [userId])
  if (rows[0].n > 0) {
    return
  }

  await pool.query(
    `insert into transactions (user_id, type, amount, status, counterparty, reference, metadata, created_at)
     select $1, 'deposit', (5000 + gs * 1500)::bigint, 'completed', 'card', 'seed_deposit_' || gs, '{}'::jsonb,
            now() - make_interval(days => gs)
     from generate_series(1, 6) as gs`,
    [userId]
  )

  await pool.query(
    `insert into transactions (user_id, type, amount, status, counterparty, reference, metadata, created_at)
     select $1, 'transfer_out', (800 + gs * 350)::bigint, 'completed', $2, 'seed_transfer_' || gs, '{}'::jsonb,
            now() - make_interval(days => gs)
     from generate_series(1, 4) as gs`,
    [userId, 'friend@wallet.local']
  )

  await pool.query(
    `insert into transactions (user_id, type, amount, status, counterparty, reference, metadata, created_at)
     values ($1, 'withdrawal', 10000, 'completed', 'bank transfer', 'seed_withdrawal_1', '{}'::jsonb, now() - interval '10 days')`,
    [userId]
  )
}

async function seedAlerts(userId: string) {
  const { rows } = await pool.query('select count(*)::int as n from alerts where user_id = $1', [userId])
  if (rows[0].n > 0) {
    return
  }

  await pool.query(
    `insert into alerts (user_id, type, severity, message, payload, read, created_at) values
     ($1, 'transfer_flagged', 'high', 'Rs. 8,000.00 sent to someone you do not usually send to — this payment is being looked at', '{"rule":"new_recipient"}', false, now() - interval '6 days'),
     ($1, 'new_device_login', 'medium', 'Sign-in from a device we have not seen for this wallet before', '{"ip":"203.0.113.42"}', false, now() - interval '4 days'),
     ($1, 'transfer_blocked', 'critical', 'We stopped a transfer of Rs. 12,500.00 for your safety', '{"rule":"large_transfer"}', true, now() - interval '2 days')`,
    [userId]
  )
}

async function reconcileBalances(userIds: string[]) {
  const net = await pool.query(
    `select user_id,
            coalesce(sum(
              case
                when type in ('deposit', 'transfer_in', 'refund') and status in ('completed', 'flagged') then amount
                when type in ('withdrawal', 'transfer_out') and status in ('completed', 'flagged') then -amount
                else 0
              end
            ), 0)::bigint as net
     from transactions
     where user_id = any($1)
     group by user_id`,
    [userIds]
  )
  for (const row of net.rows) {
    await pool.query('update wallets set balance = $2, updated_at = now() where user_id = $1', [row.user_id, row.net])
  }
}

async function main() {
  const demoEmail = process.env.SEED_DEMO_EMAIL ?? 'demo@wallet.local'
  const friendEmail = process.env.SEED_FRIEND_EMAIL ?? 'friend@wallet.local'
  const password = process.env.SEED_PASSWORD ?? 'demo1234'

  const demo = await ensureUser(demoEmail, password, 'Dhruv Kumar Pandit')
  const friend = await ensureUser(friendEmail, password, 'Albert Einstien')

  await seedHistory(demo.id)
  await seedHistory(friend.id)
  await seedAlerts(demo.id)
  await reconcileBalances([demo.id, friend.id])

  console.log('')
  console.log('Seed complete')
  console.log(`Demo sign-in:   ${demoEmail} / ${password}`)
  console.log(`Friend sign-in: ${friendEmail} / ${password}`)
  console.log('The friend user can be used as a transfer recipient.')

  await pool.end()
}

main().catch(async (error) => {
  console.error(error)
  await pool.end().catch(() => {})
  process.exit(1)
})