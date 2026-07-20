import { EmployeeSchedule, DailyReportRow, ScheduleViolation, TimesheetAnalysisResult, Shift } from "../types";
import { parseTimeToSeconds } from "./timeUtils";

function normalizeToYYYYMMDD(displayDate: string): string {
  const parts = displayDate.split("-");
  if (parts.length === 3 && parts[0].length === 2) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return displayDate;
}

function normalizeToYYYYMMDDFromSlash(slashDate: string): string {
  const parts = slashDate.split("/");
  if (parts.length === 3) {
    return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
  }
  const dashParts = slashDate.split("-");
  if (dashParts.length === 3) {
    if (dashParts[0].length === 2) {
      return `${dashParts[2]}-${dashParts[1]}-${dashParts[0]}`;
    }
    return slashDate;
  }
  return slashDate;
}

function getFirstSegments(name: string, count: number = 2): string {
  const segments = name.trim().split(/\s+/);
  return segments.slice(0, count).join(" ").toLowerCase();
}

export function findEmployeeScheduleByName(
  schedules: EmployeeSchedule[],
  fingerprintName: string
): EmployeeSchedule | null {
  const fpSegments = getFirstSegments(fingerprintName, 2);
  return schedules.find((s) => {
    const schedSegments = getFirstSegments(s.employeeName, 2);
    return fpSegments === schedSegments;
  }) || null;
}

export function buildScheduleTimeOverrides(
  employeeSchedule: EmployeeSchedule,
  shiftDefs: Record<string, Shift>
): Record<string, { startTime: string; endTime: string }> {
  const overrides: Record<string, { startTime: string; endTime: string }> = {};

  for (const day of employeeSchedule.days) {
    if (day.isOff || day.shifts.length === 0 || day.leaveType) continue;

    const firstShift = shiftDefs[day.shifts[0]];
    const lastShift = shiftDefs[day.shifts[day.shifts.length - 1]];
    if (firstShift && lastShift) {
      overrides[day.date] = {
        startTime: firstShift.startTime,
        endTime: lastShift.endTime,
      };
    }
  }

  return overrides;
}

export interface ComparisonResult {
  violations: ScheduleViolation[];
  employeeNotFound: boolean;
  searchedName: string;
  matchedSchedule: EmployeeSchedule | null;
}

export function compareScheduleToFingerprint(
  schedules: EmployeeSchedule[],
  result: TimesheetAnalysisResult,
  shiftDefs: Record<string, Shift>
): ComparisonResult {
  const violations: ScheduleViolation[] = [];
  const empName = result.employee_info.name;

  const employeeSchedule = findEmployeeScheduleByName(schedules, empName);

  if (!employeeSchedule) {
    return { violations: [], employeeNotFound: true, searchedName: empName, matchedSchedule: null };
  }

  const dailyReport = result.daily_report || [];

  const reportByDate = new Map<string, DailyReportRow>();
  for (const row of dailyReport) {
    const key = normalizeToYYYYMMDD(row.date);
    reportByDate.set(key, row);
  }

  for (const day of employeeSchedule.days) {
    const schedDate = day.date;
    const reportRow = reportByDate.get(schedDate);

    if (day.isOff) {
      if (reportRow && !reportRow.isWeekend && !reportRow.hasLeave && (reportRow.checkIn || reportRow.checkOut)) {
        violations.push({
          employeeName: empName,
          date: schedDate,
          dayName: day.dayName,
          type: "unscheduled",
          details: `حضور في يوم إجازة (${day.leaveType || "عطلة"})`,
        });
      }
      continue;
    }

    if (day.shifts.length === 0 && !day.leaveType) {
      continue;
    }

    if (day.leaveType) {
      continue;
    }

    if (day.shifts.length > 0) {
      const firstShift = shiftDefs[day.shifts[0]];
      if (!firstShift) continue;

      const expectedStartSec = parseTimeToSeconds(firstShift.startTime + ":00");
      const lastShift = shiftDefs[day.shifts[day.shifts.length - 1]];
      const expectedEndSec = lastShift ? parseTimeToSeconds(lastShift.endTime + ":00") : null;

      if (!reportRow || (!reportRow.checkIn && !reportRow.checkOut)) {
        if (!reportRow?.isWeekend && !reportRow?.hasLeave) {
          violations.push({
            employeeName: empName,
            date: schedDate,
            dayName: day.dayName,
            type: "absence",
            expectedTime: `${firstShift.startTime} - ${lastShift?.endTime || "?"}`,
            details: `غياب عن نوبت ${day.shifts.join("+")} (${firstShift.startTime}-${lastShift?.endTime || "?"})`,
          });
        }
        continue;
      }

      if (reportRow.checkIn && expectedStartSec !== null) {
        const checkInSec = parseTimeToSeconds(reportRow.checkIn);
        if (checkInSec !== null && checkInSec > expectedStartSec) {
          const delayMins = Math.ceil((checkInSec - expectedStartSec) / 60);
          violations.push({
            employeeName: empName,
            date: schedDate,
            dayName: day.dayName,
            type: "late_arrival",
            expectedTime: firstShift.startTime,
            actualTime: reportRow.checkIn,
            delayMinutes: delayMins,
            details: `تأخير ${delayMins} دقيقة عن موعد نوبت ${day.shifts[0]} (${firstShift.startTime})`,
          });
        }
      }

      if (reportRow.checkOut && expectedEndSec !== null) {
        const checkOutSec = parseTimeToSeconds(reportRow.checkOut);
        if (checkOutSec !== null && checkOutSec < expectedEndSec) {
          const earlyMins = Math.ceil((expectedEndSec - checkOutSec) / 60);
          violations.push({
            employeeName: empName,
            date: schedDate,
            dayName: day.dayName,
            type: "early_departure",
            expectedTime: lastShift?.endTime,
            actualTime: reportRow.checkOut,
            delayMinutes: earlyMins,
            details: `خروج مبكر ${earlyMins} دقيقة قبل موعد نهاية نوبت ${day.shifts[day.shifts.length - 1]} (${lastShift?.endTime})`,
          });
        }
      }

      if (reportRow.checkIn && !reportRow.checkOut) {
        violations.push({
          employeeName: empName,
          date: schedDate,
          dayName: day.dayName,
          type: "no_checkout",
          actualTime: reportRow.checkIn,
          details: "لا يوجد خروج مسجل رغم وجود دخول",
        });
      }
    }
  }

  return { violations: violations.sort((a, b) => a.date.localeCompare(b.date)), employeeNotFound: false, searchedName: empName, matchedSchedule: employeeSchedule };
}
