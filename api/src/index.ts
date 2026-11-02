import { Hono } from 'hono'
import { cors } from 'hono/cors'

const app = new Hono<{ Bindings: Env }>()

app.use('/api/*', cors())

// Health check
app.get('/api/health', (c) => {
  return c.json({ status: 'ok' })
})

// List all homes
app.get('/api/homes', async (c) => {
  const result = await c.env.DB.prepare(
    `SELECT id, name, created_at AS createdAt
     FROM homes
     ORDER BY created_at DESC`,
  ).all<{ id: string; name: string; createdAt: string }>()

  return c.json({ homes: result.results })
})

// Get a specific home by ID
app.get('/api/homes/:homeId', async (c) => {
  const homeId = c.req.param('homeId')

  const home = await c.env.DB.prepare(
    `SELECT id, name, created_at AS createdAt
     FROM homes
     WHERE id = ?`,
  )
    .bind(homeId)
    .first<{ id: string; name: string; createdAt: string }>()

  if (!home) {
    return c.json({ error: 'Home not found' }, 404)
  }

  return c.json(home)
})

// Create a home
app.post('/api/homes', async (c) => {
  const body = (await c.req.json().catch(() => null)) as {
    name?: unknown
  } | null

  if (typeof body?.name !== 'string' || !body.name.trim()) {
    return c.json({ error: 'A valid home name is required' }, 422)
  }

  const id = crypto.randomUUID()
  const name = body.name.trim()

  await c.env.DB.prepare('INSERT INTO homes (id, name) VALUES (?, ?)').bind(id, name).run()

  return c.json({ id, name }, 201)
})

// Get all members for a home
app.get('/api/homes/:homeId/members', async (c) => {
  const homeId = c.req.param('homeId')

  const home = await c.env.DB.prepare('SELECT id FROM homes WHERE id = ?')
    .bind(homeId)
    .first<{ id: string }>()

  if (!home) {
    return c.json({ error: 'Home not found' }, 404)
  }

  const members = await c.env.DB.prepare(
    `SELECT id, home_id AS homeId, name, position, created_at AS createdAt
     FROM members
     WHERE home_id = ?
     ORDER BY position ASC`,
  )
    .bind(homeId)
    .all<{
      id: string
      homeId: string
      name: string
      position: number
      createdAt: string
    }>()

  return c.json({ members: members.results })
})

// Add a member to a home
app.post('/api/homes/:homeId/members', async (c) => {
  const homeId = c.req.param('homeId')

  const body = (await c.req.json().catch(() => null)) as {
    name?: unknown
  } | null

  if (typeof body?.name !== 'string' || !body.name.trim()) {
    return c.json({ error: 'A valid member name is required' }, 422)
  }

  const home = await c.env.DB.prepare('SELECT id FROM homes WHERE id = ?')
    .bind(homeId)
    .first<{ id: string }>()

  if (!home) {
    return c.json({ error: 'Home not found' }, 404)
  }

  const result = await c.env.DB.prepare(
    `SELECT COALESCE(MAX(position), -1) + 1 AS nextPosition
     FROM members
     WHERE home_id = ?`,
  )
    .bind(homeId)
    .first<{ nextPosition: number }>()

  const position = result?.nextPosition ?? 0
  const id = crypto.randomUUID()
  const name = body.name.trim()

  await c.env.DB.prepare(
    `INSERT INTO members (id, home_id, name, position)
     VALUES (?, ?, ?, ?)`,
  )
    .bind(id, homeId, name, position)
    .run()

  return c.json({ id, homeId, name }, 201)
})

// Create a bill and automatically split it between home members
app.post('/api/homes/:homeId/bills', async (c) => {
  const homeId = c.req.param('homeId')

  const body = (await c.req.json().catch(() => null)) as {
    title?: unknown
    totalCents?: unknown
  } | null

  if (
    typeof body?.title !== 'string' ||
    !body.title.trim() ||
    typeof body.totalCents !== 'number' ||
    !Number.isSafeInteger(body.totalCents) ||
    body.totalCents <= 0
  ) {
    return c.json({ error: 'A valid title and positive integer totalCents are required' }, 422)
  }

  // Check that the home exists
  const home = await c.env.DB.prepare('SELECT id FROM homes WHERE id = ?')
    .bind(homeId)
    .first<{ id: string }>()

  if (!home) {
    return c.json({ error: 'Home not found' }, 404)
  }

  // Retrieve members in the order they were added
  const members = await c.env.DB.prepare(
    `SELECT id, name
     FROM members
     WHERE home_id = ?
     ORDER BY position ASC`,
  )
    .bind(homeId)
    .all<{ id: string; name: string }>()

  if (members.results.length === 0) {
    return c.json({ error: 'Cannot create a bill without members' }, 422)
  }

  const title = body.title.trim()
  const totalCents = body.totalCents
  const billId = crypto.randomUUID()
  const memberCount = members.results.length

  // Split every cent without losing any remainder
  const baseAmount = Math.floor(totalCents / memberCount)
  const remainder = totalCents % memberCount

  const shares = members.results.map((member, index) => ({
    id: crypto.randomUUID(),
    memberId: member.id,
    amountCents: baseAmount + (index < remainder ? 1 : 0),
    paidAt: null,
  }))

  // Insert the bill and all its shares atomically
  const statements = [
    c.env.DB.prepare(
      `INSERT INTO bills (id, home_id, title, total_cents)
       VALUES (?, ?, ?, ?)`,
    ).bind(billId, homeId, title, totalCents),

    ...shares.map((share) =>
      c.env.DB.prepare(
        `INSERT INTO shares
         (id, bill_id, member_id, amount_cents)
         VALUES (?, ?, ?, ?)`,
      ).bind(share.id, billId, share.memberId, share.amountCents),
    ),
  ]

  await c.env.DB.batch(statements)

  return c.json(
    {
      id: billId,
      homeId,
      title,
      totalCents,
      shares,
    },
    201,
  )
})

// Get all bills and their shares for a home
app.get('/api/homes/:homeId/bills', async (c) => {
  const homeId = c.req.param('homeId')

  const home = await c.env.DB.prepare('SELECT id FROM homes WHERE id = ?')
    .bind(homeId)
    .first<{ id: string }>()

  if (!home) {
    return c.json({ error: 'Home not found' }, 404)
  }

  const result = await c.env.DB.prepare(
    `SELECT
       b.id AS billId,
       b.home_id AS homeId,
       b.title AS title,
       b.total_cents AS totalCents,
       b.created_at AS createdAt,
       s.id AS shareId,
       s.member_id AS memberId,
       m.name AS memberName,
       s.amount_cents AS amountCents,
       s.paid_at AS paidAt
     FROM bills b
     LEFT JOIN shares s ON s.bill_id = b.id
     LEFT JOIN members m ON m.id = s.member_id
     WHERE b.home_id = ?
     ORDER BY b.created_at DESC, m.position ASC`,
  )
    .bind(homeId)
    .all<{
      billId: string
      homeId: string
      title: string
      totalCents: number
      createdAt: string
      shareId: string | null
      memberId: string | null
      memberName: string | null
      amountCents: number | null
      paidAt: string | null
    }>()

  const billsMap = new Map<
    string,
    {
      id: string
      homeId: string
      title: string
      totalCents: number
      createdAt: string
      shares: {
        id: string
        memberId: string
        memberName: string
        amountCents: number
        paidAt: string | null
      }[]
    }
  >()

  for (const row of result.results) {
    if (!billsMap.has(row.billId)) {
      billsMap.set(row.billId, {
        id: row.billId,
        homeId: row.homeId,
        title: row.title,
        totalCents: row.totalCents,
        createdAt: row.createdAt,
        shares: [],
      })
    }

    if (row.shareId && row.memberId && row.memberName !== null && row.amountCents !== null) {
      billsMap.get(row.billId)?.shares.push({
        id: row.shareId,
        memberId: row.memberId,
        memberName: row.memberName,
        amountCents: row.amountCents,
        paidAt: row.paidAt,
      })
    }
  }

  return c.json({
    bills: Array.from(billsMap.values()),
  })
})

// Pay a share with idempotency protection
app.post('/api/bills/:billId/shares/:shareId/pay', async (c) => {
  const billId = c.req.param('billId')
  const shareId = c.req.param('shareId')

  const idempotencyKey = c.req.header('Idempotency-Key')?.trim()

  if (!idempotencyKey) {
    return c.json({ error: 'Idempotency-Key header is required' }, 400)
  }

  // Check that the bill exists
  const bill = await c.env.DB.prepare('SELECT id FROM bills WHERE id = ?')
    .bind(billId)
    .first<{ id: string }>()

  if (!bill) {
    return c.json({ error: 'Bill not found' }, 404)
  }

  // Check that the share belongs to this bill
  const share = await c.env.DB.prepare(
    `SELECT id, member_id, amount_cents, paid_at, idempotency_key
     FROM shares
     WHERE id = ? AND bill_id = ?`,
  )
    .bind(shareId, billId)
    .first<{
      id: string
      member_id: string
      amount_cents: number
      paid_at: string | null
      idempotency_key: string | null
    }>()

  if (!share) {
    return c.json({ error: 'Share not found' }, 404)
  }

  // If already paid, allow retries with the same key
  if (share.paid_at !== null) {
    if (share.idempotency_key === idempotencyKey) {
      return c.json(
        {
          id: share.id,
          memberId: share.member_id,
          amountCents: share.amount_cents,
          paidAt: share.paid_at,
        },
        200,
      )
    }

    return c.json({ error: 'Share has already been paid' }, 409)
  }

  const paidAt = new Date().toISOString()

  // Conditional update prevents a second payment from winning
  const result = await c.env.DB.prepare(
    `UPDATE shares
     SET paid_at = ?, idempotency_key = ?
     WHERE id = ?
       AND bill_id = ?
       AND paid_at IS NULL`,
  )
    .bind(paidAt, idempotencyKey, shareId, billId)
    .run()

  if (result.meta.changes === 0) {
    // Another request may have paid the share concurrently.
    const current = await c.env.DB.prepare(
      `SELECT id, member_id, amount_cents, paid_at, idempotency_key
       FROM shares
       WHERE id = ? AND bill_id = ?`,
    )
      .bind(shareId, billId)
      .first<{
        id: string
        member_id: string
        amount_cents: number
        paid_at: string | null
        idempotency_key: string | null
      }>()

    if (current?.paid_at && current.idempotency_key === idempotencyKey) {
      return c.json(
        {
          id: current.id,
          memberId: current.member_id,
          amountCents: current.amount_cents,
          paidAt: current.paid_at,
        },
        200,
      )
    }

    return c.json({ error: 'Share has already been paid' }, 409)
  }

  return c.json(
    {
      id: share.id,
      memberId: share.member_id,
      amountCents: share.amount_cents,
      paidAt,
    },
    200,
  )
})

// Get outstanding balances for all members in a home
app.get('/api/homes/:homeId/balances', async (c) => {
  const homeId = c.req.param('homeId')

  // Check that the home exists
  const home = await c.env.DB.prepare('SELECT id FROM homes WHERE id = ?')
    .bind(homeId)
    .first<{ id: string }>()

  if (!home) {
    return c.json({ error: 'Home not found' }, 404)
  }

  // Calculate each member's unpaid shares
  const result = await c.env.DB.prepare(
    `SELECT
       m.id AS memberId,
       m.name AS name,
       COALESCE(
         SUM(
           CASE
             WHEN s.id IS NOT NULL AND s.paid_at IS NULL THEN s.amount_cents
             ELSE 0
           END
         ),
         0
       ) AS outstandingCents
     FROM members m
     LEFT JOIN bills b
       ON b.home_id = m.home_id
     LEFT JOIN shares s
       ON s.bill_id = b.id
       AND s.member_id = m.id
     WHERE m.home_id = ?
     GROUP BY m.id, m.name, m.position
     ORDER BY m.position ASC`,
  )
    .bind(homeId)
    .all<{
      memberId: string
      name: string
      outstandingCents: number
    }>()

  return c.json(
    {
      balances: result.results,
    },
    200,
  )
})

export default app
