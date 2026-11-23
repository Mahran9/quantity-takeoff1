import React, { useState } from "react";
import { Smartphone, Download, Check } from "lucide-react";
import { usePWAInstall } from "../hooks/usePWAInstall";

interface PWAInstallButtonProps {
  onOpenApkModal: () => void;
  className?: string;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  onOpenApkModal,
  className = "",
}) => {
  const { isInstallable, isInstalled, install } = usePWAInstall();
  const [justInstalled, setJustInstalled] = useState(false);

  // If already installed, show subtle installed badge or allow opening APK guide
  if (isInstalled || justInstalled) {
    return (
      <button
        onClick={onOpenApkModal}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25 transition-all cursor-pointer ${className}`}
        title="التطبيق مثبت كـ APK / PWA"
      >
        <Check className="w-3.5 h-3.5 text-emerald-400" />
        <span className="hidden sm:inline">تطبيق أندرويد مثبت</span>
        <span className="sm:hidden">مثبت</span>
      </button>
    );
  }

  // If install prompt is ready on Android / Desktop Chrome
  if (isInstallable) {
    return (
      <button
        onClick={async () => {
          const success = await install();
          if (success) {
            setJustInstalled(true);
          } else {
            onOpenApkModal();
          }
        }}
        className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 shadow-md shadow-amber-500/20 transition-all cursor-pointer ${className}`}
        title="تثبيت التطبيق كـ APK على أندرويد"
      >
        <Smartphone className="w-4 h-4 text-slate-950" />
        <span>تثبيت APK</span>
      </button>
    );
  }

  // Default fallback: Always allow opening the APK & Installation modal!
  return (
    <button
      onClick={onOpenApkModal}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 text-amber-400 border border-amber-500/30 hover:border-amber-400/60 shadow-sm transition-all cursor-pointer ${className}`}
      title="تحميل وتثبيت التطبيق بصيغة APK للأندرويد"
    >
      <Smartphone className="w-4 h-4 text-amber-400" />
      <span>تثبيت كـ APK</span>
    </button>
  );
};
