import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { TimesheetAnalysisResult } from "../types";

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
