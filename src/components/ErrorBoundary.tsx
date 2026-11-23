import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface State {
  error: Error | null;
}

/** Last line of defence: a render error must never leave the user with a blank screen. */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("UI crashed:", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div dir="rtl" className="min-h-screen flex items-center justify-center p-6 bg-slate-950 text-slate-100">
        <div className="max-w-md w-full rounded-3xl border border-slate-800 bg-slate-900 p-8 text-center shadow-2xl qto-pop-in">
          <div className="mx-auto mb-5 w-14 h-14 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center">
            <AlertTriangle className="w-7 h-7 text-rose-400" />
          </div>
          <h1 className="text-lg font-bold mb-2">حدث خطأ غير متوقع</h1>
          <p className="text-sm text-slate-400 leading-relaxed mb-6">
            بياناتك محفوظة على جهازك ولم تُفقد. أعد تحميل التطبيق للمتابعة، وإن تكرر الخطأ فصدّر نسخة احتياطية من
            شاشة المشاريع بعد إعادة التحميل.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm"
          >
            <RefreshCw className="w-4 h-4" />
            إعادة التحميل
          </button>
          <pre className="mt-6 text-[10px] text-slate-600 text-left overflow-auto max-h-24" dir="ltr">
            {String(this.state.error?.message || "")}
          </pre>
        </div>
      </div>
    );
  }
}
