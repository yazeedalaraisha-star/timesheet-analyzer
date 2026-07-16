import React, { useState, useMemo, useRef } from "react";
import {
  Calendar,
  Upload,
  Plus,
  Trash2,
  Search,
  Users,
  Building2,
  Edit3,
  Check,
  X,
  Clock,
  AlertCircle,
  Download,
  FileDown,
} from "lucide-react";
import * as XLSX from "xlsx";
import { EmployeeSchedule, DaySchedule } from "../types";

interface Props {
  schedules: EmployeeSchedule[];
  onUpdate: (schedules: EmployeeSchedule[]) => void;
}

const ARABIC_DAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

function createDefaultSchedule(): DaySchedule[] {
  return ARABIC_DAYS.map((day) => ({
    day,
    startTime: "08:00",
    endTime: "17:00",
    isOff: day === "الجمعة" || day === "السبت",
  }));
}

export default function ScheduleManager({ schedules, onUpdate }: Props) {
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterDept, setFilterDept] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [newDept, setNewDept] = useState("");
  const [newSchedule, setNewSchedule] = useState<DaySchedule[]>(createDefaultSchedule());

  const departments = useMemo(() => {
    const depts = new Set(schedules.map((s) => s.department).filter(Boolean));
    return Array.from(depts).sort();
  }, [schedules]);

  const filteredSchedules = useMemo(() => {
    let result = schedules;
    if (searchQuery.trim()) {
      const q = searchQuery.trim();
      result = result.filter((s) => s.employeeName.includes(q));
    }
    if (filterDept) {
      result = result.filter((s) => s.department === filterDept);
    }
    return result;
  }, [schedules, searchQuery, filterDept]);

  const perDeptSummary = useMemo(() => {
    const map = new Map<string, { employees: number; activeDays: number }>();
    for (const s of schedules) {
      const dept = s.department || "بدون قسم";
      const existing = map.get(dept) || { employees: 0, activeDays: 0 };
      existing.employees += 1;
      existing.activeDays += s.schedule.filter((d) => !d.isOff).length;
      map.set(dept, existing);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].employees - a[1].employees);
  }, [schedules]);

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext === "xlsx" || ext === "xls") {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const csv = XLSX.utils.sheet_to_csv(sheet);
        parseCSVAndImport(csv);
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = (ev) => {
        let text = ev.target?.result as string;
        if (!text) return;
        if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
        const decoded = decodeArabicText(text);
        parseCSVAndImport(decoded);
      };
      reader.readAsText(file, "UTF-8");
    }
    e.target.value = "";
  };

  const decodeArabicText = (text: string): string => {
    if (/[أ-ي٠-٩]/.test(text)) return text;
    try {
      const bytes = new Uint8Array(text.length);
      for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i) & 0xFF;
      const decoded = new TextDecoder("windows-1256").decode(bytes);
      if (/[أ-ي]/.test(decoded)) return decoded;
    } catch {}
    return text;
  };

  const parseCSVAndImport = (text: string) => {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) {
      alert("الملف فارغ");
      return;
    }

    const delimiter = lines[0].includes(";") ? ";" : ",";
    const header = lines[0].toLowerCase().replace(/["\s]/g, "");

    const map = new Map<string, { dept: string; schedule: DaySchedule[] }>();
    const errors: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(delimiter).map((c) => c.replace(/^"|"$/g, "").trim());
      if (cols.length < 4) { errors.push(`سطر ${i + 1}: أعمدة غير كافية (وجد ${cols.length})`); continue; }
      const [empName, dept, day, start, end, off] = cols;
      if (!empName || !day) { errors.push(`سطر ${i + 1}: بيانات ناقصة`); continue; }

      const existing = map.get(empName) || { dept: dept || "", schedule: [] };
      if (dept && !existing.dept) existing.dept = dept;
      existing.schedule.push({
        day,
        startTime: start || "08:00",
        endTime: end || "17:00",
        isOff: off === "نعم" || off === "إجازة" || off === "true" || off === "1",
      });
      map.set(empName, existing);
    }

    const newSchedules: EmployeeSchedule[] = [];
    for (const [name, data] of map) {
      if (data.schedule.length === 0) continue;
      newSchedules.push({
        id: "sch_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
        employeeName: name,
        department: data.dept,
        schedule: data.schedule,
      });
    }

    if (newSchedules.length > 0) {
      if (window.confirm(`تم العثور على ${newSchedules.length} موظف. هل تريد إضافتهم للجدول؟`)) {
        onUpdate([...schedules, ...newSchedules]);
      }
    }
    if (errors.length > 0) {
      alert("أخطاء:\n" + errors.slice(0, 10).join("\n"));
    }
  };

  const handleAddEmployee = () => {
    if (!newName.trim()) return;
    const entry: EmployeeSchedule = {
      id: "sch_" + Date.now(),
      employeeName: newName.trim(),
      department: newDept.trim(),
      schedule: [...newSchedule],
    };
    onUpdate([entry, ...schedules]);
    setNewName("");
    setNewDept("");
    setNewSchedule(createDefaultSchedule());
    setShowAddForm(false);
  };

  const handleDelete = (id: string) => {
    if (window.confirm("هل أنت متأكد من حذف هذا الموظف من الجدول؟")) {
      onUpdate(schedules.filter((s) => s.id !== id));
    }
  };

  const handleDeleteDept = (dept: string) => {
    if (window.confirm(`هل أنت متأكد من حذف جميع موظفي قسم "${dept}"؟`)) {
      onUpdate(schedules.filter((s) => s.department !== dept));
    }
  };

  const handleUpdateDay = (empId: string, dayIndex: number, field: keyof DaySchedule, value: any) => {
    const updated = schedules.map((s) => {
      if (s.id !== empId) return s;
      const newSchedule = [...s.schedule];
      newSchedule[dayIndex] = { ...newSchedule[dayIndex], [field]: value };
      return { ...s, schedule: newSchedule };
    });
    onUpdate(updated);
  };

  const handleExportCSV = () => {
    const headers = ["الموظف", "القسم", "اليوم", "وقت الدخول", "وقت الخروج", "إجازة"];
    const rows: string[][] = [];
    for (const s of filteredSchedules) {
      for (const d of s.schedule) {
        rows.push([s.employeeName, s.department, d.day, d.startTime, d.endTime, d.isOff ? "نعم" : "لا"]);
      }
    }
    const csv = [headers.join(","), ...rows.map((r) => r.map((v) => `"${v}"`).join(","))].join("\r\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `جدول_الدوام_${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden transition-colors">
        <div className="p-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-xl">
              <Calendar className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-800 dark:text-white">جدول الدوام الرسمي</h2>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                إدارة جداول عمل الموظفين — يُستخدم للمقارنة التلقائية مع البصمة
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-sm">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500">الموظفين</span>
              <div className="flex items-baseline gap-1 pt-1">
                <span className="text-3xl font-black text-slate-700 dark:text-white">{schedules.length}</span>
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400">شخص</span>
              </div>
            </div>
            <div className="p-2.5 bg-slate-100 dark:bg-slate-800 text-slate-400 rounded-lg">
              <Users className="h-4 w-4" />
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-sm">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500">الأقسام</span>
              <div className="flex items-baseline gap-1 pt-1">
                <span className="text-3xl font-black text-slate-700 dark:text-white">{departments.length}</span>
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400">قسم</span>
              </div>
            </div>
            <div className="p-2.5 bg-slate-100 dark:bg-slate-800 text-slate-400 rounded-lg">
              <Building2 className="h-4 w-4" />
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-sm">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500">أيام العمل</span>
              <div className="flex items-baseline gap-1 pt-1">
                <span className="text-3xl font-black text-slate-700 dark:text-white">
                  {schedules.reduce((sum, s) => sum + s.schedule.filter((d) => !d.isOff).length, 0)}
                </span>
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400">يوم/أسبوع</span>
              </div>
            </div>
            <div className="p-2.5 bg-slate-100 dark:bg-slate-800 text-slate-400 rounded-lg">
              <Clock className="h-4 w-4" />
            </div>
          </div>
        </div>
      </div>

      {/* Department Summary */}
      {perDeptSummary.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-sm p-5">
          <h3 className="font-bold text-slate-700 dark:text-white text-sm flex items-center gap-2 mb-3">
            <Building2 className="h-4 w-4 text-slate-400" />
            <span>الأقسام</span>
          </h3>
          <div className="flex flex-wrap gap-2">
            {perDeptSummary.map(([dept, data]) => (
              <div
                key={dept}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-bold cursor-pointer transition-all ${
                  filterDept === dept
                    ? "bg-slate-700 text-white border-slate-700 dark:bg-slate-200 dark:text-slate-800 dark:border-slate-200"
                    : "bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"
                }`}
                onClick={() => setFilterDept(filterDept === dept ? "" : dept)}
              >
                {dept}
                <span className="text-[10px] opacity-60">{data.employees}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions Bar */}
      <div className="flex flex-wrap items-center gap-2">
        <input ref={csvInputRef} type="file" accept=".csv,.txt,.xlsx,.xls" className="hidden" onChange={handleFileImport} />
        <button
          onClick={() => csvInputRef.current?.click()}
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-700 hover:bg-slate-800 dark:bg-slate-600 dark:hover:bg-slate-500 text-white text-xs font-bold rounded-xl transition-all"
        >
          <Upload className="h-3.5 w-3.5" />
          استيراد CSV / Excel
        </button>
        <button
          onClick={() => { setShowAddForm(!showAddForm); setEditingId(null); }}
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all"
        >
          <Plus className="h-3.5 w-3.5" />
          إضافة موظف
        </button>
        {filteredSchedules.length > 0 && (
          <button
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl transition-all"
          >
            <FileDown className="h-3.5 w-3.5" />
            تصدير CSV
          </button>
        )}
        <div className="relative flex-1 min-w-[200px]">
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

      {/* Add Employee Form */}
      {showAddForm && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm p-5 transition-colors">
          <h3 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2 mb-4">
            <Plus className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            إضافة موظف جديد للجدول
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
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
                list="dept-list"
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-xl px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-slate-300/50 focus:border-slate-400 outline-none transition-all"
              />
              <datalist id="dept-list">
                {departments.map((d) => <option key={d} value={d} />)}
              </datalist>
            </div>
          </div>

          {/* Day Schedule Grid */}
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 text-[10px] font-bold text-slate-400 dark:text-slate-500">
                  <th className="py-2 px-2">اليوم</th>
                  <th className="py-2 px-2">من</th>
                  <th className="py-2 px-2">إلى</th>
                  <th className="py-2 px-2">إجازة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                {newSchedule.map((day, idx) => (
                  <tr key={day.day} className={day.isOff ? "opacity-50" : ""}>
                    <td className="py-2 px-2 font-bold text-slate-700 dark:text-slate-200">{day.day}</td>
                    <td className="py-2 px-2">
                      <input
                        type="time"
                        value={day.startTime}
                        onChange={(e) => {
                          const s = [...newSchedule];
                          s[idx] = { ...s[idx], startTime: e.target.value };
                          setNewSchedule(s);
                        }}
                        disabled={day.isOff}
                        className="w-full px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-[11px] font-medium disabled:opacity-40"
                      />
                    </td>
                    <td className="py-2 px-2">
                      <input
                        type="time"
                        value={day.endTime}
                        onChange={(e) => {
                          const s = [...newSchedule];
                          s[idx] = { ...s[idx], endTime: e.target.value };
                          setNewSchedule(s);
                        }}
                        disabled={day.isOff}
                        className="w-full px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-[11px] font-medium disabled:opacity-40"
                      />
                    </td>
                    <td className="py-2 px-2 text-center">
                      <input
                        type="checkbox"
                        checked={day.isOff}
                        onChange={(e) => {
                          const s = [...newSchedule];
                          s[idx] = { ...s[idx], isOff: e.target.checked };
                          setNewSchedule(s);
                        }}
                        className="rounded"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-2 mt-4">
            <button onClick={() => setShowAddForm(false)} className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-sm font-bold rounded-xl transition-all">
              إلغاء
            </button>
            <button onClick={handleAddEmployee} disabled={!newName.trim()} className={`px-4 py-2 text-white text-sm font-bold rounded-xl transition-all ${!newName.trim() ? "opacity-50 cursor-not-allowed bg-slate-400" : "bg-emerald-600 hover:bg-emerald-700"}`}>
              حفظ الموظف
            </button>
          </div>
        </div>
      )}

      {/* Schedule Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden transition-colors">
        <div className="p-5 border-b border-slate-100 dark:border-slate-800">
          <h3 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
            <Calendar className="h-4 w-4 text-slate-400" />
            <span>الجدول ({filteredSchedules.length}{searchQuery || filterDept ? ` من ${schedules.length}` : ""})</span>
          </h3>
        </div>

        {filteredSchedules.length === 0 ? (
          <div className="py-12 text-center text-slate-400 dark:text-slate-500">
            <Calendar className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm font-bold">{schedules.length === 0 ? "لا يوجد جداول دوام" : "لا توجد نتائج"}</p>
            <p className="text-xs mt-1">{schedules.length === 0 ? "ارفع ملف CSV أو أضف موظفين يدوياً" : "جرّب تغيير الفلتر"}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20 text-[10px] font-bold text-slate-400 dark:text-slate-500">
                  <th className="py-3 px-3">#</th>
                  <th className="py-3 px-3">الموظف</th>
                  <th className="py-3 px-3">القسم</th>
                  {ARABIC_DAYS.map((d) => (
                    <th key={d} className="py-3 px-2 text-center min-w-[100px]">{d}</th>
                  ))}
                  <th className="py-3 px-3 text-center">حذف</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredSchedules.map((emp, idx) => (
                  <tr key={emp.id} className="hover:bg-slate-50/40 dark:hover:bg-slate-800/20 transition-all">
                    <td className="py-3 px-3 font-bold text-slate-400">{filteredSchedules.length - idx}</td>
                    <td className="py-3 px-3 font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">{emp.employeeName}</td>
                    <td className="py-3 px-3">
                      <span className="inline-block px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded text-[10px] font-bold">
                        {emp.department || "—"}
                      </span>
                    </td>
                    {emp.schedule.map((day, di) => (
                      <td key={day.day} className="py-3 px-2 text-center">
                        {day.isOff ? (
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold">إجازة</span>
                        ) : (
                          <span className="text-[10px] font-bold text-slate-700 dark:text-slate-200">
                            {day.startTime}-{day.endTime}
                          </span>
                        )}
                      </td>
                    ))}
                    <td className="py-3 px-3 text-center">
                      <button onClick={() => handleDelete(emp.id)} className="p-1 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-all" title="حذف">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
