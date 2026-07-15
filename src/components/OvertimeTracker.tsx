import React, { useState, useMemo } from "react";
import { Plus, Trash2, Clock, Calendar, TrendingUp, AlertCircle, Search, User, Users, Lock, Key, X, FileDown, Download } from "lucide-react";
import { OvertimeEntry } from "../types";
import { verifyPassword, changePassword } from "../apiClient";

interface Props {
  entries: OvertimeEntry[];
  onUpdate: (entries: OvertimeEntry[]) => void;
}

export default function OvertimeTracker({ entries, onUpdate }: Props) {
  const [employeeName, setEmployeeName] = useState("");
  const [showNameSuggestions, setShowNameSuggestions] = useState(false);
  const [date, setDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split("T")[0];
  });
  const [hours, setHours] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [oldPasswordInput, setOldPasswordInput] = useState("");
  const [newPasswordInput, setNewPasswordInput] = useState("");
  const [changePasswordError, setChangePasswordError] = useState<string | null>(null);
  const [changePasswordSuccess, setChangePasswordSuccess] = useState(false);
  const [changePasswordLoading, setChangePasswordLoading] = useState(false);

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

  const perEmployeeSummary = useMemo(() => {
    const map = new Map<string, { hours: number; days: number; entries: number }>();
    for (const e of entries) {
      const existing = map.get(e.employeeName) || { hours: 0, days: 0, entries: 0 };
      existing.hours += e.hours;
      existing.entries += 1;
      map.set(e.employeeName, existing);
    }
    for (const [name, data] of map) {
      data.days = Math.floor(data.hours / 8);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].hours - a[1].hours);
  }, [entries]);

  const totalHours = entries.reduce((sum, e) => sum + e.hours, 0);
  const totalDays = Math.floor(totalHours / 8);
  const remainingHours = totalHours % 8;

  const handleAddClick = () => {
    const h = parseFloat(hours);
    if (!employeeName.trim()) {
      setError("يرجى إدخال اسم الموظف");
      return;
    }
    if (!date) {
      setError("يرجى اختيار التاريخ");
      return;
    }
    if (isNaN(h) || h <= 0) {
      setError("يرجى إدخال عدد ساعات صحيح");
      return;
    }
    if (h > 24) {
      setError("لا يمكن أن تتجاوز الساعات 24 ساعة يومياً");
      return;
    }
    setError(null);
    setShowPasswordModal(true);
  };

  const handleVerifyAndAdd = async () => {
    setPasswordLoading(true);
    setPasswordError(null);
    const valid = await verifyPassword(passwordInput);
    setPasswordLoading(false);

    if (!valid) {
      setPasswordError("الباسورد غير صحيح");
      return;
    }

    const h = parseFloat(hours);
    const newEntry: OvertimeEntry = {
      id: "ot_" + Date.now(),
      employeeName: employeeName.trim(),
      date,
      hours: h,
      notes: notes.trim(),
    };

    onUpdate([newEntry, ...entries]);
    setHours("");
    setNotes("");
    setShowPasswordModal(false);
    setPasswordInput("");
    setPasswordError(null);
  };

  const [deleteId, setDeleteId] = useState<string | null>(null);

  const handleDeleteClick = (id: string) => {
    setDeleteId(id);
    setShowPasswordModal(true);
  };

  const handleConfirmDelete = async () => {
    setPasswordLoading(true);
    setPasswordError(null);
    const valid = await verifyPassword(passwordInput);
    setPasswordLoading(false);

    if (!valid) {
      setPasswordError("الباسورد غير صحيح");
      return;
    }

    onUpdate(entries.filter((e) => e.id !== deleteId));
    setDeleteId(null);
    setShowPasswordModal(false);
    setPasswordInput("");
    setPasswordError(null);
  };

  const handleClearAll = () => {
    if (searchQuery.trim()) {
      if (window.confirm(`هل أنت متأكد من حذف جميع سجلات ${searchQuery.trim()}؟`)) {
        onUpdate(entries.filter((e) => e.employeeName !== searchQuery.trim()));
      }
    } else {
      if (window.confirm("هل أنت متأكد من حذف جميع سجلات العمل الإضافي لجميع الموظفين؟")) {
        onUpdate([]);
      }
    }
  };

  const handleExportCSV = () => {
    const headers = ["#", "الموظف", "التاريخ", "اليوم", "الساعات", "ملاحظات"];
    const rows = filteredEntries.map((entry, idx) => {
      const d = new Date(entry.date);
      const dayName = d.toLocaleDateString("ar-EG", { weekday: "long" });
      return [
        filteredEntries.length - idx,
        entry.employeeName,
        entry.date,
        dayName,
        entry.hours,
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
    link.setAttribute("download", `سجل_العمل_الاضافي_${new Date().toISOString().split("T")[0]}.csv`);
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

    if (fontRegular && fontBold) {
      doc.addFileToVFS("NotoNaskhArabic-Regular.ttf", fontRegular);
      doc.addFileToVFS("NotoNaskhArabic-Bold.ttf", fontBold);
      doc.addFont("NotoNaskhArabic-Regular.ttf", "NotoArabic", "normal");
      doc.addFont("NotoNaskhArabic-Bold.ttf", "NotoArabic", "bold");
      doc.setFont("NotoArabic");
    }

    doc.setFontSize(16);
    doc.text("سجل العمل الإضافي", 148, 15, { align: "center" });
    doc.setFontSize(10);
    doc.text(`تاريخ التصدير: ${new Date().toLocaleDateString("ar-EG")}`, 148, 22, { align: "center" });

    if (searchQuery.trim()) {
      doc.text(`الموظف: ${searchQuery.trim()}`, 148, 28, { align: "center" });
    }
    if (dateFrom || dateTo) {
      const range = `من ${dateFrom || "—"} إلى ${dateTo || "—"}`;
      doc.text(range, 148, searchQuery.trim() ? 34 : 28, { align: "center" });
    }

    const startY = 38;
    const headers = [["#", "الموظف", "التاريخ", "اليوم", "الساعات", "ملاحظات"]];
    const data = filteredEntries.map((entry, idx) => {
      const d = new Date(entry.date);
      const dayName = d.toLocaleDateString("ar-EG", { weekday: "long" });
      return [
        String(filteredEntries.length - idx),
        entry.employeeName,
        entry.date,
        dayName,
        `${entry.hours}`,
        entry.notes || "-",
      ];
    });

    const totalH = filteredEntries.reduce((s, e) => s + e.hours, 0);
    const totalD = Math.floor(totalH / 8);

    autoTable(doc, {
      head: headers,
      body: data,
      startY,
      theme: "grid",
      styles: {
        font: "NotoArabic",
        fontSize: 8,
        halign: "center",
        cellPadding: 3,
      },
      headStyles: {
        fillColor: [99, 102, 241],
        textColor: 255,
        fontStyle: "bold",
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 10 },
        1: { cellWidth: 40 },
        5: { cellWidth: "auto" },
      },
      margin: { left: 14, right: 14 },
      didDrawPage: (data: any) => {
        const pageHeight = doc.internal.pageSize.height;
        doc.setFontSize(9);
        doc.text(
          `الإجمالي: ${totalH} ساعة = ${totalD} يوم  |  عدد السجلات: ${filteredEntries.length}`,
          148,
          pageHeight - 10,
          { align: "center" }
        );
        doc.text(
          `صفحة ${doc.getNumberOfPages()}`,
          14,
          pageHeight - 10
        );
      },
    });

    doc.save(`سجل_العمل_الاضافي_${new Date().toISOString().split("T")[0]}.pdf`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden transition-colors">
        <div className="h-2.5 bg-gradient-to-r from-amber-500 via-orange-500 to-red-500" />
        <div className="p-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 rounded-2xl">
              <Clock className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900 dark:text-white">
                سجل العمل الإضافي
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                تسجيل ساعات العمل الإضافي لكل موظف — كل 8 ساعات = يوم إضافي
              </p>
            </div>
          </div>
          <div className="flex justify-end mt-4">
            <button
              onClick={() => {
                setShowChangePasswordModal(true);
                setOldPasswordInput("");
                setNewPasswordInput("");
                setChangePasswordError(null);
                setChangePasswordSuccess(false);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 transition-all"
            >
              <Key className="h-3.5 w-3.5" />
              <span>تغيير الباسورد</span>
            </button>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm transition-colors">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <span className="text-xs font-bold text-slate-400 dark:text-slate-500">الموظفين</span>
              <div className="flex items-baseline gap-1 pt-1">
                <span className="text-3xl font-black text-indigo-600 dark:text-indigo-400">{perEmployeeSummary.length}</span>
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400">شخص</span>
              </div>
            </div>
            <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 rounded-xl">
              <Users className="h-5 w-5" />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm transition-colors">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <span className="text-xs font-bold text-slate-400 dark:text-slate-500">إجمالي الساعات</span>
              <div className="flex items-baseline gap-1 pt-1">
                <span className="text-3xl font-black text-amber-600 dark:text-amber-400">{totalHours}</span>
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400">ساعة</span>
              </div>
            </div>
            <div className="p-2.5 bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 rounded-xl">
              <Clock className="h-5 w-5" />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm transition-colors">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <span className="text-xs font-bold text-slate-400 dark:text-slate-500">أيام العمل الإضافي</span>
              <div className="flex items-baseline gap-1 pt-1">
                <span className="text-3xl font-black text-emerald-600 dark:text-emerald-400">{totalDays}</span>
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400">يوم</span>
              </div>
            </div>
            <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 rounded-xl">
              <Calendar className="h-5 w-5" />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm transition-colors">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <span className="text-xs font-bold text-slate-400 dark:text-slate-500">الساعات المتبقية</span>
              <div className="flex items-baseline gap-1 pt-1">
                <span className="text-3xl font-black text-violet-600 dark:text-violet-400">{remainingHours}</span>
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400">ساعة</span>
              </div>
            </div>
            <div className="p-2.5 bg-violet-50 dark:bg-violet-950/30 text-violet-600 dark:text-violet-400 rounded-xl">
              <TrendingUp className="h-5 w-5" />
            </div>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm p-5 transition-colors">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-slate-600 dark:text-slate-300">تقدم تحويل الساعات لأيام (لجميع الموظفين)</span>
          <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 px-2 py-0.5 rounded-lg">
            {remainingHours}/8 ساعات للتالي
          </span>
        </div>
        <div className="w-full h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full transition-all duration-500"
            style={{ width: `${(remainingHours / 8) * 100}%` }}
          />
        </div>
      </div>

      {/* Per-Employee Summary */}
      {perEmployeeSummary.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm p-5 transition-colors">
          <h3 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2 mb-4">
            <Users className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            <span>ملخص كل موظف</span>
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {perEmployeeSummary.map(([name, data]) => (
              <div
                key={name}
                className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20 hover:bg-indigo-50/30 dark:hover:bg-indigo-950/20 transition-all cursor-pointer"
                onClick={() => setSearchQuery(name === searchQuery ? "" : name)}
              >
                <div className="p-2 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-lg">
                  <User className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate">{name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 px-1.5 py-0.5 rounded border border-amber-100 dark:border-amber-900/40">
                      {data.hours} ساعة
                    </span>
                    <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-1.5 py-0.5 rounded border border-emerald-100 dark:border-emerald-900/40">
                      {data.days} يوم
                    </span>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">
                      {data.entries} سجل
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Entry Form */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm p-5 transition-colors">
        <h3 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2 mb-4">
          <Plus className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          <span>إضافة سجل جديد</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="relative">
            <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">اسم الموظف</label>
            <input
              type="text"
              value={employeeName}
              onChange={(e) => {
                setEmployeeName(e.target.value);
                setShowNameSuggestions(true);
              }}
              onFocus={() => setShowNameSuggestions(true)}
              onBlur={() => setTimeout(() => setShowNameSuggestions(false), 200)}
              placeholder="اسم الموظف"
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
            <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">التاريخ</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-xl px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">عدد الساعات</label>
            <input
              type="number"
              step="0.5"
              min="0.5"
              max="24"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              placeholder="مثال: 2.5"
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-xl px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">ملاحظات (اختياري)</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="مثال: إكمال مشروع"
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-xl px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all"
            />
          </div>
        </div>

        {error && (
          <div className="mt-3 p-3 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/40 text-rose-700 dark:text-rose-400 text-xs rounded-xl flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <button
          onClick={handleAddClick}
          className="mt-3 w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold rounded-xl shadow-sm shadow-amber-100 dark:shadow-none transition-all active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" />
          <span>إضافة السجل</span>
        </button>
      </div>

      {/* Entries Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden transition-colors">
        <div className="p-5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-3">
            <h3 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
              <Calendar className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <span>السجلات ({filteredEntries.length}{searchQuery || dateFrom || dateTo ? ` من ${entries.length}` : ""})</span>
            </h3>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="بحث بالاسم..."
                  className="pr-8 pl-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-lg text-xs font-medium focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all w-36"
                />
              </div>
              {filteredEntries.length > 0 && (
                <>
                  <button
                    onClick={handleExportPDF}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold rounded-lg transition-all"
                    title="تصدير PDF"
                  >
                    <FileDown className="h-3 w-3" />
                    PDF
                  </button>
                  <button
                    onClick={handleExportCSV}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold rounded-lg transition-all"
                    title="تصدير Excel"
                  >
                    <Download className="h-3 w-3" />
                    Excel
                  </button>
                </>
              )}
              {entries.length > 0 && (
                <button
                  onClick={handleClearAll}
                  className="text-xs text-rose-600 dark:text-rose-400 hover:text-rose-700 font-medium hover:underline flex items-center gap-1"
                >
                  <Trash2 className="h-3 w-3" />
                  مسح الكل
                </button>
              )}
            </div>
          </div>
          {/* Date Range Filter */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500">فلتر بالتاريخ:</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-lg text-[10px] font-medium focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all"
            />
            <span className="text-[10px] text-slate-400 dark:text-slate-500">إلى</span>
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
                مسح الفلتر
              </button>
            )}
          </div>
        </div>

        {filteredEntries.length === 0 ? (
          <div className="py-12 text-center text-slate-400 dark:text-slate-500">
            <Clock className="h-10 w-10 mx-auto mb-2 opacity-30 text-slate-300 dark:text-slate-600" />
            <p className="text-sm font-bold">
              {entries.length === 0 ? "لا توجد سجلات عمل إضافي" : "لا توجد نتائج مطابقة للبحث"}
            </p>
            <p className="text-xs mt-1">
              {entries.length === 0 ? "أضف سجلات باستخدام النموذج أعلاه" : "جرّب تغيير كلمة البحث"}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20 text-[11px] font-bold text-slate-400 dark:text-slate-500 tracking-wider">
                  <th className="py-3 px-4 font-semibold">#</th>
                  <th className="py-3 px-4 font-semibold">الموظف</th>
                  <th className="py-3 px-4 font-semibold">التاريخ</th>
                  <th className="py-3 px-4 font-semibold">اليوم</th>
                  <th className="py-3 px-4 font-semibold">الساعات</th>
                  <th className="py-3 px-4 font-semibold">ملاحظات</th>
                  <th className="py-3 px-4 font-semibold text-center">حذف</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                {filteredEntries.map((entry, idx) => {
                  const d = new Date(entry.date);
                  const dayName = d.toLocaleDateString("ar-EG", { weekday: "long" });
                    return (
                    <tr
                      key={entry.id}
                      className="hover:bg-slate-50/40 dark:hover:bg-slate-800/20 transition-all"
                    >
                      <td className="py-3.5 px-4 text-xs font-bold text-slate-400 dark:text-slate-500">
                        {filteredEntries.length - idx}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <div className="p-1 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded">
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
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 text-xs font-bold border border-amber-100 dark:border-amber-900/40">
                          <Clock className="h-3 w-3" />
                          {entry.hours} ساعة
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-500 dark:text-slate-400 max-w-[200px] truncate">
                        {entry.notes || "-"}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <button
                          onClick={() => handleDeleteClick(entry.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-all"
                          title="حذف السجل"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 dark:bg-slate-800/30 border-t border-slate-200 dark:border-slate-700">
                  <td colSpan={4} className="py-3 px-4 text-xs font-bold text-slate-600 dark:text-slate-300 text-left">
                    الإجمالي:
                  </td>
                  <td className="py-3 px-4">
                    <span className="text-sm font-black text-amber-600 dark:text-amber-400">
                      {filteredEntries.reduce((s, e) => s + e.hours, 0)} ساعة
                    </span>
                    <span className="text-xs text-slate-400 dark:text-slate-500 mr-2">
                      = {Math.floor(filteredEntries.reduce((s, e) => s + e.hours, 0) / 8)} يوم
                    </span>
                  </td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Password Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in-up">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-sm mx-4 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                <Lock className="h-4 w-4 text-amber-600" />
                <span>{deleteId ? "تأكيد الحذف" : "تأكيد الإضافة"}</span>
              </h3>
              <button
                onClick={() => {
                  setShowPasswordModal(false);
                  setPasswordInput("");
                  setPasswordError(null);
                  setDeleteId(null);
                }}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {deleteId ? "أدخل الباسورد لتأكيد حذف هذا السجل" : "أدخل الباسورد لتسجيل سجل العمل الإضافي"}
            </p>
            <input
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { deleteId ? handleConfirmDelete() : handleVerifyAndAdd(); } }}
              placeholder="أدخل الباسورد"
              autoFocus
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-xl px-3 py-2.5 text-sm font-medium focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all"
            />
            {passwordError && (
              <div className="p-2 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/40 text-rose-700 dark:text-rose-400 text-xs rounded-xl">
                {passwordError}
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowPasswordModal(false);
                  setPasswordInput("");
                  setPasswordError(null);
                  setDeleteId(null);
                }}
                className="flex-1 px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-sm font-bold rounded-xl transition-all"
              >
                إلغاء
              </button>
              <button
                onClick={deleteId ? handleConfirmDelete : handleVerifyAndAdd}
                disabled={passwordLoading || !passwordInput}
                className={`flex-1 px-4 py-2 text-white text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2 ${
                  deleteId
                    ? "bg-rose-600 hover:bg-rose-700"
                    : "bg-amber-600 hover:bg-amber-700"
                } ${passwordLoading || !passwordInput ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                {passwordLoading ? (
                  <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                ) : deleteId ? (
                  "حذف"
                ) : (
                  "إضافة"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change Password Modal */}
      {showChangePasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in-up">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-sm mx-4 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                <Key className="h-4 w-4 text-indigo-600" />
                <span>تغيير الباسورد</span>
              </h3>
              <button
                onClick={() => setShowChangePasswordModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {changePasswordSuccess ? (
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/40 text-emerald-700 dark:text-emerald-400 text-xs rounded-xl text-center font-bold">
                تم تغيير الباسورد بنجاح!
              </div>
            ) : (
              <>
                <input
                  type="password"
                  value={oldPasswordInput}
                  onChange={(e) => setOldPasswordInput(e.target.value)}
                  placeholder="الباسورد القديم"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-xl px-3 py-2.5 text-sm font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                />
                <input
                  type="password"
                  value={newPasswordInput}
                  onChange={(e) => setNewPasswordInput(e.target.value)}
                  placeholder="الباسورد الجديد"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-xl px-3 py-2.5 text-sm font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                />
                {changePasswordError && (
                  <div className="p-2 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/40 text-rose-700 dark:text-rose-400 text-xs rounded-xl">
                    {changePasswordError}
                  </div>
                )}
              </>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => setShowChangePasswordModal(false)}
                className="flex-1 px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-sm font-bold rounded-xl transition-all"
              >
                {changePasswordSuccess ? "إغلاق" : "إلغاء"}
              </button>
              {!changePasswordSuccess && (
                <button
                  onClick={async () => {
                    setChangePasswordLoading(true);
                    setChangePasswordError(null);
                    const result = await changePassword(oldPasswordInput, newPasswordInput);
                    setChangePasswordLoading(false);
                    if (result.ok) {
                      setChangePasswordSuccess(true);
                      setOldPasswordInput("");
                      setNewPasswordInput("");
                    } else {
                      setChangePasswordError(result.error || "فشل تغيير الباسورد");
                    }
                  }}
                  disabled={changePasswordLoading || !oldPasswordInput || !newPasswordInput}
                  className={`flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2 ${changePasswordLoading || !oldPasswordInput || !newPasswordInput ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  {changePasswordLoading ? (
                    <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                  ) : (
                    "تغيير"
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
