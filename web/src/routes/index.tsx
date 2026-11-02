import { createFileRoute } from '@tanstack/react-router'
import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { api, type Balance, type Bill, type Home, type Member } from '../api'
import './styles.css'

export const Route = createFileRoute('/')({
  component: HomePage,
})

const STORAGE_KEY = 'bill_splitter_home_id'

function formatMoney(amountCents: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format(amountCents / 100)
}

function HomePage() {
  const [home, setHome] = useState<Home | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [bills, setBills] = useState<Bill[]>([])
  const [balances, setBalances] = useState<Balance[]>([])
  const [availableHomes, setAvailableHomes] = useState<Home[]>([])

  // Setup view state
  const [setupTab, setSetupTab] = useState<'create' | 'existing'>('create')
  const [homeName, setHomeName] = useState('')
  const [selectedHomeIdInput, setSelectedHomeIdInput] = useState('')

  // Workspace forms
  const [memberName, setMemberName] = useState('')
  const [billTitle, setBillTitle] = useState('')
  const [billAmount, setBillAmount] = useState('')

  // UI state
  const [initialLoading, setInitialLoading] = useState(true)
  const [loading, setLoading] = useState(false)
  const [payingShareId, setPayingShareId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [copiedId, setCopiedId] = useState(false)

  // Load home and its related data by ID
  const loadHomeData = useCallback(async (homeId: string, showSuccessMessage = false) => {
    setLoading(true)
    setError('')
    try {
      const [fetchedHome, fetchedMembers, fetchedBills, fetchedBalances] = await Promise.all([
        api.getHome(homeId),
        api.getMembers(homeId),
        api.getBills(homeId),
        api.getBalances(homeId),
      ])

      setHome(fetchedHome)
      setMembers(fetchedMembers)
      setBills(fetchedBills)
      setBalances(fetchedBalances)
      localStorage.setItem(STORAGE_KEY, fetchedHome.id)

      if (showSuccessMessage) {
        setSuccess(`Loaded home "${fetchedHome.name}".`)
      }
    } catch (err) {
      localStorage.removeItem(STORAGE_KEY)
      setHome(null)
      setError(
        err instanceof Error
          ? err.message
          : 'Could not restore home. Please select or create a home.',
      )
    } finally {
      setLoading(false)
      setInitialLoading(false)
    }
  }, [])

  // Refresh homes list
  const refreshHomesList = useCallback(async () => {
    try {
      const homesList = await api.getHomes()
      setAvailableHomes(homesList)
    } catch {
      // Ignore initial home listing errors if backend starting up
    }
  }, [])

  // Initial mount: load available homes and restore saved home if any
  useEffect(() => {
    async function init() {
      await refreshHomesList()
      const savedHomeId = localStorage.getItem(STORAGE_KEY)
      if (savedHomeId) {
        await loadHomeData(savedHomeId)
      } else {
        setInitialLoading(false)
      }
    }
    void init()
  }, [loadHomeData, refreshHomesList])

  // Create a new home
  async function handleCreateHome(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = homeName.trim()
    if (!trimmed) {
      setError('Please enter a valid home name.')
      return
    }

    setError('')
    setSuccess('')
    setLoading(true)

    try {
      const newHome = await api.createHome(trimmed)
      localStorage.setItem(STORAGE_KEY, newHome.id)
      setHome(newHome)
      setMembers([])
      setBills([])
      setBalances([])
      setHomeName('')
      setSuccess(`Home "${newHome.name}" has been created.`)
      void refreshHomesList()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create home.')
    } finally {
      setLoading(false)
    }
  }

  // Open existing home by selected ID or direct input
  async function handleOpenExistingHome(homeIdToOpen: string) {
    const trimmedId = homeIdToOpen.trim()
    if (!trimmedId) {
      setError('Please enter or select a Home ID.')
      return
    }
    await loadHomeData(trimmedId, true)
  }

  // Switch home
  function handleSwitchHome() {
    localStorage.removeItem(STORAGE_KEY)
    setHome(null)
    setMembers([])
    setBills([])
    setBalances([])
    setError('')
    setSuccess('')
    void refreshHomesList()
  }

  // Copy home ID to clipboard
  async function handleCopyHomeId() {
    if (!home) return
    try {
      await navigator.clipboard.writeText(home.id)
      setCopiedId(true)
      setTimeout(() => setCopiedId(false), 2000)
    } catch {
      // Fallback
    }
  }

  // Add member to current home
  async function handleAddMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!home) return

    const trimmed = memberName.trim()
    if (!trimmed) {
      setError('Please enter a valid member name.')
      return
    }

    setError('')
    setSuccess('')
    setLoading(true)

    try {
      const newMember = await api.addMember(home.id, trimmed)
      setMembers((prev) => [...prev, newMember])
      setMemberName('')
      setSuccess(`${newMember.name} has been added to ${home.name}.`)

      // Refresh balances so new member appears with 0 outstanding
      const updatedBalances = await api.getBalances(home.id)
      setBalances(updatedBalances)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add member.')
    } finally {
      setLoading(false)
    }
  }

  // Create and split a bill
  async function handleCreateBill(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!home) return

    setError('')
    setSuccess('')

    const trimmedTitle = billTitle.trim()
    if (!trimmedTitle) {
      setError('Please enter a valid bill title.')
      return
    }

    const amount = Number(billAmount)
    if (!Number.isFinite(amount) || amount <= 0 || !/^\d+(\.\d{1,2})?$/.test(billAmount.trim())) {
      setError('Enter a valid positive amount with up to two decimal places.')
      return
    }

    if (members.length === 0) {
      setError('Add at least one member before creating a bill.')
      return
    }

    const totalCents = Math.round(amount * 100)
    setLoading(true)

    try {
      const createdBill = await api.createBill(home.id, trimmedTitle, totalCents)
      // Reload bills and balances
      const [fetchedBills, fetchedBalances] = await Promise.all([
        api.getBills(home.id),
        api.getBalances(home.id),
      ])

      setBills(fetchedBills)
      setBalances(fetchedBalances)
      setBillTitle('')
      setBillAmount('')
      setSuccess(
        `Bill "${createdBill.title}" (${formatMoney(totalCents)}) split equally among ${members.length} member(s).`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create bill.')
    } finally {
      setLoading(false)
    }
  }

  // Pay an individual share
  async function handlePayShare(
    billId: string,
    shareId: string,
    memberName: string,
    amountCents: number,
  ) {
    if (!home || payingShareId) return

    setError('')
    setSuccess('')
    setPayingShareId(shareId)

    const idempotencyKey = crypto.randomUUID()

    try {
      await api.payShare(billId, shareId, idempotencyKey)

      // Refresh bills and balances upon verified API success
      const [fetchedBills, fetchedBalances] = await Promise.all([
        api.getBills(home.id),
        api.getBalances(home.id),
      ])

      setBills(fetchedBills)
      setBalances(fetchedBalances)
      setSuccess(`Payment of ${formatMoney(amountCents)} confirmed for ${memberName}.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment failed. Please retry.')
    } finally {
      setPayingShareId(null)
    }
  }

  // Live split calculation for preview
  const parsedAmount = Number(billAmount)
  const isAmountValid =
    Number.isFinite(parsedAmount) && parsedAmount > 0 && /^\d+(\.\d{1,2})?$/.test(billAmount.trim())

  let splitSummary = ''
  if (isAmountValid && members.length > 0) {
    const totalCents = Math.round(parsedAmount * 100)
    const base = Math.floor(totalCents / members.length)
    const remainder = totalCents % members.length

    if (remainder === 0) {
      splitSummary = `Each member pays ${formatMoney(base)}.`
    } else {
      splitSummary = `${remainder} member(s) pay ${formatMoney(base + 1)} and ${members.length - remainder} pay ${formatMoney(base)}.`
    }
  }

  // Total outstanding balance across all members
  const totalOutstandingCents = balances.reduce((sum, b) => sum + b.outstandingCents, 0)

  if (initialLoading) {
    return (
      <main className="app-shell">
        <header className="topbar">
          <a className="brand" href="/">
            <span className="brand-mark">S</span>
            Splitwise
          </a>
          <span className="topbar-label">Shared expenses, simplified</span>
        </header>
        <section className="hero">
          <span className="eyebrow">LOADING</span>
          <h1>Restoring your shared space...</h1>
          <p>Connecting to the database and checking your active home.</p>
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="/">
          <span className="brand-mark">S</span>
          Splitwise
        </a>
        <span className="topbar-label">Shared expenses, simplified</span>
      </header>

      <section className="hero">
        <span className="eyebrow">YOUR SHARED SPACE</span>
        <h1>
          Make shared expenses <span>simple.</span>
        </h1>
        <p>
          Create a home, add your people, and keep everyone's expenses organised with exact
          integer-split precision.
        </p>
      </section>

      {error && (
        <div className="error-message" role="alert">
          {error}
        </div>
      )}

      {success && (
        <div className="success-message" role="status">
          {success}
        </div>
      )}

      {!home ? (
        <section className="setup-card">
          <div className="tab-nav" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={setupTab === 'create'}
              className={`tab-btn ${setupTab === 'create' ? 'active' : ''}`}
              onClick={() => {
                setSetupTab('create')
                setError('')
              }}
            >
              Create New Home
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={setupTab === 'existing'}
              className={`tab-btn ${setupTab === 'existing' ? 'active' : ''}`}
              onClick={() => {
                setSetupTab('existing')
                setError('')
                void refreshHomesList()
              }}
            >
              Open Existing Home ({availableHomes.length})
            </button>
          </div>

          {setupTab === 'create' ? (
            <div>
              <div className="card-heading">
                <span className="step-number">01</span>
                <div>
                  <h2>Create your home</h2>
                  <p>Start by giving your shared space a name.</p>
                </div>
              </div>

              <form onSubmit={handleCreateHome} className="form">
                <label htmlFor="homeName">Home name</label>
                <input
                  id="homeName"
                  value={homeName}
                  onChange={(event) => setHomeName(event.target.value)}
                  placeholder="e.g. Flat 4B"
                  required
                  maxLength={100}
                />
                <button type="submit" disabled={loading || !homeName.trim()}>
                  {loading ? 'Creating...' : 'Create home'}
                  <span aria-hidden="true">→</span>
                </button>
              </form>
            </div>
          ) : (
            <div>
              <div className="card-heading">
                <span className="step-number">01</span>
                <div>
                  <h2>Open an existing home</h2>
                  <p>Select a home from the database or enter a Home ID.</p>
                </div>
              </div>

              <div className="form">
                <label htmlFor="directHomeId">Enter Home ID</label>
                <div className="input-row">
                  <input
                    id="directHomeId"
                    value={selectedHomeIdInput}
                    onChange={(e) => setSelectedHomeIdInput(e.target.value)}
                    placeholder="e.g. 3d0fb824-957a-49f6-a8cb-dfc01dc320e2"
                  />
                  <button
                    type="button"
                    disabled={loading || !selectedHomeIdInput.trim()}
                    onClick={() => handleOpenExistingHome(selectedHomeIdInput)}
                  >
                    Open home
                  </button>
                </div>

                {availableHomes.length > 0 && (
                  <div style={{ marginTop: '16px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600 }}>
                      Or select from existing homes:
                    </span>
                    <div className="existing-homes-list">
                      {availableHomes.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className="existing-home-item"
                          onClick={() => handleOpenExistingHome(item.id)}
                        >
                          <div>
                            <div className="existing-home-name">{item.name}</div>
                            <div className="existing-home-meta">ID: {item.id}</div>
                          </div>
                          <span style={{ color: '#527b56', fontWeight: 600, fontSize: '13px' }}>
                            Open →
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      ) : (
        <section className="workspace">
          <div className="home-card">
            <div>
              <span className="eyebrow">YOUR HOME</span>
              <h2>{home.name}</h2>
              <p>
                Home ID: <span className="home-id">{home.id}</span>
              </p>
              <div className="home-actions">
                <button type="button" className="btn-secondary" onClick={handleCopyHomeId}>
                  {copiedId ? 'Copied ID!' : 'Copy Home ID'}
                </button>
                <button type="button" className="btn-secondary" onClick={handleSwitchHome}>
                  Switch Home
                </button>
              </div>
            </div>
            <span className="home-icon" aria-hidden="true">
              ⌂
            </span>
          </div>

          {/* Members Management */}
          <div className="setup-card">
            <div className="card-heading">
              <span className="step-number">02</span>
              <div>
                <h2>Add your people</h2>
                <p>Add everyone who will share expenses in this home.</p>
              </div>
            </div>

            <form onSubmit={handleAddMember} className="form">
              <label htmlFor="memberName">Member name</label>
              <div className="input-row">
                <input
                  id="memberName"
                  value={memberName}
                  onChange={(event) => setMemberName(event.target.value)}
                  placeholder="e.g. Asha"
                  required
                  maxLength={100}
                />
                <button type="submit" disabled={loading || !memberName.trim()}>
                  {loading ? 'Adding...' : 'Add member'}
                </button>
              </div>
            </form>

            <div className="member-section">
              <div className="member-heading">
                <h3>Members</h3>
                <span className="member-count">{members.length}</span>
              </div>

              {members.length === 0 ? (
                <p className="empty-state">No members yet. Add the first person above.</p>
              ) : (
                <ul className="member-list">
                  {members.map((member, index) => (
                    <li key={member.id} className="member-item">
                      <span className="avatar">{member.name.charAt(0).toUpperCase()}</span>
                      <span className="member-name">{member.name}</span>
                      <span className="member-number">#{index + 1}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Balances Summary */}
          <section className="setup-card balances-summary-card">
            <div className="member-heading">
              <div>
                <h2>Outstanding balances</h2>
                <p className="section-description">
                  Current unsettled balance for each member across all bills.
                </p>
              </div>
            </div>

            {balances.length === 0 ? (
              <p className="empty-state">Add members above to begin tracking balances.</p>
            ) : (
              <div>
                <div className="balance-grid">
                  {balances.map((b) => {
                    const isSettled = b.outstandingCents === 0
                    return (
                      <div
                        key={b.memberId}
                        className={`balance-card ${isSettled ? 'settled' : 'has-due'}`}
                      >
                        <div className="balance-card-header">
                          <span style={{ fontWeight: 600, fontSize: '14px' }}>{b.name}</span>
                          <span className={`payment-status ${isSettled ? 'paid' : 'pending'}`}>
                            {isSettled ? 'Settled' : 'Unpaid share'}
                          </span>
                        </div>
                        <div className="balance-card-amount">{formatMoney(b.outstandingCents)}</div>
                      </div>
                    )
                  })}
                </div>

                <div className="total-due-banner">
                  <span>Total outstanding across home:</span>
                  <strong>{formatMoney(totalOutstandingCents)}</strong>
                </div>
              </div>
            )}
          </section>

          {/* Create a Bill */}
          <section className="setup-card bill-setup">
            <div className="card-heading">
              <span className="step-number">03</span>
              <div>
                <h2>Create a bill</h2>
                <p>Enter an expense and we'll split it equally between members.</p>
              </div>
            </div>

            <form onSubmit={handleCreateBill} className="form">
              <label htmlFor="billTitle">Bill title</label>
              <input
                id="billTitle"
                value={billTitle}
                onChange={(event) => setBillTitle(event.target.value)}
                placeholder="e.g. Electricity bill"
                required
                maxLength={100}
              />

              <label htmlFor="billAmount">Total amount (₹)</label>
              <input
                id="billAmount"
                type="number"
                min="0.01"
                step="0.01"
                value={billAmount}
                onChange={(event) => setBillAmount(event.target.value)}
                placeholder="e.g. 1000.00"
                required
              />

              {splitSummary && (
                <div className="split-preview">
                  <strong>Deterministic split preview: </strong>
                  {splitSummary}
                </div>
              )}

              <button
                type="submit"
                disabled={
                  loading || members.length === 0 || !billTitle.trim() || !billAmount.trim()
                }
              >
                {loading ? 'Creating bill...' : 'Create and split bill'}
                <span aria-hidden="true">→</span>
              </button>

              {members.length === 0 && (
                <p className="empty-state">Add at least one member before creating a bill.</p>
              )}
            </form>
          </section>

          {/* Bill History & Payments */}
          <section className="setup-card bills-section">
            <div className="member-heading">
              <div>
                <h2>Bill history</h2>
                <p className="section-description">
                  All expenses recorded for this home with share breakdown.
                </p>
              </div>
              <span className="member-count">{bills.length}</span>
            </div>

            {bills.length === 0 ? (
              <p className="empty-state">No bills yet. Create your first bill above.</p>
            ) : (
              <div className="bill-list">
                {bills.map((bill) => {
                  const paidCount = bill.shares.filter((share) => share.paidAt !== null).length

                  const allPaid = bill.shares.length > 0 && paidCount === bill.shares.length

                  return (
                    <article className="bill-card" key={bill.id}>
                      <div className="bill-card-header">
                        <div>
                          <h3>{bill.title}</h3>
                          <p className="bill-date">
                            {new Date(bill.createdAt).toLocaleDateString('en-IN', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                        </div>
                        <div className="bill-total">{formatMoney(bill.totalCents)}</div>
                      </div>

                      <div className="bill-status-row">
                        <span className="bill-status-label">
                          {paidCount} of {bill.shares.length} shares paid
                        </span>
                        <span className={`payment-status ${allPaid ? 'paid' : 'pending'}`}>
                          {allPaid ? 'Fully paid' : 'Pending'}
                        </span>
                      </div>

                      <div className="share-list">
                        {bill.shares.map((share) => {
                          const isPaid = share.paidAt !== null
                          const isPayingThis = payingShareId === share.id

                          return (
                            <div className="share-item" key={share.id}>
                              <div className="share-person">
                                <span className="avatar">
                                  {share.memberName.charAt(0).toUpperCase()}
                                </span>
                                <span>{share.memberName}</span>
                              </div>

                              <div className="share-right">
                                <strong>{formatMoney(share.amountCents)}</strong>
                                {isPaid ? (
                                  <span className="share-payment paid">✓ Paid</span>
                                ) : (
                                  <button
                                    type="button"
                                    className="btn-pay"
                                    disabled={loading || payingShareId !== null}
                                    onClick={() =>
                                      handlePayShare(
                                        bill.id,
                                        share.id,
                                        share.memberName,
                                        share.amountCents,
                                      )
                                    }
                                  >
                                    {isPayingThis ? 'Paying...' : 'Mark as paid'}
                                  </button>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </section>
        </section>
      )}

      <footer className="footer">Built for better shared living.</footer>
    </main>
  )
}
