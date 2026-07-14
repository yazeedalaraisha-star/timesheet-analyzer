import React from "react";
import { TimesheetAnalysisResult, SavedReport } from "../types";
import { useLang } from "../context/LanguageContext";
import { BarChart3, Users, TrendingUp } from "lucide-react";

interface Props {
  reports: SavedReport[];
  onSelect: (result: TimesheetAnalysisResult) => void;
  onBack: () => void;
}

export default function AdminPanel({ reports, onSelect, onBack }: Props) {
  const { t } = useLang();

  const uniqueEmployees = new Set(reports.map((r) => r.result.employee_info.id)).size;
  const avgCompliance =
    reports.length > 0
      ? Math.round(
          reports.reduce((sum, r) => sum + (r.result.kpis.correctAttendancePercentage ?? 100), 0) /
            reports.length
        )
      : 0;

  return (
    <div className="space-y-6 animate-fade-in-down">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-indigo-600" />
            {t("adminTitle")}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{t("adminDesc")}</p>
        </div>
        <button
          onClick={onBack}
          className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-lg transition-all"
        >
          {t("backToMain")}
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-2 text-slate-400 dark:text-slate-500 text-xs font-bold mb-1">
            <BarChart3 className="h-3.5 w-3.5" />
            {t("totalReports")}
          </div>
          <p className="text-2xl font-black text-indigo-600 dark:text-indigo-400">{reports.length}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-2 text-slate-400 dark:text-slate-500 text-xs font-bold mb-1">
            <Users className="h-3.5 w-3.5" />
            {t("totalEmployees")}
          </div>
          <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{uniqueEmployees}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-2 text-slate-400 dark:text-slate-500 text-xs font-bold mb-1">
            <TrendingUp className="h-3.5 w-3.5" />
            {t("avgCompliance")}
          </div>
          <p className="text-2xl font-black text-violet-600 dark:text-violet-400">{avgCompliance}%</p>
        </div>
      </div>

      {/* Reports List */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800">
          <h3 className="font-bold text-sm text-slate-900 dark:text-white">{t("recentReports")}</h3>
        </div>
        {reports.length === 0 ? (
          <div className="p-8 text-center text-slate-400 dark:text-slate-500 text-xs">
            {t("noAdminData")}
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {reports.map((report) => (
              <div
                key={report.id}
                className="flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
              >
                <div className="space-y-0.5">
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                    {report.result.employee_info.name}
                  </p>
                  <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                    <span>ID: {report.result.employee_info.id}</span>
                    <span>|</span>
                    <span>{report.savedAt}</span>
                    <span>|</span>
                    <span className="text-indigo-600 dark:text-indigo-400 font-bold">
                      {report.result.kpis.correctAttendancePercentage ?? 100}%
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => onSelect(report.result)}
                  className="px-3 py-1.5 bg-indigo-50 dark:bg-indigo-950/30 hover:bg-indigo-100 dark:hover:bg-indigo-950/50 text-indigo-700 dark:text-indigo-400 text-xs font-bold rounded-lg transition-all"
                >
                  {t("viewReport")}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
