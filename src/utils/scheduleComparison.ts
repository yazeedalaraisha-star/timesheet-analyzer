import { EmployeeSchedule, DailyReportRow, ScheduleViolation, TimesheetAnalysisResult, Shift } from "../types";
import { parseTimeToSeconds } from "./timeUtils";
import { GRACE_PERIOD_MINUTES } from "../analysis";

function normalizeToYYYYMMDD(displayDate: string): string {
  const parts = displayDate.split("-");
  if (parts.length === 3 && parts[0].length === 2) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return displayDate;
}

const NAME_CONNECTORS = ["بن", "بنت", "ابن", "أبو", "أبا", "أم", "آل", "أولاد"];

function getMeaningfulParts(name: string): string[] {
  return name
    .trim()
    .split(/\s+/)
    .filter((w) => !NAME_CONNECTORS.includes(w.toLowerCase()))
    .map((w) => w.toLowerCase());
}

export function findEmployeeScheduleByName(
  schedules: EmployeeSchedule[],
  fingerprintName: string
): EmployeeSchedule | null {
  const fpParts = getMeaningfulParts(fingerprintName);
  if (fpParts.length === 0) return null;

  const candidates: EmployeeSchedule[] = [];

  for (const s of schedules) {
    const schedParts = getMeaningfulParts(s.employeeName);
    if (schedParts.length === 0) continue;

    const firstNameMatch = fpParts[0] === schedParts[0];
    if (!firstNameMatch) continue;

    if (schedParts.length >= 2 && fpParts.length >= 2) {
      const secondNameMatch = fpParts[1] === schedParts[1];
      const lastNameMatch = fpParts[fpParts.length - 1] === schedParts[schedParts.length - 1];
      if (secondNameMatch || lastNameMatch) {
        candidates.push(s);
      }
    } else if (schedParts.length === 1 && fpParts.length === 1) {
      candidates.push(s);
    }
  }

  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  let bestMatch = candidates[0];
  let bestScore = 0;
  for (const c of candidates) {
    const cParts = getMeaningfulParts(c.employeeName);
    const score = cParts.length;
    if (score > bestScore) {
      bestScore = score;
      bestMatch = c;
    }
  }
  return bestMatch;
}

export function buildScheduleTimeOverrides(
  employeeSchedule: EmployeeSchedule,
  shiftDefs: Record<string, Shift>
): Record<string, { startTime: string; endTime: string }> {
  const overrides: Record<string, { startTime: string; endTime: string }> = {};

  const hasCustomTimes = employeeSchedule.customStartTime && employeeSchedule.customEndTime;

  for (const day of employeeSchedule.days) {
    if (day.isOff || day.leaveType) continue;

    if (hasCustomTimes) {
      overrides[day.date] = {
        startTime: employeeSchedule.customStartTime!,
        endTime: employeeSchedule.customEndTime!,
      };
      continue;
    }

    if (day.shifts.length === 0) continue;

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

  const scheduleByDate = new Map<string, typeof employeeSchedule.days[0]>();
  for (const day of employeeSchedule.days) {
    scheduleByDate.set(day.date, day);
  }

  for (const row of dailyReport) {
    const reportDateKey = normalizeToYYYYMMDD(row.date);
    const day = scheduleByDate.get(reportDateKey);

    if (!day) continue;

    if (day.isOff) {
      if (!row.isWeekend && !row.hasLeave && (row.checkIn || row.checkOut)) {
        violations.push({
          employeeName: empName,
          date: reportDateKey,
          dayName: day.dayName,
          type: "unscheduled",
          details: `حضور في يوم إجازة (${day.leaveType || "عطلة"})`,
        });
      }
      continue;
    }

    if (day.shifts.length === 0 && !day.leaveType) continue;
    if (day.leaveType) continue;

    if (day.shifts.length > 0) {
      const firstShift = shiftDefs[day.shifts[0]];
      if (!firstShift) continue;

      const expectedStartSec = parseTimeToSeconds(firstShift.startTime + ":00");
      const lastShift = shiftDefs[day.shifts[day.shifts.length - 1]];
      const expectedEndSec = lastShift ? parseTimeToSeconds(lastShift.endTime + ":00") : null;

      if (!row.checkIn && !row.checkOut) {
        if (!row.isWeekend && !row.hasLeave) {
          violations.push({
            employeeName: empName,
            date: reportDateKey,
            dayName: day.dayName,
            type: "absence",
            expectedTime: `${firstShift.startTime} - ${lastShift?.endTime || "?"}`,
            details: `غياب عن نوبت ${day.shifts.join("+")} (${firstShift.startTime}-${lastShift?.endTime || "?"})`,
          });
        }
        continue;
      }

      if (row.checkIn && expectedStartSec !== null) {
        const checkInSec = parseTimeToSeconds(row.checkIn);
        if (checkInSec !== null && checkInSec > expectedStartSec) {
          const actualDelayMins = Math.ceil((checkInSec - expectedStartSec) / 60);
          if (actualDelayMins > GRACE_PERIOD_MINUTES) {
            const delayMins = actualDelayMins - GRACE_PERIOD_MINUTES;
            violations.push({
              employeeName: empName,
              date: reportDateKey,
              dayName: day.dayName,
              type: "late_arrival",
              expectedTime: firstShift.startTime,
              actualTime: row.checkIn,
              delayMinutes: delayMins,
              details: `تأخير ${actualDelayMins} دقيقة (${GRACE_PERIOD_MINUTES} سماح) = ${delayMins} دقيقة مخالفة`,
            });
          }
        }
      }

      if (row.checkOut && expectedEndSec !== null) {
        const checkOutSec = parseTimeToSeconds(row.checkOut);
        if (checkOutSec !== null && checkOutSec < expectedEndSec) {
          const actualEarlyMins = Math.ceil((expectedEndSec - checkOutSec) / 60);
          if (actualEarlyMins > GRACE_PERIOD_MINUTES) {
            const earlyMins = actualEarlyMins - GRACE_PERIOD_MINUTES;
            violations.push({
              employeeName: empName,
              date: reportDateKey,
              dayName: day.dayName,
              type: "early_departure",
              expectedTime: lastShift?.endTime,
              actualTime: row.checkOut,
              delayMinutes: earlyMins,
              details: `خروج مبكر ${actualEarlyMins} دقيقة (${GRACE_PERIOD_MINUTES} سماح) = ${earlyMins} دقيقة مخالفة`,
            });
          }
        }
      }

      if (row.checkIn && !row.checkOut) {
        violations.push({
          employeeName: empName,
          date: reportDateKey,
          dayName: day.dayName,
          type: "no_checkout",
          actualTime: row.checkIn,
          details: "لا يوجد خروج مسجل رغم وجود دخول",
        });
      }
    }
  }

  return { violations: violations.sort((a, b) => a.date.localeCompare(b.date)), employeeNotFound: false, searchedName: empName, matchedSchedule: employeeSchedule };
}
