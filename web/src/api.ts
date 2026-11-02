export type Home = {
  id: string
  name: string
  createdAt?: string
}

export type Member = {
  id: string
  homeId: string
  name: string
  position?: number
  createdAt?: string
}

export type Share = {
  id: string
  memberId: string
  memberName: string
  amountCents: number
  paidAt: string | null
}

export type Bill = {
  id: string
  homeId: string
  title: string
  totalCents: number
  createdAt: string
  shares: Share[]
}

export type Balance = {
  memberId: string
  name: string
  outstandingCents: number
}

export type ApiError = {
  error?: string
}

export async function apiRequest<T>(url: string, options: RequestInit = {}): Promise<T> {
  let response: Response

  try {
    response = await fetch(url, options)
  } catch {
    throw new Error(
      'Cannot connect to the backend. Make sure the API server is running on port 8787.',
    )
  }

  const responseText = await response.text()
  let data: unknown = null

  if (responseText) {
    try {
      data = JSON.parse(responseText)
    } catch {
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}.`)
      }
      throw new Error('The server returned an invalid response format.')
    }
  }

  if (!response.ok) {
    const apiError = data as ApiError | null
    throw new Error(apiError?.error || `Request failed with status ${response.status}.`)
  }

  if (data === null) {
    throw new Error('The server returned an empty response.')
  }

  return data as T
}

export const api = {
  async getHomes(): Promise<Home[]> {
    const data = await apiRequest<{ homes: Home[] }>('/api/homes')
    return data.homes
  },

  async getHome(homeId: string): Promise<Home> {
    return apiRequest<Home>(`/api/homes/${encodeURIComponent(homeId)}`)
  },

  async createHome(name: string): Promise<Home> {
    return apiRequest<Home>('/api/homes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
  },

  async getMembers(homeId: string): Promise<Member[]> {
    const data = await apiRequest<{ members: Member[] }>(
      `/api/homes/${encodeURIComponent(homeId)}/members`,
    )
    return data.members
  },

  async addMember(homeId: string, name: string): Promise<Member> {
    return apiRequest<Member>(`/api/homes/${encodeURIComponent(homeId)}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
  },

  async getBills(homeId: string): Promise<Bill[]> {
    const data = await apiRequest<{ bills: Bill[] }>(
      `/api/homes/${encodeURIComponent(homeId)}/bills`,
    )
    return data.bills
  },

  async createBill(homeId: string, title: string, totalCents: number): Promise<Bill> {
    return apiRequest<Bill>(`/api/homes/${encodeURIComponent(homeId)}/bills`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, totalCents }),
    })
  },

  async payShare(
    billId: string,
    shareId: string,
    idempotencyKey: string,
  ): Promise<{
    id: string
    memberId: string
    amountCents: number
    paidAt: string
  }> {
    return apiRequest<{
      id: string
      memberId: string
      amountCents: number
      paidAt: string
    }>(`/api/bills/${encodeURIComponent(billId)}/shares/${encodeURIComponent(shareId)}/pay`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
    })
  },

  async getBalances(homeId: string): Promise<Balance[]> {
    const data = await apiRequest<{ balances: Balance[] }>(
      `/api/homes/${encodeURIComponent(homeId)}/balances`,
    )
    return data.balances
  },
}
