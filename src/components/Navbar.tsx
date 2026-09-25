import React, { useState } from 'react';
import { useMarketplace } from '../context/MarketplaceContext.tsx';
import { User, Shield, Menu, X } from 'lucide-react';

interface NavbarProps {
  currentView: 'homepage' | 'dashboard' | 'admin';
  setCurrentView: (view: 'homepage' | 'dashboard' | 'admin') => void;
  onOpenCreateAd: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentView, setCurrentView, onOpenCreateAd }) => {
  const { currentUser, switchUser, currentLiveSchedule, liveRemainingSeconds } = useMarketplace();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200">
      <div className="max-w-6xl mx-auto px-3.5 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-18">
          {/* Logo & Core Product Name */}
          <div className="flex items-center gap-4 sm:gap-6 lg:gap-8">
            <button
              onClick={() => {
                setCurrentView('homepage');
                setMobileMenuOpen(false);
              }}
              className="flex items-center gap-2 sm:gap-2.5 text-left cursor-pointer focus:outline-none touch-manipulation"
            >
              <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-lg sm:rounded-xl bg-slate-950 text-white flex items-center justify-center font-black text-sm sm:text-base tracking-tighter shrink-0 shadow-xs">
                60
              </div>
              <div>
                <span className="font-black text-lg sm:text-xl tracking-tight text-slate-950 block leading-tight">
                  60SEC
                </span>
              </div>
            </button>

            {/* Navigation links (Desktop) */}
            <nav className="hidden md:flex items-center space-x-1">
              <button
                onClick={() => {
                  setCurrentView('homepage');
                  setTimeout(() => {
                    document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' });
                  }, 50);
                }}
                className="px-3.5 py-2 text-sm font-medium text-slate-600 hover:text-slate-950 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
              >
                How It Works
              </button>
              <button
                onClick={onOpenCreateAd}
                className="px-3.5 py-2 text-sm font-medium text-slate-600 hover:text-slate-950 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
              >
                Advertise
              </button>
              <button
                onClick={() => setCurrentView('dashboard')}
                className={`px-3.5 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer ${
                  currentView === 'dashboard'
                    ? 'text-slate-950 bg-slate-100 font-bold'
                    : 'text-slate-600 hover:text-slate-950 hover:bg-slate-50'
                }`}
              >
                My Bids
              </button>
            </nav>
          </div>

          {/* Right Controls (Desktop & Tablet) */}
          <div className="hidden sm:flex items-center space-x-2.5 lg:space-x-3">
            {/* Exactly One Live Broadcast Indicator */}
            {currentLiveSchedule && (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 border border-rose-200 text-rose-700">
                <span className="h-2 w-2 rounded-full bg-rose-500 animate-ping shrink-0"></span>
                <span className="font-bold text-[11px] sm:text-xs">
                  {currentLiveSchedule.scheduleCode.replace('-', ' ')} LIVE
                </span>
                <span className="font-mono font-bold text-rose-950 px-1 py-0.5 rounded bg-rose-100/80">
                  {liveRemainingSeconds}s
                </span>
              </div>
            )}

            {/* Persona Switcher */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs">
              <button
                onClick={() => {
                  switchUser('advertiser');
                  if (currentView === 'admin') setCurrentView('homepage');
                }}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md font-medium transition cursor-pointer touch-manipulation ${
                  currentUser.role === 'advertiser'
                    ? 'bg-white text-slate-900 shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <User className="h-3.5 w-3.5" />
                <span className="hidden lg:inline">Advertiser</span>
              </button>
              <button
                onClick={() => {
                  switchUser('admin');
                  setCurrentView('admin');
                }}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md font-medium transition cursor-pointer touch-manipulation ${
                  currentUser.role === 'admin'
                    ? 'bg-slate-950 text-white shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Shield className="h-3.5 w-3.5" />
                <span className="hidden lg:inline">Admin</span>
              </button>
            </div>

            {/* Quick Create Ad CTA */}
            <button
              onClick={onOpenCreateAd}
              className="px-3.5 sm:px-4 py-2 rounded-xl bg-slate-950 text-white text-xs sm:text-sm font-bold hover:bg-slate-800 transition shadow-xs cursor-pointer shrink-0 touch-manipulation"
            >
              + Create Ad
            </button>
          </div>

          {/* Mobile Right Controls (< 640px) */}
          <div className="flex sm:hidden items-center gap-1.5">
            {currentLiveSchedule && (
              <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 border border-rose-200 text-rose-700">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-ping shrink-0"></span>
                <span>{liveRemainingSeconds}s</span>
              </div>
            )}

            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="h-10 w-10 min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-slate-700 hover:bg-slate-100 active:scale-95 transition cursor-pointer touch-manipulation"
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? (
                <X className="h-5 w-5 pointer-events-none" />
              ) : (
                <Menu className="h-5 w-5 pointer-events-none" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Dropdown Drawer */}
      {mobileMenuOpen && (
        <div className="sm:hidden border-t border-slate-200 bg-white px-4 pt-3 pb-5 space-y-3 shadow-xl">
          <div className="flex flex-col space-y-1">
            <button
              onClick={() => {
                setCurrentView('homepage');
                setMobileMenuOpen(false);
                setTimeout(() => {
                  document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' });
                }, 50);
              }}
              className="px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-xl text-left touch-manipulation"
            >
              How It Works
            </button>
            <button
              onClick={() => {
                setCurrentView('dashboard');
                setMobileMenuOpen(false);
              }}
              className={`px-3 py-2.5 text-sm font-medium rounded-xl text-left touch-manipulation ${
                currentView === 'dashboard' ? 'bg-slate-100 font-bold text-slate-950' : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              My Bids
            </button>
            <button
              onClick={() => {
                switchUser('admin');
                setCurrentView('admin');
                setMobileMenuOpen(false);
              }}
              className={`px-3 py-2.5 text-sm font-medium rounded-xl text-left flex items-center gap-2 touch-manipulation ${
                currentView === 'admin' ? 'bg-slate-950 text-white font-bold' : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Shield className="h-4 w-4" />
              <span>Operator Console & Harness</span>
            </button>
          </div>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2.5">
            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs flex-1">
              <button
                onClick={() => {
                  switchUser('advertiser');
                  if (currentView === 'admin') setCurrentView('homepage');
                }}
                className={`w-1/2 py-2 text-center font-medium rounded-md transition touch-manipulation ${
                  currentUser.role === 'advertiser' ? 'bg-white font-bold text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                Advertiser
              </button>
              <button
                onClick={() => {
                  switchUser('admin');
                  setCurrentView('admin');
                }}
                className={`w-1/2 py-2 text-center font-medium rounded-md transition touch-manipulation ${
                  currentUser.role === 'admin' ? 'bg-slate-900 text-white font-bold' : 'text-slate-600'
                }`}
              >
                Admin
              </button>
            </div>

            <button
              onClick={() => {
                setMobileMenuOpen(false);
                onOpenCreateAd();
              }}
              className="py-2.5 px-4 rounded-xl bg-slate-950 text-white text-xs font-bold hover:bg-slate-800 transition shrink-0 touch-manipulation shadow-xs"
            >
              + Create Ad
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
