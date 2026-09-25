# 60SEC Advertisement Delivery & Telemetry Rules

This document specifies the technical requirements for ad rendering, media verification, live broadcast lifecycle, click handling, and telemetry measurement on 60SEC.

---

## 1. Normative Rules Index

| Rule ID | Title | Summary |
|---|---|---|
| **DELIV-001** | Creative Media Validation | Uploaded media must be valid image (JPG, PNG, WEBP) or video (MP4, WEBM) $\le 25\text{MB}$. |
| **DELIV-002** | Destination URL Sanitization | Website URL must use HTTP/HTTPS protocol; dangerous URI schemes (`javascript:`, `data:`) are rejected. |
| **DELIV-003** | Required Creative Metadata | Ad must supply `brand_name` (2-50 chars), `title` (3-100 chars), `media_url`, and `website_url`. |
| **DELIV-004** | Live Synchronization | Live display transitions are governed by server UTC window $[T_{\text{start}}, T_{\text{end}})$. |
| **DELIV-005** | Seamless Slot Handover | Exactly at $T_{\text{end}}$, the broadcast transitions to the next queued ad or platform standby card. |
| **DELIV-006** | Real Telemetry Events | Telemetry tracks 5 discrete lifecycle events: `loaded`, `viewable`, `started`, `completed`, `clicked`. |
| **DELIV-007** | Click Telemetry & Redirect | Clicking "VISIT WEBSITE" records an authentic `ad_clicked` record before forwarding to the destination. |
| **DELIV-008** | Anti-Bot & Deduplication | Duplicate events from the same session/IP within identical millisecond spans are throttled. |

---

## 2. Creative Submission & Sanitization (DELIV-001 to DELIV-003)

### Validation Matrix
- **Brand Name**: String, trimmed length between 2 and 50 characters.
- **Ad Title**: String, trimmed length between 3 and 100 characters.
- **Website URL**:
  - Must parse under standard RFC 3986 URL parsing.
  - Protocol must be strictly `http:` or `https:`.
  - Disallowed: `javascript:`, `file:`, `data:`, `vbscript:`.
- **Media File**:
  - MIME types allowed: `image/jpeg`, `image/png`, `image/webp`, `video/mp4`, `video/webm`.
  - Maximum upload size: $25 \times 1024 \times 1024$ bytes (25 MB).

---

## 3. Public Display Area Architecture (DELIV-004, DELIV-005)

The public display area runs 24/7 at `/live` (or the hero billboard):

```text
┌──────────────────────────────────────────────┐
│  🔴 60SEC BROADCAST NETWORK   [ LIVE NOW ]   │
├──────────────────────────────────────────────┤
│                                              │
│             [ MEDIA DISPLAY ]                │
│         High-Definition Video/Image          │
│                                              │
├──────────────────────────────────────────────┤
│  ABC SHOES                                   │
│  Summer Flash Sale — Flat 40% OFF Everything │
│                                              │
│  [ VISIT WEBSITE (abcshoes.com) ]   ⏱️ 00:43  │
└──────────────────────────────────────────────┘
```

### Server-Synchronized Timer Hook
- Frontend fetches `/api/broadcast/current` which returns:
  ```json
  {
    "activeSlot": {
      "id": "sched_123",
      "startTime": "2026-09-25T15:12:00.000Z",
      "endTime": "2026-09-25T15:13:00.000Z",
      "serverNow": "2026-09-25T15:12:17.400Z",
      "ad": {
        "brandName": "ABC Shoes",
        "title": "Summer Flash Sale — Flat 40% OFF Everything",
        "mediaUrl": "https://...",
        "websiteUrl": "https://abcshoes.com"
      }
    }
  }
  ```
- The remaining seconds are computed as $\max\left(0, \frac{T_{\text{end}} - T_{\text{current}}}{1000}\right)$.

---

## 4. Telemetry Specification (DELIV-006 to DELIV-008)

### Event Schema
```typescript
export type AdEventType =
  | 'ad_loaded'
  | 'ad_viewable'
  | 'ad_started'
  | 'ad_completed'
  | 'ad_clicked';

export interface AdEventPayload {
  advertisementId: string;
  scheduleId: string;
  eventType: AdEventType;
  sessionId: string;
  timestamp: string; // UTC ISO string
  metadata?: {
    userAgent?: string;
    referrer?: string;
    viewportPercentage?: number;
  };
}
```

### Definitions:
1. `ad_loaded`: Creative asset loaded in DOM.
2. `ad_viewable`: At least 50% of the creative area is inside the viewport continuously for $\ge 1$ second (utilizing `IntersectionObserver`).
3. `ad_started`: Playback initiation during the active slot.
4. `ad_completed`: Full 60 seconds elapsed while ad remained continuously mounted and visible.
5. `ad_clicked`: Outbound navigation triggered.

### Click-Through Redirect Contract
When user clicks "Visit Website":
1. Client fires POST to `/api/events/click` with `{ advertisementId, scheduleId, destinationUrl }`.
2. Server validates URL against the approved record in database.
3. Server logs `ad_clicked` with session hash.
4. Server returns redirect response or client handles safe `window.open(safeUrl, '_blank')`.
