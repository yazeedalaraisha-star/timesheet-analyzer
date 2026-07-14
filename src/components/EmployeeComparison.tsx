import React, { useState } from "react";
import { SavedReport, TimesheetAnalysisResult } from "../types";
import { useLang } from "../context/LanguageContext";
import { GitCompareArrows, Plus, XCircle } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

interface Props {
  reports: SavedReport[];
  onSelect: (result: TimesheetAnalysisResult) => void;
}

export default function EmployeeComparison({ reports, onSelect }: Props) {
  const { t } = useLang();
  const [selected, setSelected] = useState<string[]>([]);

  const selectedReports = reports.filter((r) => selected.includes(r.id));

  const toggleSelect = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const chartData = selectedReports.map((r) => ({
    name: r.result.employee_info.name,
    compliance: r.result.kpis.correctAttendancePercentage ?? 100,
    delays: r.result.kpis.totalDelayMinutes,
    absences: r.result.kpis.totalAbsences,
    hours: r.result.kpis.totalWorkHours ?? 0,
  }));

  if (reports.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm p-8 text-center">
        <GitCompareArrows className="h-10 w-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
        <p className="text-sm font-bold text-slate-700 dark:text-slate-300">{t("noReportsToCompare")}</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm p-6 space-y-5 animate-fade-in-down">
      <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
        <GitCompareArrows className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
        <div>
          <h3 className="font-bold text-slate-900 dark:text-white text-sm">{t("compareTitle")}</h3>
          <p className="text-[11px] text-slate-400 dark:text-slate-500">{t("compareDesc")}</p>
        </div>
      </div>

      {/* Report Selection */}
      <div className="flex flex-wrap gap-2">
        {reports.map((r) => (
          <button
            key={r.id}
            onClick={() => toggleSelect(r.id)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
              selected.includes(r.id)
                ? "bg-indigo-600 border-indigo-600 text-white"
                : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
            }`}
          >
            {selected.includes(r.id) ? <XCircle className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
            {r.result.employee_info.name} ({r.result.employee_info.id})
          </button>
        ))}
      </div>

      {/* Comparison Chart */}
      {selectedReports.length >= 2 && (
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
              <Bar dataKey="compliance" name="Compliance %" fill="#6366f1" radius={[4, 4, 0, 0]} />
              <Bar dataKey="delays" name="Delay Min" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              <Bar dataKey="absences" name="Absences" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Side-by-side KPI cards */}
      {selectedReports.length >= 2 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {selectedReports.map((r) => (
            <div
              key={r.id}
              onClick={() => onSelect(r.result)}
              className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20 hover:bg-indigo-50/30 dark:hover:bg-indigo-950/20 cursor-pointer transition-all"
            >
              <p className="text-sm font-extrabold text-slate-800 dark:text-slate-200 mb-2">
                {r.result.employee_info.name}
              </p>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <span className="text-slate-400 dark:text-slate-500">Compliance</span>
                  <p className="font-bold text-indigo-600 dark:text-indigo-400">{r.result.kpis.correctAttendancePercentage ?? 100}%</p>
                </div>
                <div>
                  <span className="text-slate-400 dark:text-slate-500">Delays</span>
                  <p className="font-bold text-amber-600 dark:text-amber-400">{r.result.kpis.totalDelayMinutes} min</p>
                </div>
                <div>
                  <span className="text-slate-400 dark:text-slate-500">Absences</span>
                  <p className="font-bold text-rose-600 dark:text-rose-400">{r.result.kpis.totalAbsences}</p>
                </div>
                <div>
                  <span className="text-slate-400 dark:text-slate-500">Hours</span>
                  <p className="font-bold text-teal-600 dark:text-teal-400">{r.result.kpis.totalWorkHours ?? 0}h</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
