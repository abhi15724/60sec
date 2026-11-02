import React, { useMemo } from 'react';
import { Trophy, Medal, Crown } from 'lucide-react';
import { useMarketplace } from '../context/MarketplaceContext.tsx';
import { getCurrencySymbol } from '../core/currency.ts';

function istDateKey(value: Date | string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));
}

export const TodaysBidLeaderboard: React.FC = () => {
  const { bids, auctions, ads } = useMarketplace();
  const today = istDateKey(new Date());

  const rows = useMemo(() => {
    const byAuction = new Map<string, typeof bids>();
    bids.forEach((bid) => {
      if (istDateKey(bid.createdAt) !== today) return;
      const list = byAuction.get(bid.auctionId) || [];
      list.push(bid);
      byAuction.set(bid.auctionId, list);
    });

    return Array.from(byAuction.entries()).flatMap(([auctionId, auctionBids]) => {
      const auction = auctions.find((item) => item.id === auctionId);
      if (!auction) return [];
      const ad = ads.find((item) => item.id === auction.advertisementId);
      if (!ad || ad.isHouseAd || ad.adType === 'HOUSE') return [];
      const highestBid = [...auctionBids].sort((a, b) =>
        b.amount - a.amount || b.createdAt.getTime() - a.createdAt.getTime()
      )[0];
      const isWinner = ['AWAITING_PAYMENT', 'PAID'].includes(auction.status) &&
        auction.currentBidderId === highestBid.userId;
      const isLeader = auction.status === 'ACTIVE' &&
        auction.currentBidderId === highestBid.userId;
      return [{
        auctionId,
        brandName: ad.brandName,
        title: ad.title,
        amount: highestBid.amount,
        currency: auction.currency || 'USD',
        bidderId: highestBid.userId,
        createdAt: highestBid.createdAt,
        isWinner,
        isLeader,
      }];
    }).sort((a, b) => a.currency.localeCompare(b.currency) ||
      b.amount - a.amount || a.createdAt.getTime() - b.createdAt.getTime());
  }, [bids, auctions, ads, today]);

  const currencies = Array.from(new Set(rows.map((row) => row.currency)));

  return (
    <section className="py-10 sm:py-14 bg-slate-50 border-y border-slate-200">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
          <div>
            <div className="inline-flex items-center gap-2 text-amber-700 text-xs font-black uppercase tracking-widest">
              <Trophy className="h-4 w-4" /> Daily rankings
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-950 mt-1">TODAY'S BID LEADERBOARD</h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">Highest bids first · Today's activity (India Standard Time)</p>
          </div>
          <span className="text-xs font-mono text-slate-500">{today} · {rows.length} ranked auctions</span>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
            <Trophy className="h-8 w-8 mx-auto text-slate-300" />
            <h3 className="font-bold text-slate-800 mt-3">No qualifying bids yet today</h3>
            <p className="text-sm text-slate-500 mt-1">Approved commercial ad auctions will appear here after bids are placed.</p>
          </div>
        ) : currencies.map((currency) => {
          const currencyRows = rows.filter((row) => row.currency === currency);
          const symbol = getCurrencySymbol(currency);
          return (
            <div key={currency} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
              <div className="px-4 sm:px-6 py-3 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-black text-slate-900">{currency} RANKINGS</h3>
                <span className="text-xs text-slate-500">{currencyRows.length} bids / auctions</span>
              </div>
              <div className="divide-y divide-slate-100">
                {currencyRows.map((row, index) => (
                  <div key={row.auctionId} className="grid grid-cols-[2rem_1fr_auto] sm:grid-cols-[3rem_1fr_8rem_9rem] items-center gap-3 px-4 sm:px-6 py-3.5">
                    <div className="font-black text-slate-500 flex items-center justify-center">
                      {index === 0 ? <Crown className="h-5 w-5 text-amber-500" /> : index === 1 ? <Medal className="h-5 w-5 text-slate-400" /> : index === 2 ? <Medal className="h-5 w-5 text-amber-700" /> : `#${index + 1}`}
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-slate-900 truncate">{row.brandName}</div>
                      <div className="text-xs text-slate-500 truncate">{row.title}</div>
                      <div className="text-[10px] text-slate-400 sm:hidden mt-1">{row.isWinner ? 'TODAY’S WINNER' : row.isLeader ? 'CURRENT LEADER' : 'TOP BID TODAY'}</div>
                    </div>
                    <div className="hidden sm:block text-xs text-slate-500">
                      {row.isWinner ? <span className="text-emerald-700 font-bold">WINNER TODAY</span> : row.isLeader ? <span className="text-blue-700 font-bold">LEADING</span> : 'Bid recorded'}
                    </div>
                    <div className="text-right">
                      <div className="font-black text-slate-950 tabular-nums">{symbol}{row.amount.toLocaleString()}</div>
                      <div className="text-[10px] text-slate-400">{new Date(row.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })} IST</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        <p className="text-[11px] text-slate-400">Rankings are separated by currency. A current highest bidder is marked as leading; a winner is shown only after the auction closes. House ads are excluded.</p>
      </div>
    </section>
  );
};
