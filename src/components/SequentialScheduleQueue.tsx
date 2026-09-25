import React from 'react';
import { useMarketplace } from '../context/MarketplaceContext.tsx';

export const SequentialScheduleQueue: React.FC = () => {
  const { schedules, getAdById } = useMarketplace();

  // All confirmed sequential slots
  const sortedSchedules = [...schedules].sort(
    (a, b) => a.startTime.getTime() - b.startTime.getTime()
  );

  const formatTimeWindow = (start: Date, end: Date) => {
    const s = start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const e = end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    return `${s} — ${e}`;
  };

  return (
    <section className="py-10 sm:py-16 bg-slate-50 border-b border-slate-200">
      <div className="max-w-4xl mx-auto px-3.5 sm:px-6 lg:px-8 space-y-5 sm:space-y-6 text-left">
        <div>
          <span className="text-[10px] sm:text-xs uppercase font-extrabold tracking-wider text-slate-500 block">
            Strict Non-Overlapping Sequence
          </span>
          <h3 className="text-xl sm:text-2xl font-black text-slate-950 tracking-tight">
            SEQUENTIAL HOMEPAGE QUEUE
          </h3>
          <p className="text-xs text-slate-600 mt-0.5 sm:mt-1">
            Slots air sequentially one after another. Exactly 60 seconds per broadcast. No overlapping impressions.
          </p>
        </div>

        <div className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
          {sortedSchedules.map((slot) => {
            const ad = getAdById(slot.advertisementId);
            const isLive = slot.status === 'LIVE';

            return (
              <div
                key={slot.id}
                className={`p-3.5 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 transition ${
                  isLive ? 'bg-rose-50/60' : 'bg-white'
                }`}
              >
                <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                  <div
                    className={`h-10 w-10 sm:h-11 sm:w-11 rounded-xl flex items-center justify-center font-mono font-bold text-xs shrink-0 ${
                      isLive
                        ? 'bg-rose-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {slot.scheduleCode.replace('SLOT-', '')}
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                      <span className="font-mono text-xs font-bold text-slate-900">
                        {slot.scheduleCode}
                      </span>
                      {isLive ? (
                        <span className="text-[9px] sm:text-[10px] font-black uppercase text-rose-700 bg-rose-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <span className="h-1.5 w-1.5 rounded-full bg-rose-600 animate-ping"></span>
                          BROADCASTING NOW
                        </span>
                      ) : (
                        <span className="text-[9px] sm:text-[10px] font-bold uppercase text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                          {slot.status}
                        </span>
                      )}
                    </div>
                    <div className="text-xs sm:text-sm font-bold text-slate-900 mt-0.5 truncate">
                      {ad?.brandName} — {ad?.title}
                    </div>
                  </div>
                </div>

                <div className="text-left sm:text-right text-xs pt-1 sm:pt-0 border-t sm:border-t-0 border-slate-100 shrink-0">
                  <div className="font-mono font-bold text-slate-900">
                    {formatTimeWindow(slot.startTime, slot.endTime)}
                  </div>
                  <div className="text-[10px] sm:text-[11px] text-slate-400 mt-0.5">
                    Exactly 60 seconds (UTC aligned)
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
