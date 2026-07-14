import { useState } from "react";
import { Plus, Trash2, Edit2, Save, X, CalendarDays, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { EmployeeLeaveBalance, LeaveBalanceEntry } from "../types";

interface Props {
  balances: EmployeeLeaveBalance[];
  onUpdate: (balances: EmployeeLeaveBalance[]) => void;
}

const LEAVE_TYPES = [
  "إجازة سنوية",
  "إجازة مرضية",
  "إجازة رسمية",
  "إجازة استثنائية",
  "إجازة بدون راتب",
  "إجازة أمومة",
  "إجازة أبوبة",
  "أخرى",
];

export default function LeaveBalance({ balances, onUpdate }: Props) {
  const [expandedEmployee, setExpandedEmployee] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState<string | null>(null);
  const [editingEntry, setEditingEntry] = useState<{ empId: string; entryId: string } | null>(null);
  const [newEmployeeName, setNewEmployeeName] = useState("");
  const [showNewEmployee, setShowNewEmployee] = useState(false);

  const [form, setForm] = useState({
    year: new Date().getFullYear(),
    leaveType: LEAVE_TYPES[0],
    totalDays: 30,
    usedDays: 0,
    notes: "",
  });

  const addEmployee = () => {
    if (!newEmployeeName.trim()) return;
    const newBalances: EmployeeLeaveBalance = {
      employeeId: "emp_" + Date.now(),
      employeeName: newEmployeeName.trim(),
      balances: [],
    };
    onUpdate([...balances, newBalances]);
    setNewEmployeeName("");
    setShowNewEmployee(false);
    setExpandedEmployee(newBalances.employeeId);
  };

  const addEntry = (empId: string) => {
    const entry: LeaveBalanceEntry = {
      id: "le_" + Date.now(),
      year: form.year,
      leaveType: form.leaveType,
      totalDays: form.totalDays,
      usedDays: form.usedDays,
      notes: form.notes,
    };
    const updated = balances.map((b) =>
      b.employeeId === empId ? { ...b, balances: [...b.balances, entry] } : b
    );
    onUpdate(updated);
    setForm({ year: new Date().getFullYear(), leaveType: LEAVE_TYPES[0], totalDays: 30, usedDays: 0, notes: "" });
    setShowAddForm(null);
  };

  const updateEntry = (empId: string, entryId: string) => {
    const updated = balances.map((b) => {
      if (b.employeeId !== empId) return b;
      return {
        ...b,
        balances: b.balances.map((e) =>
          e.id === entryId ? { ...e, ...form } : e
        ),
      };
    });
    onUpdate(updated);
    setEditingEntry(null);
    setForm({ year: new Date().getFullYear(), leaveType: LEAVE_TYPES[0], totalDays: 30, usedDays: 0, notes: "" });
  };

  const deleteEntry = (empId: string, entryId: string) => {
    if (!window.confirm("هل أنت متأكد من حذف هذا السجل؟")) return;
    const updated = balances.map((b) => {
      if (b.employeeId !== empId) return b;
      return { ...b, balances: b.balances.filter((e) => e.id !== entryId) };
    });
    onUpdate(updated);
  };

  const deleteEmployee = (empId: string) => {
    if (!window.confirm("هل أنت متأكد من حذف هذا الموظف وجميع سجلاته؟")) return;
    onUpdate(balances.filter((b) => b.employeeId !== empId));
  };

  const startEdit = (empId: string, entry: LeaveBalanceEntry) => {
    setEditingEntry({ empId, entryId: entry.id });
    setForm({
      year: entry.year,
      leaveType: entry.leaveType,
      totalDays: entry.totalDays,
      usedDays: entry.usedDays,
      notes: entry.notes,
    });
  };

  const totalBalance = (b: LeaveBalanceEntry) => b.totalDays - b.usedDays;
  const usagePercent = (b: LeaveBalanceEntry) => b.totalDays > 0 ? Math.round((b.usedDays / b.totalDays) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-indigo-500" />
          رصيد الإجازات
        </h3>
        <button
          onClick={() => setShowNewEmployee(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          إضافة موظف
        </button>
      </div>

      {showNewEmployee && (
        <div className="bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 rounded-xl p-4 flex gap-2">
          <input
            type="text"
            placeholder="اسم الموظف"
            value={newEmployeeName}
            onChange={(e) => setNewEmployeeName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addEmployee()}
            className="flex-1 px-3 py-2 rounded-lg border border-indigo-300 dark:border-indigo-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-sm focus:ring-2 focus:ring-indigo-500"
            autoFocus
          />
          <button onClick={addEmployee} className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700">
            <Save className="h-4 w-4" />
          </button>
          <button onClick={() => { setShowNewEmployee(false); setNewEmployeeName(""); }} className="px-3 py-2 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg text-sm hover:bg-slate-300 dark:hover:bg-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {balances.length === 0 && (
        <div className="text-center py-12 text-slate-400 dark:text-slate-500">
          <CalendarDays className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p className="font-bold">لا يوجد رصيد إجازات مسجل</p>
          <p className="text-sm mt-1">أضف موظفاً لبدء تتبع رصيد الإجازات</p>
        </div>
      )}

      {balances.map((emp) => (
        <div key={emp.employeeId} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
          <div
            className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-750 transition-colors"
            onClick={() => setExpandedEmployee(expandedEmployee === emp.employeeId ? null : emp.employeeId)}
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold text-sm">
                {emp.employeeName.charAt(0)}
              </div>
              <div>
                <span className="font-bold text-slate-800 dark:text-slate-100">{emp.employeeName}</span>
                <span className="text-xs text-slate-400 mr-2">({emp.balances.length} سجل)</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {emp.balances.some((b) => totalBalance(b) <= 5 && totalBalance(b) >= 0) && (
                <AlertTriangle className="h-4 w-4 text-amber-500" />
              )}
              {expandedEmployee === emp.employeeId ? (
                <ChevronUp className="h-5 w-5 text-slate-400" />
              ) : (
                <ChevronDown className="h-5 w-5 text-slate-400" />
              )}
            </div>
          </div>

          {expandedEmployee === emp.employeeId && (
            <div className="border-t border-slate-200 dark:border-slate-700 p-4 space-y-3">
              {emp.balances.length === 0 ? (
                <p className="text-center text-sm text-slate-400 py-4">لا توجد سجلات بعد</p>
              ) : (
                <div className="space-y-2">
                  {emp.balances.map((entry) => (
                    <div key={entry.id} className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-750 rounded-lg">
                      {editingEntry?.empId === emp.employeeId && editingEntry?.entryId === entry.id ? (
                        <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <input
                            type="number"
                            value={form.year}
                            onChange={(e) => setForm({ ...form, year: parseInt(e.target.value) })}
                            className="px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-sm"
                            placeholder="السنة"
                          />
                          <select
                            value={form.leaveType}
                            onChange={(e) => setForm({ ...form, leaveType: e.target.value })}
                            className="px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-sm"
                          >
                            {LEAVE_TYPES.map((lt) => (
                              <option key={lt} value={lt}>{lt}</option>
                            ))}
                          </select>
                          <input
                            type="number"
                            value={form.totalDays}
                            onChange={(e) => setForm({ ...form, totalDays: parseInt(e.target.value) || 0 })}
                            className="px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-sm"
                            placeholder="أيام الإجمالي"
                          />
                          <input
                            type="number"
                            value={form.usedDays}
                            onChange={(e) => setForm({ ...form, usedDays: parseInt(e.target.value) || 0 })}
                            className="px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-sm"
                            placeholder="الأيام المستخدمة"
                          />
                          <input
                            type="text"
                            value={form.notes}
                            onChange={(e) => setForm({ ...form, notes: e.target.value })}
                            className="px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-sm col-span-2"
                            placeholder="ملاحظات"
                          />
                          <div className="flex gap-1 col-span-2">
                            <button onClick={() => updateEntry(emp.employeeId, entry.id)} className="px-2 py-1 bg-emerald-600 text-white rounded text-xs font-bold hover:bg-emerald-700">
                              <Save className="h-3 w-3" />
                            </button>
                            <button onClick={() => setEditingEntry(null)} className="px-2 py-1 bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-300 rounded text-xs hover:bg-slate-300">
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{entry.leaveType}</span>
                              <span className="text-xs text-slate-400">({entry.year})</span>
                              {totalBalance(entry) <= 0 && (
                                <span className="text-xs bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded font-bold">نفدت</span>
                              )}
                              {totalBalance(entry) > 0 && totalBalance(entry) <= 5 && (
                                <span className="text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded font-bold">منخفض</span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 mt-1">
                              <div className="flex items-center gap-1.5">
                                <div className="w-24 h-1.5 bg-slate-200 dark:bg-slate-600 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all ${
                                      usagePercent(entry) >= 100
                                        ? "bg-red-500"
                                        : usagePercent(entry) >= 80
                                        ? "bg-amber-500"
                                        : "bg-emerald-500"
                                    }`}
                                    style={{ width: `${Math.min(usagePercent(entry), 100)}%` }}
                                  />
                                </div>
                                <span className="text-xs text-slate-500 dark:text-slate-400">
                                  {entry.usedDays}/{entry.totalDays}
                                </span>
                              </div>
                              <span className={`text-xs font-bold ${totalBalance(entry) <= 0 ? "text-red-500" : "text-emerald-600 dark:text-emerald-400"}`}>
                                متبقي: {totalBalance(entry)}
                              </span>
                              {entry.notes && (
                                <span className="text-xs text-slate-400 truncate">{entry.notes}</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => startEdit(emp.employeeId, entry)}
                              className="p-1 text-slate-400 hover:text-indigo-500 transition-colors"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => deleteEntry(emp.employeeId, entry.id)}
                              className="p-1 text-slate-400 hover:text-red-500 transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {showAddForm === emp.employeeId ? (
                <div className="bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 rounded-lg p-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <input
                    type="number"
                    value={form.year}
                    onChange={(e) => setForm({ ...form, year: parseInt(e.target.value) })}
                    className="px-2 py-1.5 rounded border border-indigo-300 dark:border-indigo-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-sm"
                    placeholder="السنة"
                  />
                  <select
                    value={form.leaveType}
                    onChange={(e) => setForm({ ...form, leaveType: e.target.value })}
                    className="px-2 py-1.5 rounded border border-indigo-300 dark:border-indigo-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-sm"
                  >
                    {LEAVE_TYPES.map((lt) => (
                      <option key={lt} value={lt}>{lt}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    value={form.totalDays}
                    onChange={(e) => setForm({ ...form, totalDays: parseInt(e.target.value) || 0 })}
                    className="px-2 py-1.5 rounded border border-indigo-300 dark:border-indigo-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-sm"
                    placeholder="أيام الإجمالي"
                  />
                  <input
                    type="number"
                    value={form.usedDays}
                    onChange={(e) => setForm({ ...form, usedDays: parseInt(e.target.value) || 0 })}
                    className="px-2 py-1.5 rounded border border-indigo-300 dark:border-indigo-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-sm"
                    placeholder="الأيام المستخدمة"
                  />
                  <input
                    type="text"
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    className="px-2 py-1.5 rounded border border-indigo-300 dark:border-indigo-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-sm col-span-2"
                    placeholder="ملاحظات (اختياري)"
                  />
                  <div className="flex gap-1 col-span-2">
                    <button onClick={() => addEntry(emp.employeeId)} className="px-3 py-1.5 bg-indigo-600 text-white rounded text-sm font-bold hover:bg-indigo-700">
                      <Save className="h-3.5 w-3.5 inline ml-1" />
                      حفظ
                    </button>
                    <button onClick={() => setShowAddForm(null)} className="px-3 py-1.5 bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-300 rounded text-sm hover:bg-slate-300">
                      إلغاء
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setShowAddForm(emp.employeeId);
                      setForm({ year: new Date().getFullYear(), leaveType: LEAVE_TYPES[0], totalDays: 30, usedDays: 0, notes: "" });
                    }}
                    className="flex items-center gap-1 px-3 py-1.5 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg text-xs font-bold hover:bg-indigo-200 dark:hover:bg-indigo-900/50 transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    إضافة رصيد
                  </button>
                  <button
                    onClick={() => deleteEmployee(emp.employeeId)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg text-xs font-bold hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    حذف الموظف
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
