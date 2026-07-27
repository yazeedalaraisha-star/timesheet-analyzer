import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { TimesheetAnalysisResult, ScheduleViolation } from "../types";

let cachedRegular: string | null = null;
let cachedBold: string | null = null;
let fontsLoaded = false;

async function loadFonts(): Promise<boolean> {
  if (fontsLoaded) return true;
  try {
    const [regResp, boldResp] = await Promise.all([
      fetch("/fonts/NotoNaskhArabic-Regular.ttf"),
      fetch("/fonts/NotoNaskhArabic-Bold.ttf"),
    ]);
    if (!regResp.ok || !boldResp.ok) return false;

    const [regBuf, boldBuf] = await Promise.all([
      regResp.arrayBuffer(),
      boldResp.arrayBuffer(),
    ]);

    const regBytes = new Uint8Array(regBuf);
    const boldBytes = new Uint8Array(boldBuf);

    let regBin = "";
    for (let i = 0; i < regBytes.byteLength; i++) regBin += String.fromCharCode(regBytes[i]);
    cachedRegular = btoa(regBin);

    let boldBin = "";
    for (let i = 0; i < boldBytes.byteLength; i++) boldBin += String.fromCharCode(boldBytes[i]);
    cachedBold = btoa(boldBin);

    fontsLoaded = true;
    return true;
  } catch (e) {
    console.error("Failed to load Arabic fonts:", e);
    return false;
  }
}

function reg(doc: jsPDF) {
  if (cachedRegular) {
    doc.addFileToVFS("NotoNaskhArabic-Regular.ttf", cachedRegular);
    doc.addFont("NotoNaskhArabic-Regular.ttf", "NotoNaskh", "normal");
  }
}

function bld(doc: jsPDF) {
  if (cachedBold) {
    doc.addFileToVFS("NotoNaskhArabic-Bold.ttf", cachedBold);
    doc.addFont("NotoNaskhArabic-Bold.ttf", "NotoNaskh", "bold");
  }
}

function useFont(doc: jsPDF, weight: "normal" | "bold") {
  if (fontsLoaded) {
    doc.setFont("NotoNaskh", weight);
  } else {
    doc.setFont("helvetica", weight);
  }
}

export async function exportToPDF(
  result: TimesheetAnalysisResult,
  officialStartTime: string,
  officialEndTime: string,
  lang: "ar" | "en" = "ar"
) {
  const hasFonts = await loadFonts();

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  if (hasFonts) {
    reg(doc);
    bld(doc);
  }

  const ff = hasFonts ? "NotoNaskh" : "helvetica";
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  const t = (ar: string, en: string) => (lang === "ar" ? ar : en);

  // Title
  doc.setFontSize(18);
  useFont(doc, "bold");
  doc.text(t("تقرير كشف الدوام", "Timesheet Analysis Report"), pageWidth / 2, 20, { align: "center" });

  // Employee info
  doc.setFontSize(11);
  useFont(doc, "normal");
  doc.text(
    t(
      `الموظف: ${result.employee_info.name}  |  الرقم: ${result.employee_info.id}  |  الوظيفة: ${result.employee_info.role}`,
      `Employee: ${result.employee_info.name}  |  ID: ${result.employee_info.id}  |  Role: ${result.employee_info.role}`
    ),
    pageWidth / 2, 30, { align: "center" }
  );
  doc.text(
    t(
      `ساعات العمل: ${officialStartTime} - ${officialEndTime}  |  التاريخ: ${new Date().toLocaleDateString("ar-EG")}`,
      `Work Hours: ${officialStartTime} - ${officialEndTime}  |  Generated: ${new Date().toLocaleDateString("en")}`
    ),
    pageWidth / 2, 36, { align: "center" }
  );

  // KPIs
  doc.setFontSize(12);
  useFont(doc, "bold");
  doc.text(t("مؤشرات الأداء الرئيسية", "Key Performance Indicators"), margin, 48);

  doc.setFontSize(10);
  useFont(doc, "normal");
  const kpis = [
    t(`نسبة الالتزام: ${result.kpis.correctAttendancePercentage ?? 100}%`, `Compliance: ${result.kpis.correctAttendancePercentage ?? 100}%`),
    t(`التأخير: ${result.kpis.totalDelayMinutes} دقيقة`, `Delays: ${result.kpis.totalDelayMinutes} min`),
    t(`الخروج المبكر: ${result.kpis.totalEarlyOutMinutes ?? 0} دقيقة`, `Early Exits: ${result.kpis.totalEarlyOutMinutes ?? 0} min`),
    t(`الغياب: ${result.kpis.totalAbsences} يوم`, `Absences: ${result.kpis.totalAbsences} days`),
    t(`الإجازات: ${result.kpis.totalLeavesUsed} يوم`, `Leaves: ${result.kpis.totalLeavesUsed} days`),
    t(`ساعات العمل: ${result.kpis.totalWorkHours ?? 0} ساعة`, `Work Hours: ${result.kpis.totalWorkHours ?? 0} hrs`),
  ];
  doc.text(kpis.join("   |   "), margin, 55);

  // Daily report table
  const tableHeaders = [
    [
      t("اليوم والتاريخ", "Day & Date"),
      t("وقت الدخول", "Check In"),
      t("وقت الخروج", "Check Out"),
      t("الساعات", "Hours"),
      t("الحالة", "Status"),
      t("ملاحظات", "Notes"),
    ],
  ];

  const tableData = result.daily_report
    .filter((row) => !row.isWeekend)
    .map((row) => [
      `${row.dayName} (${row.date})`,
      row.checkIn || "-",
      row.checkOut || "-",
      row.workHours ? `${row.workHours}h` : "-",
      row.status,
      row.note || "-",
    ]);

  autoTable(doc, {
    startY: 62,
    head: tableHeaders,
    body: tableData,
    styles: {
      font: ff,
      fontSize: 8,
      cellPadding: 2,
      halign: "center",
    },
    headStyles: {
      fillColor: [79, 70, 229],
      textColor: 255,
      fontStyle: "bold",
      halign: "center",
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { cellWidth: 45 },
      1: { cellWidth: 25 },
      2: { cellWidth: 25 },
      3: { cellWidth: 20 },
      4: { cellWidth: 35 },
      5: { cellWidth: "auto" },
    },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 4) {
        const val = String(data.cell.raw);
        if (val.includes("تأخير") || val.includes("غياب") || val.includes("Delinquent") || val.includes("Absent")) {
          data.cell.styles.textColor = [220, 38, 38];
        } else if (val.includes("منتظم") || val.includes("Regular") || val.includes("حضور")) {
          data.cell.styles.textColor = [5, 150, 105];
        } else if (val.includes("إجازة") || val.includes("Leave")) {
          data.cell.styles.textColor = [217, 119, 6];
        }
      }
    },
  });

  // Late days summary
  const finalY = (doc as any).lastAutoTable?.finalY || 62;
  if (result.lateDaysSummary && result.lateDaysSummary.length > 0) {
    doc.setFontSize(12);
    useFont(doc, "bold");
    doc.text(t("ملخص أيام التأخر", "Late Days Summary"), margin, finalY + 12);

    const lateData = result.lateDaysSummary.map((item) => [
      `${item.dayName} (${item.date})`,
      item.time,
      `${item.delayMinutes} ${t("دقيقة", "min")}`,
    ]);

    autoTable(doc, {
      startY: finalY + 16,
      head: [[t("اليوم والتاريخ", "Day & Date"), t("وقت الدخول", "Check In Time"), t("التأخير", "Delay")]],
      body: lateData,
      styles: { font: ff, fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [245, 158, 11], textColor: 255, fontStyle: "bold" },
      margin: { left: margin },
    });
  }

  // Duplicate fingerprints
  if (result.duplicateFingerprintsSummary && result.duplicateFingerprintsSummary.length > 0) {
    const dupY = (doc as any).lastAutoTable?.finalY || finalY + 16;
    doc.setFontSize(12);
    useFont(doc, "bold");
    doc.text(t("البصمات المكررة", "Duplicate Fingerprints"), margin, dupY + 12);

    const dupData = result.duplicateFingerprintsSummary.map((item) => [
      `${item.dayName} (${item.date})`,
      item.details,
    ]);

    autoTable(doc, {
      startY: dupY + 16,
      head: [[t("اليوم والتاريخ", "Day & Date"), t("التفاصيل", "Details")]],
      body: dupData,
      styles: { font: ff, fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [239, 68, 68], textColor: 255, fontStyle: "bold" },
      margin: { left: margin },
    });
  }

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    useFont(doc, "normal");
    doc.text(
      t(
        `تم إنشاء بواسطة محلل الدوام الذكي | ${result.employee_info.name} | صفحة ${i}/${pageCount}`,
        `Generated by Smart Timesheet Analyzer | ${result.employee_info.name} | Page ${i}/${pageCount}`
      ),
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 8,
      { align: "center" }
    );
  }

  doc.save(`Timesheet_${result.employee_info.id || "employee"}.pdf`);
}

export async function exportEmployeeReportPDF(
  result: TimesheetAnalysisResult,
  officialStartTime: string,
  officialEndTime: string,
  lang: "ar" | "en" = "ar"
) {
  const hasFonts = await loadFonts();
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  if (hasFonts) { reg(doc); bld(doc); }

  const ff = hasFonts ? "NotoNaskh" : "helvetica";
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  const t = (ar: string, en: string) => (lang === "ar" ? ar : en);

  let y = 15;

  // Title
  doc.setFontSize(16);
  useFont(doc, "bold");
  doc.text(t("تقرير الحضور والانصراف الشخصي", "Personal Attendance Report"), pageWidth / 2, y, { align: "center" });
  y += 10;

  doc.setFontSize(9);
  useFont(doc, "normal");
  doc.setTextColor(120);
  doc.text(t(`تاريخ الإصدار: ${new Date().toLocaleDateString("ar-EG")}`, `Issue Date: ${new Date().toLocaleDateString("en")}`), pageWidth / 2, y, { align: "center" });
  doc.setTextColor(0);
  y += 10;

  // Employee info box
  doc.setDrawColor(200);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(margin, y, pageWidth - margin * 2, 28, 2, 2, "FD");
  y += 7;
  doc.setFontSize(11);
  useFont(doc, "bold");
  doc.text(t(`الاسم: ${result.employee_info.name}`, `Name: ${result.employee_info.name}`), margin + 5, y);
  y += 7;
  doc.setFontSize(10);
  useFont(doc, "normal");
  doc.text(t(`الرقم: ${result.employee_info.id}`, `ID: ${result.employee_info.id}`), margin + 5, y);
  doc.text(t(`الوظيفة: ${result.employee_info.role}`, `Role: ${result.employee_info.role}`), pageWidth / 2 + 10, y);
  y += 7;
  doc.text(t(`ساعات العمل: ${officialStartTime.substring(0, 5)} - ${officialEndTime.substring(0, 5)}`, `Hours: ${officialStartTime.substring(0, 5)} - ${officialEndTime.substring(0, 5)}`), margin + 5, y);
  const totalDays = result.daily_report.filter((r) => !r.isWeekend).length;
  const presentDays = result.daily_report.filter((r) => !r.isWeekend && (r.checkIn || r.checkOut)).length;
  doc.text(t(`أيام العمل: ${totalDays} | أيام الحضور: ${presentDays}`, `Working Days: ${totalDays} | Present: ${presentDays}`), pageWidth / 2 + 10, y);
  y += 14;

  // KPIs summary
  doc.setFontSize(12);
  useFont(doc, "bold");
  doc.text(t("ملخص الأداء", "Performance Summary"), margin, y);
  y += 6;

  doc.setFontSize(10);
  useFont(doc, "normal");
  const reqHours = result.kpis.requiredWorkHours ?? 0;
  const actHours = result.kpis.totalWorkHours ?? 0;
  const kpiLines = [
    t(`نسبة الالتزام: ${result.kpis.correctAttendancePercentage ?? 100}%`, `Compliance: ${result.kpis.correctAttendancePercentage ?? 100}%`),
    t(`ساعات العمل الفعلية: ${actHours} / ${reqHours} ساعة`, `Actual Hours: ${actHours} / ${reqHours} hrs`),
    t(`التأخيرات: ${result.kpis.totalDelayMinutes} دقيقة`, `Delays: ${result.kpis.totalDelayMinutes} min`),
    t(`الخروج المبكر: ${result.kpis.totalEarlyOutMinutes ?? 0} دقيقة`, `Early Exits: ${result.kpis.totalEarlyOutMinutes ?? 0} min`),
    t(`الغياب: ${result.kpis.totalAbsences} يوم`, `Absences: ${result.kpis.totalAbsences} days`),
    t(`الإجازات: ${result.kpis.totalLeavesUsed} يوم`, `Leaves: ${result.kpis.totalLeavesUsed} days`),
  ];
  for (const line of kpiLines) {
    doc.text(line, margin + 2, y);
    y += 5;
  }
  y += 4;

  // Daily table
  const tableHeaders = [[
    t("اليوم", "Day"),
    t("التاريخ", "Date"),
    t("دخول", "In"),
    t("خروج", "Out"),
    t("ساعات", "Hrs"),
    t("الحالة", "Status"),
  ]];

  const tableData = result.daily_report
    .filter((row) => !row.isWeekend)
    .map((row) => [
      row.dayName,
      row.date,
      row.checkIn || "-",
      row.checkOut || "-",
      row.workHours ? `${row.workHours}h` : "-",
      row.status,
    ]);

  autoTable(doc, {
    startY: y,
    head: tableHeaders,
    body: tableData,
    styles: { font: ff, fontSize: 7.5, cellPadding: 2, halign: "center" },
    headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: "bold", halign: "center" },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: 28 },
      2: { cellWidth: 18 },
      3: { cellWidth: 18 },
      4: { cellWidth: 15 },
      5: { cellWidth: "auto" },
    },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 5) {
        const val = String(data.cell.raw);
        if (val.includes("تأخير") || val.includes("غياب")) data.cell.styles.textColor = [220, 38, 38];
        else if (val.includes("منتظم") || val.includes("حضور")) data.cell.styles.textColor = [5, 150, 105];
        else if (val.includes("إجازة")) data.cell.styles.textColor = [217, 119, 6];
      }
    },
  });

  // Signature section
  const sigY = (doc as any).lastAutoTable?.finalY || y + 80;
  const sigLineY = Math.min(sigY + 30, 260);
  doc.setDrawColor(150);
  doc.setLineWidth(0.3);
  const sigWidth = 55;

  // Employee signature
  doc.line(margin, sigLineY, margin + sigWidth, sigLineY);
  doc.setFontSize(9);
  useFont(doc, "normal");
  doc.text(t("توقيع الموظف", "Employee Signature"), margin + sigWidth / 2, sigLineY + 5, { align: "center" });

  // Manager signature
  const sig2X = pageWidth / 2 - sigWidth / 2;
  doc.line(sig2X, sigLineY, sig2X + sigWidth, sigLineY);
  doc.text(t("توقيع المدير", "Manager Signature"), sig2X + sigWidth / 2, sigLineY + 5, { align: "center" });

  // HR signature
  const sig3X = pageWidth - margin - sigWidth;
  doc.line(sig3X, sigLineY, sig3X + sigWidth, sigLineY);
  doc.text(t("توقيع الموارد البشرية", "HR Signature"), sig3X + sigWidth / 2, sigLineY + 5, { align: "center" });

  // Date line
  doc.setFontSize(8);
  doc.text(t(`التاريخ: _____/_____/_____`, `Date: _____/_____/_____`), pageWidth / 2, sigLineY + 12, { align: "center" });

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150);
    useFont(doc, "normal");
    doc.text(
      t(`محلل الدوام الذكي | صفحة ${i}/${pageCount}`, `Smart Timesheet Analyzer | Page ${i}/${pageCount}`),
      pageWidth / 2, doc.internal.pageSize.getHeight() - 5, { align: "center" }
    );
  }

  doc.save(`Report_${result.employee_info.id || "employee"}.pdf`);
}

export async function exportViolationsPDF(
  violations: ScheduleViolation[],
  employeeName: string,
  lang: "ar" | "en" = "ar"
) {
  const hasFonts = await loadFonts();
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  if (hasFonts) { reg(doc); bld(doc); }

  const ff = hasFonts ? "NotoNaskh" : "helvetica";
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  const t = (ar: string, en: string) => (lang === "ar" ? ar : en);

  let y = 15;

  // Title
  doc.setFontSize(16);
  useFont(doc, "bold");
  doc.text(t("تقرير مخالفات جدول الدوام", "Schedule Violations Report"), pageWidth / 2, y, { align: "center" });
  y += 10;

  doc.setFontSize(10);
  useFont(doc, "normal");
  doc.setTextColor(120);
  doc.text(t(`الموظف: ${employeeName}`, `Employee: ${employeeName}`), pageWidth / 2, y, { align: "center" });
  y += 5;
  doc.text(t(`تاريخ الإصدار: ${new Date().toLocaleDateString("ar-EG")}  |  عدد المخالفات: ${violations.length}`, `Date: ${new Date().toLocaleDateString("en")}  |  Total Violations: ${violations.length}`), pageWidth / 2, y, { align: "center" });
  doc.setTextColor(0);
  y += 12;

  if (violations.length === 0) {
    doc.setFontSize(14);
    useFont(doc, "bold");
    doc.setTextColor(5, 150, 105);
    doc.text(t("لا توجد مخالفات — التزام كامل", "No Violations — Full Compliance"), pageWidth / 2, y + 20, { align: "center" });
    doc.setTextColor(0);
  } else {
    // Summary counts
    const counts = { late: 0, early: 0, absence: 0, unscheduled: 0, noCheckout: 0 };
    for (const v of violations) {
      if (v.type === "late_arrival") counts.late++;
      else if (v.type === "early_departure") counts.early++;
      else if (v.type === "absence") counts.absence++;
      else if (v.type === "unscheduled") counts.unscheduled++;
      else if (v.type === "no_checkout") counts.noCheckout++;
    }

    doc.setFontSize(10);
    useFont(doc, "bold");
    const summaryParts: string[] = [];
    if (counts.late > 0) summaryParts.push(t(`تأخير: ${counts.late}`, `Late: ${counts.late}`));
    if (counts.early > 0) summaryParts.push(t(`خروج مبكر: ${counts.early}`, `Early: ${counts.early}`));
    if (counts.absence > 0) summaryParts.push(t(`غياب: ${counts.absence}`, `Absence: ${counts.absence}`));
    if (counts.unscheduled > 0) summaryParts.push(t(`حضور غير مجدول: ${counts.unscheduled}`, `Unscheduled: ${counts.unscheduled}`));
    if (counts.noCheckout > 0) summaryParts.push(t(`بدون خروج: ${counts.noCheckout}`, `No Checkout: ${counts.noCheckout}`));
    doc.text(summaryParts.join("   |   "), margin, y);
    y += 8;

    // Violations table
    const typeLabels: Record<string, { ar: string; en: string; color: number[] }> = {
      late_arrival: { ar: "تأخير", en: "Late", color: [245, 158, 11] },
      early_departure: { ar: "خروج مبكر", en: "Early Exit", color: [139, 92, 246] },
      absence: { ar: "غياب", en: "Absence", color: [220, 38, 38] },
      unscheduled: { ar: "حضور غير مجدول", en: "Unscheduled", color: [249, 115, 22] },
      no_checkout: { ar: "بدون خروج", en: "No Checkout", color: [107, 114, 128] },
    };

    const tableHeaders = [[
      t("اليوم", "Day"),
      t("التاريخ", "Date"),
      t("النوع", "Type"),
      t("المتوقع", "Expected"),
      t("الفعلي", "Actual"),
      t("التفاصيل", "Details"),
    ]];

    const tableData = violations.map((v) => [
      v.dayName,
      v.date,
      typeLabels[v.type]?.[lang === "ar" ? "ar" : "en"] || v.type,
      v.expectedTime || "-",
      v.actualTime || "-",
      v.details,
    ]);

    autoTable(doc, {
      startY: y,
      head: tableHeaders,
      body: tableData,
      styles: { font: ff, fontSize: 7.5, cellPadding: 2, halign: "center" },
      headStyles: { fillColor: [220, 38, 38], textColor: 255, fontStyle: "bold", halign: "center" },
      alternateRowStyles: { fillColor: [254, 242, 242] },
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 28 },
        2: { cellWidth: 28 },
        3: { cellWidth: 18 },
        4: { cellWidth: 18 },
        5: { cellWidth: "auto" },
      },
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index === 2) {
          const val = String(data.cell.raw);
          if (val.includes("تأخير") || val.includes("Late")) data.cell.styles.textColor = [245, 158, 11];
          else if (val.includes("خروج") || val.includes("Early")) data.cell.styles.textColor = [139, 92, 246];
          else if (val.includes("غياب") || val.includes("Absence")) data.cell.styles.textColor = [220, 38, 38];
          else if (val.includes("غير") || val.includes("Unscheduled")) data.cell.styles.textColor = [249, 115, 22];
        }
      },
    });
  }

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150);
    useFont(doc, "normal");
    doc.text(
      t(`محلل الدوام الذكي | صفحة ${i}/${pageCount}`, `Smart Timesheet Analyzer | Page ${i}/${pageCount}`),
      pageWidth / 2, doc.internal.pageSize.getHeight() - 5, { align: "center" }
    );
  }

  doc.save(`Violations_${employeeName.replace(/\s+/g, "_")}.pdf`);
}
