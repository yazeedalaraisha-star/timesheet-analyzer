import { parseTimeToSeconds, cleanArabicNumbers } from "./utils/timeUtils";

export function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const cleanStr = cleanArabicNumbers(dateStr).trim();

  const parts = cleanStr.split(/[-/.]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const date = new Date(year, month, day);
      return isNaN(date.getTime()) ? null : date;
    }
    if (parts[2].length === 4 || parts[2].length === 2) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      let year = parseInt(parts[2], 10);
      if (year < 100) {
        year += 2000;
      }
      const date = new Date(year, month, day);
      return isNaN(date.getTime()) ? null : date;
    }
  }

  const timestamp = Date.parse(cleanStr);
  if (!isNaN(timestamp)) {
    return new Date(timestamp);
  }
  return null;
}

export function formatDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatDateDisplay(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${d}-${m}-${y}`;
}

function getArabicDayName(date: Date): string {
  const days = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
  return days[date.getDay()];
}

export function processAttendanceData(rawExtracted: any, officialStartTime: string, officialEndTime: string) {
  const employee_info = {
    id: cleanArabicNumbers(rawExtracted.employee_info?.id || "").trim() || "غير معروف",
    name: (rawExtracted.employee_info?.name || "غير معروف").trim(),
    role: (rawExtracted.employee_info?.role || "غير معروف").trim()
  };

  const officialStartSec = parseTimeToSeconds(officialStartTime) || (8 * 3600);
  const officialEndSec = parseTimeToSeconds(officialEndTime) || (17 * 3600);

  const attendanceList = (rawExtracted.attendance_records || []).map((rec: any) => {
    return {
      day: (rec.day || "").trim(),
      date: cleanArabicNumbers(rec.date || "").trim(),
      time: cleanArabicNumbers(rec.time || "").trim(),
      type: (rec.type || "").trim()
    };
  });

  const permissionsList = (rawExtracted.permissions || []).map((perm: any) => {
    return {
      date: cleanArabicNumbers(perm.date || "").trim(),
      start_time: cleanArabicNumbers(perm.start_time || "").trim(),
      end_time: cleanArabicNumbers(perm.end_time || "").trim()
    };
  });

  const leavesList = (rawExtracted.leaves || []).map((lv: any) => {
    return {
      start_date: cleanArabicNumbers(lv.start_date || "").trim(),
      end_date: cleanArabicNumbers(lv.end_date || "").trim(),
      leave_type: (lv.leave_type || "إجازة").trim()
    };
  });

  const attendanceByDate: Record<string, { checkIn: any; checkOut: any; checkInCount: number; checkOutCount: number }> = {};
  attendanceList.forEach((rec: any) => {
    const parsedD = parseDate(rec.date);
    if (!parsedD) return;
    const dateKey = formatDateKey(parsedD);

    if (!attendanceByDate[dateKey]) {
      attendanceByDate[dateKey] = { checkIn: null, checkOut: null, checkInCount: 0, checkOutCount: 0 };
    }

    const normType = (rec.type === "حضور" || rec.type.includes("دخول") || rec.type.includes("قدوم")) ? "حضور" : (rec.type === "خروج" || rec.type.includes("انصراف") || rec.type.includes("مغادرة")) ? "خروج" : "";
    if (!normType) return;

    if (normType === "حضور") {
      attendanceByDate[dateKey].checkInCount++;
      if (!attendanceByDate[dateKey].checkIn) {
        attendanceByDate[dateKey].checkIn = rec;
      } else {
        const currentSec = parseTimeToSeconds(attendanceByDate[dateKey].checkIn.time) || 999999;
        const newSec = parseTimeToSeconds(rec.time) || 999999;
        if (newSec < currentSec) {
          attendanceByDate[dateKey].checkIn = rec;
        }
      }
    } else if (normType === "خروج") {
      attendanceByDate[dateKey].checkOutCount++;
      if (!attendanceByDate[dateKey].checkOut) {
        attendanceByDate[dateKey].checkOut = rec;
      } else {
        const currentSec = parseTimeToSeconds(attendanceByDate[dateKey].checkOut.time) || 0;
        const newSec = parseTimeToSeconds(rec.time) || 0;
        if (newSec > currentSec) {
          attendanceByDate[dateKey].checkOut = rec;
        }
      }
    }
  });

  const isDateInLeave = (date: Date): { inLeave: boolean; type: string } => {
    for (const lv of leavesList) {
      const startD = parseDate(lv.start_date);
      const endD = parseDate(lv.end_date);
      if (startD && endD) {
        const sTime = new Date(startD.getFullYear(), startD.getMonth(), startD.getDate()).getTime();
        const eTime = new Date(endD.getFullYear(), endD.getMonth(), endD.getDate()).getTime();
        const curTime = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
        if (curTime >= sTime && curTime <= eTime) {
          return { inLeave: true, type: lv.leave_type };
        }
      }
    }
    return { inLeave: false, type: "" };
  };

  let startDate = new Date();
  let endDate = new Date();

  const validParsedDates = attendanceList
    .map((rec: any) => parseDate(rec.date))
    .filter((d: Date | null) => d !== null) as Date[];

  if (validParsedDates.length > 0) {
    let minTime = validParsedDates[0].getTime();
    let maxTime = validParsedDates[0].getTime();
    validParsedDates.forEach(d => {
      const t = d.getTime();
      if (t < minTime) minTime = t;
      if (t > maxTime) maxTime = t;
    });
    startDate = new Date(minTime);
    endDate = new Date(maxTime);
  } else {
    startDate = new Date();
    startDate.setDate(1);
  }

  const maxDays = 31;
  const daysCount = Math.min(
    maxDays,
    Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 3600 * 24)) + 1
  );

  const dailyReports: any[] = [];
  let totalDelayMinutes = 0;
  let totalEarlyOutMinutes = 0;
  let totalAbsences = 0;
  let totalLeavesUsed = 0;
  let totalWorkingDays = 0;
  let perfectComplianceDays = 0;
  let totalWorkHours = 0;

  const lateDaysSummary: any[] = [];
  const duplicateFingerprintsSummary: any[] = [];
  let totalDuplicateFingerprintDays = 0;

  for (let i = 0; i < daysCount; i++) {
    const currentDate = new Date(startDate);
    currentDate.setDate(startDate.getDate() + i);

    const dateKey = formatDateKey(currentDate);
    const dayOfWeek = currentDate.getDay();
    const dayArabic = getArabicDayName(currentDate);
    const isWeekend = dayOfWeek === 5 || dayOfWeek === 6;

    if (!isWeekend) {
      totalWorkingDays++;
    }

    const attendance = attendanceByDate[dateKey];
    const { inLeave, type: leaveType } = isDateInLeave(currentDate);

    let hasPermission = false;
    let permissionDetails = "";
    for (const perm of permissionsList) {
      const pDate = parseDate(perm.date);
      if (pDate && formatDateKey(pDate) === dateKey) {
        hasPermission = true;
        permissionDetails = `مغادرة من ${perm.start_time} إلى ${perm.end_time}`;
        break;
      }
    }

    let statusText = "منتظم";
    let statusStyle = "success";
    let delayMinutes = 0;
    let earlyOutMinutes = 0;
    let note = "";
    const checkInTime = attendance?.checkIn?.time || null;
    const checkOutTime = attendance?.checkOut?.time || null;

    if (attendance) {
      let hasViolation = false;
      let delayMsg = "";

      if (attendance.checkInCount > 1) {
        note += `تنبيه: تم رصد حركتي دخول (${attendance.checkInCount} مرات). `;
      }
      if (attendance.checkOutCount > 1) {
        note += `تنبيه: تم رصد حركتي خروج (${attendance.checkOutCount} مرات). `;
      }

      if (checkInTime) {
        const checkInSec = parseTimeToSeconds(checkInTime);
        if (checkInSec !== null && checkInSec > officialStartSec) {
          let excusedByPermission = false;
          let coveringPermission: any = null;

          for (const perm of permissionsList) {
            const pDate = parseDate(perm.date);
            if (pDate && formatDateKey(pDate) === dateKey) {
              const pStartSec = parseTimeToSeconds(perm.start_time);
              const pEndSec = parseTimeToSeconds(perm.end_time);

              if (pStartSec !== null && pEndSec !== null) {
                if (pStartSec <= officialStartSec && pEndSec >= checkInSec) {
                  excusedByPermission = true;
                  coveringPermission = perm;
                  break;
                }
              }
            }
          }

          if (excusedByPermission) {
            delayMsg = "تأخير معذور بمغادرة";
            note += `مغادرة رسمية من ${coveringPermission.start_time} إلى ${coveringPermission.end_time}. `;
          } else {
            delayMinutes = Math.ceil((checkInSec - officialStartSec) / 60);
            totalDelayMinutes += delayMinutes;
            delayMsg = `تأخير ${delayMinutes} دقيقة`;
            hasViolation = true;
            note += "تأخير غير معذور. ";

            lateDaysSummary.push({
              date: formatDateDisplay(currentDate),
              dayName: dayArabic,
              delayMinutes,
              time: checkInTime
            });
          }
        }
      } else {
        hasViolation = true;
        delayMsg = "بدون دخول";
        note += "لم يتم رصد حركة دخول. ";
      }

      if (checkOutTime) {
        const checkOutSec = parseTimeToSeconds(checkOutTime);
        if (checkOutSec !== null && checkOutSec < officialEndSec) {
          let excusedByPermission = false;
          let coveringPermission: any = null;

          for (const perm of permissionsList) {
            const pDate = parseDate(perm.date);
            if (pDate && formatDateKey(pDate) === dateKey) {
              const pStartSec = parseTimeToSeconds(perm.start_time);
              const pEndSec = parseTimeToSeconds(perm.end_time);

              if (pStartSec !== null && pEndSec !== null) {
                if (pStartSec <= checkOutSec && pEndSec >= officialEndSec) {
                  excusedByPermission = true;
                  coveringPermission = perm;
                  break;
                }
              }
            }
          }

          if (excusedByPermission) {
            note += `مغادرة خروج من ${coveringPermission.start_time} إلى ${coveringPermission.end_time}. `;
          } else {
            earlyOutMinutes = Math.ceil((officialEndSec - checkOutSec) / 60);
            totalEarlyOutMinutes += earlyOutMinutes;
            hasViolation = true;
            note += `خرج مبكراً بـ ${earlyOutMinutes} دقيقة. `;
          }
        }
      } else {
        note += "لم يتم رصد حركة خروج. ";
      }

      if (hasViolation) {
        statusStyle = "danger";
        const parts = [];
        if (delayMinutes > 0) parts.push(`تأخير ${delayMinutes} د`);
        if (earlyOutMinutes > 0) parts.push(`خروج مبكر ${earlyOutMinutes} د`);
        if (parts.length === 0) parts.push("غير ملتزم");
        statusText = parts.join(" و ");
      } else {
        statusStyle = "success";
        statusText = delayMsg && delayMsg.includes("معذور") ? "حضور (تأخير معذور)" : "حضور منتظم";
        if (!isWeekend) {
          perfectComplianceDays++;
        }
      }

    } else {
      if (isWeekend) {
        statusText = "عطلة نهاية الأسبوع";
        statusStyle = "secondary";
      } else if (inLeave) {
        statusText = `إجازة رسمية (${leaveType})`;
        statusStyle = "warning";
        totalLeavesUsed++;
        perfectComplianceDays++;
        note = `مغطى بإجازة: ${leaveType}`;
      } else {
        statusText = "غياب بدون عذر";
        statusStyle = "danger";
        totalAbsences++;
        note = "لم يتم رصد أي حركات حضور أو خروج";
      }
    }

    let dailyWorkHours = 0;
    if (checkInTime && checkOutTime) {
      const inSec = parseTimeToSeconds(checkInTime);
      const outSec = parseTimeToSeconds(checkOutTime);
      if (inSec !== null && outSec !== null && outSec > inSec) {
        dailyWorkHours = Number(((outSec - inSec) / 3600).toFixed(2));
        totalWorkHours += dailyWorkHours;
      }
    }

    dailyReports.push({
      date: formatDateDisplay(currentDate),
      dayName: dayArabic,
      checkIn: checkInTime,
      checkOut: checkOutTime,
      checkInCount: attendance?.checkInCount || 0,
      checkOutCount: attendance?.checkOutCount || 0,
      hasLeave: inLeave,
      leaveType: inLeave ? leaveType : null,
      hasPermission,
      permissionDetails,
      workHours: dailyWorkHours,
      status: statusText,
      statusStyle,
      delayMinutes,
      earlyOutMinutes,
      note: note.trim(),
      isWeekend
    });
  }

  for (const report of dailyReports) {
    if (report.checkInCount > 1 || report.checkOutCount > 1) {
      totalDuplicateFingerprintDays++;
      const details: string[] = [];
      if (report.checkInCount > 1) {
        details.push(`دخول ${report.checkInCount} مرات`);
      }
      if (report.checkOutCount > 1) {
        details.push(`خروج ${report.checkOutCount} مرات`);
      }
      duplicateFingerprintsSummary.push({
        date: report.date,
        dayName: report.dayName,
        checkInCount: report.checkInCount,
        checkOutCount: report.checkOutCount,
        details: details.join(" و ")
      });
    }
  }

  let correctAttendancePercentage = 100;
  if (totalWorkingDays > 0) {
    correctAttendancePercentage = Math.round((perfectComplianceDays / totalWorkingDays) * 100);
  }

  return {
    employee_info,
    kpis: {
      totalDelayMinutes,
      totalEarlyOutMinutes,
      totalAbsences,
      totalLeavesUsed,
      totalWorkingDays,
      perfectComplianceDays,
      correctAttendancePercentage,
      totalWorkHours: Number(totalWorkHours.toFixed(1)),
      totalDuplicateFingerprintDays
    },
    lateDaysSummary,
    duplicateFingerprintsSummary,
    daily_report: dailyReports,
    extracted_data: rawExtracted
  };
}
