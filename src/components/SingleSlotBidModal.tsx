import React, { useState, useEffect } from 'react';
import { useMarketplace } from '../context/MarketplaceContext.tsx';
import { calculateMinimumNextBid } from '../core/auction.ts';
import { anonymizeUserId } from '../core/realtime.ts';
import { X, Clock, Users, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';

interface SingleSlotBidModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenCreateAd: () => void;
  onOpenPayment: () => void;
}

export const SingleSlotBidModal: React.FC<SingleSlotBidModalProps> = ({
  isOpen,
  onClose,
  onOpenCreateAd,
}) => {
  const {
    currentUser,
    nextSlotAuction,
    auctionRemainingSeconds,
    getAdById,
    getAuctionBids,
    placeBid,
    simulateCompetingBid,
    ads,
  } = useMarketplace();

  const [bidAmount, setBidAmount] = useState<number>(0);
  const [selectedAdId, setSelectedAdId] = useState<string>('');
  const [step, setStep] = useState<'input' | 'confirm' | 'success'>('input');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // User's advertisements
  const userAds = ads.filter((a) => a.userId === currentUser.id);

  // Keyboard Escape listener & Lock background scroll
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (nextSlotAuction) {
      const minBid = calculateMinimumNextBid(nextSlotAuction.currentBid, nextSlotAuction.startingBid);
      setBidAmount(minBid);
      setStep('input');
      setErrorMsg(null);

      if (userAds.length > 0) {
        setSelectedAdId(userAds[0].id);
      } else if (nextSlotAuction.advertisementId) {
        setSelectedAdId(nextSlotAuction.advertisementId);
      }
    }
  }, [nextSlotAuction, userAds.length, isOpen]);

  if (!isOpen || !nextSlotAuction) return null;

  const currentBid = nextSlotAuction.currentBid || nextSlotAuction.startingBid;
  const minNextBid = calculateMinimumNextBid(nextSlotAuction.currentBid, nextSlotAuction.startingBid);
  const recentBids = getAuctionBids(nextSlotAuction.id);
  const selectedAd = getAdById(selectedAdId) || getAdById(nextSlotAuction.advertisementId);

  const formatCountdown = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `00:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const handlePlaceBidSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (bidAmount < minNextBid) {
      setErrorMsg(`Your bid must be at least $${minNextBid}`);
      return;
    }
    setErrorMsg(null);
    setStep('confirm');
  };

  const handleConfirmBid = () => {
    const res = placeBid(bidAmount, selectedAdId);
    if (!res.success) {
      setErrorMsg(res.error || 'Failed to place bid');
      setStep('input');
    } else {
      setStep('success');
    }
  };

  const handleModalClose = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    onClose();
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleModalClose();
        }
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/75 backdrop-blur-xs overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bid-modal-title"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg bg-white rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-auto max-h-[94vh] sm:max-h-[90vh] flex flex-col transition-all"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-100 bg-slate-50/80 shrink-0">
          <div>
            <span className="text-[10px] uppercase font-mono font-bold tracking-wider text-slate-500 block">
              Homepage Slot Auction
            </span>
            <h3 id="bid-modal-title" className="text-sm sm:text-base font-black text-slate-950">
              BID FOR THE NEXT 60 SECONDS
            </h3>
          </div>

          <button
            type="button"
            onClick={handleModalClose}
            aria-label="Close dialog"
            className="h-10 w-10 min-w-[40px] min-h-[40px] flex items-center justify-center rounded-full sm:rounded-xl text-slate-500 hover:text-slate-950 bg-slate-100 hover:bg-slate-200 active:scale-95 transition-all cursor-pointer z-10 touch-manipulation focus:outline-none focus:ring-2 focus:ring-slate-900"
          >
            <X className="h-5 w-5 pointer-events-none stroke-[2.5]" />
          </button>
        </div>

        {/* STEP 1: FOCUSED BID INPUT */}
        {step === 'input' && (
          <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 overflow-y-auto flex-1">
            {/* Advertisement Preview */}
            <div className="flex items-center gap-3 sm:gap-4 p-3 rounded-xl bg-slate-50 border border-slate-200">
              {selectedAd?.mediaUrl ? (
                <img
                  src={selectedAd.mediaUrl}
                  alt={selectedAd.title}
                  className="h-14 w-20 sm:h-16 sm:w-24 object-cover rounded-lg shrink-0 border border-slate-200"
                />
              ) : (
                <div className="h-14 w-20 sm:h-16 sm:w-24 bg-slate-200 rounded-lg flex items-center justify-center text-xs text-slate-500">
                  No preview
                </div>
              )}
              <div className="flex-1 min-w-0 text-left">
                <span className="text-[11px] sm:text-xs uppercase font-extrabold text-slate-500 block">
                  {selectedAd?.brandName || 'Brand Creative'}
                </span>
                <div className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                  {selectedAd?.title || '60-Second Broadcast'}
                </div>
                <div className="text-[11px] sm:text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                  <span className="flex items-center gap-1 font-mono font-bold text-rose-600">
                    <Clock className="h-3 w-3" /> {formatCountdown(auctionRemainingSeconds)}
                  </span>
                  <span>·</span>
                  <span className="flex items-center gap-1 font-mono">
                    <Users className="h-3 w-3" /> {Math.max(recentBids.length, 1)} bidders
                  </span>
                </div>
              </div>
            </div>

            {/* Price Cards */}
            <div className="grid grid-cols-2 gap-3 sm:gap-4 p-3.5 sm:p-4 rounded-xl bg-slate-950 text-white text-left">
              <div>
                <span className="text-[10px] sm:text-[11px] uppercase tracking-wider text-slate-400 font-medium block">
                  {nextSlotAuction.currentBid ? 'Current Highest Bid' : 'Starting Price'}
                </span>
                <span className="text-xl sm:text-2xl font-black text-amber-400 mt-0.5 block">
                  ${currentBid}
                </span>
                <span className="text-[10px] text-slate-400">
                  {nextSlotAuction.currentBid
                    ? `Base: $${nextSlotAuction.startingBid}`
                    : `Starts from prev end ($${nextSlotAuction.startingBid})`}
                </span>
              </div>

              <div className="text-right">
                <span className="text-[10px] sm:text-[11px] uppercase tracking-wider text-slate-400 font-medium block">
                  Minimum Next Bid
                </span>
                <span className="text-xl sm:text-2xl font-black text-emerald-400 mt-0.5 block">
                  ${minNextBid}
                </span>
                <span className="text-[10px] text-slate-400">
                  Strictly &ge; ${minNextBid}
                </span>
              </div>
            </div>

            {/* Bidding Form */}
            <form onSubmit={handlePlaceBidSubmit} className="space-y-4 text-left">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Your Bid ($ USD)
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-bold text-slate-400">
                    $
                  </span>
                  <input
                    type="number"
                    min={minNextBid}
                    step="1"
                    value={bidAmount}
                    onChange={(e) => setBidAmount(Number(e.target.value))}
                    className="w-full pl-9 pr-4 py-3 rounded-xl border border-slate-300 text-base sm:text-xl font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-950 focus:border-transparent touch-manipulation"
                    required
                  />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-1.5 text-xs text-slate-500 mt-1.5">
                  <span>Minimum acceptable: ${minNextBid}</span>
                  <div className="flex gap-1.5">
                    {[minNextBid, minNextBid + 10, minNextBid + 50].map((quick) => (
                      <button
                        key={quick}
                        type="button"
                        onClick={() => setBidAmount(quick)}
                        className="px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-mono text-[11px] cursor-pointer touch-manipulation"
                      >
                        +${quick - minNextBid}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Creative selection if multiple ads exist */}
              {userAds.length > 1 && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Select Your Ad Creative
                  </label>
                  <select
                    value={selectedAdId}
                    onChange={(e) => setSelectedAdId(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-slate-300 text-sm font-medium bg-white focus:outline-none focus:ring-2 focus:ring-slate-950"
                  >
                    {userAds.map((ad) => (
                      <option key={ad.id} value={ad.id}>
                        {ad.brandName} — {ad.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {userAds.length === 0 && (
                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                  <span className="text-slate-600">Want to use custom creative?</span>
                  <button
                    type="button"
                    onClick={() => {
                      handleModalClose();
                      onOpenCreateAd();
                    }}
                    className="text-slate-950 font-bold hover:underline cursor-pointer"
                  >
                    + Create New Ad
                  </button>
                </div>
              )}

              {errorMsg && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div className="flex gap-2 sm:gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleModalClose}
                  className="w-1/3 py-3 sm:py-3.5 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs sm:text-sm hover:bg-slate-50 transition cursor-pointer touch-manipulation"
                >
                  Close
                </button>
                <button
                  type="submit"
                  className="w-2/3 py-3 sm:py-3.5 rounded-xl bg-slate-950 text-white font-black text-xs sm:text-base hover:bg-slate-800 transition shadow-sm cursor-pointer touch-manipulation"
                >
                  PLACE BID
                </button>
              </div>
            </form>

            {/* Anonymized Bids Feed */}
            <div className="pt-3 border-t border-slate-100 text-left">
              <span className="text-xs font-bold text-slate-600 block mb-2">
                Recent Bids for This Slot
              </span>
              <div className="space-y-1.5 max-h-24 sm:max-h-28 overflow-y-auto">
                {recentBids.slice(0, 4).map((b, idx) => (
                  <div
                    key={b.id}
                    className="flex items-center justify-between text-xs py-1.5 px-2.5 rounded bg-slate-50 border border-slate-100"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900">${b.amount}</span>
                      <span className="text-slate-500 text-[11px] font-mono">
                        {anonymizeUserId(b.userId)}
                      </span>
                      {idx === 0 && (
                        <span className="text-[9px] uppercase font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                          Highest
                        </span>
                      )}
                    </div>
                    <span className="font-mono text-[10px] text-slate-400">
                      {new Date(b.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: CONFIRM YOUR BID */}
        {step === 'confirm' && (
          <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 overflow-y-auto flex-1">
            <div className="text-center space-y-1">
              <h4 className="text-base sm:text-lg font-black text-slate-950">CONFIRM YOUR BID</h4>
              <p className="text-xs text-slate-500">
                You are bidding for the exclusive next 60-second homepage broadcast.
              </p>
            </div>

            <div className="p-4 sm:p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-3 text-xs sm:text-sm text-left">
              <div className="flex justify-between py-1 border-b border-slate-200/60">
                <span className="text-slate-500">Advertisement</span>
                <span className="font-bold text-slate-900 truncate max-w-[200px]">{selectedAd?.brandName}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200/60">
                <span className="text-slate-500">Current Highest</span>
                <span className="font-mono text-slate-700">${currentBid}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200/60">
                <span className="text-slate-500">Your Bid</span>
                <span className="text-lg sm:text-xl font-black text-slate-950">${bidAmount}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200/60">
                <span className="text-slate-500">Slot Duration</span>
                <span className="font-bold text-slate-900">Exactly 60 Seconds</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Auction Closes In</span>
                <span className="font-mono font-bold text-rose-600">
                  {formatCountdown(auctionRemainingSeconds)}
                </span>
              </div>
            </div>

            <div className="flex gap-2 sm:gap-3">
              <button
                type="button"
                onClick={() => setStep('input')}
                className="w-1/2 py-3 rounded-xl border border-slate-300 font-semibold text-xs sm:text-sm text-slate-700 hover:bg-slate-50 cursor-pointer touch-manipulation"
              >
                BACK
              </button>
              <button
                type="button"
                onClick={handleConfirmBid}
                className="w-1/2 py-3 rounded-xl bg-slate-950 text-white font-black text-xs sm:text-sm hover:bg-slate-800 transition shadow-sm cursor-pointer touch-manipulation"
              >
                CONFIRM BID
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: BID PLACED SUCCESS */}
        {step === 'success' && (
          <div className="p-5 sm:p-8 text-center space-y-4 sm:space-y-6 overflow-y-auto flex-1">
            <div className="h-14 w-14 sm:h-16 sm:w-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
              <CheckCircle2 className="h-8 w-8 sm:h-10 sm:w-10" />
            </div>

            <div>
              <div className="text-xs uppercase font-extrabold tracking-wider text-emerald-600">
                🔥 BID PLACED
              </div>
              <h4 className="text-xl sm:text-2xl font-black text-slate-950 mt-1">
                You are currently #1 HIGHEST BIDDER
              </h4>
              <p className="text-xs text-slate-500 mt-2 max-w-sm mx-auto">
                If no higher bid is placed before countdown zero, you will win the next 60 seconds of exclusive homepage broadcast.
              </p>
            </div>

            <div className="p-3.5 sm:p-4 rounded-xl bg-slate-950 text-white text-left grid grid-cols-2 gap-3 sm:gap-4">
              <div>
                <span className="text-[10px] sm:text-[11px] text-slate-400 block uppercase">Your Bid</span>
                <span className="text-xl sm:text-2xl font-black text-emerald-400">${bidAmount}</span>
              </div>
              <div className="text-right">
                <span className="text-[10px] sm:text-[11px] text-slate-400 block uppercase">Auction Closes In</span>
                <span className="text-lg sm:text-xl font-mono font-bold text-white">
                  {formatCountdown(auctionRemainingSeconds)}
                </span>
              </div>
            </div>

            <div className="space-y-2 sm:space-y-3">
              <button
                type="button"
                onClick={handleModalClose}
                className="w-full py-3 sm:py-3.5 rounded-xl bg-slate-950 text-white font-bold text-sm hover:bg-slate-800 transition shadow-xs cursor-pointer touch-manipulation"
              >
                VIEW HOMEPAGE
              </button>

              <button
                type="button"
                onClick={() => {
                  simulateCompetingBid();
                  handleModalClose();
                }}
                className="w-full py-2.5 rounded-lg border border-slate-200 text-slate-600 text-xs font-medium hover:bg-slate-50 transition flex items-center justify-center gap-1.5 cursor-pointer touch-manipulation"
                title="Test what happens when another user bids higher right now"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Simulate being Outbid (Demo Helper)</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
