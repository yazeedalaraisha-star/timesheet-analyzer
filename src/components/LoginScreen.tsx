import React, { useState } from "react";
import { Lock, User, Eye, EyeOff, LogIn } from "lucide-react";
import { verifyPassword } from "../apiClient";

export type UserRole = "admin" | "viewer";

interface Props {
  onLogin: (role: UserRole, name: string) => void;
}

const USERS: { name: string; role: UserRole; password: string }[] = [
  { name: "يزيد العريشة", role: "admin", password: "admin@2026" },
  { name: "متابع", role: "viewer", password: "viewer@2026" },
];

export default function LoginScreen({ onLogin }: Props) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !password.trim()) {
      setError("يرجى إدخال اسم المستخدم وكلمة المرور");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const user = USERS.find((u) => u.name === name.trim());
      if (!user) {
        setError("اسم المستخدم غير صحيح");
        setLoading(false);
        return;
      }

      const valid = await verifyPassword(password.trim());
      if (!valid) {
        setError("كلمة المرور غير صحيحة");
        setLoading(false);
        return;
      }

      onLogin(user.role, user.name);
    } catch {
      setError("خطأ في الاتصال");
    } finally {
      setLoading(false);
    }
  };

  const nameSuggestions = USERS.filter((u) =>
    u.name.includes(name.trim()) || !name.trim()
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden">
          {/* Header */}
          <div className="p-6 text-center border-b border-slate-100 dark:border-slate-800">
            <div className="mx-auto w-14 h-14 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 mb-4">
              <Lock className="h-6 w-6" />
            </div>
            <h2 className="text-lg font-black text-slate-800 dark:text-white">
              محلل كشوفات الدوام
            </h2>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
              سجّل الدخول للمتابعة
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleLogin} className="p-6 space-y-4">
            <div className="relative">
              <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                اسم المستخدم
              </label>
              <div className="relative">
                <User className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onFocus={() => {}}
                  placeholder="اختر اسمك"
                  className="w-full pr-10 pl-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-xl text-sm font-medium focus:ring-2 focus:ring-slate-300/50 focus:border-slate-400 outline-none transition-all"
                />
              </div>
              {name.trim() && nameSuggestions.length > 0 && (
                <div className="absolute z-30 top-full mt-1 left-0 right-0 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg max-h-36 overflow-y-auto">
                  {nameSuggestions.map((u) => (
                    <button
                      key={u.name}
                      type="button"
                      onClick={() => setName(u.name)}
                      className="w-full text-right px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all flex items-center gap-2"
                    >
                      <User className="h-3 w-3 text-slate-400" />
                      <span className="flex-1">{u.name}</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${u.role === "admin" ? "bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400" : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"}`}>
                        {u.role === "admin" ? "مدير" : "متابع"}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                كلمة المرور
              </label>
              <div className="relative">
                <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="أدخل كلمة المرور"
                  className="w-full pr-10 pl-10 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-xl text-sm font-medium focus:ring-2 focus:ring-slate-300/50 focus:border-slate-400 outline-none transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/40 text-rose-700 dark:text-rose-400 text-xs rounded-xl">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className={`w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-bold text-sm transition-all ${
                loading
                  ? "bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed"
                  : "bg-slate-700 hover:bg-slate-800 dark:bg-slate-600 dark:hover:bg-slate-500 text-white active:scale-[0.98]"
              }`}
            >
              {loading ? (
                <span className="animate-spin h-4 w-4 border-2 border-slate-400 border-t-transparent rounded-full" />
              ) : (
                <>
                  <LogIn className="h-4 w-4" />
                  <span>تسجيل الدخول</span>
                </>
              )}
            </button>
          </form>

          {/* Footer hint */}
          <div className="px-6 pb-4 text-center">
            <p className="text-[10px] text-slate-400 dark:text-slate-500">
              يزيد العريشة (مدير) • متابع (مشاهدة فقط)
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
