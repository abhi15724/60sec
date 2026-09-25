# 60SEC Database Contracts & Relational Schema (PostgreSQL / Supabase)

This document contains the canonical DDL, relational constraints, foreign keys, and indexes for the 60SEC platform.

---

## 1. Entity Relationship Diagram

```text
       +------------------+
       |      users       |
       +------------------+
          |            |
          | 1:N        | 1:N
          v            v
+----------------+   +------------------+
| advertisements |   |      bids        |
+----------------+   +------------------+
          |                    |
          | 1:N                | N:1
          v                    v
+----------------+   +------------------+
|    auctions    |<--|     payments     |
+----------------+   +------------------+
          |
          | 1:1
          v
+----------------+
|  ad_schedules  |
+----------------+
          |
          | 1:N
          v
+----------------+
|   ad_events    |
+----------------+
```

---

## 2. Table Definitions (DDL)

```sql
-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- ENUMS
CREATE TYPE user_role AS ENUM ('advertiser', 'admin');
CREATE TYPE ad_approval_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE ad_status AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED');
CREATE TYPE auction_status AS ENUM ('UPCOMING', 'ACTIVE', 'AWAITING_PAYMENT', 'PAID', 'EXPIRED', 'CANCELLED');
CREATE TYPE payment_status AS ENUM ('PENDING', 'VERIFIED', 'FAILED', 'REFUNDED');
CREATE TYPE schedule_status AS ENUM ('SCHEDULED', 'LIVE', 'COMPLETED', 'CANCELLED');
CREATE TYPE ad_event_type AS ENUM ('ad_loaded', 'ad_viewable', 'ad_started', 'ad_completed', 'ad_clicked');

-- 1. USERS
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL CHECK (char_length(trim(name)) >= 2),
  email TEXT NOT NULL UNIQUE CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
  role user_role NOT NULL DEFAULT 'advertiser',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. ADVERTISEMENTS
CREATE TABLE advertisements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  brand_name TEXT NOT NULL CHECK (char_length(trim(brand_name)) BETWEEN 2 AND 50),
  title TEXT NOT NULL CHECK (char_length(trim(title)) BETWEEN 3 AND 100),
  media_url TEXT NOT NULL CHECK (media_url ~* '^https?://'),
  media_type TEXT NOT NULL CHECK (media_type IN ('image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm')),
  website_url TEXT NOT NULL CHECK (website_url ~* '^https?://'),
  status ad_status NOT NULL DEFAULT 'DRAFT',
  approval_status ad_approval_status NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. AUCTIONS
CREATE TABLE auctions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  advertisement_id UUID REFERENCES advertisements(id) ON DELETE SET NULL,
  starting_bid NUMERIC(12, 2) NOT NULL DEFAULT 1.00 CHECK (starting_bid >= 1.00),
  current_bid NUMERIC(12, 2) CHECK (current_bid IS NULL OR current_bid >= starting_bid),
  current_bidder_id UUID REFERENCES users(id) ON DELETE SET NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  status auction_status NOT NULL DEFAULT 'UPCOMING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT check_auction_time_order CHECK (end_time > start_time)
);

-- 4. BIDS
CREATE TABLE bids (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auction_id UUID NOT NULL REFERENCES auctions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 1.00),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. PAYMENTS
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auction_id UUID NOT NULL REFERENCES auctions(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  payment_provider TEXT NOT NULL CHECK (payment_provider IN ('RAZORPAY', 'DEMO_MOCK')),
  provider_payment_id TEXT UNIQUE,
  status payment_status NOT NULL DEFAULT 'PENDING',
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. AD_SCHEDULES (Enforces exact 60 seconds and zero-overlap)
CREATE TABLE ad_schedules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  schedule_code TEXT NOT NULL UNIQUE,
  advertisement_id UUID NOT NULL REFERENCES advertisements(id) ON DELETE RESTRICT,
  auction_id UUID NOT NULL UNIQUE REFERENCES auctions(id) ON DELETE RESTRICT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  duration_seconds INT NOT NULL DEFAULT 60 CHECK (duration_seconds = 60),
  status schedule_status NOT NULL DEFAULT 'SCHEDULED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT check_exact_60_seconds CHECK (EXTRACT(EPOCH FROM (end_time - start_time)) = 60),
  CONSTRAINT exclude_overlapping_slots EXCLUDE USING gist (
    tstzrange(start_time, end_time, '[)') WITH &&
  ) WHERE (status IN ('SCHEDULED', 'LIVE'))
);

-- 7. AD_EVENTS (Telemetry)
CREATE TABLE ad_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  advertisement_id UUID NOT NULL REFERENCES advertisements(id) ON DELETE CASCADE,
  schedule_id UUID REFERENCES ad_schedules(id) ON DELETE CASCADE,
  event_type ad_event_type NOT NULL,
  session_id TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- 8. NOTIFICATIONS
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 3. High-Performance Indexes

```sql
-- Fast lookup for active auctions
CREATE INDEX idx_auctions_status_end_time ON auctions(status, end_time);

-- Fast lookup for bid history by auction ordered by amount descending
CREATE INDEX idx_bids_auction_amount ON bids(auction_id, amount DESC, created_at ASC);

-- Fast lookup for user bids
CREATE INDEX idx_bids_user ON bids(user_id);

-- Fast lookup for public live broadcasting query
CREATE INDEX idx_ad_schedules_time_window ON ad_schedules(start_time, end_time) WHERE (status IN ('SCHEDULED', 'LIVE'));

-- Index on telemetry events for analytics aggregation
CREATE INDEX idx_ad_events_ad_type ON ad_events(advertisement_id, event_type);
```
