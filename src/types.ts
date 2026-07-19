export interface EmployeeInfo {
  id: string;
  name: string;
  role: string;
}

export interface AttendanceRecord {
  day: string;
  date: string;
  time: string;
  type: "حضور" | "خروج" | string;
}

export interface PermissionRecord {
  date: string;
  start_time: string;
  end_time: string;
}

export interface LeaveRecord {
  start_date: string;
  end_date: string;
  leave_type: string;
}

export interface DailyReportRow {
  date: string;
  dayName: string;
  checkIn: string | null;
  checkOut: string | null;
  status: string;
  statusStyle: "success" | "danger" | "warning" | "secondary" | string;
  delayMinutes: number;
  earlyOutMinutes?: number;
  checkInCount?: number;
  checkOutCount?: number;
  hasLeave?: boolean;
  leaveType?: string | null;
  hasPermission?: boolean;
  permissionDetails?: string;
  workHours?: number;
  note: string;
  isWeekend: boolean;
}

export interface AnalysisKPIs {
  totalDelayMinutes: number;
  totalEarlyOutMinutes?: number;
  totalAbsences: number;
  totalLeavesUsed: number;
  totalWorkingDays?: number;
  perfectComplianceDays?: number;
  correctAttendancePercentage?: number;
  totalWorkHours?: number;
  totalDuplicateFingerprintDays?: number;
}

export interface DuplicateFingerprintItem {
  date: string;
  dayName: string;
  checkInCount: number;
  checkOutCount: number;
  details: string;
}

export interface LateDaySummaryItem {
  date: string;
  dayName: string;
  delayMinutes: number;
  time: string;
}

export interface TimesheetAnalysisResult {
  employee_info: EmployeeInfo;
  kpis: AnalysisKPIs;
  lateDaysSummary?: LateDaySummaryItem[];
  duplicateFingerprintsSummary?: DuplicateFingerprintItem[];
  daily_report: DailyReportRow[];
  extracted_data: {
    employee_info: EmployeeInfo;
    attendance_records: AttendanceRecord[];
    permissions: PermissionRecord[];
    leaves: LeaveRecord[];
  };
}

export interface SavedReport {
  id: string;
  savedAt: string;
  officialStartTime: string;
  officialEndTime?: string;
  result: TimesheetAnalysisResult;
}

export interface LeaveBalanceEntry {
  id: string;
  year: number;
  leaveType: string;
  totalDays: number;
  usedDays: number;
  notes: string;
}

export interface EmployeeLeaveBalance {
  employeeId: string;
  employeeName: string;
  balances: LeaveBalanceEntry[];
}

export interface OvertimeEntry {
  id: string;
  employeeName: string;
  date: string;
  hours: number;
  notes: string;
  type?: "overtime" | "deduction";
  reason?: string;
}

export interface Shift {
  name: string;
  startTime: string;
  endTime: string;
}

export const DEFAULT_SHIFT_DEFINITIONS: Record<string, Shift> = {
  A: { name: "A", startTime: "06:00", endTime: "14:00" },
  B: { name: "B", startTime: "14:00", endTime: "22:00" },
  C: { name: "C", startTime: "22:00", endTime: "06:00" },
};

export const SHIFT_NAMES = ["A", "B", "C"];
export const SHIFT_COLORS: Record<string, string> = {
  A: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800",
  B: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800",
  C: "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800",
};

export interface DaySchedule {
  date: string;
  dayName: string;
  shifts: string[];
  isOff: boolean;
}

export interface EmployeeSchedule {
  id: string;
  employeeName: string;
  department: string;
  days: DaySchedule[];
}

export interface ScheduleViolation {
  employeeName: string;
  date: string;
  dayName: string;
  type: "late_arrival" | "early_departure" | "absence" | "unscheduled" | "no_checkout";
  expectedTime?: string;
  actualTime?: string;
  delayMinutes?: number;
  details: string;
}

export const MONTH_NAMES = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];

export const ARABIC_DAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
