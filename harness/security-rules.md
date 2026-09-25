# 60SEC Security Architecture & Access Control Rules

This document specifies the authorization models, attack mitigation vectors, and Row Level Security (RLS) rules governing 60SEC.

---

## 1. Normative Rules Index

| Rule ID | Title | Summary |
|---|---|---|
| **SEC-001** | Zero Client Authority | Client browser inputs are treated as untrusted suggestions; all state transitions require server verification. |
| **SEC-002** | Ad Ownership Isolation | Users can only modify or delete advertisements where `user_id == auth.uid()`. |
| **SEC-003** | Bid Tamper Resistance | Bids are immutable once recorded; users cannot alter or cancel submitted bids. |
| **SEC-004** | Role Boundary Enforcement | Administrative routes and mutations require `user.role === 'admin'`; role claims cannot be set via client requests. |
| **SEC-005** | Financial Protection | Payment verification requires cryptographic signature validation or direct webhook verification. |
| **SEC-006** | XSS & Protocol Defense | Inputs (brand name, title, website URL) are strictly sanitized against HTML/JS injection. |
| **SEC-007** | Rate Limiting & DoS Defense | Ingestion of bids and ad events is limited per user/IP (e.g., maximum 10 bids per minute per user). |

---

## 2. Role-Based Access Control (RBAC) Matrix

| Resource / Action | Public / Guest | Authenticated Advertiser | Platform Admin |
|---|---|---|---|
| View Live Broadcast (`/live`) | Read | Read | Read |
| View Active Auctions & Public Bids | Read (Anonymized) | Read (Anonymized) | Read (Full Audit) |
| Create Advertisement | Denied | Allowed (Own Account) | Allowed |
| Update / Delete Advertisement | Denied | Allowed (Own Drafts Only) | Allowed (All) |
| Review / Approve / Reject Ad | Denied | Denied | Allowed |
| Place Bid | Denied | Allowed (Verified User) | Denied (No Self-Dealing) |
| Submit Payment Proof | Denied | Allowed (Winning Bidder Only) | Allowed |
| Manage Ad Slots & Schedules | Denied | Denied | Allowed |
| View System Analytics & Revenue | Denied | Denied | Allowed |

---

## 3. Database Row Level Security (RLS) Policies (PostgreSQL)

### Advertisements Table
```sql
ALTER TABLE advertisements ENABLE ROW LEVEL SECURITY;

-- Anyone can view approved advertisements that are currently live or in public auctions
CREATE POLICY "Public can view approved advertisements"
ON advertisements FOR SELECT
USING (approval_status = 'APPROVED');

-- Advertisers can view all of their own advertisements (even drafts/rejected)
CREATE POLICY "Advertisers can view own ads"
ON advertisements FOR SELECT
USING (auth.uid() = user_id);

-- Advertisers can insert their own advertisements
CREATE POLICY "Advertisers can insert own ads"
ON advertisements FOR INSERT
WITH CHECK (auth.uid() = user_id AND approval_status = 'PENDING');

-- Advertisers can update their own ads ONLY if not yet live/approved
CREATE POLICY "Advertisers can update own pending ads"
ON advertisements FOR UPDATE
USING (auth.uid() = user_id AND status = 'DRAFT')
WITH CHECK (auth.uid() = user_id AND approval_status = 'PENDING');

-- Admins can perform all operations
CREATE POLICY "Admins have full access to ads"
ON advertisements FOR ALL
USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));
```

### Bids Table
```sql
ALTER TABLE bids ENABLE ROW LEVEL SECURITY;

-- Public can view anonymized bids
CREATE POLICY "Public can view bids"
ON bids FOR SELECT
USING (true);

-- Authenticated users can insert bids matching their own ID
CREATE POLICY "Authenticated users can submit bids"
ON bids FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Bids are append-only; updates and deletes are blocked for everyone
CREATE POLICY "Bids are immutable"
ON bids FOR UPDATE
USING (false);

CREATE POLICY "Bids cannot be deleted"
ON bids FOR DELETE
USING (false);
```

### Payments Table
```sql
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Users can only view payments associated with their own won auctions
CREATE POLICY "Users can view own payments"
ON payments FOR SELECT
USING (auth.uid() = user_id);

-- Direct client INSERT/UPDATE is prohibited; only service role can write verified payments
CREATE POLICY "Service role only for payment writes"
ON payments FOR ALL
USING (false);
```

---

## 4. Parameter Tampering Prevention

The backend explicitly rejects any attempt by client requests to pass:
1. `role`: Hardcoded to `'advertiser'` on user registration; elevated only by direct database admin seeding.
2. `approval_status`: Defaults to `'PENDING'`; settable only by admin routes.
3. `status` on payments: Settable only via internal payment verification function.
4. `start_time` / `end_time` on schedules: Computed strictly by scheduler engine.
