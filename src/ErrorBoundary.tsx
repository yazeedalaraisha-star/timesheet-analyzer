import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw, Copy, ChevronDown, ChevronUp } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  showDetails: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null, showDetails: false };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo);
    this.setState({ errorInfo });

    // Log to console for debugging
    console.group("[ErrorBoundary] Detailed Error Info");
    console.error("Error:", error.message);
    console.error("Stack:", error.stack);
    console.error("Component Stack:", errorInfo.componentStack);
    console.groupEnd();
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null, showDetails: false });
    window.location.reload();
  };

  handleCopyError = () => {
    const { error, errorInfo } = this.state;
    const text = [
      "Error: " + (error?.message || "Unknown"),
      "",
      "Stack:",
      error?.stack || "N/A",
      "",
      "Component Stack:",
      errorInfo?.componentStack || "N/A",
      "",
      "User Agent: " + navigator.userAgent,
      "URL: " + window.location.href,
      "Time: " + new Date().toISOString()
    ].join("\n");

    navigator.clipboard.writeText(text).then(() => {
      alert("تم نسخ تفاصيل الخطأ.");
    });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4" dir="rtl">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 max-w-lg w-full text-center space-y-5">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-rose-50 flex items-center justify-center text-rose-600">
              <AlertTriangle className="h-8 w-8" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">حدث خطأ غير متوقع</h2>
              <p className="text-sm text-slate-500 leading-relaxed mt-2">
                واجه التطبيق خطأ يمنعه من العمل بشكل صحيح. يمكنك إعادة تحميل الصفحة أو الاطلاع على تفاصيل الخطأ.
              </p>
            </div>

            {this.state.error && (
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs text-slate-600 font-mono text-left overflow-auto max-h-24 text-left" dir="ltr">
                {this.state.error.message}
              </div>
            )}

            {/* Toggle details */}
            <button
              onClick={() => this.setState({ showDetails: !this.state.showDetails })}
              className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 font-medium"
            >
              {this.state.showDetails ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              {this.state.showDetails ? "إخفاء التفاصيل" : "عرض تفاصيل الخطأ الكاملة"}
            </button>

            {this.state.showDetails && (
              <div className="text-left space-y-2 animate-fade-in-down" dir="ltr">
                {this.state.error?.stack && (
                  <div>
                    <p className="text-[10px] font-bold text-slate-500 mb-1">Stack Trace:</p>
                    <pre className="bg-slate-900 text-slate-200 p-3 rounded-xl text-[10px] overflow-auto max-h-32 leading-relaxed">
                      {this.state.error.stack}
                    </pre>
                  </div>
                )}
                {this.state.errorInfo?.componentStack && (
                  <div>
                    <p className="text-[10px] font-bold text-slate-500 mb-1">Component Stack:</p>
                    <pre className="bg-slate-900 text-slate-200 p-3 rounded-xl text-[10px] overflow-auto max-h-32 leading-relaxed">
                      {this.state.errorInfo.componentStack}
                    </pre>
                  </div>
                )}
                <button
                  onClick={this.handleCopyError}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg border border-slate-200 transition-all"
                >
                  <Copy className="h-3 w-3" />
                  نسخ تفاصيل الخطأ
                </button>
              </div>
            )}

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={this.handleReset}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl transition-all"
              >
                <RefreshCw className="h-4 w-4" />
                إعادة تحميل الصفحة
              </button>
              <button
                onClick={() => window.history.back()}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold rounded-xl transition-all"
              >
                العودة
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
