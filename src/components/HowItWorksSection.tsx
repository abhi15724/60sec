import React from 'react';
import { PlusCircle, Gavel, Trophy, CreditCard, Calendar, Radio } from 'lucide-react';

export const HowItWorksSection: React.FC = () => {
  const steps = [
    {
      num: '01',
      title: 'Create Your Ad',
      desc: 'Submit your brand creative, headline, and destination website URL.',
      icon: PlusCircle,
    },
    {
      num: '02',
      title: 'Bid for the Next Slot',
      desc: 'Compete for the single scarce 60-second homepage broadcast. Each new slot auction starts from the previous auction ending price.',
      icon: Gavel,
    },
    {
      num: '03',
      title: 'Win the Auction',
      desc: 'When the timer reaches zero, the highest eligible bidder wins exclusive rights to the next slot.',
      icon: Trophy,
    },
    {
      num: '04',
      title: 'Pay Securely',
      desc: 'Winning requires immediate payment verification before the slot is officially reserved.',
      icon: CreditCard,
    },
    {
      num: '05',
      title: 'Assigned Exact Window',
      desc: 'Get assigned an exact, non-overlapping sequential time window (e.g. 12:01:00 — 12:02:00).',
      icon: Calendar,
    },
    {
      num: '06',
      title: 'Own the Homepage',
      desc: 'Your brand takes over the homepage for 60 seconds with live countdown and direct website traffic.',
      icon: Radio,
    },
  ];

  return (
    <section id="how-it-works" className="py-10 sm:py-16 bg-white border-b border-slate-200">
      <div className="max-w-4xl mx-auto px-3.5 sm:px-6 lg:px-8 space-y-8 sm:space-y-12">
        <div className="text-center space-y-2">
          <span className="text-[10px] sm:text-xs uppercase font-extrabold tracking-wider text-slate-500">
            Scarcity & Mechanics
          </span>
          <h2 className="text-2xl sm:text-4xl font-black tracking-tight text-slate-950 uppercase">
            HOW IT WORKS
          </h2>
          <p className="text-slate-600 text-xs sm:text-sm max-w-md mx-auto">
            One homepage. One advertising slot. One winning brand.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 text-left">
          {steps.map((step) => {
            const Icon = step.icon;
            return (
              <div
                key={step.num}
                className="p-5 sm:p-6 rounded-2xl bg-slate-50/70 border border-slate-200/80 hover:border-slate-300 transition shadow-xs flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-3.5 sm:mb-4">
                    <span className="font-mono text-lg sm:text-xl font-black text-slate-300">
                      {step.num}
                    </span>
                    <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-lg sm:rounded-xl bg-slate-950 text-white flex items-center justify-center shadow-xs shrink-0">
                      <Icon className="h-4 w-4" />
                    </div>
                  </div>
                  <h3 className="text-sm sm:text-base font-bold text-slate-900 mb-1 sm:mb-1.5">
                    {step.title}
                  </h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {step.desc}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
