import React, { useState, useMemo, useRef, useCallback } from "react";
import {
  Calendar,
  Upload,
  Plus,
  Trash2,
  Search,
  Users,
  Building2,
  Clock,
  AlertCircle,
  Download,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  FileDown,
} from "lucide-react";
import * as XLSX from "xlsx";
import html2canvas from "html2canvas";
import { EmployeeSchedule, DaySchedule, SHIFT_NAMES, SHIFT_COLORS, SHIFT_DEFINITIONS, ARABIC_DAYS } from "../types";

interface Props {
  schedules: EmployeeSchedule[];
  onUpdate: (schedules: EmployeeSchedule[]) => void;
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function generateMonthDays(year: number, month: number): DaySchedule[] {
  const daysInMonth = getDaysInMonth(year, month);
  const days: DaySchedule[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const dayName = ARABIC_DAYS[date.getDay()];
    days.push({ date: dateStr, dayName, shifts: [], isOff: dayName === "الجمعة" || dayName === "السبت" });
  }
  return days;
}

export default function ScheduleManager({ schedules, onUpdate }: Props) {
  const now = new Date();
  const [currentYear, setCurrentYear] = useState(now.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(now.getMonth());
  const [searchQuery, setSearchQuery] = useState("");
  const [filterDept, setFilterDept] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingCell, setEditingCell] = useState<{ empId: string; dayIdx: number } | null>(null);
  const [selectedShift, setSelectedShift] = useState<string>("A");
  const gridRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [newName, setNewName] = useState("");
  const [newDept, setNewDept] = useState("");

  const monthLabel = useMemo(() => {
    const months = [
      "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
      "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
    ];
    return `${months[currentMonth]} ${currentYear}`;
  }, [currentYear, currentMonth]);

  const monthDays = useMemo(() => generateMonthDays(currentYear, currentMonth), [currentYear, currentMonth]);

  const departments = useMemo(() => {
    const depts = new Set(schedules.map((s) => s.department).filter(Boolean));
    return Array.from(depts).sort();
  }, [schedules]);

  const filteredSchedules = useMemo(() => {
    let result = schedules;
    if (searchQuery.trim()) {
      result = result.filter((s) => s.employeeName.includes(searchQuery.trim()));
    }
    if (filterDept) {
      result = result.filter((s) => s.department === filterDept);
    }
    return result;
  }, [schedules, searchQuery, filterDept]);

  const perDeptSummary = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of schedules) {
      map.set(s.department || "بدون قسم", (map.get(s.department || "بدون قسم") || 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [schedules]);

  const ensureMonthDays = useCallback((emp: EmployeeSchedule): DaySchedule[] => {
    const existing = new Map(emp.days.map((d) => [d.date, d]));
    return monthDays.map((md) => existing.get(md.date) || { ...md, shifts: [], isOff: md.isOff });
  }, [monthDays]);

  const handlePrevMonth = () => {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear((y) => y - 1); }
    else setCurrentMonth((m) => m - 1);
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear((y) => y + 1); }
    else setCurrentMonth((m) => m + 1);
  };

  const handleCellClick = (empId: string, dayIdx: number) => {
    if (editingCell?.empId === empId && editingCell.dayIdx === dayIdx) {
      setEditingCell(null);
      return;
    }
    setEditingCell({ empId, dayIdx });
  };

  const handleToggleShift = (empId: string, dayIdx: number, shiftName: string) => {
    const updated = schedules.map((emp) => {
      if (emp.id !== empId) return emp;
      const days = ensureMonthDays(emp);
      const day = { ...days[dayIdx] };
      if (shiftName === "OFF") {
        day.isOff = !day.isOff;
        day.shifts = day.isOff ? [] : day.shifts;
      } else if (shiftName === "CLEAR") {
        day.isOff = false;
        day.shifts = [];
      } else {
        day.isOff = false;
        if (day.shifts.includes(shiftName)) {
          day.shifts = day.shifts.filter((s) => s !== shiftName);
        } else {
          day.shifts = [...day.shifts, shiftName].sort();
        }
      }
      days[dayIdx] = day;
      return { ...emp, days };
    });
    onUpdate(updated);
  };

  const handleAddEmployee = () => {
    if (!newName.trim()) return;
    const entry: EmployeeSchedule = {
      id: "sch_" + Date.now(),
      employeeName: newName.trim(),
      department: newDept.trim(),
      days: generateMonthDays(currentYear, currentMonth),
    };
    onUpdate([entry, ...schedules]);
    setNewName("");
    setNewDept("");
    setShowAddForm(false);
  };

  const handleDelete = (id: string) => {
    if (window.confirm("هل أنت متأكد من حذف هذا الموظف؟")) {
      onUpdate(schedules.filter((s) => s.id !== id));
    }
  };

  const handleDeleteAll = () => {
    if (window.confirm("هل أنت متأكد من حذف جميع الموظفين من الجدول؟")) {
      onUpdate([]);
    }
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase();

    if (ext === "xlsx" || ext === "xls") {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { header: 1 });
        parseExcelData(jsonData);
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = (ev) => {
        let text = ev.target?.result as string;
        if (!text) return;
        if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
        parseCSVAndImport(text);
      };
      reader.readAsText(file, "UTF-8");
    }
    e.target.value = "";
  };

  const parseExcelData = (rows: Record<string, any>[]) => {
    if (rows.length < 2) { alert("الملف فارغ"); return; }

    const headerRow = rows[0].map(String).map((h) => h?.trim() || "");
    const nameIdx = headerRow.findIndex((h) => /الموظف|الاسم|name/i.test(h));
    const deptIdx = headerRow.findIndex((h) => /القسم|dept/i.test(h));

    const dateHeaders: { idx: number; dateStr: string }[] = [];
    for (let i = 0; i < headerRow.length; i++) {
      const h = headerRow[i];
      if (nameIdx === i || deptIdx === i) continue;
      const m = h.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-]?(\d{2,4})?/);
      if (m) {
        const day = parseInt(m[1]);
        const month = parseInt(m[2]) - 1;
        const year = m[3] ? (m[3].length === 2 ? 2000 + parseInt(m[3]) : parseInt(m[3])) : currentYear;
        const ds = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        dateHeaders.push({ idx: i, dateStr: ds });
      }
    }

    if (dateHeaders.length === 0) {
      const inferred = generateMonthDays(currentYear, currentMonth);
      dateHeaders.push(...inferred.map((d, i) => ({ idx: i + 2, dateStr: d.date })));
    }

    const map = new Map<string, { dept: string; days: Map<string, DaySchedule> }>();
    const errors: string[] = [];

    for (let r = 1; r < rows.length; r++) {
      const cols = rows[r];
      const empName = String(cols[nameIdx] || "").trim();
      if (!empName) continue;
      const dept = deptIdx >= 0 ? String(cols[deptIdx] || "").trim() : "";

      const entry = map.get(empName) || { dept, days: new Map<string, DaySchedule>() };
      if (dept && !entry.dept) entry.dept = dept;

      for (const dh of dateHeaders) {
        const cellVal = String(cols[dh.idx] || "").trim().toUpperCase();
        if (!cellVal) continue;

        const existing = entry.days.get(dh.dateStr) || {
          date: dh.dateStr,
          dayName: ARABIC_DAYS[new Date(dh.dateStr).getDay()],
          shifts: [] as string[],
          isOff: false,
        };

        if (cellVal === "OFF" || cellVal === "إجازة" || cellVal === "ع" || cellVal === "ح") {
          existing.isOff = true;
          existing.shifts = [];
        } else {
          existing.isOff = false;
          const shiftChars = cellVal.replace(/[^A-C]/g, "").split("").filter(Boolean);
          existing.shifts = [...new Set([...existing.shifts, ...shiftChars])].sort();
        }

        entry.days.set(dh.dateStr, existing);
      }

      map.set(empName, entry);
    }

    const newSchedules: EmployeeSchedule[] = [];
    for (const [name, data] of map) {
      const daysArray = monthDays.map((md) => data.days.get(md.date) || { ...md, shifts: [], isOff: md.isOff });
      if (daysArray.length === 0) continue;
      newSchedules.push({
        id: "sch_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
        employeeName: name,
        department: data.dept,
        days: daysArray,
      });
    }

    if (newSchedules.length > 0) {
      if (window.confirm(`تم العثور على ${newSchedules.length} موظف. هل تريد إضافتهم للجدول؟`)) {
        onUpdate([...schedules, ...newSchedules]);
      }
    } else {
      alert("لم يتم العثور على بيانات صالحة");
    }
  };

  const parseCSVAndImport = (text: string) => {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) { alert("الملف فارغ"); return; }

    const delimiter = lines[0].includes(";") ? ";" : ",";
    const header = lines[0].split(delimiter).map((h) => h.replace(/^"|"$/g, "").trim());

    const nameIdx = header.findIndex((h) => /الموظف|الاسم|name/i.test(h));
    const deptIdx = header.findIndex((h) => /القسم|dept/i.test(h));

    const dateHeaders: { idx: number; dateStr: string }[] = [];
    for (let i = 0; i < header.length; i++) {
      if (i === nameIdx || i === deptIdx) continue;
      const m = header[i].match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-]?(\d{2,4})?/);
      if (m) {
        const day = parseInt(m[1]);
        const month = parseInt(m[2]) - 1;
        const year = m[3] ? (m[3].length === 2 ? 2000 + parseInt(m[3]) : parseInt(m[3])) : currentYear;
        dateHeaders.push({ idx: i, dateStr: `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}` });
      }
    }

    const map = new Map<string, { dept: string; days: Map<string, DaySchedule> }>();

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(delimiter).map((c) => c.replace(/^"|"$/g, "").trim());
      const empName = cols[nameIdx >= 0 ? nameIdx : 0];
      if (!empName) continue;
      const dept = deptIdx >= 0 ? cols[deptIdx] : "";

      const entry = map.get(empName) || { dept, days: new Map<string, DaySchedule>() };
      if (dept && !entry.dept) entry.dept = dept;

      for (const dh of dateHeaders) {
        const cellVal = (cols[dh.idx] || "").trim().toUpperCase();
        if (!cellVal) continue;
        const existing = entry.days.get(dh.dateStr) || {
          date: dh.dateStr,
          dayName: ARABIC_DAYS[new Date(dh.dateStr).getDay()],
          shifts: [] as string[],
          isOff: false,
        };
        if (cellVal === "OFF" || cellVal === "إجازة" || cellVal === "ح" || cellVal === "ع") {
          existing.isOff = true;
          existing.shifts = [];
        } else {
          existing.isOff = false;
          const shiftChars = cellVal.replace(/[^A-C]/g, "").split("").filter(Boolean);
          existing.shifts = [...new Set([...existing.shifts, ...shiftChars])].sort();
        }
        entry.days.set(dh.dateStr, existing);
      }
      map.set(empName, entry);
    }

    const newSchedules: EmployeeSchedule[] = [];
    for (const [name, data] of map) {
      const daysArray = monthDays.map((md) => data.days.get(md.date) || { ...md, shifts: [], isOff: md.isOff });
      newSchedules.push({
        id: "sch_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
        employeeName: name,
        department: data.dept,
        days: daysArray,
      });
    }

    if (newSchedules.length > 0) {
      if (window.confirm(`تم العثور على ${newSchedules.length} موظف. هل تريد إضافتهم؟`)) {
        onUpdate([...schedules, ...newSchedules]);
      }
    }
  };

  const handleExportExcel = () => {
    const headerRow: any[] = ["الموظف", "القسم"];
    monthDays.forEach((d) => { headerRow.push(`${new Date(d.date).getDate()}`); });

    const data: any[][] = [];
    for (const emp of filteredSchedules) {
      const days = ensureMonthDays(emp);
      const row: any[] = [emp.employeeName, emp.department || ""];
      days.forEach((d) => {
        if (d.isOff) row.push("OFF");
        else if (d.shifts.length > 0) row.push(d.shifts.join(""));
        else row.push("");
      });
      data.push(row);
    }

    const ws = XLSX.utils.aoa_to_sheet([headerRow, ...data]);
    ws["!cols"] = [{ wch: 20 }, { wch: 15 }, ...monthDays.map(() => ({ wch: 6 }))];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "جدول الدوام");
    XLSX.writeFile(wb, `جدول_الدوام_${monthLabel}.xlsx`);
  };

  const handleExportImage = async () => {
    if (!gridRef.current) return;
    const btn = document.getElementById("export-img-btn");
    if (btn) btn.textContent = "جاري التصدير...";
    try {
      const canvas = await html2canvas(gridRef.current, {
        scale: 2,
        backgroundColor: "#ffffff",
        logging: false,
        useCORS: true,
      });
      const link = document.createElement("a");
      link.download = `جدول_الدوام_${monthLabel}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch {
      alert("حدث خطأ أثناء التصدير كصورة");
    }
    if (btn) btn.textContent = "صورة PNG";
  };

  const handleExportPDF = async () => {
    if (!gridRef.current) return;
    const btn = document.getElementById("export-pdf-btn");
    if (btn) btn.textContent = "جاري التصدير...";
    try {
      const canvas = await html2canvas(gridRef.current, {
        scale: 2,
        backgroundColor: "#ffffff",
        logging: false,
        useCORS: true,
      });
      const { default: jsPDF } = await import("jspdf");
      const imgData = canvas.toDataURL("image/png");
      const pdfWidth = canvas.width;
      const pdfHeight = canvas.height;
      const pdf = new jsPDF({
        orientation: pdfWidth > pdfHeight ? "l" : "p",
        unit: "px",
        format: [pdfWidth, pdfHeight],
      });
      pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
      pdf.save(`جدول_الدوام_${monthLabel}.pdf`);
    } catch {
      alert("حدث خطأ أثناء التصدير كـ PDF");
    }
    if (btn) btn.textContent = "PDF";
  };

  const dayNameShort = (dayName: string) => {
    const map: Record<string, string> = { "الأحد": "أح", "الإثنين": "إث", "الثلاثاء": "ثل", "الأربعاء": "أرب", "الخميس": "خم", "الجمعة": "جم", "السبت": "سب" };
    return map[dayName] || dayName.charAt(0);
  };

  const isWeekend = (d: DaySchedule) => d.dayName === "الجمعة" || d.dayName === "السبت";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden transition-colors">
        <div className="p-5">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-xl">
              <Calendar className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-800 dark:text-white">جدول الدوام الشهري</h2>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                الشフトات: A (06-14) / B (14-22) / C (22-06) — كل شفت 8 ساعات
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Summary + Month Nav */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button onClick={handlePrevMonth} className="p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-all">
            <ChevronRight className="h-4 w-4 text-slate-600 dark:text-slate-300" />
          </button>
          <span className="text-sm font-black text-slate-700 dark:text-white min-w-[140px] text-center">{monthLabel}</span>
          <button onClick={handleNextMonth} className="p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-all">
            <ChevronLeft className="h-4 w-4 text-slate-600 dark:text-slate-300" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {SHIFT_NAMES.map((s) => (
            <span key={s} className={`text-[10px] font-bold px-2 py-1 rounded-lg border ${SHIFT_COLORS[s]}`}>
              {s}: {SHIFT_DEFINITIONS[s].startTime}-{SHIFT_DEFINITIONS[s].endTime}
            </span>
          ))}
        </div>

        <div className="flex items-center gap-2 text-xs">
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg">
            <Users className="h-3.5 w-3.5 text-slate-400" />
            <span className="font-bold text-slate-600 dark:text-slate-300">{schedules.length}</span>
            <span className="text-slate-400">موظف</span>
          </div>
          {perDeptSummary.length > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg">
              <Building2 className="h-3.5 w-3.5 text-slate-400" />
              <span className="font-bold text-slate-600 dark:text-slate-300">{perDeptSummary.length}</span>
              <span className="text-slate-400">قسم</span>
            </div>
          )}
        </div>
      </div>

      {/* Department badges */}
      {perDeptSummary.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {perDeptSummary.map(([dept, count]) => (
            <button
              key={dept}
              onClick={() => setFilterDept(filterDept === dept ? "" : dept)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all ${
                filterDept === dept
                  ? "bg-slate-700 text-white border-slate-700 dark:bg-slate-200 dark:text-slate-800 dark:border-slate-200"
                  : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
              }`}
            >
              {dept}
              <span className="text-[10px] opacity-60">{count}</span>
            </button>
          ))}
        </div>
      )}

      {/* Actions Bar */}
      <div className="flex flex-wrap items-center gap-2">
        <input ref={fileInputRef} type="file" accept=".csv,.txt,.xlsx,.xls" className="hidden" onChange={handleFileImport} />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-700 hover:bg-slate-800 dark:bg-slate-600 dark:hover:bg-slate-500 text-white text-xs font-bold rounded-xl transition-all"
        >
          <Upload className="h-3.5 w-3.5" />
          رفع ملف
        </button>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all"
        >
          <Plus className="h-3.5 w-3.5" />
          إضافة موظف
        </button>
        {filteredSchedules.length > 0 && (
          <>
            <button
              onClick={handleExportExcel}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-all"
            >
              <FileDown className="h-3.5 w-3.5" />
              Excel
            </button>
            <button
              id="export-pdf-btn"
              onClick={handleExportPDF}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl transition-all"
            >
              <Download className="h-3.5 w-3.5" />
              PDF
            </button>
            <button
              id="export-img-btn"
              onClick={handleExportImage}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold rounded-xl transition-all"
            >
              <ImageIcon className="h-3.5 w-3.5" />
              صورة PNG
            </button>
          </>
        )}
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث بالاسم..."
            className="w-full pr-8 pl-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-xl text-xs font-medium focus:ring-2 focus:ring-slate-300/50 focus:border-slate-400 outline-none transition-all"
          />
        </div>
      </div>

      {/* Shift picker for editing */}
      {editingCell && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-sm p-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400">اختر الشفت:</span>
          {SHIFT_NAMES.map((s) => (
            <button
              key={s}
              onClick={() => { setSelectedShift(s); handleToggleShift(editingCell.empId, editingCell.dayIdx, s); }}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all ${
                SHIFT_COLORS[s]
              } hover:scale-105 active:scale-95`}
            >
              {s}
            </button>
          ))}
          <button
            onClick={() => handleToggleShift(editingCell.empId, editingCell.dayIdx, "OFF")}
            className="px-3 py-1.5 text-xs font-bold rounded-lg border bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 hover:scale-105 active:scale-95 transition-all"
          >
            إجازة
          </button>
          <button
            onClick={() => handleToggleShift(editingCell.empId, editingCell.dayIdx, "CLEAR")}
            className="px-3 py-1.5 text-xs font-bold rounded-lg border bg-red-50 text-red-600 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800 hover:scale-105 active:scale-95 transition-all"
          >
            مسح
          </button>
          <button onClick={() => setEditingCell(null)} className="mr-auto p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg transition-all">
            ✕
          </button>
        </div>
      )}

      {/* Add Employee Form */}
      {showAddForm && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-sm p-4">
          <h3 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2 mb-3">
            <Plus className="h-4 w-4 text-emerald-600" />
            إضافة موظف جديد — {monthLabel}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">اسم الموظف</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="اسم الموظف"
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-xl px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-slate-300/50 focus:border-slate-400 outline-none transition-all"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">القسم</label>
              <input
                type="text"
                value={newDept}
                onChange={(e) => setNewDept(e.target.value)}
                placeholder="مثال: المحاسبة"
                list="dept-list-schedule"
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-xl px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-slate-300/50 focus:border-slate-400 outline-none transition-all"
              />
              <datalist id="dept-list-schedule">
                {departments.map((d) => <option key={d} value={d} />)}
              </datalist>
            </div>
            <div className="flex items-end gap-2">
              <button onClick={() => setShowAddForm(false)} className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-sm font-bold rounded-xl transition-all">
                إلغاء
              </button>
              <button onClick={handleAddEmployee} disabled={!newName.trim()} className={`px-4 py-2 text-white text-sm font-bold rounded-xl transition-all ${!newName.trim() ? "opacity-50 cursor-not-allowed bg-slate-400" : "bg-emerald-600 hover:bg-emerald-700"}`}>
                حفظ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Monthly Grid */}
      <div ref={gridRef} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden transition-colors">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h3 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
            <Calendar className="h-4 w-4 text-slate-400" />
            {monthLabel} ({filteredSchedules.length}{searchQuery || filterDept ? ` من ${schedules.length}` : ""} موظف)
          </h3>
          {filteredSchedules.length > 0 && (
            <button onClick={handleDeleteAll} className="text-[10px] text-red-400 hover:text-red-600 font-bold transition-all">
              حذف الكل
            </button>
          )}
        </div>

        {filteredSchedules.length === 0 ? (
          <div className="py-12 text-center text-slate-400 dark:text-slate-500">
            <Calendar className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm font-bold">{schedules.length === 0 ? "لا يوجد جداول دوام" : "لا توجد نتائج"}</p>
            <p className="text-xs mt-1">{schedules.length === 0 ? "ارفع ملف Excel أو أضف موظفين يدوياً" : "جرّب تغيير الفلتر"}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-[10px] border-collapse">
              <thead>
                <tr className="bg-slate-50/80 dark:bg-slate-800/30">
                  <th className="py-2 px-2 sticky right-0 bg-slate-50/80 dark:bg-slate-800/30 z-10 text-[10px] font-bold text-slate-400">#</th>
                  <th className="py-2 px-2 sticky right-6 bg-slate-50/80 dark:bg-slate-800/30 z-10 text-[10px] font-bold text-slate-400 whitespace-nowrap">الموظف</th>
                  <th className="py-2 px-2 text-[10px] font-bold text-slate-400 whitespace-nowrap">القسم</th>
                  {monthDays.map((d, i) => {
                    const dayNum = new Date(d.date).getDate();
                    const weekend = isWeekend(d);
                    return (
                      <th key={i} className={`py-2 px-1 text-center min-w-[36px] ${weekend ? "bg-slate-100/80 dark:bg-slate-800/50" : ""}`}>
                        <div className="text-[9px] text-slate-400">{dayNum}</div>
                        <div className={`text-[8px] font-bold ${weekend ? "text-red-400" : "text-slate-500 dark:text-slate-400"}`}>{dayNameShort(d.dayName)}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                {filteredSchedules.map((emp, idx) => {
                  const days = ensureMonthDays(emp);
                  return (
                    <tr key={emp.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-all">
                      <td className="py-1.5 px-2 sticky right-0 bg-white dark:bg-slate-900 z-10 font-bold text-slate-400">{filteredSchedules.length - idx}</td>
                      <td className="py-1.5 px-2 sticky right-6 bg-white dark:bg-slate-900 z-10">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap text-[11px]">{emp.employeeName}</span>
                          <button onClick={() => handleDelete(emp.id)} className="text-slate-300 hover:text-red-500 transition-all" title="حذف">
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </td>
                      <td className="py-1.5 px-2">
                        <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400">{emp.department || "—"}</span>
                      </td>
                      {days.map((d, di) => {
                        const weekend = isWeekend(d);
                        const isActive = editingCell?.empId === emp.id && editingCell.dayIdx === di;
                        return (
                          <td
                            key={di}
                            onClick={() => handleCellClick(emp.id, di)}
                            className={`py-1 px-1 text-center cursor-pointer transition-all ${
                              isActive ? "bg-slate-200 dark:bg-slate-700 ring-2 ring-slate-400" :
                              weekend ? "bg-slate-50/80 dark:bg-slate-800/30" : "hover:bg-slate-100 dark:hover:bg-slate-800/40"
                            }`}
                          >
                            {d.isOff ? (
                              <span className="text-[9px] font-bold text-red-400">OFF</span>
                            ) : d.shifts.length > 0 ? (
                              <div className="flex items-center justify-center gap-0.5 flex-wrap">
                                {d.shifts.map((s) => (
                                  <span key={s} className={`text-[9px] font-black px-1 py-0.5 rounded border ${SHIFT_COLORS[s] || "bg-slate-100 text-slate-600 border-slate-200"}`}>
                                    {s}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-slate-300 dark:text-slate-600">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
