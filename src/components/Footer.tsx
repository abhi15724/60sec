import React from 'react';

interface FooterProps {
  onNavigateHowItWorks: () => void;
  onOpenCreateAd: () => void;
}

export const Footer: React.FC<FooterProps> = ({
  onNavigateHowItWorks,
  onOpenCreateAd,
}) => {
  return (
    <footer className="bg-white border-t border-slate-200 py-10 sm:py-14 text-slate-600">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 pb-8 sm:pb-10 border-b border-slate-100 text-left">
          {/* Brand Info */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-md bg-slate-950 text-white flex items-center justify-center font-black text-sm shrink-0">
                60
              </div>
              <span className="font-extrabold text-lg text-slate-950 tracking-tight">
                60SEC
              </span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              One homepage. One advertising slot. One winning brand.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-slate-950 mb-2.5">
              Navigation
            </div>
            <ul className="space-y-2 text-xs">
              <li>
                <button
                  type="button"
                  onClick={onNavigateHowItWorks}
                  className="hover:text-slate-950 transition cursor-pointer py-1 touch-manipulation"
                >
                  How It Works
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={onOpenCreateAd}
                  className="hover:text-slate-950 transition cursor-pointer py-1 touch-manipulation"
                >
                  Advertise
                </button>
              </li>
            </ul>
          </div>

          {/* Platform Status */}
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-slate-950 mb-2.5">
              Platform
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Strict mathematical single-slot duration and sequential non-overlapping queue.
            </p>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-6 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-400 gap-3 text-center sm:text-left">
          <div>
            © {new Date().getFullYear()} 60SEC Inc. All rights reserved.
          </div>
          <div className="flex flex-wrap items-center justify-center sm:justify-end gap-2 sm:gap-4 text-[11px] sm:text-xs">
            <span>Server Time: UTC Authoritative</span>
            <span>·</span>
            <span>Single Scarce Slot Engine</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
