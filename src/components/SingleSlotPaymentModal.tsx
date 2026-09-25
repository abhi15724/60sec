import React, { useState } from 'react';
import { useMarketplace } from '../context/MarketplaceContext.tsx';
import { Auction, AdSchedule } from '../core/types.ts';
import { Trophy, CheckCircle, CreditCard, X, ArrowRight, AlertCircle } from 'lucide-react';

interface SingleSlotPaymentModalProps {
  isOpen: boolean;
  auction: Auction | null;
  onClose: () => void;
  onViewInDashboard?: () => void;
}

export const SingleSlotPaymentModal: React.FC<SingleSlotPaymentModalProps> = ({
  isOpen,
  auction,
  onClose,
  onViewInDashboard,
}) => {
  const { makePayment } = useMarketplace();
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentResult, setPaymentResult] = useState<AdSchedule | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Close on Escape key & Lock background scroll
  React.useEffect(() => {
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

  if (!isOpen || !auction) return null;

  const winningAmount = auction.currentBid || auction.startingBid;

  const handleModalClose = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    onClose();
  };

  const handlePayNow = () => {
    setIsProcessing(true);
    setErrorMsg(null);

    setTimeout(() => {
      const res = makePayment(auction.id);
      setIsProcessing(false);
      if (!res.success) {
        setErrorMsg(res.error || 'Payment failed.');
      } else if (res.schedule) {
        setPaymentResult(res.schedule);
      }
    }, 900);
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
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
      aria-labelledby="payment-modal-title"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg bg-white rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-auto max-h-[94vh] sm:max-h-[90vh] flex flex-col transition-all"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-100 bg-slate-50/80 shrink-0">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-amber-500 shrink-0" />
            <span className="text-xs uppercase font-extrabold tracking-wider text-slate-800">
              Auction Settlement
            </span>
          </div>

          <button
            type="button"
            onClick={handleModalClose}
            aria-label="Close auction settlement window"
            className="h-10 w-10 min-w-[40px] min-h-[40px] flex items-center justify-center rounded-full sm:rounded-xl text-slate-500 hover:text-slate-950 bg-slate-100 hover:bg-slate-200 active:scale-95 transition-all cursor-pointer z-10 touch-manipulation focus:outline-none focus:ring-2 focus:ring-slate-900"
          >
            <X className="h-5 w-5 pointer-events-none stroke-[2.5]" />
          </button>
        </div>

        {!paymentResult ? (
          /* STEP 1: PAYMENT REQUIRED */
          <div className="p-4 sm:p-8 text-center space-y-4 sm:space-y-6 overflow-y-auto flex-1">
            <div className="h-12 w-12 sm:h-16 sm:w-16 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mx-auto shadow-inner">
              <Trophy className="h-6 w-6 sm:h-8 sm:w-8" />
            </div>

            <div className="space-y-1">
              <span className="text-[10px] sm:text-xs uppercase font-black tracking-widest text-amber-600 block">
                AUCTION CLOSED
              </span>
              <h3 id="payment-modal-title" className="text-lg sm:text-2xl font-black text-slate-950 tracking-tight">
                YOU WON THE NEXT 60 SECONDS
              </h3>
              <p className="text-xs text-slate-500 max-w-xs mx-auto">
                Payment is strictly required before your advertisement is assigned its authoritative broadcast window.
              </p>
            </div>

            {/* Financial Card */}
            <div className="p-3.5 sm:p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5 sm:space-y-3 text-xs sm:text-sm text-left">
              <div className="flex justify-between py-1 border-b border-slate-200/60">
                <span className="text-slate-500">Slot Inventory</span>
                <span className="font-bold text-slate-900">Homepage Exclusive 60s Slot</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200/60">
                <span className="text-slate-500">Winning Bid</span>
                <span className="font-mono font-bold text-slate-900">${winningAmount}</span>
              </div>
              <div className="flex justify-between py-1 items-center border-b border-slate-200/60">
                <span className="text-slate-700 font-bold">Payment Status</span>
                <span className="font-black uppercase text-amber-700 bg-amber-100 px-2 py-0.5 rounded text-[11px] sm:text-xs">
                  REQUIRED
                </span>
              </div>
              <div className="flex justify-between py-1 items-center pt-1.5">
                <span className="text-slate-900 font-extrabold">Amount Due</span>
                <span className="text-xl sm:text-2xl font-black text-slate-950">${winningAmount}</span>
              </div>
            </div>

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
                className="w-1/3 py-3 rounded-xl border border-slate-300 font-bold text-xs sm:text-sm text-slate-700 hover:bg-slate-50 transition cursor-pointer touch-manipulation"
              >
                Later
              </button>
              <button
                type="button"
                onClick={handlePayNow}
                disabled={isProcessing}
                className="w-2/3 py-3 sm:py-3.5 rounded-xl bg-slate-950 hover:bg-slate-800 text-white font-black text-xs sm:text-base transition shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 touch-manipulation"
              >
                {isProcessing ? (
                  <>
                    <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Settling...</span>
                  </>
                ) : (
                  <>
                    <CreditCard className="h-4 w-4" />
                    <span>PAY NOW (${winningAmount})</span>
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          /* STEP 2: YOUR SLOT IS RESERVED */
          <div className="p-4 sm:p-8 text-center space-y-4 sm:space-y-6 overflow-y-auto flex-1">
            <div className="h-12 w-12 sm:h-16 sm:w-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
              <CheckCircle className="h-6 w-6 sm:h-10 sm:w-10" />
            </div>

            <div>
              <span className="text-[10px] sm:text-xs uppercase font-black tracking-widest text-emerald-600 block">
                PAYMENT VERIFIED
              </span>
              <h3 className="text-lg sm:text-2xl lg:text-3xl font-black text-slate-950 mt-1 tracking-tight">
                YOUR SLOT IS RESERVED
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Your 60-second advertisement is confirmed and locked into the sequential homepage schedule.
              </p>
            </div>

            {/* Schedule details */}
            <div className="p-3.5 sm:p-5 rounded-xl bg-slate-900 text-white text-left space-y-2.5 sm:space-y-3 text-xs">
              <div className="flex justify-between items-center pb-2 border-b border-slate-800">
                <span className="text-slate-400 font-mono">Slot Position</span>
                <span className="font-mono font-bold text-amber-400">{paymentResult.scheduleCode}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-800">
                <span className="text-slate-400">Date</span>
                <span className="font-semibold text-white">{formatDate(paymentResult.startTime)}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-800">
                <span className="text-slate-400">Start Time</span>
                <span className="font-mono font-bold text-emerald-400">
                  {formatTime(paymentResult.startTime)}
                </span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-800">
                <span className="text-slate-400">End Time</span>
                <span className="font-mono font-bold text-emerald-400">
                  {formatTime(paymentResult.endTime)}
                </span>
              </div>
              <div className="flex justify-between items-center pt-1">
                <span className="text-slate-400">Duration</span>
                <span className="font-bold text-white">60 Seconds (Fixed)</span>
              </div>
            </div>

            <div className="flex gap-2 sm:gap-3">
              <button
                type="button"
                onClick={handleModalClose}
                className="w-1/2 py-3 rounded-xl border border-slate-300 font-bold text-xs sm:text-sm text-slate-700 hover:bg-slate-50 transition cursor-pointer touch-manipulation"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  handleModalClose();
                  if (onViewInDashboard) onViewInDashboard();
                }}
                className="w-1/2 py-3 rounded-xl bg-slate-950 text-white font-bold text-xs sm:text-sm hover:bg-slate-800 transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs touch-manipulation"
              >
                <span>MY BIDS</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
