/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { MarketplaceProvider, useMarketplace } from './context/MarketplaceContext.tsx';
import { Navbar } from './components/Navbar.tsx';
import { SingleSlotHero } from './components/SingleSlotHero.tsx';
import { HowItWorksSection } from './components/HowItWorksSection.tsx';
import { SequentialScheduleQueue } from './components/SequentialScheduleQueue.tsx';
import { Footer } from './components/Footer.tsx';
import { SingleSlotBidModal } from './components/SingleSlotBidModal.tsx';
import { CreateAdModal } from './components/CreateAdModal.tsx';
import { SingleSlotPaymentModal } from './components/SingleSlotPaymentModal.tsx';
import { OutbidNotificationToast } from './components/OutbidNotificationToast.tsx';
import { AdvertiserDashboard } from './components/AdvertiserDashboard.tsx';
import { AdminPortal } from './components/AdminPortal.tsx';

function SingleSlotApp() {
  const [currentView, setCurrentView] = useState<'homepage' | 'dashboard' | 'admin'>('homepage');
  const [activeModal, setActiveModal] = useState<'none' | 'bid' | 'create_ad' | 'payment'>('none');

  const { nextSlotAuction, awaitingPaymentAuction, switchUser, currentUser } = useMarketplace();
  const [hasPromptedPaymentForAuctionId, setHasPromptedPaymentForAuctionId] = useState<string | null>(null);

  // When an auction closes with status AWAITING_PAYMENT and current user is winner, auto-prompt payment once
  useEffect(() => {
    if (
      awaitingPaymentAuction &&
      awaitingPaymentAuction.status === 'AWAITING_PAYMENT' &&
      awaitingPaymentAuction.currentBidderId === currentUser.id &&
      hasPromptedPaymentForAuctionId !== awaitingPaymentAuction.id
    ) {
      setActiveModal('payment');
      setHasPromptedPaymentForAuctionId(awaitingPaymentAuction.id);
    }
  }, [awaitingPaymentAuction, currentUser.id, hasPromptedPaymentForAuctionId]);

  // If in Admin Console
  if (currentView === 'admin') {
    return (
      <AdminPortal
        onBackToMarketplace={() => {
          switchUser('advertiser');
          setCurrentView('homepage');
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans selection:bg-slate-900 selection:text-white flex flex-col justify-between antialiased">
      {/* Navbar: 60SEC, How It Works, Advertise, My Bids, Sign In */}
      <Navbar
        currentView={currentView}
        setCurrentView={setCurrentView}
        onOpenCreateAd={() => setActiveModal('create_ad')}
      />

      {currentView === 'homepage' ? (
        /* HOMEPAGE REVOLVING AROUND THE SINGLE SCARCE ADVERTISING SLOT */
        <main className="flex-1 w-full">
          {/* Hero: "THE NEXT 60 SECONDS", Current Live Ad, and Next Slot Auction */}
          <SingleSlotHero
            onBidNowClick={() => setActiveModal('bid')}
          />

          {/* How It Works (6 Steps) */}
          <HowItWorksSection />

          {/* Sequential Schedule Queue (Proof of zero overlap & strict 60s sequential queue) */}
          <SequentialScheduleQueue />
        </main>
      ) : (
        /* Advertiser Workspace */
        <main className="flex-1 w-full">
          <AdvertiserDashboard
            onOpenBidModal={() => setActiveModal('bid')}
            onOpenPaymentModal={() => setActiveModal('payment')}
            onOpenCreateAd={() => setActiveModal('create_ad')}
          />
        </main>
      )}

      {/* Footer */}
      <Footer
        onNavigateHowItWorks={() => {
          setCurrentView('homepage');
          setTimeout(() => {
            document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' });
          }, 50);
        }}
        onOpenCreateAd={() => setActiveModal('create_ad')}
        onOpenAdmin={() => {
          switchUser('admin');
          setCurrentView('admin');
        }}
      />

      {/* Exclusively render at most ONE modal at any given time to prevent stacking & uncloseable overlaps */}
      {activeModal === 'bid' && (
        <SingleSlotBidModal
          isOpen={true}
          onClose={() => setActiveModal('none')}
          onOpenCreateAd={() => setActiveModal('create_ad')}
          onOpenPayment={() => setActiveModal('payment')}
        />
      )}

      {activeModal === 'create_ad' && (
        <CreateAdModal
          isOpen={true}
          onClose={() => setActiveModal('none')}
          onAdCreated={() => setActiveModal('bid')}
        />
      )}

      {activeModal === 'payment' && (
        <SingleSlotPaymentModal
          isOpen={true}
          auction={awaitingPaymentAuction || nextSlotAuction}
          onClose={() => setActiveModal('none')}
          onViewInDashboard={() => {
            setActiveModal('none');
            setCurrentView('dashboard');
          }}
        />
      )}

      {/* Non-intrusive outbid notification toast with quick-action */}
      <OutbidNotificationToast
        onBidAgainClick={() => setActiveModal('bid')}
      />
    </div>
  );
}

export default function App() {
  return (
    <MarketplaceProvider>
      <SingleSlotApp />
    </MarketplaceProvider>
  );
}
