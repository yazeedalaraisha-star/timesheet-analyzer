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
}
