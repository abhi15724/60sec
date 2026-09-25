# 60SEC Ad Slot Scheduling Rules & Invariants

This document specifies the algorithmic rules, database constraints, and collision-avoidance logic governing advertising broadcast slots on 60SEC.

---

## 1. Normative Rules Index

| Rule ID | Title | Summary |
|---|---|---|
| **SCHED-001** | Strict 60-Second Duration Invariant | Every scheduled broadcast must span exactly 60 seconds (`end - start = 60s`). |
| **SCHED-002** | Prerequisites: Approved Ad & Verified Payment | No slot may be scheduled unless `payment.status == 'VERIFIED'` and `advertisement.approval_status == 'APPROVED'`. |
| **SCHED-003** | Zero Slot Collisions (No Overlaps) | Broadcast slots are strictly sequential; two active slots can never overlap in time. |
| **SCHED-004** | Authoritative UTC Storage | All start and end timestamps must be stored in UTC format (`timestamptz`). |
| **SCHED-005** | Deterministic Queue Placement | New slots append immediately after the latest scheduled slot or at the next aligned minute boundary. |
| **SCHED-006** | Ad Schedule ID Standard | Formatted as `AD60-YYYYMMDD-XXXXXX` (e.g., `AD60-20260925-000184`). |
| **SCHED-007** | Client Display Decoupling | Countdown timers rendered in the browser are visual guides; server UTC timestamps govern live airing state. |

---

## 2. Invariant SCHED-001: Mathematical Duration

Given any scheduled record in table `ad_schedules`:

$$\text{duration\_seconds} = \frac{\text{end\_time} - \text{start\_time}}{1000 \text{ ms}} = 60$$

Database Check Constraint:
```sql
ALTER TABLE ad_schedules
ADD CONSTRAINT check_exact_sixty_seconds
CHECK (EXTRACT(EPOCH FROM (end_time - start_time)) = 60);
```

---

## 3. Invariant SCHED-003: Zero Overlap Guarantee

For any two rows $S_1$ and $S_2$ in `ad_schedules` with status `SCHEDULED` or `LIVE`:

$$\neg (\text{start}_1 < \text{end}_2 \land \text{start}_2 < \text{end}_1)$$

In PostgreSQL, this is enforced using a GiST range exclusion constraint:
```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE ad_schedules
ADD CONSTRAINT exclude_overlapping_ad_slots
EXCLUDE USING gist (
  tstzrange(start_time, end_time, '[)') WITH &&
) WHERE (status IN ('SCHEDULED', 'LIVE'));
```

---

## 4. Scheduling Algorithm (Server Implementation)

When payment verification succeeds:

```typescript
export interface ScheduleCalculationInput {
  advertisementId: string;
  auctionId: string;
  isPaymentVerified: boolean;
  isAdApproved: boolean;
  latestScheduledEndTime: Date | null;
  currentServerTime: Date;
}

export interface AdScheduleRecord {
  id: string;
  scheduleCode: string;
  advertisementId: string;
  auctionId: string;
  startTime: Date;
  endTime: Date;
  durationSeconds: 60;
  status: 'SCHEDULED' | 'LIVE' | 'COMPLETED' | 'CANCELLED';
}

export function computeNextAvailableSlot(input: ScheduleCalculationInput): { startTime: Date; endTime: Date } {
  if (!input.isPaymentVerified) {
    throw new Error('SCHED-002: Cannot schedule an unpaid auction.');
  }
  if (!input.isAdApproved) {
    throw new Error('SCHED-002: Cannot schedule an unapproved advertisement.');
  }

  const minLeadTimeMs = 60 * 1000; // 1 minute buffer to let advertiser prepare
  const earliestPossibleStart = new Date(input.currentServerTime.getTime() + minLeadTimeMs);

  let startTime: Date;

  if (input.latestScheduledEndTime && input.latestScheduledEndTime > earliestPossibleStart) {
    // Append directly to the queue
    startTime = new Date(input.latestScheduledEndTime);
  } else {
    // Align to the next top of the minute
    const s = new Date(earliestPossibleStart);
    s.setSeconds(0, 0);
    if (s.getTime() <= earliestPossibleStart.getTime()) {
      s.setMinutes(s.getMinutes() + 1);
    }
    startTime = s;
  }

  const endTime = new Date(startTime.getTime() + 60 * 1000);
  return { startTime, endTime };
}
```

---

## 5. Timezone Transformation Rule (SCHED-004)
- **Database/API**: Always returns ISO 8601 strings: `"2026-09-25T15:12:00.000Z"`.
- **Client UI**:
  ```typescript
  export function formatToUserLocalTime(utcDateStr: string | Date): string {
    const d = new Date(utcDateStr);
    return new Intl.DateTimeFormat(undefined, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    }).format(d);
  }
  ```


## 6. Operating-Day Inventory & House-Ad Fallback
- Each operating day has exactly 12 continuous one-hour auction sessions.
- Each session contains exactly 60 sequential 60-second ad slots.
- Total daily inventory is exactly 720 slots.
- A commercial slot may go LIVE only when its advertisement is APPROVED and its auction payment is VERIFIED.
- If no paid + approved advertisement is scheduled for a slot, the scheduler may use the configured 60SEC HOUSE advertisement.
- The house advertisement is not an auction winner, is not paid commercial inventory, and must never replace a paid + approved scheduled advertisement.
- House-ad analytics must remain separate from commercial advertiser analytics.
- When an eligible paid + approved advertisement exists for the next slot, it takes priority over the house advertisement.
