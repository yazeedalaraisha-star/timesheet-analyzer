import React, { useState, useMemo, useRef, useCallback } from "react";
import {
  Calendar,
  Upload,
  Plus,
  Trash2,
  Search,
  Building2,
  Clock,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  FileDown,
  Download,
  Camera,
  Loader2,
  Settings,
} from "lucide-react";
import * as XLSX from "xlsx";
import html2canvas from "html2canvas";
import { EmployeeSchedule, DaySchedule, SHIFT_NAMES, SHIFT_COLORS, DEFAULT_SHIFT_DEFINITIONS, ARABIC_DAYS, Shift } from "../types";
import { analyzeScheduleImage } from "../apiClient";
import { useLang } from "../context/LanguageContext";

interface Props {
  schedules: EmployeeSchedule[];
  onUpdate: (schedules: EmployeeSchedule[]) => void;
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getDayNameFromDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return ARABIC_DAYS[new Date(y, m - 1, d).getDay()];
}

function generateMonthDays(year: number, month: number): DaySchedule[] {
  const daysInMonth = getDaysInMonth(year, month);
  const days: DaySchedule[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const dayName = getDayNameFromDate(dateStr);
    days.push({ date: dateStr, dayName, shifts: [], isOff: dayName === "الجمعة" || dayName === "السبت" });
  }
  return days;
}

function calculateTotalHours(days: DaySchedule[]): number {
  let total = 0;
  for (const d of days) {
    if (!d.isOff) total += d.shifts.length * 8;
  }
  return total;
}

export default function ScheduleManager({ schedules, onUpdate }: Props) {
  const { t } = useLang();
  const now = new Date();
  const [currentYear, setCurrentYear] = useState(now.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(now.getMonth());
  const [selectedDept, setSelectedDept] = useState<string | null>(null);
  const [newDeptName, setNewDeptName] = useState("");
  const [showNewDeptInput, setShowNewDeptInput] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingCell, setEditingCell] = useState<{ empId: string; dayIdx: number } | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrStatus, setOcrStatus] = useState("");
  const [showShiftSettings, setShowShiftSettings] = useState(false);
  const [shiftDefs, setShiftDefs] = useState<Record<string, Shift>>(() => {
    try {
      const stored = localStorage.getItem("schedule_shift_definitions");
      return stored ? JSON.parse(stored) : { ...DEFAULT_SHIFT_DEFINITIONS };
    } catch { return { ...DEFAULT_SHIFT_DEFINITIONS }; }
  });
  const gridRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [newName, setNewName] = useState("");

  const monthLabel = useMemo(() => {
    const months = [
      "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
      "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
    ];
    return `${months[currentMonth]} ${currentYear}`;
  }, [currentYear, currentMonth]);

  const monthDays = useMemo(() => generateMonthDays(currentYear, currentMonth), [currentYear, currentMonth]);

  const departments = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of schedules) {
      const dept = s.department || t("noDept");
      map.set(dept, (map.get(dept) || 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [schedules]);

  const deptSchedules = useMemo(() => {
    if (!selectedDept) return [];
    return schedules.filter((s) => (s.department || t("noDept")) === selectedDept);
  }, [schedules, selectedDept]);

  const filteredDeptSchedules = useMemo(() => {
    let result = deptSchedules;
    if (searchQuery.trim()) {
      result = result.filter((s) => s.employeeName.includes(searchQuery.trim()));
    }
    return result;
  }, [deptSchedules, searchQuery]);

  const ensureMonthDays = useCallback((emp: EmployeeSchedule): DaySchedule[] => {
    const existing = new Map(emp.days.map((d) => [d.date, d]));
    return monthDays.map((md) => existing.get(md.date) || { ...md, shifts: [], isOff: md.isOff });
  }, [monthDays]);

  const handleSaveShiftDef = (name: string, field: "startTime" | "endTime", value: string) => {
    const updated = { ...shiftDefs, [name]: { ...shiftDefs[name], [field]: value } };
    setShiftDefs(updated);
    try { localStorage.setItem("schedule_shift_definitions", JSON.stringify(updated)); } catch {}
  };

  const handleResetShifts = () => {
    const defs = { ...DEFAULT_SHIFT_DEFINITIONS };
    setShiftDefs(defs);
    try { localStorage.setItem("schedule_shift_definitions", JSON.stringify(defs)); } catch {}
  };

  const handlePrevMonth = () => {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear((y) => y - 1); }
    else setCurrentMonth((m) => m - 1);
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear((y) => y + 1); }
    else setCurrentMonth((m) => m + 1);
  };

  const handleAddDept = () => {
    const name = newDeptName.trim();
    if (!name) return;
    if (!departments.find(([d]) => d === name)) {
      const placeholder: EmployeeSchedule = {
        id: "sch_dept_" + Date.now(),
        employeeName: "—",
        department: name,
        days: generateMonthDays(currentYear, currentMonth),
      };
      onUpdate([...schedules, placeholder]);
    }
    setSelectedDept(name);
    setNewDeptName("");
    setShowNewDeptInput(false);
  };

  const handleDeleteDept = (dept: string) => {
    if (window.confirm(t("confirmDeleteDept", { dept }))) {
      onUpdate(schedules.filter((s) => (s.department || t("noDept")) !== dept));
      if (selectedDept === dept) setSelectedDept(null);
    }
  };

  const handleDeleteAll = () => {
    if (window.confirm(t("confirmClearDept", { dept: selectedDept || "" }))) {
      const kept = schedules.filter((s) => (s.department || t("noDept")) !== selectedDept);
      onUpdate(kept);
    }
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
        if (day.isOff) {
          day.isOff = false;
          day.shifts = [];
          day.leaveType = undefined;
        } else {
          day.isOff = true;
          day.shifts = [];
        }
      } else if (shiftName === "CLEAR") {
        day.isOff = false;
        day.shifts = [];
        day.leaveType = undefined;
      } else {
        day.isOff = false;
        day.leaveType = undefined;
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

  const handleSetLeaveType = (empId: string, dayIdx: number, leaveType: string) => {
    const updated = schedules.map((emp) => {
      if (emp.id !== empId) return emp;
      const days = ensureMonthDays(emp);
      const day = { ...days[dayIdx] };
      day.isOff = true;
      day.shifts = [];
      day.leaveType = leaveType;
      days[dayIdx] = day;
      return { ...emp, days };
    });
    onUpdate(updated);
  };

  const LEAVE_TYPES = [
    "leaveAnnual",
    "leaveSick",
    "leaveEmergency",
    "leaveUnpaid",
    "leaveMaternity",
    "leaveHajj",
    "leaveBereavement",
    "leaveOfficial",
    "leaveMission",
  ];

  const handleAddEmployee = () => {
    if (!newName.trim() || !selectedDept) return;
    const entry: EmployeeSchedule = {
      id: "sch_" + Date.now(),
      employeeName: newName.trim(),
      department: selectedDept,
      days: generateMonthDays(currentYear, currentMonth),
    };
    onUpdate([...schedules, entry]);
    setNewName("");
    setShowAddForm(false);
  };

  const handleDelete = (id: string) => {
    if (window.confirm(t("confirmDeleteEmployee"))) {
      onUpdate(schedules.filter((s) => s.id !== id));
    }
  };

  const handleImageImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    setOcrLoading(true);
    setOcrStatus(t("ocrReading"));

    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      setOcrStatus(t("ocrAnalyzing"));

      const result = await analyzeScheduleImage(base64, currentMonth + 1, currentYear);

      if (!result?.employees || result.employees.length === 0) {
        alert(t("ocrNoData"));
        setOcrLoading(false);
        return;
      }

      const dept = selectedDept || t("noDept");
      const newSchedules: EmployeeSchedule[] = [];
      for (const emp of result.employees) {
        if (!emp.name || emp.name === "—") continue;
        const days = monthDays.map((md) => {
          const dayNum = parseInt(md.date.split("-")[2]);
          const cellVal = String(emp.days?.[dayNum] || "").trim().toUpperCase();
          if (cellVal === "OFF" || cellVal === "إجازة" || cellVal === "ع" || cellVal === "ح") {
            return { ...md, isOff: true, shifts: [] };
          }
          const shiftChars = cellVal.replace(/[^A-C]/g, "").split("").filter(Boolean);
          if (shiftChars.length > 0) {
            return { ...md, isOff: false, shifts: [...new Set(shiftChars)].sort() };
          }
          return md;
        });
        const totalShifts = days.filter((d) => !d.isOff && d.shifts.length > 0).length;
        if (totalShifts === 0) continue;
        newSchedules.push({
          id: "sch_ocr_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
          employeeName: emp.name,
          department: dept,
          days,
        });
      }

      if (newSchedules.length > 0) {
        const filtered = schedules.filter(
          (s) => (s.department || t("noDept")) !== dept || s.employeeName === "—"
        );
        onUpdate([...filtered, ...newSchedules]);
        alert(t("ocrExtracted", { count: newSchedules.length }));
      } else {
        alert(t("ocrNoValid"));
      }
    } catch (err: any) {
      alert(t("ocrError", { error: err.message || t("ocrUnknownError") }));
    } finally {
      setOcrLoading(false);
      setOcrStatus("");
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
    if (rows.length < 2) { alert(t("importFileEmpty")); return; }
    const dept = selectedDept || t("noDept");

    const headerRow = rows[0].map(String).map((h) => h?.trim() || "");
    const nameIdx = headerRow.findIndex((h) => /الموظف|الاسم|name|employee/i.test(h));
    const deptIdx = headerRow.findIndex((h) => /القسم|dept|department/i.test(h));

    const dateHeaders: { idx: number; dateStr: string }[] = [];
    for (let i = 0; i < headerRow.length; i++) {
      const h = headerRow[i];
      if (nameIdx === i || deptIdx === i) continue;

      const hClean = h.replace(/[\/\-.]/g, "/").trim();

      const m3 = hClean.match(/^(\d{1,2})[\/](\d{1,2})[\/](\d{2,4})$/);
      if (m3) {
        const day = parseInt(m3[1]);
        const month = parseInt(m3[2]) - 1;
        const year = m3[3].length === 2 ? 2000 + parseInt(m3[3]) : parseInt(m3[3]);
        if (day >= 1 && day <= 31 && month >= 0 && month <= 11) {
          dateHeaders.push({ idx: i, dateStr: `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}` });
          continue;
        }
      }

      const m2 = hClean.match(/^(\d{1,2})[\/](\d{1,2})$/);
      if (m2) {
        const a = parseInt(m2[1]);
        const b = parseInt(m2[2]);
        let day: number, month: number;
        if (a > 12 && b >= 1 && b <= 12) { day = a; month = b; }
        else if (b > 12 && a >= 1 && a <= 12) { month = a; day = b; }
        else { day = a; month = b; }
        if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
          dateHeaders.push({ idx: i, dateStr: `${currentYear}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` });
          continue;
        }
      }

      const m1 = h.match(/^(\d{1,2})$/);
      if (m1) {
        const day = parseInt(m1[1]);
        if (day >= 1 && day <= 31) {
          dateHeaders.push({ idx: i, dateStr: `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}` });
          continue;
        }
      }
    }

    const map = new Map<string, { dept: string; days: Map<string, DaySchedule> }>();

    for (let r = 1; r < rows.length; r++) {
      const cols = rows[r];
      const empName = String(cols[nameIdx >= 0 ? nameIdx : 0] || "").trim();
      if (!empName) continue;
      const empDept = deptIdx >= 0 ? String(cols[deptIdx] || "").trim() : dept;

      const entry = map.get(empName) || { dept: empDept, days: new Map<string, DaySchedule>() };
      if (empDept && !entry.dept) entry.dept = empDept;

      for (const dh of dateHeaders) {
        const cellVal = String(cols[dh.idx] || "").trim().toUpperCase();
        if (!cellVal) continue;

        const existing = entry.days.get(dh.dateStr) || {
          date: dh.dateStr,
          dayName: getDayNameFromDate(dh.dateStr),
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
        department: data.dept || dept,
        days: daysArray,
      });
    }

    if (newSchedules.length > 0) {
      if (window.confirm(t("importFound", { count: newSchedules.length }))) {
        const existing = schedules.filter(
          (s) => (s.department || t("noDept")) !== dept || s.employeeName === "—"
        );
        onUpdate([...existing, ...newSchedules]);
      }
    } else {
      alert(t("importNoValid"));
    }
  };

  const parseCSVAndImport = (text: string) => {
    if (text.trim().length < 10) { alert(t("importFileEmpty")); return; }
    const dept = selectedDept || t("noDept");
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) { alert(t("importFileEmpty")); return; }

    const delimiter = lines[0].includes(";") ? ";" : ",";
    const header = lines[0].split(delimiter).map((h) => h.replace(/^"|"$/g, "").trim());

    const nameIdx = header.findIndex((h) => /الموظف|الاسم|name/i.test(h));
    const deptIdx = header.findIndex((h) => /القسم|dept/i.test(h));

    const dateHeaders: { idx: number; dateStr: string }[] = [];
    for (let i = 0; i < header.length; i++) {
      if (i === nameIdx || i === deptIdx) continue;
      const h = header[i].replace(/[\/\-.]/g, "/").trim();

      const m3 = h.match(/^(\d{1,2})[\/](\d{1,2})[\/](\d{2,4})$/);
      if (m3) {
        const day = parseInt(m3[1]); const month = parseInt(m3[2]) - 1;
        const year = m3[3].length === 2 ? 2000 + parseInt(m3[3]) : parseInt(m3[3]);
        if (day >= 1 && day <= 31 && month >= 0 && month <= 11) {
          dateHeaders.push({ idx: i, dateStr: `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}` }); continue;
        }
      }
      const m2 = h.match(/^(\d{1,2})[\/](\d{1,2})$/);
      if (m2) {
        const a = parseInt(m2[1]); const b = parseInt(m2[2]);
        let day = a, month = b;
        if (a > 12 && b >= 1 && b <= 12) { day = a; month = b; }
        else if (b > 12 && a >= 1 && a <= 12) { month = a; day = b; }
        if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
          dateHeaders.push({ idx: i, dateStr: `${currentYear}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` }); continue;
        }
      }
      const m1 = header[i].match(/^(\d{1,2})$/);
      if (m1) {
        const day = parseInt(m1[1]);
        if (day >= 1 && day <= 31) {
          dateHeaders.push({ idx: i, dateStr: `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}` }); continue;
        }
      }
    }

    const map = new Map<string, { dept: string; days: Map<string, DaySchedule> }>();

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(delimiter).map((c) => c.replace(/^"|"$/g, "").trim());
      const empName = cols[nameIdx >= 0 ? nameIdx : 0];
      if (!empName) continue;
      const empDept = deptIdx >= 0 ? cols[deptIdx] : dept;

      const entry = map.get(empName) || { dept: empDept, days: new Map<string, DaySchedule>() };
      if (empDept && !entry.dept) entry.dept = empDept;

      for (const dh of dateHeaders) {
        const cellVal = (cols[dh.idx] || "").trim().toUpperCase();
        if (!cellVal) continue;
        const existing = entry.days.get(dh.dateStr) || {
          date: dh.dateStr,
          dayName: getDayNameFromDate(dh.dateStr),
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
        department: data.dept || dept,
        days: daysArray,
      });
    }

    if (newSchedules.length > 0) {
      if (window.confirm(t("importFound", { count: newSchedules.length }))) {
        const existing = schedules.filter(
          (s) => (s.department || t("noDept")) !== dept || s.employeeName === "—"
        );
        onUpdate([...existing, ...newSchedules]);
      }
    }
  };

  const handleExportExcel = () => {
    const headerRow: any[] = [t("excelColEmployee")];
    monthDays.forEach((d) => { headerRow.push(`${parseInt(d.date.split("-")[2])}`); });
    headerRow.push(t("excelColHours"));

    const data: any[][] = [];
    for (const emp of filteredDeptSchedules) {
      const days = ensureMonthDays(emp);
      const row: any[] = [emp.employeeName];
      days.forEach((d) => {
        if (d.isOff) row.push(d.leaveType || "OFF");
        else if (d.shifts.length > 0) row.push(d.shifts.join(""));
        else row.push("");
      });
      row.push(calculateTotalHours(days));
      data.push(row);
    }

    const ws = XLSX.utils.aoa_to_sheet([headerRow, ...data]);
    ws["!cols"] = [{ wch: 20 }, ...monthDays.map(() => ({ wch: 6 })), { wch: 8 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, t("sheetName"));
    XLSX.writeFile(wb, `${t("filePrefix")}${selectedDept || ""}_${monthLabel}.xlsx`);
  };

  const handleExportImage = async () => {
    if (!gridRef.current) return;
    try {
      const canvas = await html2canvas(gridRef.current, { scale: 2, backgroundColor: "#ffffff", logging: false });
      const link = document.createElement("a");
      link.download = `${t("filePrefix")}${selectedDept || ""}_${monthLabel}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch { alert(t("exportError")); }
  };

  const handleExportPDF = async () => {
    if (!gridRef.current) return;
    try {
      const canvas = await html2canvas(gridRef.current, { scale: 2, backgroundColor: "#ffffff", logging: false });
      const { default: jsPDF } = await import("jspdf");
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({
        orientation: canvas.width > canvas.height ? "l" : "p",
        unit: "px",
        format: [canvas.width, canvas.height],
      });
      pdf.addImage(imgData, "PNG", 0, 0, canvas.width, canvas.height);
      pdf.save(`${t("filePrefix")}${selectedDept || ""}_${monthLabel}.pdf`);
    } catch { alert(t("exportError")); }
  };

  const dayNameShort = (dayName: string) => {
    const map: Record<string, string> = { "الأحد": "أح", "الإثنين": "إث", "الثلاثاء": "ثل", "الأربعاء": "أرب", "الخميس": "خم", "الجمعة": "جم", "السبت": "سب" };
    return map[dayName] || dayName.charAt(0);
  };

  const isWeekend = (d: DaySchedule) => d.dayName === "الجمعة" || d.dayName === "السبت";

  // Department Selection View
  if (!selectedDept) {
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
                <h2 className="text-lg font-black text-slate-800 dark:text-white">{t("scheduleTitle")}</h2>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                  {t("scheduleDesc")}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Month Nav */}
        <div className="flex items-center justify-center gap-3">
          <button onClick={handlePrevMonth} className="p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-all">
            <ChevronRight className="h-4 w-4 text-slate-600 dark:text-slate-300" />
          </button>
          <span className="text-sm font-black text-slate-700 dark:text-white min-w-[140px] text-center">{monthLabel}</span>
          <button onClick={handleNextMonth} className="p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-all">
            <ChevronLeft className="h-4 w-4 text-slate-600 dark:text-slate-300" />
          </button>
        </div>

        {/* Add New Department */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-sm p-5">
          <h3 className="font-bold text-slate-700 dark:text-white text-sm mb-3">{t("addDepartment")}</h3>
          {showNewDeptInput ? (
            <div className="flex gap-2">
              <input
                type="text"
                value={newDeptName}
                onChange={(e) => setNewDeptName(e.target.value)}
                placeholder={t("deptPlaceholder")}
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && handleAddDept()}
                className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-xl px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-slate-300/50 focus:border-slate-400 outline-none transition-all"
              />
              <button onClick={handleAddDept} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl transition-all">
                {t("saveBtn")}
              </button>
              <button onClick={() => { setShowNewDeptInput(false); setNewDeptName(""); }} className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-sm font-bold rounded-xl transition-all">
                {t("cancelBtn")}
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowNewDeptInput(true)}
              className="inline-flex items-center gap-2 px-4 py-3 bg-emerald-50 dark:bg-emerald-950/30 border-2 border-dashed border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400 text-sm font-bold rounded-xl hover:bg-emerald-100 dark:hover:bg-emerald-950/50 transition-all w-full justify-center"
            >
              <Plus className="h-4 w-4" />
              {t("addDepartment")}
            </button>
          )}
        </div>

        {/* Department List */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800">
            <h3 className="font-bold text-slate-700 dark:text-white text-sm flex items-center gap-2">
              <Building2 className="h-4 w-4 text-slate-400" />
              {t("departmentCount", { count: departments.length })}
            </h3>
          </div>
          {departments.length === 0 ? (
            <div className="py-10 text-center text-slate-400">
              <Building2 className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm font-bold">{t("noDepartments")}</p>
              <p className="text-xs mt-1">{t("addDeptHint")}</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800/50">
              {departments.map(([dept, count]) => (
                <div
                  key={dept}
                  className="flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-slate-800/30 cursor-pointer transition-all"
                  onClick={() => setSelectedDept(dept)}
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-slate-100 dark:bg-slate-800 text-slate-400 rounded-lg">
                      <Building2 className="h-4 w-4" />
                    </div>
                    <div>
                      <span className="text-sm font-bold text-slate-800 dark:text-slate-200">{dept}</span>
                      <div className="text-[10px] text-slate-400 mt-0.5">{t("deptEmployeeCount", { count })}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteDept(dept); }}
                      className="p-1.5 text-slate-300 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/50 transition-all"
                      title={t("deleteDept")}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                    <ChevronLeft className="h-4 w-4 text-slate-400" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Department Grid View
  return (
    <div className="space-y-4">
      {/* Header with Back */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden transition-colors">
        <div className="p-5">
          <div className="flex items-center gap-3">
            <button
              onClick={() => { setSelectedDept(null); setEditingCell(null); }}
              className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 rounded-lg transition-all"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <div className="p-3 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-xl">
              <Building2 className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-black text-slate-800 dark:text-white">{selectedDept}</h2>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                {t("deptEmployeeCount", { count: deptSchedules.length })} — {monthLabel}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Month Nav + Hours */}
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
        <div className="flex items-center gap-2 text-xs">
          <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
            <Clock className="h-3 w-3 inline ml-1" />
            {deptSchedules.reduce((sum, emp) => sum + calculateTotalHours(ensureMonthDays(emp)), 0)} {t("totalHours")}
          </span>
          {SHIFT_NAMES.map((s) => (
            <span key={s} className={`text-[10px] font-bold px-2 py-1 rounded-lg border ${SHIFT_COLORS[s]}`}>
              {s}: {shiftDefs[s].startTime}-{shiftDefs[s].endTime}
            </span>
          ))}
          <button
            onClick={() => setShowShiftSettings(!showShiftSettings)}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg transition-all"
            title={t("shiftSettings")}
          >
            <Settings className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Shift Settings Panel */}
      {showShiftSettings && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-sm p-4">
          <h3 className="font-bold text-slate-700 dark:text-white text-sm flex items-center gap-2 mb-3">
            <Settings className="h-4 w-4 text-slate-400" />
            {t("shiftSettings")}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {SHIFT_NAMES.map((s) => (
              <div key={s} className="flex items-center gap-2">
                <span className={`text-xs font-black px-2 py-1 rounded-lg border ${SHIFT_COLORS[s]} min-w-[28px] text-center`}>{s}</span>
                <input
                  type="time"
                  value={shiftDefs[s].startTime}
                  onChange={(e) => handleSaveShiftDef(s, "startTime", e.target.value)}
                  className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs font-medium"
                />
                <span className="text-slate-400 text-xs">←</span>
                <input
                  type="time"
                  value={shiftDefs[s].endTime}
                  onChange={(e) => handleSaveShiftDef(s, "endTime", e.target.value)}
                  className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs font-medium"
                />
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 mt-3">
            <button onClick={handleResetShifts} className="text-[10px] text-slate-400 hover:text-red-500 font-bold transition-all">
              {t("resetShifts")}
            </button>
            <button onClick={() => setShowShiftSettings(false)} className="text-[10px] text-slate-400 hover:text-slate-600 font-bold transition-all mr-auto">
              {t("hideSettings")}
            </button>
          </div>
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
          {t("uploadFile")}
        </button>

        <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageImport} />
        <button
          onClick={() => imageInputRef.current?.click()}
          disabled={ocrLoading}
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold rounded-xl transition-all disabled:opacity-50"
        >
          {ocrLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
          {ocrLoading ? ocrStatus || t("analyzingOcr") : t("uploadScheduleImage")}
        </button>

        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all"
        >
          <Plus className="h-3.5 w-3.5" />
          {t("addEmployee")}
        </button>

        {filteredDeptSchedules.length > 0 && (
          <>
            <button onClick={handleExportExcel} className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-all">
              <FileDown className="h-3.5 w-3.5" />
              Excel
            </button>
            <button onClick={handleExportPDF} className="inline-flex items-center gap-1.5 px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl transition-all">
              <Download className="h-3.5 w-3.5" />
              PDF
            </button>
            <button onClick={handleExportImage} className="inline-flex items-center gap-1.5 px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl transition-all">
              <ImageIcon className="h-3.5 w-3.5" />
              {t("exportImage")}
            </button>
          </>
        )}

        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="w-full pr-8 pl-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-xl text-xs font-medium focus:ring-2 focus:ring-slate-300/50 focus:border-slate-400 outline-none transition-all"
          />
        </div>
      </div>

      {/* Shift picker */}
      {editingCell && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-sm p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">{t("shiftPickerLabel")}</span>
            {SHIFT_NAMES.map((s) => (
              <button
                key={s}
                onClick={() => handleToggleShift(editingCell.empId, editingCell.dayIdx, s)}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all ${SHIFT_COLORS[s]} hover:scale-105 active:scale-95`}
              >
                {s}
              </button>
            ))}
            <button
              onClick={() => handleToggleShift(editingCell.empId, editingCell.dayIdx, "OFF")}
              className="px-3 py-1.5 text-xs font-bold rounded-lg border bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 hover:scale-105 active:scale-95 transition-all"
            >
              {t("leaveLabel")}
            </button>
            <button
              onClick={() => handleToggleShift(editingCell.empId, editingCell.dayIdx, "CLEAR")}
              className="px-3 py-1.5 text-xs font-bold rounded-lg border bg-red-50 text-red-600 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800 hover:scale-105 active:scale-95 transition-all"
            >
              {t("clear")}
            </button>
            <button onClick={() => setEditingCell(null)} className="mr-auto p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg transition-all">
              ✕
            </button>
          </div>
          {/* Leave type selector */}
          <div className="flex flex-wrap items-center gap-1.5 mt-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <span className="text-[10px] font-bold text-slate-400">{t("leaveTypeLabel")}</span>
            {LEAVE_TYPES.map((lt) => (
              <button
                key={lt}
                onClick={() => handleSetLeaveType(editingCell.empId, editingCell.dayIdx, lt)}
                className="px-2 py-1 text-[10px] font-bold rounded-lg border bg-rose-50 text-rose-600 border-rose-200 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-800 hover:scale-105 active:scale-95 transition-all"
              >
                {t(lt)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Add Employee Form */}
      {showAddForm && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-sm p-4">
          <h3 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2 mb-3">
            <Plus className="h-4 w-4 text-emerald-600" />
            {t("addDeptTo", { dept: selectedDept })}
          </h3>
          <div className="flex gap-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t("employeeNamePlaceholder")}
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleAddEmployee()}
              className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-xl px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-slate-300/50 focus:border-slate-400 outline-none transition-all"
            />
            <button onClick={() => setShowAddForm(false)} className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-sm font-bold rounded-xl transition-all">
              {t("cancelBtn")}
            </button>
            <button onClick={handleAddEmployee} disabled={!newName.trim()} className={`px-4 py-2 text-white text-sm font-bold rounded-xl transition-all ${!newName.trim() ? "opacity-50 cursor-not-allowed bg-slate-400" : "bg-emerald-600 hover:bg-emerald-700"}`}>
              {t("saveBtn")}
            </button>
          </div>
        </div>
      )}

      {/* Monthly Grid */}
      <div ref={gridRef} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden transition-colors">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h3 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
            <Calendar className="h-4 w-4 text-slate-400" />
            {selectedDept} — {monthLabel} ({t("deptEmployeeCount", { count: filteredDeptSchedules.length })})
          </h3>
          {deptSchedules.filter((s) => s.employeeName !== "—").length > 0 && (
            <button onClick={handleDeleteAll} className="text-[10px] text-red-400 hover:text-red-600 font-bold transition-all">
              {t("clearAllEmployees")}
            </button>
          )}
        </div>

        {filteredDeptSchedules.length === 0 ? (
          <div className="py-12 text-center text-slate-400 dark:text-slate-500">
            <Calendar className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm font-bold">{t("noEmployees")}</p>
            <p className="text-xs mt-1">{t("noEmployeesHint")}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-[10px] border-collapse">
              <thead>
                <tr className="bg-slate-50/80 dark:bg-slate-800/30">
                  <th className="py-2 px-2 sticky right-0 bg-slate-50/80 dark:bg-slate-800/30 z-10 text-[10px] font-bold text-slate-400">#</th>
                  <th className="py-2 px-2 sticky right-6 bg-slate-50/80 dark:bg-slate-800/30 z-10 text-[10px] font-bold text-slate-400 whitespace-nowrap">{t("colEmployee")}</th>
                  <th className="py-2 px-2 text-[10px] font-bold text-slate-400 whitespace-nowrap min-w-[50px]">{t("colHours")}</th>
                  {monthDays.map((d, i) => {
                    const dayNum = parseInt(d.date.split("-")[2]);
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
                {filteredDeptSchedules.map((emp, idx) => {
                  const days = ensureMonthDays(emp);
                  const totalHours = calculateTotalHours(days);
                  return (
                    <tr key={emp.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-all">
                      <td className="py-1.5 px-2 sticky right-0 bg-white dark:bg-slate-900 z-10 font-bold text-slate-400">{filteredDeptSchedules.length - idx}</td>
                      <td className="py-1.5 px-2 sticky right-6 bg-white dark:bg-slate-900 z-10">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap text-[11px]">{emp.employeeName}</span>
                          {emp.employeeName !== "—" && (
                            <button onClick={() => handleDelete(emp.id)} className="text-slate-300 hover:text-red-500 transition-all" title={t("deleteBtn")}>
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="py-1.5 px-2 text-center">
                        <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-md ${
                          totalHours > 0 ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400" : "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500"
                        }`}>
                          {totalHours}
                        </span>
                      </td>
                      {days.map((d, di) => {
                        const weekend = isWeekend(d);
                        const isActive = editingCell?.empId === emp.id && editingCell.dayIdx === di;
                        return (
                          <td
                            key={di}
                            onClick={() => emp.employeeName !== "—" && handleCellClick(emp.id, di)}
                            className={`py-1 px-1 text-center transition-all ${
                              emp.employeeName !== "—" ? "cursor-pointer" : ""} ${
                              isActive ? "bg-slate-200 dark:bg-slate-700 ring-2 ring-slate-400" :
                              weekend ? "bg-slate-50/80 dark:bg-slate-800/30" : "hover:bg-slate-100 dark:hover:bg-slate-800/40"
                            }`}
                          >
                            {d.isOff ? (
                              d.leaveType ? (
                                <span className="text-[8px] font-bold text-rose-500 dark:text-rose-400 leading-tight block">{t(d.leaveType)}</span>
                              ) : (
                                <span className="text-[9px] font-bold text-red-400">OFF</span>
                              )
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
