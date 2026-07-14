import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { TimesheetAnalysisResult } from "../types";

let cachedFontBase64: string | null = null;
let fontLoadingPromise: Promise<string | null> | null = null;

async function fetchArabicFont(): Promise<string | null> {
  if (cachedFontBase64) return cachedFontBase64;
  if (fontLoadingPromise) return fontLoadingPromise;

  fontLoadingPromise = (async () => {
    try {
      const cssResp = await fetch(
        "https://fonts.googleapis.com/css2?family=Noto+Naskh+Arabic:wght@400;700&display=swap",
        { headers: { "User-Agent": "Mozilla/4.0 (compatible; MSIE 6.0; Windows NT 5.1)" } }
      );
      const cssText = await cssResp.text();
      const urlMatch = cssText.match(/url\((https:\/\/[^)]+\.ttf)\)/);
      if (!urlMatch) return null;

      const fontResp = await fetch(urlMatch[1]);
      const buffer = await fontResp.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = "";
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      cachedFontBase64 = btoa(binary);
      return cachedFontBase64;
    } catch (e) {
      console.error("Failed to load Arabic font:", e);
      return null;
    }
  })();

  return fontLoadingPromise;
}

function setupArabicFont(doc: jsPDF, base64: string, fontName: string) {
  doc.addFileToVFS(`${fontName}.ttf`, base64);
  doc.addFont(`${fontName}.ttf`, fontName, "normal");
}

function tr(doc: jsPDF, text: string, x: number, y: number, options?: { align?: string; maxWidth?: number }) {
  return doc.text(text, x, y, options as any);
}

export async function exportToPDF(
  result: TimesheetAnalysisResult,
  officialStartTime: string,
  officialEndTime: string,
  lang: "ar" | "en" = "ar"
) {
  const fontBase64 = await fetchArabicFont();
  const hasArabicFont = !!fontBase64;

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  const fontName = "NotoNaskh";
  if (hasArabicFont) {
    setupArabicFont(doc, fontBase64!, fontName);
  }
  const fallbackFont = hasArabicFont ? fontName : "helvetica";

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  const isRTL = lang === "ar";

  const t = (ar: string, en: string) => (lang === "ar" ? ar : en);

  doc.setFont(fallbackFont, "bold");
  doc.setFontSize(18);
  doc.text(t("تقرير كشف الدوام", "Timesheet Analysis Report"), pageWidth / 2, 20, { align: "center" });

  doc.setFontSize(11);
  doc.setFont(fallbackFont, "normal");
  doc.text(
    t(
      `الموظف: ${result.employee_info.name}  |  الرقم: ${result.employee_info.id}  |  الوظيفة: ${result.employee_info.role}`,
      `Employee: ${result.employee_info.name}  |  ID: ${result.employee_info.id}  |  Role: ${result.employee_info.role}`
    ),
    pageWidth / 2,
    30,
    { align: "center" }
  );
  doc.text(
    t(
      `ساعات العمل: ${officialStartTime} - ${officialEndTime}  |  التاريخ: ${new Date().toLocaleDateString("ar-EG")}`,
      `Work Hours: ${officialStartTime} - ${officialEndTime}  |  Generated: ${new Date().toLocaleDateString("en")}`
    ),
    pageWidth / 2,
    36,
    { align: "center" }
  );

  doc.setFontSize(12);
  doc.setFont(fallbackFont, "bold");
  doc.text(t("مؤشرات الأداء الرئيسية", "Key Performance Indicators"), margin, 48);

  doc.setFontSize(10);
  doc.setFont(fallbackFont, "normal");
  const kpis = [
    t(`نسبة الالتزام: ${result.kpis.correctAttendancePercentage ?? 100}%`, `Compliance: ${result.kpis.correctAttendancePercentage ?? 100}%`),
    t(`التأخير: ${result.kpis.totalDelayMinutes} دقيقة`, `Delays: ${result.kpis.totalDelayMinutes} min`),
    t(`الخروج المبكر: ${result.kpis.totalEarlyOutMinutes ?? 0} دقيقة`, `Early Exits: ${result.kpis.totalEarlyOutMinutes ?? 0} min`),
    t(`الغياب: ${result.kpis.totalAbsences} يوم`, `Absences: ${result.kpis.totalAbsences} days`),
    t(`الإجازات: ${result.kpis.totalLeavesUsed} يوم`, `Leaves: ${result.kpis.totalLeavesUsed} days`),
    t(`ساعات العمل: ${result.kpis.totalWorkHours ?? 0} ساعة`, `Work Hours: ${result.kpis.totalWorkHours ?? 0} hrs`),
  ];
  doc.text(kpis.join("   |   "), margin, 55);

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
      font: fallbackFont,
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
        if (val.includes("تأخير") || val.includes("غياب") || val.includes("غياب") || val.includes("Delinquent") || val.includes("Absent")) {
          data.cell.styles.textColor = [220, 38, 38];
        } else if (val.includes("منتظم") || val.includes("Regular") || val.includes("حضور")) {
          data.cell.styles.textColor = [5, 150, 105];
        } else if (val.includes("إجازة") || val.includes("Leave")) {
          data.cell.styles.textColor = [217, 119, 6];
        }
      }
    },
  });

  const finalY = (doc as any).lastAutoTable?.finalY || 62;
  if (result.lateDaysSummary && result.lateDaysSummary.length > 0) {
    doc.setFontSize(12);
    doc.setFont(fallbackFont, "bold");
    doc.text(t("ملخص أيام التأخر", "Late Days Summary"), margin, finalY + 12);

    const lateData = result.lateDaysSummary.map((item) => [
      `${item.dayName} (${item.date})`,
      item.time,
      `${item.delayMinutes} ${t("دقيقة", "min")}`,
    ]);

    autoTable(doc, {
      startY: finalY + 16,
      head: [
        [
          t("اليوم والتاريخ", "Day & Date"),
          t("وقت الدخول", "Check In Time"),
          t("التأخير", "Delay"),
        ],
      ],
      body: lateData,
      styles: { font: fallbackFont, fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [245, 158, 11], textColor: 255, fontStyle: "bold" },
      margin: { left: margin },
    });
  }

  if (result.duplicateFingerprintsSummary && result.duplicateFingerprintsSummary.length > 0) {
    const dupY = (doc as any).lastAutoTable?.finalY || finalY + 16;
    doc.setFontSize(12);
    doc.setFont(fallbackFont, "bold");
    doc.text(t("البصمات المكررة", "Duplicate Fingerprints"), margin, dupY + 12);

    const dupData = result.duplicateFingerprintsSummary.map((item) => [
      `${item.dayName} (${item.date})`,
      item.details,
    ]);

    autoTable(doc, {
      startY: dupY + 16,
      head: [
        [
          t("اليوم والتاريخ", "Day & Date"),
          t("التفاصيل", "Details"),
        ],
      ],
      body: dupData,
      styles: { font: fallbackFont, fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [239, 68, 68], textColor: 255, fontStyle: "bold" },
      margin: { left: margin },
    });
  }

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.setFont(fallbackFont, "normal");
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
