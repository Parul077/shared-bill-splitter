import { describe, expect, it } from 'vitest'
import { call, createBill, createHome } from './helpers'

describe('list bills', () => {
  it('returns all bills with their shares', async () => {
    const { homeId, members } = await createHome(['Asha', 'Ben'])

    await createBill(homeId, 1000)
    await createBill(homeId, 2000)

    const response = await call<{
      bills: {
        id: string
        title: string
        totalCents: number
        shares: {
          memberId: string
          memberName: string
          amountCents: number
          paidAt: string | null
        }[]
      }[]
    }>('GET', `/api/homes/${homeId}/bills`)

    expect(response.status).toBe(200)
    expect(response.body.bills).toHaveLength(2)

    const bill = response.body.bills.find((item) => item.totalCents === 1000)

    expect(bill).toBeDefined()
    expect(bill?.shares).toHaveLength(2)
    expect(bill?.shares.map((share) => share.memberId)).toEqual(members.map((member) => member.id))
  })

  it('returns an empty array when there are no bills', async () => {
    const { homeId } = await createHome(['Asha'])

    const response = await call<{ bills: unknown[] }>('GET', `/api/homes/${homeId}/bills`)

    expect(response.status).toBe(200)
    expect(response.body.bills).toEqual([])
  })

  it('returns 404 when the home does not exist', async () => {
    const response = await call('GET', '/api/homes/does-not-exist/bills')

    expect(response.status).toBe(404)
  })
})
