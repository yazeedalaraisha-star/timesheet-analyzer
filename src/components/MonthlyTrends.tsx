import React from "react";
import { SavedReport, TimesheetAnalysisResult } from "../types";
import { useLang } from "../context/LanguageContext";
import { BarChart3, TrendingDown, TrendingUp } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

interface Props {
  reports: SavedReport[];
}

export default function MonthlyTrends({ reports }: Props) {
  const { t } = useLang();

  if (reports.length < 2) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm p-8 text-center">
        <BarChart3 className="h-10 w-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
        <p className="text-sm font-bold text-slate-700 dark:text-slate-300">{t("noTrendsData")}</p>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Need at least 2 saved reports</p>
      </div>
    );
  }

  // Group by month
  const byMonth: Record<string, { delays: number; absences: number; compliance: number; count: number; hours: number }> = {};
  for (const r of reports) {
    const firstRow = r.result.daily_report.find((d) => !d.isWeekend);
    const monthKey = firstRow?.date?.substring(3) || "Unknown";
    if (!byMonth[monthKey]) {
      byMonth[monthKey] = { delays: 0, absences: 0, compliance: 0, count: 0, hours: 0 };
    }
    byMonth[monthKey].delays += r.result.kpis.totalDelayMinutes;
    byMonth[monthKey].absences += r.result.kpis.totalAbsences;
    byMonth[monthKey].compliance += r.result.kpis.correctAttendancePercentage ?? 100;
    byMonth[monthKey].hours += r.result.kpis.totalWorkHours ?? 0;
    byMonth[monthKey].count++;
  }

  const chartData = Object.entries(byMonth).map(([month, data]) => ({
    name: month,
    [t("avgDelay")]: Math.round(data.delays / data.count),
    [t("totalAbsencesTrend")]: Math.round(data.absences / data.count),
    [t("complianceRate")]: Math.round(data.compliance / data.count),
  }));

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm p-6 space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
        <div>
          <h3 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            {t("trendsTitle")}
          </h3>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{t("trendsDesc")}</p>
        </div>
      </div>

      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} tickLine={false} />
            <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
            <Tooltip
              contentStyle={{
                backgroundColor: "#1e293b",
                border: "none",
                borderRadius: "12px",
                color: "#fff",
                fontSize: "11px",
              }}
            />
            <Legend verticalAlign="top" height={36} iconType="circle" iconSize={8} wrapperStyle={{ fontSize: "11px", fontWeight: "bold" }} />
            <Bar dataKey={t("avgDelay")} fill="#f59e0b" radius={[4, 4, 0, 0]} />
            <Bar dataKey={t("totalAbsencesTrend")} fill="#ef4444" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
