import React, { useState, useEffect } from 'react';
import { useMarketplace } from '../context/MarketplaceContext.tsx';
import { X, Globe, Image as ImageIcon, AlertCircle, CheckCircle } from 'lucide-react';

interface CreateAdModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdCreated?: (adId: string) => void;
}

const PRESET_MEDIA = [
  { label: 'Shoes / Retail', url: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1200&q=80' },
  { label: 'Cloud / Tech', url: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=1200&q=80' },
  { label: 'Coffee / Food', url: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=1200&q=80' },
  { label: 'Audio / Tech', url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=1200&q=80' },
];

export const CreateAdModal: React.FC<CreateAdModalProps> = ({ isOpen, onClose, onAdCreated }) => {
  const { createAdvertisement } = useMarketplace();

  const [brandName, setBrandName] = useState('ABC Shoes');
  const [title, setTitle] = useState('Summer Flash Sale — Flat 40% OFF');
  const [mediaUrl, setMediaUrl] = useState(PRESET_MEDIA[0].url);
  const [mediaType] = useState<'image/jpeg' | 'image/png' | 'image/webp' | 'video/mp4'>('image/jpeg');
  const [websiteUrl, setWebsiteUrl] = useState('https://abcshoes.com');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

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

  if (!isOpen) return null;

  const handleModalClose = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const res = createAdvertisement({
      brandName,
      title,
      mediaUrl,
      mediaType,
      websiteUrl,
    });

    if (!res.success) {
      setErrorMsg(res.error || 'Failed to create advertisement');
    } else {
      setIsSuccess(true);
      setTimeout(() => {
        setIsSuccess(false);
        if (res.ad && onAdCreated) {
          onAdCreated(res.ad.id);
        }
        onClose();
      }, 1000);
    }
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
      aria-labelledby="create-ad-modal-title"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-xl bg-white rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-auto max-h-[94vh] sm:max-h-[90vh] flex flex-col transition-all"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-100 bg-slate-50/80 shrink-0">
          <div>
            <span className="text-[10px] uppercase font-mono font-bold tracking-wider text-slate-500 block">
              New Campaign
            </span>
            <h3 id="create-ad-modal-title" className="text-sm sm:text-base font-bold text-slate-900">
              Create 60-Second Advertisement
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

        {isSuccess ? (
          <div className="p-8 sm:p-12 text-center space-y-4 overflow-y-auto flex-1">
            <div className="h-12 w-12 sm:h-14 sm:w-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
              <CheckCircle className="h-7 w-7 sm:h-8 sm:w-8" />
            </div>
            <h4 className="text-lg sm:text-xl font-bold text-slate-900">Advertisement Created!</h4>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Your creative is ready and active for live auction bidding.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 sm:space-y-5 overflow-y-auto flex-1 text-left">
            {errorMsg && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Brand & Title */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Brand / Advertiser Name
                </label>
                <input
                  type="text"
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  placeholder="e.g. ABC Shoes"
                  required
                  minLength={2}
                  maxLength={50}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-base sm:text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-950 focus:border-transparent touch-manipulation"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Advertisement Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Summer Flash Sale — 40% OFF"
                  required
                  minLength={3}
                  maxLength={100}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-base sm:text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-950 focus:border-transparent touch-manipulation"
                />
              </div>
            </div>

            {/* Media URL & Presets */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Creative Media URL (Image/Video)
                </label>
                <span className="text-[10px] text-slate-400">JPG, PNG, WEBP</span>
              </div>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                  <ImageIcon className="h-4 w-4" />
                </span>
                <input
                  type="url"
                  value={mediaUrl}
                  onChange={(e) => setMediaUrl(e.target.value)}
                  placeholder="https://..."
                  required
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 text-base sm:text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-950 focus:border-transparent touch-manipulation"
                />
              </div>

              {/* Quick Presets */}
              <div className="mt-2 flex items-center gap-1.5 sm:gap-2 overflow-x-auto pb-1 text-xs">
                <span className="text-[11px] text-slate-400 shrink-0 font-medium">Presets:</span>
                {PRESET_MEDIA.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => setMediaUrl(preset.url)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition cursor-pointer shrink-0 touch-manipulation ${
                      mediaUrl === preset.url
                        ? 'bg-slate-950 text-white'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Website URL */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                Destination Website URL
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                  <Globe className="h-4 w-4" />
                </span>
                <input
                  type="url"
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  placeholder="https://abcshoes.com"
                  required
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 text-base sm:text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-950 focus:border-transparent touch-manipulation"
                />
              </div>
              <span className="text-[10px] text-slate-400 mt-1 block">
                Visitors clicking &quot;Visit Website&quot; during your 60s broadcast route here.
              </span>
            </div>

            {/* Live Preview Card */}
            <div>
              <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                Creative Preview (As seen in 60s broadcast)
              </span>
              <div className="p-3 rounded-xl bg-slate-950 text-white flex items-center gap-3">
                <div className="h-14 w-20 sm:h-16 sm:w-24 rounded-lg overflow-hidden bg-slate-800 shrink-0 relative">
                  <img
                    src={mediaUrl}
                    alt="Preview"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = PRESET_MEDIA[0].url;
                    }}
                  />
                  <div className="absolute top-1 left-1 bg-slate-950/80 px-1 py-0.5 rounded text-[8px] font-mono text-white">
                    60s
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] uppercase font-bold text-amber-400">{brandName || 'Brand'}</div>
                  <div className="text-xs font-bold text-white truncate">{title || 'Advertisement Title'}</div>
                  <div className="text-[10px] text-slate-400 truncate mt-0.5">{websiteUrl}</div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="pt-2 flex gap-2 sm:gap-3">
              <button
                type="button"
                onClick={handleModalClose}
                className="w-1/3 py-3 rounded-xl border border-slate-300 text-xs sm:text-sm font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer touch-manipulation"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="w-2/3 py-3 rounded-xl bg-slate-950 text-white text-xs sm:text-sm font-bold hover:bg-slate-800 shadow-sm transition cursor-pointer touch-manipulation"
              >
                SUBMIT ADVERTISEMENT
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
