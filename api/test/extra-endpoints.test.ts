import { describe, expect, it } from 'vitest'
import { type Balance, call, createBill, createHome, type Member } from './helpers'

describe('extended home and member endpoints', () => {
  it('lists all homes', async () => {
    const { homeId } = await createHome(['Asha'])
    const response = await call<{ homes: { id: string; name: string }[] }>('GET', '/api/homes')

    expect(response.status).toBe(200)
    expect(Array.isArray(response.body.homes)).toBe(true)
    const found = response.body.homes.find((h) => h.id === homeId)
    expect(found).toBeDefined()
    expect(found?.name).toBe('Test home')
  })

  it('retrieves a home by id', async () => {
    const { homeId } = await createHome(['Asha'])
    const response = await call<{ id: string; name: string }>('GET', `/api/homes/${homeId}`)

    expect(response.status).toBe(200)
    expect(response.body.id).toBe(homeId)
    expect(response.body.name).toBe('Test home')
  })

  it('returns 404 when getting a non-existent home by id', async () => {
    const response = await call('GET', '/api/homes/non-existent-id')
    expect(response.status).toBe(404)
  })

  it('retrieves members of a home in position order', async () => {
    const { homeId, members } = await createHome(['Asha', 'Ben', 'Chitra'])
    const response = await call<{ members: Member[] }>('GET', `/api/homes/${homeId}/members`)

    expect(response.status).toBe(200)
    expect(response.body.members).toHaveLength(3)
    expect(response.body.members.map((m) => m.name)).toEqual(['Asha', 'Ben', 'Chitra'])
    expect(response.body.members.map((m) => m.id)).toEqual(members.map((m) => m.id))
  })

  it('returns 404 when getting members for a non-existent home', async () => {
    const response = await call('GET', '/api/homes/non-existent-id/members')
    expect(response.status).toBe(404)
  })

  it('rejects creating a home with an empty or whitespace name', async () => {
    const emptyRes = await call('POST', '/api/homes', { body: { name: '' } })
    expect(emptyRes.status).toBe(422)

    const whitespaceRes = await call('POST', '/api/homes', { body: { name: '   ' } })
    expect(whitespaceRes.status).toBe(422)

    const missingRes = await call('POST', '/api/homes', { body: {} })
    expect(missingRes.status).toBe(422)
  })

  it('rejects adding a member with empty or whitespace name', async () => {
    const { homeId } = await createHome(['Asha'])
    const emptyRes = await call('POST', `/api/homes/${homeId}/members`, { body: { name: '' } })
    expect(emptyRes.status).toBe(422)

    const whitespaceRes = await call('POST', `/api/homes/${homeId}/members`, {
      body: { name: '   ' },
    })
    expect(whitespaceRes.status).toBe(422)
  })

  it('rejects creating a bill with empty or whitespace title', async () => {
    const { homeId } = await createHome(['Asha'])
    const emptyRes = await call('POST', `/api/homes/${homeId}/bills`, {
      body: { title: '   ', totalCents: 1000 },
    })
    expect(emptyRes.status).toBe(422)
  })

  it('calculates zero balance when all shares are paid', async () => {
    const { homeId, members } = await createHome(['Asha', 'Ben'])
    const bill = await createBill(homeId, 1000)
    const shares = bill.body.shares

    for (const share of shares) {
      await call('POST', `/api/bills/${bill.body.id}/shares/${share.id}/pay`, {
        headers: { 'Idempotency-Key': crypto.randomUUID() },
      })
    }

    const balances = await call<{ balances: Balance[] }>('GET', `/api/homes/${homeId}/balances`)
    expect(balances.status).toBe(200)
    expect(balances.body.balances).toEqual([
      { memberId: members[0]?.id, name: 'Asha', outstandingCents: 0 },
      { memberId: members[1]?.id, name: 'Ben', outstandingCents: 0 },
    ])
  })
})
