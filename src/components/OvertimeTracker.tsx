import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  Plus,
  Trash2,
  Clock,
  Calendar,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  Search,
  User,
  Users,
  FileDown,
  Download,
  ArrowDownUp,
  Upload,
  Lock,
  X,
  Undo2,
  Pencil,
  AlertTriangle,
  CalendarDays,
  History,
  Eye,
} from "lucide-react";
import * as XLSX from "xlsx";
import { OvertimeEntry } from "../types";
import { addOperation, fetchOperations, OperationLog, verifyAdminPassword } from "../apiClient";
import { exportOvertimeMonthlyPDF } from "../utils/pdfExport";
import { useLang } from "../context/LanguageContext";

interface Props {
  entries: OvertimeEntry[];
  onUpdate: (entries: OvertimeEntry[]) => void;
}

export default function OvertimeTracker({ entries, onUpdate }: Props) {
  const { t, lang } = useLang();

  const [exportMonth, setExportMonth] = useState(() => new Date().toISOString().slice(0, 7));

  const handleExportMonthlyPDF = async () => {
    const monthEntries = entries.filter((e) => e.date.startsWith(exportMonth));
    const label = monthEntries.length
      ? new Date(exportMonth + "-01").toLocaleDateString(lang === "ar" ? "ar-EG" : "en-GB", {
          year: "numeric",
          month: "long",
        })
      : t("allMonths");
    await exportOvertimeMonthlyPDF(monthEntries.length ? monthEntries : entries, label, lang as "ar" | "en");
  };
  const [formMode, setFormMode] = useState<"overtime" | "deduction">("overtime");
  const [employeeName, setEmployeeName] = useState("");
  const [showNameSuggestions, setShowNameSuggestions] = useState(false);
  const [date, setDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split("T")[0];
  });
  const [hours, setHours] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [reason, setReason] = useState("");
  const [showReasonSuggestions, setShowReasonSuggestions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [adminUnlocked, setAdminUnlocked] = useState(() => {
    try {
      return sessionStorage.getItem("ot_admin_unlocked") === "1";
    } catch {
      return false;
    }
  });
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminInput, setAdminInput] = useState("");
  const [adminError, setAdminError] = useState<string | null>(null);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminNameInput, setAdminNameInput] = useState(() => {
    try {
      return localStorage.getItem("ot_operator") || "";
    } catch {
      return "";
    }
  });
  const [undoStack, setUndoStack] = useState<OvertimeEntry[][]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [operator, setOperator] = useState(() => {
    try {
      return localStorage.getItem("ot_operator") || "";
    } catch {
      return "";
    }
  });
  const [showLog, setShowLog] = useState(false);
  const [operations, setOperations] = useState<OperationLog[]>([]);
  const [logLoading, setLogLoading] = useState(false);

  const logOperation = (action: string, employeeName?: string, hours?: number | string) => {
    const op = operator.trim() || t("unknownOperator");
    addOperation({ action, employeeName, hours, operator: op, date: new Date().toISOString().split("T")[0], timestamp: Date.now() });
  };

  const toggleLog = async () => {
    const next = !showLog;
    setShowLog(next);
    if (next && operations.length === 0) {
      setLogLoading(true);
      const logs = await fetchOperations();
      setOperations(logs);
      setLogLoading(false);
    }
  };

  const getBalanceExcluding = (name: string, excludeId: string) => {
    let o = 0, d = 0;
    for (const e of entries) {
      if (e.id === excludeId) continue;
      if (e.employeeName !== name) continue;
      if (e.type === "deduction") d += e.hours; else o += e.hours;
    }
    const net = o - d;
    return { days: Math.floor(Math.abs(net) / 8), remainingHours: Math.abs(net) % 8 };
  };

  const applyMutation = (next: OvertimeEntry[]) => {
    setUndoStack((s) => [...s.slice(-19), entries]);
    onUpdate(next);
  };

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setUndoStack((s) => s.slice(0, -1));
    onUpdate(prev);
    logOperation("undo");
  };

  const closePasswordModal = () => {
    setShowAdminModal(false);
    setAdminInput("");
    setAdminError(null);
  };

  const REASON_PRESETS = [t("reasonPreset1"), t("reasonPreset2"), t("reasonPreset3")];

  const handleCSVImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase();

    if (ext === "xlsx" || ext === "xls") {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[workbook.SheetNames[0]]);
        parseImportCSV(csv);
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = (ev) => {
        let text = ev.target?.result as string;
        if (!text) return;
        if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
        parseImportCSV(text);
      };
      reader.readAsText(file, "UTF-8");
    }
    e.target.value = "";
  };

  const parseImportCSV = (text: string) => {
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length < 2) {
        alert(t("importEmptyFile"));
        return;
      }
      const delimiter = lines[0].includes(";") ? ";" : ",";
      const header = lines[0].toLowerCase().replace(/["\s]/g, "");
      const isArabic = header.includes("الموظف") || header.includes("التاريخ");
      const newEntries: OvertimeEntry[] = [];
      const errors: string[] = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(delimiter).map((c) => c.replace(/^"|"$/g, "").trim());
        if (cols.length < 4) { errors.push(t("importRowError", { i: i + 1 })); continue; }
        const [empName, dateVal, hoursVal, notesVal, typeVal, reasonVal] = cols;
        if (!empName || !dateVal || !hoursVal) { errors.push(t("importRowIncomplete", { i: i + 1 })); continue; }
        const h = parseFloat(hoursVal);
        if (isNaN(h) || h <= 0 || h > 24) { errors.push(t("importRowBadHours", { i: i + 1, hours: hoursVal })); continue; }
        const entryType = typeVal === "deduction" || typeVal === t("csvTypeDeduction") ? "deduction" : "overtime";
        newEntries.push({
          id: "ot_import_" + Date.now() + "_" + i,
          employeeName: empName,
          date: dateVal,
          hours: h,
          notes: notesVal || "",
          type: entryType,
          reason: entryType === "deduction" ? (reasonVal || notesVal || "") : undefined,
        });
      }
      if (newEntries.length > 0) {
        if (window.confirm(t("importFoundRecords", { count: newEntries.length }))) {
          handleImportParse(newEntries);
        }
      }
      if (errors.length > 0) {
        alert(t("importErrors") + errors.slice(0, 10).join("\n"));
      }
  };

  const uniqueNames = useMemo(() => {
    const names = new Set(entries.map((e) => e.employeeName));
    return Array.from(names).sort();
  }, [entries]);

  const filteredNames = useMemo(() => {
    if (!employeeName.trim()) return uniqueNames;
    return uniqueNames.filter((n) => n.includes(employeeName.trim()));
  }, [uniqueNames, employeeName]);

  const filteredEntries = useMemo(() => {
    let result = entries;
    if (searchQuery.trim()) {
      const q = searchQuery.trim();
      result = result.filter((e) => e.employeeName.includes(q));
    }
    if (dateFrom) {
      result = result.filter((e) => e.date >= dateFrom);
    }
    if (dateTo) {
      result = result.filter((e) => e.date <= dateTo);
    }
    return result;
  }, [entries, searchQuery, dateFrom, dateTo]);

  const totalOvertimeHours = useMemo(
    () => entries.filter((e) => e.type !== "deduction").reduce((s, e) => s + e.hours, 0),
    [entries]
  );
  const totalDeductionHours = useMemo(
    () => entries.filter((e) => e.type === "deduction").reduce((s, e) => s + e.hours, 0),
    [entries]
  );
  const netHours = totalOvertimeHours - totalDeductionHours;
  const totalDays = Math.floor(Math.abs(netHours) / 8);
  const remainingHours = Math.abs(netHours) % 8;

  const perEmployeeSummary = useMemo(() => {
    const map = new Map<
      string,
      { overtime: number; deduction: number; net: number; days: number; remainingHours: number; entries: number }
    >();
    for (const e of entries) {
      const existing = map.get(e.employeeName) || {
        overtime: 0,
        deduction: 0,
        net: 0,
        days: 0,
        remainingHours: 0,
        entries: 0,
      };
      if (e.type === "deduction") {
        existing.deduction += e.hours;
      } else {
        existing.overtime += e.hours;
      }
      existing.entries += 1;
      map.set(e.employeeName, existing);
    }
    for (const [, data] of map) {
      data.net = data.overtime - data.deduction;
      data.days = Math.floor(Math.abs(data.net) / 8);
      data.remainingHours = Math.abs(data.net) % 8;
    }
    return Array.from(map.entries()).sort((a, b) => b[1].net - a[1].net);
  }, [entries]);

  const selectedEmpData = useMemo(() => {
    if (!employeeName.trim()) return null;
    const found = perEmployeeSummary.find(([name]) => name === employeeName.trim());
    return found ? found[1] : null;
  }, [employeeName, perEmployeeSummary]);

  const empTotalHours = selectedEmpData ? selectedEmpData.days * 8 + selectedEmpData.remainingHours : 0;

  const summaryMaxes = useMemo(() => {
    let maxDays = 0;
    let maxDeduction = 0;
    for (const [, d] of perEmployeeSummary) {
      if (d.days > maxDays) maxDays = d.days;
      if (d.deduction > maxDeduction) maxDeduction = d.deduction;
    }
    return { maxDays: Math.max(1, maxDays), maxDeduction: Math.max(1, maxDeduction) };
  }, [perEmployeeSummary]);

  const [thresholdDays, setThresholdDays] = useState(() => {
    const saved = localStorage.getItem("ot_threshold_days");
    const n = saved ? parseInt(saved, 10) : 20;
    return isNaN(n) || n <= 0 ? 20 : n;
  });
  useEffect(() => {
    localStorage.setItem("ot_threshold_days", String(thresholdDays));
  }, [thresholdDays]);

  const criticalEmployees = useMemo(
    () => perEmployeeSummary.filter(([, d]) => d.days >= thresholdDays && d.net > 0),
    [perEmployeeSummary, thresholdDays]
  );

  const handleAddClick = () => {
    const h = parseFloat(hours);
    if (!employeeName.trim()) {
      setError(t("errNameRequired"));
      return;
    }
    if (!date) {
      setError(t("errDateRequired"));
      return;
    }
    if (isNaN(h) || h <= 0) {
      setError(t("errHoursRequired"));
      return;
    }
    if (h > 24) {
      setError(t("errHoursMax"));
      return;
    }
    if (formMode === "deduction" && !reason.trim()) {
      setError(t("errDeductionReason"));
      return;
    }
    if (formMode === "deduction") {
      let daysAvailable = 0;
      let hoursAvailable = 0;
      if (editingId) {
        const bal = getBalanceExcluding(employeeName.trim(), editingId);
        daysAvailable = bal.days;
        hoursAvailable = bal.remainingHours;
      } else {
        daysAvailable = selectedEmpData ? selectedEmpData.days : 0;
        hoursAvailable = selectedEmpData ? selectedEmpData.remainingHours : 0;
      }
      const totalHours = daysAvailable * 8 + hoursAvailable;
      if (h === 8) {
        if (totalHours < 8) {
          setError(t("deductNotEnoughBalance"));
          return;
        }
      } else {
        if (h > 2) {
          setError(t("errDeductionMaxTwo"));
          return;
        }
        if (totalHours < h) {
          setError(t("errDeductionPartial", { available: totalHours }));
          return;
        }
      }
    }
    setError(null);
    const entry: OvertimeEntry = {
      id: editingId || "ot_" + Date.now(),
      employeeName: employeeName.trim(),
      date,
      hours: h,
      notes: notes.trim(),
      type: formMode,
      reason: formMode === "deduction" ? reason.trim() : undefined,
    };
    if (editingId) {
      const original = entries.find((e) => e.id === editingId);
      applyMutation(entries.map((e) => (e.id === editingId ? { ...entry, id: editingId } : e)));
      logOperation("edit", entry.employeeName, `${original?.hours ?? 0} -> ${entry.hours}`);
    } else {
      applyMutation([entry, ...entries]);
      logOperation(formMode === "deduction" ? "deduct" : "add", entry.employeeName, entry.hours);
    }
    setHours("");
    setNotes("");
    setReason("");
    if (editingId) cancelEditing();
  };

  const startEditing = (id: string) => {
    const entry = entries.find((e) => e.id === id);
    if (!entry) return;
    setEditingId(id);
    setFormMode(entry.type === "deduction" ? "deduction" : "overtime");
    setEmployeeName(entry.employeeName);
    setDate(entry.date);
    setHours(String(entry.hours));
    setNotes(entry.notes || "");
    setReason(entry.reason || "");
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelEditing = () => {
    setEditingId(null);
    setFormMode("overtime");
    setEmployeeName("");
    setDate(new Date().toISOString().split("T")[0]);
    setHours("");
    setNotes("");
    setReason("");
    setError(null);
  };

  const handleDeleteClick = (id: string) => {
    if (!window.confirm(t("confirmDeleteRecord"))) return;
    const target = entries.find((e) => e.id === id);
    applyMutation(entries.filter((e) => e.id !== id));
    logOperation("delete", target?.employeeName, target?.hours);
  };

  const handleClearAll = () => {
    if (searchQuery.trim() && !window.confirm(t("confirmDeleteRecords", { name: searchQuery.trim() }))) {
      return;
    }
    if (!searchQuery.trim() && !window.confirm(t("confirmDeleteAll"))) {
      return;
    }
    if (searchQuery.trim()) {
      applyMutation(entries.filter((e) => e.employeeName !== searchQuery.trim()));
      logOperation("clearEmployee", searchQuery.trim());
    } else {
      applyMutation([]);
      logOperation("clearAll");
    }
  };

  const handleImportParse = (parsed: OvertimeEntry[]) => {
    applyMutation([...parsed, ...entries]);
    logOperation("import", undefined, parsed.length);
  };

  const handleVerifyAdmin = async () => {
    if (!adminNameInput.trim()) {
      setAdminError(t("errAdminNameRequired"));
      return;
    }
    setAdminLoading(true);
    setAdminError(null);
    const valid = await verifyAdminPassword(adminInput);
    setAdminLoading(false);
    if (!valid) {
      setAdminError(t("errAdminWrong"));
      return;
    }
    setOperator(adminNameInput.trim());
    try { localStorage.setItem("ot_operator", adminNameInput.trim()); } catch {}
    setAdminUnlocked(true);
    try { sessionStorage.setItem("ot_admin_unlocked", "1"); } catch {}
    closePasswordModal();
  };

  const handleLockAdmin = () => {
    setAdminUnlocked(false);
    try { sessionStorage.removeItem("ot_admin_unlocked"); } catch {}
    setEditingId(null);
    setFormMode("overtime");
    setEmployeeName("");
    setHours("");
    setNotes("");
    setReason("");
    setError(null);
  };

  const handleExportCSV = () => {
    const headers = ["#", t("csvColEmployee"), t("csvColDate"), t("csvColDay"), t("csvColType"), t("csvColHours"), t("csvColReason"), t("csvColNotes")];
    const rows = filteredEntries.map((entry, idx) => {
      const d = new Date(entry.date);
      const dayName = d.toLocaleDateString("ar-EG", { weekday: "long" });
      return [
        filteredEntries.length - idx,
        entry.employeeName,
        entry.date,
        dayName,
        entry.type === "deduction" ? t("csvTypeDeduction") : t("csvTypeOvertime"),
        entry.hours,
        entry.reason || "-",
        entry.notes || "-",
      ];
    });

    const csvRows = [
      headers.join(","),
      ...rows.map((r) => r.map((val) => `"${String(val).replace(/"/g, '""')}"`).join(",")),
    ];
    const csvContent = csvRows.join("\r\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${t("csvFilePrefix")}${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportPDF = async () => {
    const jsPDFModule = await import("jspdf");
    const autoTableModule = await import("jspdf-autotable");
    const jsPDF = jsPDFModule.default;
    const autoTable = autoTableModule.default;

    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

    let fontRegular: string | null = null;
    let fontBold: string | null = null;
    try {
      const [regResp, boldResp] = await Promise.all([
        fetch("/fonts/NotoNaskhArabic-Regular.ttf"),
        fetch("/fonts/NotoNaskhArabic-Bold.ttf"),
      ]);
      if (regResp.ok && boldResp.ok) {
        const arrayBufferToBase64 = async (resp: Response) => {
          const buf = await resp.arrayBuffer();
          const bytes = new Uint8Array(buf);
          let bin = "";
          for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
          return btoa(bin);
        };
        fontRegular = await arrayBufferToBase64(regResp);
        fontBold = await arrayBufferToBase64(boldResp);
      }
    } catch {}

    const fontOk = !!(fontRegular && fontBold);
    if (fontOk) {
      doc.addFileToVFS("NotoNaskhArabic-Regular.ttf", fontRegular);
      doc.addFileToVFS("NotoNaskhArabic-Bold.ttf", fontBold);
      doc.addFont("NotoNaskhArabic-Regular.ttf", "NotoArabic", "normal");
      doc.addFont("NotoNaskhArabic-Bold.ttf", "NotoArabic", "bold");
      doc.setFont("NotoArabic");
    }

    const dateString = new Date().toLocaleDateString("ar-EG");

    doc.setFontSize(16);
    doc.text(t("pdfTitle"), 148, 15, { align: "center" });
    doc.setFontSize(10);
    doc.text(t("pdfExportDate", { date: dateString }), 148, 22, { align: "center" });

    if (searchQuery.trim()) {
      doc.text(t("pdfEmployeeFilter", { name: searchQuery.trim() }), 148, 28, { align: "center" });
    }
    if (dateFrom || dateTo) {
      const range = t("pdfDateRange", { from: dateFrom || "—", to: dateTo || "—" });
      doc.text(range, 148, searchQuery.trim() ? 34 : 28, { align: "center" });
    }

    const startY = 38;
    const headers = [["#", t("csvColEmployee"), t("csvColDate"), t("csvColDay"), t("csvColType"), t("csvColHours"), t("csvColReason"), t("csvColNotes")]];
    const data = filteredEntries.map((entry, idx) => {
      const d = new Date(entry.date);
      const dayName = d.toLocaleDateString("ar-EG", { weekday: "long" });
      return [
        String(filteredEntries.length - idx),
        entry.employeeName,
        entry.date,
        dayName,
        entry.type === "deduction" ? t("csvTypeDeduction") : t("csvTypeOvertime"),
        `${entry.hours}`,
        entry.reason || "-",
        entry.notes || "-",
      ];
    });

    autoTable(doc, {
      head: headers,
      body: data,
      startY,
      theme: "grid",
      styles: {
        font: fontOk ? "NotoArabic" : "helvetica",
        fontSize: 8,
        halign: "center",
        cellPadding: 3,
      },
      headStyles: {
        fillColor: [75, 101, 132],
        textColor: 255,
        fontStyle: "bold",
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 10 },
        1: { cellWidth: 35 },
        7: { cellWidth: "auto" },
      },
      margin: { left: 14, right: 14 },
      didDrawPage: (data: any) => {
        const pageHeight = doc.internal.pageSize.height;
        doc.setFontSize(9);
        doc.text(
          t("pdfSummary", { ot: totalOvertimeHours, ded: totalDeductionHours, net: netHours, days: totalDays, count: filteredEntries.length }),
          148,
          pageHeight - 10,
          { align: "center" }
        );
        doc.text(t("pdfPage", { num: doc.getNumberOfPages() }), 14, pageHeight - 10);
      },
    });

    doc.save(`${t("csvFilePrefix")}${new Date().toISOString().split("T")[0]}.pdf`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden transition-colors">
        <div className="p-6">
          <div className="flex items-center gap-3">
            <div className={`p-3 rounded-xl ${adminUnlocked ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-500" : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"}`}>
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-black text-slate-800 dark:text-white">
                  {t("overtimeTitle")}
                </h2>
                {adminUnlocked ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/40 text-[10px] font-bold">
                    <Lock className="h-3 w-3" />
                    {t("adminModeBadge")}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-900/40 text-[10px] font-bold">
                    <Eye className="h-3 w-3" />
                    {t("browseModeBadge")}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                {t("overtimeSubtitle")}
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4 flex-wrap">
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv,.txt,.xlsx,.xls"
              className="hidden"
              onChange={handleCSVImport}
            />
            {adminUnlocked ? (
              <>
                <button
                  onClick={() => csvInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 transition-all"
                >
                  <Upload className="h-3.5 w-3.5" />
                  <span>{t("importCsvExcel")}</span>
                </button>
                <button
                  onClick={handleLockAdmin}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/40 text-rose-600 dark:text-rose-400 text-xs font-semibold rounded-lg border border-rose-200 dark:border-rose-900/40 transition-all"
                >
                  <Lock className="h-3.5 w-3.5" />
                  <span>{t("exitAdminMode")}</span>
                </button>
              </>
            ) : (
              <button
                onClick={() => setShowAdminModal(true)}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-sm transition-all"
              >
                <Lock className="h-3.5 w-3.5" />
                <span>{t("unlockAdminBtn")}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-sm transition-colors">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500">{t("employeesCount")}</span>
              <div className="flex items-baseline gap-1 pt-1">
                <span className="text-3xl font-black text-slate-700 dark:text-white">{perEmployeeSummary.length}</span>
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400">{t("employeesCountUnit")}</span>
              </div>
            </div>
            <div className="p-2.5 bg-slate-100 dark:bg-slate-800 text-slate-400 rounded-lg">
              <Users className="h-4 w-4" />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-sm transition-colors">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500">{t("overtimeHours")}</span>
              <div className="flex items-baseline gap-1 pt-1">
                <span className="text-3xl font-black text-emerald-600 dark:text-emerald-400">{totalOvertimeHours}</span>
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500">{t("hours")}</span>
              </div>
            </div>
            <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-500 rounded-lg">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-sm transition-colors">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500">{t("deductions")}</span>
              <div className="flex items-baseline gap-1 pt-1">
                <span className="text-3xl font-black text-rose-600 dark:text-rose-400">{totalDeductionHours}</span>
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500">{t("hours")}</span>
              </div>
            </div>
            <div className="p-2.5 bg-rose-50 dark:bg-rose-950/30 text-rose-500 rounded-lg">
              <TrendingDown className="h-4 w-4" />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-sm transition-colors">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500">{t("netHours")}</span>
              <div className="flex items-baseline gap-1 pt-1">
                <span className={`text-3xl font-black ${netHours >= 0 ? "text-slate-700 dark:text-white" : "text-rose-600 dark:text-rose-400"}`}>
                  {netHours}
                </span>
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500">{t("hours")}</span>
              </div>
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500">
                = {totalDays} {t("dayUnit")} {remainingHours > 0 ? `و ${remainingHours} ${t("hoursShort")}` : ""}
              </span>
            </div>
            <div className={`p-2.5 rounded-lg ${netHours >= 0 ? "bg-slate-100 dark:bg-slate-800 text-slate-400" : "bg-rose-50 dark:bg-rose-950/30 text-rose-500"}`}>
              <ArrowDownUp className="h-4 w-4" />
            </div>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-sm p-5 transition-colors">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-slate-600 dark:text-slate-300">{t("progressTitle")}</span>
          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
            {remainingHours}/8 {t("hoursUnit")}
          </span>
        </div>
        <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${netHours >= 0 ? "bg-slate-600 dark:bg-slate-400" : "bg-rose-500 dark:bg-rose-400"}`}
            style={{ width: `${(remainingHours / 8) * 100}%` }}
          />
        </div>
      </div>

      {/* Balance Alert */}
      {criticalEmployees.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-xl p-4 transition-colors">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-600 dark:text-amber-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-amber-800 dark:text-amber-300">
                {t("alertTitle", { threshold: thresholdDays })}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {criticalEmployees.map(([name, d]) => (
                  <span
                    key={name}
                    onClick={() => setSearchQuery(name === searchQuery ? "" : name)}
                    className="text-[10px] font-bold text-amber-800 dark:text-amber-300 bg-white dark:bg-slate-900 px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-900/40 cursor-pointer hover:border-amber-400 transition-all"
                  >
                    {name} ({d.days} {t("dayUnit")})
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Per-Employee Summary */}
      {perEmployeeSummary.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-sm p-5 transition-colors">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-700 dark:text-white text-sm flex items-center gap-2">
              <Users className="h-4 w-4 text-slate-400" />
              <span>{t("perEmployeeSummary")}</span>
            </h3>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">{t("alertThresholdLabel")}</span>
              <input
                type="number"
                min="1"
                value={thresholdDays}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  setThresholdDays(isNaN(v) || v <= 0 ? 1 : v);
                }}
                className="w-14 px-2 py-0.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-[10px] font-bold focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {perEmployeeSummary.map(([name, data]) => (
              <div
                key={name}
                className="flex items-center gap-3 p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20 hover:bg-slate-100/50 dark:hover:bg-slate-800/40 transition-all cursor-pointer"
                onClick={() => setSearchQuery(name === searchQuery ? "" : name)}
              >
                <div className="p-2 bg-slate-100 dark:bg-slate-800 text-slate-400 rounded-lg">
                  <User className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-700 dark:text-slate-200 truncate">{name}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                      {t("dayWithCount", { count: data.days })}
                      {data.remainingHours > 0 ? ` + ${data.remainingHours} ${t("hoursShort")}` : ""}
                    </span>
                    <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-1.5 py-0.5 rounded">
                      +{data.overtime} {t("hoursShort")}
                    </span>
                    {data.deduction > 0 && (
                      <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30 px-1.5 py-0.5 rounded">
                        -{data.deduction} {t("hoursShort")}
                      </span>
                    )}
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${data.net >= 0 ? "text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800" : "text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30"}`}>
                      {t("netShort", { value: data.net })}
                    </span>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">
                      {t("recordsCount", { count: data.entries })}
                    </span>
                  </div>
                  <div className="mt-2 space-y-1.5">
                    <div>
                      <div className="flex justify-between text-[9px] font-medium text-slate-500 dark:text-slate-400 mb-0.5">
                        <span>{t("barDays")}</span>
                        <span>{data.days}</span>
                      </div>
                      <div className="h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${(data.days / summaryMaxes.maxDays) * 100}%` }} />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-[9px] font-medium text-slate-500 dark:text-slate-400 mb-0.5">
                        <span>{t("barHours")}</span>
                        <span>{data.remainingHours}</span>
                      </div>
                      <div className="h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div className="h-full bg-amber-500 rounded-full" style={{ width: `${(data.remainingHours / 8) * 100}%` }} />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-[9px] font-medium text-slate-500 dark:text-slate-400 mb-0.5">
                        <span>{t("barTaken")}</span>
                        <span>-{data.deduction}</span>
                      </div>
                      <div className="h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div className="h-full bg-rose-500 rounded-full" style={{ width: `${(data.deduction / summaryMaxes.maxDeduction) * 100}%` }} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Entry Form */}
      {adminUnlocked ? (
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm p-5 transition-colors">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
            <Plus className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <span>{editingId ? t("editEntryTitle") : t("addNewEntry")}</span>
          </h3>
          {editingId && (
            <button
              onClick={cancelEditing}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-[10px] font-bold rounded-lg transition-all"
            >
              <X className="h-3 w-3" />
              {t("cancelEdit")}
            </button>
          )}
        </div>

        {/* Mode Toggle */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setFormMode("overtime")}
            className={`flex-1 sm:flex-none px-4 py-2 text-sm font-bold rounded-xl border transition-all ${
              formMode === "overtime"
                ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                : "bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"
            }`}
          >
            <span className="flex items-center justify-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5" />
              {t("addMode")}
            </span>
          </button>
          <button
            onClick={() => setFormMode("deduction")}
            className={`flex-1 sm:flex-none px-4 py-2 text-sm font-bold rounded-xl border transition-all ${
              formMode === "deduction"
                ? "bg-rose-600 text-white border-rose-600 shadow-sm"
                : "bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"
            }`}
          >
            <span className="flex items-center justify-center gap-1.5">
              <TrendingDown className="h-3.5 w-3.5" />
              {t("deductionMode")}
            </span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="relative">
            <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">{t("employeeNameLabel")}</label>
            <input
              type="text"
              value={employeeName}
              onChange={(e) => {
                setEmployeeName(e.target.value);
                setShowNameSuggestions(true);
              }}
              onFocus={() => setShowNameSuggestions(true)}
              onBlur={() => setTimeout(() => setShowNameSuggestions(false), 200)}
              placeholder={t("employeeNamePlaceholder")}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-xl px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all"
            />
            {showNameSuggestions && filteredNames.length > 0 && (
              <div className="absolute z-30 top-full mt-1 left-0 right-0 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg max-h-40 overflow-y-auto">
                {filteredNames.map((name) => (
                  <button
                    key={name}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setEmployeeName(name);
                      setShowNameSuggestions(false);
                    }}
                    className="w-full text-right px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-amber-50 dark:hover:bg-amber-950/20 transition-all flex items-center gap-2"
                  >
                    <User className="h-3 w-3 text-slate-400" />
                    {name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">{t("dateLabel")}</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-xl px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">{t("hoursLabel")}</label>
            <input
              type="number"
              step="0.5"
              min="0.5"
              max="24"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              placeholder={t("hoursPlaceholder")}
              className={`w-full bg-slate-50 dark:bg-slate-800 border text-slate-800 dark:text-slate-100 rounded-xl px-3 py-2 text-sm font-medium focus:outline-none outline-none transition-all ${
                formMode === "deduction"
                  ? "border-rose-200 dark:border-rose-900/40 focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                  : "border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              }`}
            />
            {formMode === "deduction" && (
              <div className="mt-1.5 flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setHours("8")}
                  disabled={!!selectedEmpData && empTotalHours < 8}
                  title={selectedEmpData && empTotalHours < 8 ? t("deductNotEnoughBalance") : ""}
                  className={`flex-1 px-2 py-1 text-[10px] font-bold rounded-lg border transition-all ${
                    !selectedEmpData || empTotalHours >= 8
                      ? "text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/30 border-rose-100 dark:border-rose-900/40 hover:bg-rose-100 dark:hover:bg-rose-950/50"
                      : "text-slate-400 dark:text-slate-600 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 cursor-not-allowed"
                  }`}
                >
                  {t("deductEight")}
                </button>
                <button
                  type="button"
                  onClick={() => setHours("2")}
                  disabled={!selectedEmpData || empTotalHours < 2}
                  title={selectedEmpData && empTotalHours < 2 ? t("deductNotEnoughBalance") : ""}
                  className={`flex-1 px-2 py-1 text-[10px] font-bold rounded-lg border transition-all ${
                    selectedEmpData && empTotalHours >= 2
                      ? "text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/30 border-rose-100 dark:border-rose-900/40 hover:bg-rose-100 dark:hover:bg-rose-950/50"
                      : "text-slate-400 dark:text-slate-600 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 cursor-not-allowed"
                  }`}
                >
                  {t("deductTwoHours")}
                </button>
              </div>
            )}
            {formMode === "deduction" && selectedEmpData && (
              <div className="mt-1.5 text-[10px] font-medium text-slate-500 dark:text-slate-400">
                {t("empBalance", { days: selectedEmpData.days, hours: selectedEmpData.remainingHours })}
              </div>
            )}
          </div>
          {formMode === "deduction" ? (
            <div className="relative">
              <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">{t("deductionReasonLabel")}</label>
              <input
                type="text"
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  setShowReasonSuggestions(true);
                }}
                onFocus={() => setShowReasonSuggestions(true)}
                onBlur={() => setTimeout(() => setShowReasonSuggestions(false), 200)}
                placeholder={t("deductionReasonPlaceholder")}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-rose-200 dark:border-rose-900/40 text-slate-800 dark:text-slate-100 rounded-xl px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 outline-none transition-all"
              />
              {showReasonSuggestions && (
                <div className="absolute z-30 top-full mt-1 left-0 right-0 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg max-h-32 overflow-y-auto">
                  {REASON_PRESETS.map((r) => (
                    <button
                      key={r}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setReason(r);
                        setShowReasonSuggestions(false);
                      }}
                      className="w-full text-right px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-all"
                    >
                      {r}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div>
              <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">{t("notesOptional")}</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t("notesPlaceholder")}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-xl px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all"
              />
            </div>
          )}
        </div>

        {error && (
          <div className="mt-3 p-3 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/40 text-rose-700 dark:text-rose-400 text-xs rounded-xl flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <button
          onClick={handleAddClick}
          className={`mt-3 w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 text-white text-sm font-bold rounded-xl shadow-sm transition-all active:scale-[0.98] ${
            formMode === "deduction"
              ? "bg-rose-600 hover:bg-rose-700 shadow-rose-100 dark:shadow-none"
              : "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-100 dark:shadow-none"
          }`}
        >
          {formMode === "deduction" ? (
            <TrendingDown className="h-4 w-4" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          <span>{editingId ? t("saveEdit") : formMode === "deduction" ? t("registerDeduction") : t("addEntry")}</span>
        </button>
      </div>
      ) : (
        <button
          onClick={() => setShowAdminModal(true)}
          className="w-full bg-white dark:bg-slate-900 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 p-8 flex flex-col items-center gap-3 transition-all hover:border-emerald-400 hover:bg-emerald-50/30 dark:hover:bg-emerald-950/10 group"
        >
          <div className="p-3 bg-slate-100 dark:bg-slate-800 group-hover:bg-emerald-50 dark:group-hover:bg-emerald-950/40 text-slate-400 group-hover:text-emerald-500 rounded-xl transition-all">
            <Lock className="h-6 w-6" />
          </div>
          <div className="text-center">
            <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{t("lockNoticeTitle")}</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{t("lockNoticeDesc")}</p>
          </div>
          <span className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all">
            <Lock className="h-3.5 w-3.5" />
            {t("unlockAdminBtn")}
          </span>
        </button>
      )}

      {/* Entries Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden transition-colors">
        <div className="p-5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-3">
            <h3 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
              <Calendar className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <span>{t("recordsTitle")} ({filteredEntries.length}{searchQuery || dateFrom || dateTo ? ` ${t("recordsOf")} ${entries.length}` : ""})</span>
            </h3>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t("searchNamePlaceholder")}
                  className="pr-8 pl-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-lg text-xs font-medium focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all w-36"
                />
              </div>
              {filteredEntries.length > 0 && (
                <>
                  <button
                    onClick={handleExportPDF}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold rounded-lg transition-all"
                    title={t("exportPdfTitle")}
                  >
                    <FileDown className="h-3 w-3" />
                    PDF
                  </button>
                  <button
                    onClick={handleExportCSV}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold rounded-lg transition-all"
                    title={t("exportExcelTitle")}
                  >
                    <Download className="h-3 w-3" />
                    Excel
                  </button>
                </>
              )}
              {entries.length > 0 && (
                <>
                  <input
                    type="month"
                    value={exportMonth}
                    onChange={(e) => setExportMonth(e.target.value)}
                    className="px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-[10px] font-medium outline-none transition-all"
                    title={t("monthPicker")}
                  />
                  <button
                    onClick={handleExportMonthlyPDF}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-bold rounded-lg transition-all"
                    title={t("exportMonthlyTitle")}
                  >
                    <CalendarDays className="h-3 w-3" />
                    {t("monthlyBtn")}
                  </button>
                </>
              )}
              {adminUnlocked && entries.length > 0 && (
                <button
                  onClick={handleClearAll}
                  className="text-xs text-rose-600 dark:text-rose-400 hover:text-rose-700 font-medium hover:underline flex items-center gap-1"
                >
                  <Trash2 className="h-3 w-3" />
                  {t("clearAllBtn")}
                </button>
              )}
              {adminUnlocked && undoStack.length > 0 && (
                <button
                  onClick={handleUndo}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-indigo-50 dark:bg-indigo-950/30 hover:bg-indigo-100 dark:hover:bg-indigo-950/50 text-indigo-600 dark:text-indigo-300 text-[10px] font-bold rounded-lg border border-indigo-100 dark:border-indigo-900/40 transition-all"
                  title={t("undoTitle")}
                >
                  <Undo2 className="h-3 w-3" />
                  {t("undoBtn")}
                </button>
              )}
            </div>
          </div>
          {/* Date Range Filter */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500">{t("dateFilter")}</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-lg text-[10px] font-medium focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all"
            />
            <span className="text-[10px] text-slate-400 dark:text-slate-500">{t("to")}</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-lg text-[10px] font-medium focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all"
            />
            {(dateFrom || dateTo) && (
              <button
                onClick={() => { setDateFrom(""); setDateTo(""); }}
                className="text-[10px] text-rose-600 dark:text-rose-400 hover:underline font-bold"
              >
                {t("clearFilter")}
              </button>
            )}
          </div>
        </div>

        {filteredEntries.length === 0 ? (
          <div className="py-12 text-center text-slate-400 dark:text-slate-500">
            <Clock className="h-10 w-10 mx-auto mb-2 opacity-30 text-slate-300 dark:text-slate-600" />
            <p className="text-sm font-bold">
              {entries.length === 0 ? t("noRecords") : t("noResults")}
            </p>
            <p className="text-xs mt-1">
              {entries.length === 0 ? t("noRecordsHint") : t("noResultsHint")}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20 text-[11px] font-bold text-slate-400 dark:text-slate-500 tracking-wider">
                  <th className="py-3 px-4 font-semibold">#</th>
                  <th className="py-3 px-4 font-semibold">{t("csvColEmployee")}</th>
                  <th className="py-3 px-4 font-semibold">{t("csvColDate")}</th>
                  <th className="py-3 px-4 font-semibold">{t("csvColDay")}</th>
                  <th className="py-3 px-4 font-semibold">{t("csvColType")}</th>
                  <th className="py-3 px-4 font-semibold">{t("csvColHours")}</th>
                  <th className="py-3 px-4 font-semibold">{t("colNotes")}</th>
                  <th className="py-3 px-4 font-semibold text-center">{t("deleteBtn")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                {filteredEntries.map((entry, idx) => {
                  const d = new Date(entry.date);
                  const dayName = d.toLocaleDateString("ar-EG", { weekday: "long" });
                  const isDeduction = entry.type === "deduction";
                  return (
                    <tr
                      key={entry.id}
                      className={`hover:bg-slate-50/40 dark:hover:bg-slate-800/20 transition-all ${isDeduction ? "bg-rose-50/20 dark:bg-rose-950/5" : ""}`}
                    >
                      <td className="py-3.5 px-4 text-xs font-bold text-slate-400 dark:text-slate-500">
                        {filteredEntries.length - idx}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <div className={`p-1 rounded ${isDeduction ? "bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400" : "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400"}`}>
                            <User className="h-3 w-3" />
                          </div>
                          <span className="text-sm font-bold text-slate-800 dark:text-slate-200">{entry.employeeName}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-sm font-bold text-slate-800 dark:text-slate-200">
                        {entry.date}
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-500 dark:text-slate-400">
                        {dayName}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                          isDeduction
                            ? "bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 border border-rose-100 dark:border-rose-900/40"
                            : "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/40"
                        }`}>
                          {isDeduction ? t("typeDeduction") : t("typeOvertime")}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold border ${
                          isDeduction
                            ? "bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 border-rose-100 dark:border-rose-900/40"
                            : "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900/40"
                        }`}>
                          {isDeduction ? <TrendingDown className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                          {entry.hours} {t("hourUnit")}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-500 dark:text-slate-400 max-w-[200px] truncate">
                        {isDeduction ? (entry.reason || "-") : (entry.notes || "-")}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {adminUnlocked && (
                            <>
                              <button
                                onClick={() => startEditing(entry.id)}
                                className="p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-950/50 transition-all"
                                title={t("editRecord")}
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteClick(entry.id)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-all"
                                title={t("deleteRecord")}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </>
                          )}
                          {!adminUnlocked && <span title={t("lockedActionsHint")} className="text-slate-300 dark:text-slate-600"><Lock className="h-4 w-4" /></span>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 dark:bg-slate-800/30 border-t border-slate-200 dark:border-slate-700">
                  <td colSpan={5} className="py-3 px-4 text-xs font-bold text-slate-600 dark:text-slate-300 text-left">
                    {t("totalOvertime", { ot: totalOvertimeHours, ded: totalDeductionHours })}
                  </td>
                  <td className="py-3 px-4">
                    <span className={`text-sm font-black ${netHours >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                      {t("totalNet", { net: netHours })}
                    </span>
                    <span className="text-xs text-slate-400 dark:text-slate-500 mr-2">
                      = {totalDays} {t("dayUnit")}
                    </span>
                  </td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Activity Log */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm p-5 transition-colors">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
            <History className="h-4 w-4 text-slate-400" />
            <span>{t("activityLog")}</span>
          </h3>
          <div className="flex items-center gap-2">
            {adminUnlocked && operator.trim() && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/40 rounded-lg text-[10px] font-bold">
                <User className="h-3 w-3" />
                {operator.trim()}
              </span>
            )}
            <button
              onClick={toggleLog}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-800 dark:bg-slate-700 hover:bg-slate-700 dark:hover:bg-slate-600 text-white text-[10px] font-bold rounded-lg transition-all"
            >
              <History className="h-3 w-3" />
              {showLog ? t("hideLog") : t("showLog")}
            </button>
          </div>
        </div>
        {showLog && (
          <div className="mt-3 space-y-1.5 max-h-72 overflow-y-auto">
            {logLoading ? (
              <p className="text-xs text-slate-400 p-2">{t("logLoading")}</p>
            ) : operations.length === 0 ? (
              <p className="text-xs text-slate-400 p-2">{t("logEmpty")}</p>
            ) : (
              operations.map((op, idx) => (
                <div
                  key={op._id || idx}
                  className="flex items-center gap-2 p-2 rounded-lg bg-slate-50/50 dark:bg-slate-800/20 border border-slate-100 dark:border-slate-800 text-xs"
                >
                  <span className="flex items-center gap-1 font-bold shrink-0 text-slate-700 dark:text-slate-200">
                    {op.action === "add" ? (
                      <Plus className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                    ) : op.action === "deduct" ? (
                      <TrendingDown className="h-3 w-3 text-rose-600 dark:text-rose-400" />
                    ) : op.action === "delete" ? (
                      <Trash2 className="h-3 w-3 text-rose-600 dark:text-rose-400" />
                    ) : op.action === "edit" ? (
                      <Pencil className="h-3 w-3 text-indigo-600 dark:text-indigo-400" />
                    ) : op.action === "undo" ? (
                      <Undo2 className="h-3 w-3 text-slate-500" />
                    ) : (
                      <CalendarDays className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                    )}
                    {t("op_" + op.action)}
                  </span>
                  {op.employeeName && <span className="font-bold text-slate-600 dark:text-slate-300 truncate">{op.employeeName}</span>}
                  {op.hours !== undefined && <span className="text-slate-500 dark:text-slate-400 shrink-0">{op.hours} {t("hourUnit")}</span>}
                  <span className="ml-auto shrink-0 text-slate-400 dark:text-slate-500">{op.operator}</span>
                  <span className="shrink-0 text-slate-400 dark:text-slate-500">
                    {new Date(op.timestamp).toLocaleString(lang === "ar" ? "ar-EG" : "en-GB")}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Admin Unlock Modal */}
      {showAdminModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in-up">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-sm mx-4 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                <Lock className="h-4 w-4 text-emerald-600" />
                <span>{t("adminUnlockTitle")}</span>
              </h3>
              <button
                onClick={closePasswordModal}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t("adminUnlockDesc")}
            </p>
            <input
              type="text"
              value={adminNameInput}
              onChange={(e) => setAdminNameInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const pw = document.getElementById("ot-admin-pw") as HTMLInputElement | null;
                  pw?.focus();
                }
              }}
              placeholder={t("adminNamePlaceholder")}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-xl px-3 py-2.5 text-sm font-medium focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all"
            />
            <input
              id="ot-admin-pw"
              type="password"
              value={adminInput}
              onChange={(e) => setAdminInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleVerifyAdmin();
              }}
              placeholder={t("passwordPlaceholder")}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-xl px-3 py-2.5 text-sm font-medium focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all"
            />
            {adminError && (
              <div className="p-2 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/40 text-rose-700 dark:text-rose-400 text-xs rounded-xl">
                {adminError}
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={closePasswordModal}
                className="flex-1 px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-sm font-bold rounded-xl transition-all"
              >
                {t("cancelBtn")}
              </button>
              <button
                onClick={handleVerifyAdmin}
                disabled={adminLoading || !adminInput}
                className={`flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2 ${
                  adminLoading || !adminInput ? "opacity-50 cursor-not-allowed" : ""
                }`}
              >
                {adminLoading ? (
                  <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                ) : (
                  t("unlockConfirm")
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
