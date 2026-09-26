/**
 * 60SEC Authoritative Scheduling Engine
 * Enforces SCHED-001 through SCHED-007
 */

import { AdSchedule, Advertisement, PaymentRecord } from './types.ts';

export const AUCTION_HOURS_PER_OPERATING_DAY = 12;
export const SLOTS_PER_AUCTION_HOUR = 60;
export const SLOTS_PER_OPERATING_DAY = 720;

/**
 * 60SEC operating day: 09:00–21:00 IST, every day.
 * The 12-hour window is continuous; there is no hourly price reset.
 */
export const OPERATING_DAY_TIME_ZONE = 'Asia/Kolkata';
export const OPERATING_DAY_START_HOUR_IST = 9;
export const OPERATING_DAY_END_HOUR_IST = 21;

function istDateParts(date: Date): { year: number; month: number; day: number; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: OPERATING_DAY_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute') };
}

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function getOperatingDayKey(date: Date): string | null {
  const p = istDateParts(date);
  const minuteOfDay = p.hour * 60 + p.minute;
  if (minuteOfDay < OPERATING_DAY_START_HOUR_IST * 60 || minuteOfDay >= OPERATING_DAY_END_HOUR_IST * 60) {
    return null;
  }
  return isoDate(p.year, p.month, p.day);
}

export function getOperatingDayWindow(date: Date): { start: Date; end: Date; key: string } | null {
  const p = istDateParts(date);
  const minuteOfDay = p.hour * 60 + p.minute;
  if (minuteOfDay < OPERATING_DAY_START_HOUR_IST * 60 || minuteOfDay >= OPERATING_DAY_END_HOUR_IST * 60) {
    return null;
  }
  const key = isoDate(p.year, p.month, p.day);
  return {
    start: new Date(`${key}T09:00:00+05:30`),
    end: new Date(`${key}T21:00:00+05:30`),
    key,
  };
}

export function getAuctionHourForSlot(slotNumber: number): number {
  return Math.floor((slotNumber - 1) / SLOTS_PER_AUCTION_HOUR) + 1;
}

export function validateOperatingDayInventory(slotNumbers: number[]): boolean {
  return slotNumbers.every((n) => Number.isInteger(n) && n >= 1 && n <= SLOTS_PER_OPERATING_DAY);
}

export class SchedulingError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'SchedulingError';
  }
}

/**
 * SCHED-001: Strict 60-Second Duration Validation
 */
export function validateSlotDuration(startTime: Date, endTime: Date): boolean {
  const durationMs = endTime.getTime() - startTime.getTime();
  return durationMs === 60 * 1000;
}

/**
 * SCHED-003: Overlap Detector
 * Checks if a requested slot [newStart, newEnd) overlaps with any existing scheduled slots.
 */
export function hasSlotCollision(
  existingSlots: ReadonlyArray<Pick<AdSchedule, 'startTime' | 'endTime' | 'status'>>,
  newStart: Date,
  newEnd: Date
): boolean {
  for (const slot of existingSlots) {
    if (slot.status !== 'SCHEDULED' && slot.status !== 'LIVE') {
      continue;
    }
    // Overlap condition: start1 < end2 && start2 < end1
    if (newStart.getTime() < slot.endTime.getTime() && slot.startTime.getTime() < newEnd.getTime()) {
      return true;
    }
  }
  return false;
}

/**
 * SCHED-006: Generate Unique Schedule Code
 * Format: AD60-YYYYMMDD-XXXXXX
 */
export function generateScheduleCode(date: Date, sequenceNum: number): string {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const seq = String(sequenceNum).padStart(6, '0');
  return `AD60-${yyyy}${mm}${dd}-${seq}`;
}

export interface ScheduleBookingRequest {
  advertisement: Readonly<Advertisement>;
  payment: Readonly<PaymentRecord>;
  existingSchedules: ReadonlyArray<AdSchedule>;
  serverTime: Date;
  sequenceNumber?: number;
}

/**
 * SCHED-002, SCHED-003, SCHED-005:
 * Deterministically schedules the next 60-second broadcast slot.
 */
export function bookNextScheduledSlot(request: ScheduleBookingRequest): AdSchedule {
  // SCHED-002: Must have verified payment
  if (request.payment.status !== 'VERIFIED') {
    throw new SchedulingError(
      'UNVERIFIED_PAYMENT',
      `Cannot schedule slot: Payment status is '${request.payment.status}'. Must be 'VERIFIED'.`
    );
  }

  // SCHED-002: Advertisement must be approved
  if (request.advertisement.approvalStatus !== 'APPROVED') {
    throw new SchedulingError(
      'UNAPPROVED_ADVERTISEMENT',
      `Cannot schedule slot: Ad approval status is '${request.advertisement.approvalStatus}'. Must be 'APPROVED'.`
    );
  }

  // Earliest possible start: 60 seconds from current server time (preparation buffer)
  const minLeadTimeMs = 60 * 1000;
  const earliestAllowedStart = new Date(request.serverTime.getTime() + minLeadTimeMs);

  // Find latest active end time among existing schedules
  let latestEndMs = 0;
  for (const s of request.existingSchedules) {
    if ((s.status === 'SCHEDULED' || s.status === 'LIVE') && s.endTime.getTime() > latestEndMs) {
      latestEndMs = s.endTime.getTime();
    }
  }

  let slotStartTime: Date;
  if (latestEndMs > earliestAllowedStart.getTime()) {
    // Append directly to the sequential queue
    slotStartTime = new Date(latestEndMs);
  } else {
    // Align to the next clean minute boundary
    const aligned = new Date(earliestAllowedStart);
    aligned.setUTCSeconds(0, 0);
    if (aligned.getTime() <= earliestAllowedStart.getTime()) {
      aligned.setUTCMinutes(aligned.getUTCMinutes() + 1);
    }
    slotStartTime = aligned;
  }

  // SCHED-001: Exactly 60 seconds
  const slotEndTime = new Date(slotStartTime.getTime() + 60 * 1000);

  // SCHED-003: Double-check collision
  if (hasSlotCollision(request.existingSchedules, slotStartTime, slotEndTime)) {
    throw new SchedulingError(
      'SLOT_COLLISION',
      'Computed slot collides with an existing scheduled advertisement.'
    );
  }

  const seq = request.sequenceNumber || request.existingSchedules.length + 1;
  const scheduleCode = generateScheduleCode(slotStartTime, seq);

  return {
    id: `sched_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    scheduleCode,
    advertisementId: request.advertisement.id,
    auctionId: request.payment.auctionId,
    startTime: slotStartTime,
    endTime: slotEndTime,
    durationSeconds: 60,
    status: 'SCHEDULED',
    createdAt: new Date(request.serverTime),
  };
}
