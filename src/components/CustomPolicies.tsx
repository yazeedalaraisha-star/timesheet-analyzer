import React, { useState, useEffect } from "react";
import { useLang } from "../context/LanguageContext";
import { Settings, Save, CheckCircle2 } from "lucide-react";

interface WorkPolicies {
  gracePeriod: number;
  overtimeThreshold: number;
  maxDelaysAllowed: number;
}

const defaultPolicies: WorkPolicies = {
  gracePeriod: 0,
  overtimeThreshold: 0,
  maxDelaysAllowed: 10,
};

interface Props {
  policies: WorkPolicies;
  onSave: (p: WorkPolicies) => void;
}

export default function CustomPolicies({ policies: initial, onSave }: Props) {
  const { t } = useLang();
  const [local, setLocal] = useState<WorkPolicies>(initial);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    onSave(local);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
          <Settings className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
          {t("policiesTitle")}
        </h3>
        {saved && (
          <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 animate-fade-in-down">
            <CheckCircle2 className="h-3 w-3" />
            {t("policiesSaved")}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">
            {t("gracePeriod")}
          </label>
          <input
            type="number"
            min={0}
            max={60}
            value={local.gracePeriod}
            onChange={(e) => setLocal({ ...local, gracePeriod: parseInt(e.target.value) || 0 })}
            className="w-full px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-bold text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
          />
          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">{t("gracePeriodDesc")}</p>
        </div>
        <div>
          <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">
            {t("overtimeThreshold")}
          </label>
          <input
            type="number"
            min={0}
            max={12}
            value={local.overtimeThreshold}
            onChange={(e) => setLocal({ ...local, overtimeThreshold: parseInt(e.target.value) || 0 })}
            className="w-full px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-bold text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
          />
          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">{t("overtimeThresholdDesc")}</p>
        </div>
        <div>
          <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">
            {t("maxDelaysAllowed")}
          </label>
          <input
            type="number"
            min={0}
            max={30}
            value={local.maxDelaysAllowed}
            onChange={(e) => setLocal({ ...local, maxDelaysAllowed: parseInt(e.target.value) || 0 })}
            className="w-full px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-bold text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
          />
          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">{t("maxDelaysAllowedDesc")}</p>
        </div>
      </div>

      <button
        onClick={handleSave}
        className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all shadow-sm"
      >
        <Save className="h-3.5 w-3.5" />
        {t("savePolicies")}
      </button>
    </div>
  );
}
