
-- 1. Homes
CREATE TABLE homes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_homes_name
        CHECK (length(trim(name)) > 0)
);

-- 2. Members
CREATE TABLE members (
    id TEXT PRIMARY KEY,
    home_id TEXT NOT NULL,
    name TEXT NOT NULL,
    position INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_members_home
        FOREIGN KEY (home_id) REFERENCES homes(id)
        ON DELETE CASCADE,

    CONSTRAINT uq_members_home_position
        UNIQUE (home_id, position),

    CONSTRAINT chk_members_name
        CHECK (length(trim(name)) > 0),

    CONSTRAINT chk_members_position
        CHECK (position >= 0)
);

-- 3. Bills
CREATE TABLE bills (
    id TEXT PRIMARY KEY,
    home_id TEXT NOT NULL,
    title TEXT NOT NULL,
    total_cents INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_bills_home
        FOREIGN KEY (home_id) REFERENCES homes(id)
        ON DELETE CASCADE,

    CONSTRAINT chk_bills_total_positive
        CHECK (total_cents > 0),

    CONSTRAINT chk_bills_title
        CHECK (length(trim(title)) > 0)
);

-- 4. Shares
CREATE TABLE shares (
    id TEXT PRIMARY KEY,
    bill_id TEXT NOT NULL,
    member_id TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    paid_at TEXT,
    idempotency_key TEXT,
    
    CONSTRAINT fk_shares_bill
        FOREIGN KEY (bill_id) REFERENCES bills(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_shares_member
        FOREIGN KEY (member_id) REFERENCES members(id),

    CONSTRAINT uq_shares_bill_member
        UNIQUE (bill_id, member_id),

    CONSTRAINT chk_shares_amount
        CHECK (amount_cents >= 0),

    CONSTRAINT chk_shares_payment_state
        CHECK (
            (paid_at IS NULL AND idempotency_key IS NULL)
            OR
            (paid_at IS NOT NULL AND idempotency_key IS NOT NULL)
        )
);

-- Indexes for frequently queried relationships
CREATE INDEX idx_members_home
    ON members(home_id, position);

CREATE INDEX idx_bills_home
    ON bills(home_id);

CREATE INDEX idx_shares_bill
    ON shares(bill_id);

CREATE INDEX idx_shares_member
    ON shares(member_id);

CREATE INDEX idx_shares_unpaid
    ON shares(member_id, paid_at);
