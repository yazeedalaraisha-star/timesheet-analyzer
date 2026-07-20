import React, { useState, useEffect, Suspense } from "react";
import { 
  Upload, 
  FileText, 
  Clock, 
  AlertTriangle, 
  Calendar, 
  User, 
  Briefcase, 
  Hash, 
  TrendingUp, 
  CheckCircle2, 
  XCircle, 
  HelpCircle, 
  Loader2, 
  Printer, 
  Eye, 
  EyeOff, 
  History, 
  Trash2, 
  Download,
  AlertCircle,
  Info,
  Fingerprint,
  Moon,
  Sun,
  Globe,
  FileDown,
  LogOut,
  LogIn,
  X,
  Shield,
} from "lucide-react";
import { TimesheetAnalysisResult, SavedReport, DuplicateFingerprintItem, OvertimeEntry, EmployeeSchedule, ScheduleViolation, DEFAULT_SHIFT_DEFINITIONS, Shift } from "./types";
import { exportToPDF } from "./utils/pdfExport";
import { compareScheduleToFingerprint } from "./utils/scheduleComparison";
import { useLang } from "./context/LanguageContext";
import { useTheme } from "./context/ThemeContext";
import {
  checkDBStatus,
  fetchReports,
  saveReportToDB,
  deleteReportFromDB,
  clearAllReportsFromDB,
  fetchOvertimeFromDB,
  saveOvertimeToDB,
  fetchSchedulesFromDB,
  saveSchedulesToDB,
} from "./apiClient";
import { parseTimeToSeconds } from "./utils/timeUtils";
const OvertimeTracker = React.lazy(() => import("./components/OvertimeTracker"));
const ScheduleManager = React.lazy(() => import("./components/ScheduleManager"));

type UserRole = "admin" | "viewer";

import { 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";

const getStatusExplanation = (row: any, officialStartTime: string, officialEndTime: string): string => {
  if (row.isWeekend) {
    return "عطلة نهاية الأسبوع الرسمية.\nلا تحتسب ضمن أيام العمل الفعلية ولا تسجل عليها مخالفات.";
  }
  if (row.hasLeave) {
    return `إجازة رسمية معتمدة (${row.leaveType || "سنوية"}).\nيتم إعفاء الموظف بالكامل من تسجيل الحركات لهذا اليوم.`;
  }
  if (!row.checkIn && !row.checkOut) {
    return `غياب بدون عذر.\nلم يتم رصد أي حركة حضور (دخول) أو انصراف (خروج) في السجلات الرسمية لهذا اليوم العمل المعتاد.`;
  }
  
  let explanation = "";
  if (row.checkIn) {
    if (row.delayMinutes > 0) {
      explanation += `• تأخير: تم تسجيل الحضور الساعة ${row.checkIn}، وهي بعد موعد الدوام الرسمي ${officialStartTime.substring(0, 5)} بمقدار ${row.delayMinutes} دقيقة.\n`;
    } else if (row.hasPermission) {
      explanation += `• حضور معذور بمغادرة: تم تسجيل حضور متأخر ولكن بتفويض مغادرة معتمد.\n`;
    } else {
      explanation += `• حضور ملتزم: تم تسجيل الحضور الساعة ${row.checkIn}، قبل أو عند موعد بدء العمل ${officialStartTime.substring(0, 5)}.\n`;
    }
  } else {
    explanation += `• بدون دخول: لم يتم تسجيل حركة دخول للعمل.\n`;
  }

  if (row.checkOut) {
    if (row.earlyOutMinutes > 0) {
      explanation += `• خروج مبكر: تم تسجيل الانصراف الساعة ${row.checkOut}، وهي قبل موعد انتهاء الدوام ${officialEndTime.substring(0, 5)} بمقدار ${row.earlyOutMinutes} دقيقة.\n`;
    } else {
      explanation += `• انصراف ملتزم: تم تسجيل الانصراف الساعة ${row.checkOut}، عند أو بعد موعد انتهاء العمل ${officialEndTime.substring(0, 5)}.\n`;
    }
  } else {
    explanation += `• بدون خروج: لم يتم تسجيل حركة انصراف رسمية.\n`;
  }

  return explanation.trim();
};

const compressImage = (file: File, maxWidth = 2400, quality = 0.92): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let w = img.width;
        let h = img.height;
        if (w > maxWidth) {
          h = Math.round((h * maxWidth) / w);
          w = maxWidth;
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(reader.result as string);
          return;
        }
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, w, h);
        const isSmallEnough = (w * h) < 4000000;
        resolve(canvas.toDataURL(isSmallEnough ? "image/png" : "image/jpeg", quality));
      };
      img.onerror = () => reject(new Error("فشل تحميل الصورة للضغط"));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error("فشل قراءة ملف الصورة"));
    reader.readAsDataURL(file);
  });
};

const TIME_OPTIONS = Array.from({ length: 48 }).map((_, index) => {
  const hours = Math.floor(index / 2);
  const minutes = (index % 2) * 30;
  const formattedHours = String(hours).padStart(2, "0");
  const formattedMinutes = String(minutes).padStart(2, "0");
  return `${formattedHours}:${formattedMinutes}:00`;
});

export default function App() {
  const { lang, setLang, t } = useLang();
  const { dark, toggle: toggleTheme } = useTheme();
  
  // State variables
  const [image, setImage] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [officialStartTime, setOfficialStartTime] = useState<string>("08:00:00");
  const [officialEndTime, setOfficialEndTime] = useState<string>("17:00:00");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TimesheetAnalysisResult | null>(null);
  
  // UI filter state for daily log table
  const [filter, setFilter] = useState<"all" | "violations" | "regular" | "leaves">("all");
  
  // Saved reports history state (stored in localStorage + DB)
  const [history, setHistory] = useState<SavedReport[]>([]);
  const [dbAvailable, setDbAvailable] = useState<boolean>(false);

  // Tab/View selector for result
  const [showRawJson, setShowRawJson] = useState<boolean>(false);

  // View modes
  type ViewMode = "main" | "overtime" | "schedule";
  const [viewMode, setViewMode] = useState<ViewMode>("main");

  // Auth state — default is viewer (no login needed)
  const [authRole, setAuthRole] = useState<UserRole | null>(() => {
    try { return (localStorage.getItem("auth_role") as UserRole) || null; } catch { return null; }
  });
  const [authName, setAuthName] = useState<string>(() => {
    try { return localStorage.getItem("auth_name") || ""; } catch { return ""; }
  });
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const isAdmin = authRole === "admin";

  const handleLogin = (role: UserRole, name: string) => {
    setAuthRole(role);
    setAuthName(name);
    try {
      localStorage.setItem("auth_role", role);
      localStorage.setItem("auth_name", name);
    } catch {}
  };

  const handleLogout = () => {
    setAuthRole(null);
    setAuthName("");
    try {
      localStorage.removeItem("auth_role");
      localStorage.removeItem("auth_name");
    } catch {}
  };

  const [adminPasswordInput, setAdminPasswordInput] = useState("");
  const [adminLoginError, setAdminLoginError] = useState<string | null>(null);

  const handleAdminLogin = () => {
    if (adminPasswordInput === "admin@2026") {
      handleLogin("admin", "يزيد العريشة");
      setShowAdminLogin(false);
      setAdminPasswordInput("");
      setAdminLoginError(null);
    } else {
      setAdminLoginError(t("wrongPassword"));
    }
  };

  // Multiple images state
  const [multiImages, setMultiImages] = useState<string[]>([]);
  const [multiResults, setMultiResults] = useState<TimesheetAnalysisResult[]>([]);

  // Inline row editing states
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editCheckIn, setEditCheckIn] = useState<string>("");
  const [editCheckOut, setEditCheckOut] = useState<string>("");
  const [editHasLeave, setEditHasLeave] = useState<boolean>(false);
  const [editLeaveType, setEditLeaveType] = useState<string>("");
  const [editHasPermission, setEditHasPermission] = useState<boolean>(false);

  // Streaming progress state
  const [progressMessage, setProgressMessage] = useState<string | null>(null);

  // Overtime state
  const [overtimeEntries, setOvertimeEntries] = useState<OvertimeEntry[]>(() => {
    try {
      const stored = localStorage.getItem("overtime_entries");
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const handleUpdateOvertime = (newEntries: OvertimeEntry[]) => {
    setOvertimeEntries(newEntries);
    try { localStorage.setItem("overtime_entries", JSON.stringify(newEntries)); } catch {}
    if (dbAvailable) saveOvertimeToDB(newEntries).catch(() => {});
  };

  // Schedule state
  const [schedules, setSchedules] = useState<EmployeeSchedule[]>(() => {
    try {
      const stored = localStorage.getItem("employee_schedules");
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });

  // Shift definitions for schedule comparison
  const [shiftDefs, setShiftDefs] = useState<Record<string, Shift>>(() => {
    try {
      const stored = localStorage.getItem("schedule_shift_definitions");
      return stored ? JSON.parse(stored) : { ...DEFAULT_SHIFT_DEFINITIONS };
    } catch { return { ...DEFAULT_SHIFT_DEFINITIONS }; }
  });

  // Schedule comparison violations
  const [scheduleViolations, setScheduleViolations] = useState<ScheduleViolation[]>([]);
  const [showScheduleComparison, setShowScheduleComparison] = useState<boolean>(false);

  const handleUpdateSchedules = (newSchedules: EmployeeSchedule[]) => {
    setSchedules(newSchedules);
    try { localStorage.setItem("employee_schedules", JSON.stringify(newSchedules)); } catch {}
    if (dbAvailable) saveSchedulesToDB(newSchedules).catch(() => {});
  };

  // Schedule comparison handler
  const handleCompareSchedule = () => {
    if (!result || schedules.length === 0) return;
    const violations = compareScheduleToFingerprint(schedules, result, shiftDefs);
    setScheduleViolations(violations);
    setShowScheduleComparison(true);
  };

  // Load history on mount + check DB status
  useEffect(() => {
    // Load from localStorage first (fast)
    try {
      const stored = localStorage.getItem("timesheet_reports_history");
      if (stored) setHistory(JSON.parse(stored));
    } catch {}

    // Then try to load from DB and sync
    (async () => {
      const dbOk = await checkDBStatus();
      setDbAvailable(dbOk);
      if (dbOk) {
        try {
          const dbReports = await fetchReports();
          if (dbReports.length > 0) {
            setHistory(dbReports);
            localStorage.setItem("timesheet_reports_history", JSON.stringify(dbReports));
          }
          const dbOvertime = await fetchOvertimeFromDB();
          if (dbOvertime.length > 0) {
            setOvertimeEntries(dbOvertime);
            localStorage.setItem("overtime_entries", JSON.stringify(dbOvertime));
          }
          const dbSchedules = await fetchSchedulesFromDB();
          if (dbSchedules.length > 0) {
            setSchedules(dbSchedules);
            localStorage.setItem("employee_schedules", JSON.stringify(dbSchedules));
          }
        } catch (e) {
          console.error("[DB] Failed to load data:", e);
        }
      }
    })();
  }, []);

  // Save history helper (localStorage)
  const saveToHistory = (newResult: TimesheetAnalysisResult) => {
    try {
      const newReport: SavedReport = {
        id: "report_" + Date.now(),
        savedAt: new Date().toLocaleString("ar-EG", {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit"
        }),
        officialStartTime,
        officialEndTime,
        result: newResult
      };
      
      const updated = [newReport, ...history];
      setHistory(updated);
      localStorage.setItem("timesheet_reports_history", JSON.stringify(updated));
      if (dbAvailable) saveReportToDB(newReport).catch(() => {});
    } catch (e) {
      console.error("Error saving to history:", e);
    }
  };

  // Delete history item
  const deleteHistoryItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const updated = history.filter(item => item.id !== id);
      setHistory(updated);
      localStorage.setItem("timesheet_reports_history", JSON.stringify(updated));
      if (dbAvailable) deleteReportFromDB(id).catch(() => {});
    } catch (e) {
      console.error("Error deleting history item:", e);
    }
  };

  // Clear all history
  const clearAllHistory = () => {
    if (window.confirm(t("confirmDeleteHistory"))) {
      setHistory([]);
      localStorage.removeItem("timesheet_reports_history");
      if (dbAvailable) clearAllReportsFromDB().catch(() => {});
    }
  };

  // Export to PDF
  const handleExportPDF = async () => {
    if (!result) return;
    await exportToPDF(result, officialStartTime, officialEndTime, lang);
  };

  // Drag and Drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const processFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("الرجاء اختيار ملف صورة صالح (PNG, JPEG, JPG).");
      return;
    }

    try {
      setError(null);
      setResult(null);
      const compressedDataUrl = await compressImage(file);
      setImage(compressedDataUrl);
      setImagePreview(compressedDataUrl);

      const originalKB = Math.round(file.size / 1024);
      const compressedBytes = Math.round((compressedDataUrl.length * 3) / 4);
      const compressedKB = Math.round(compressedBytes / 1024);
      if (compressedKB < originalKB) {
        console.log(`[Compression] ${originalKB}KB → ${compressedKB}KB (${Math.round((1 - compressedKB / originalKB) * 100)}% reduction)`);
      }
    } catch (err: any) {
      setError("حدث خطأ أثناء ضغط الصورة: " + (err.message || "خطأ غير معروف"));
    }
  };

  const processMultipleFiles = async (files: FileList | File[]) => {
    const validFiles = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (validFiles.length === 0) {
      setError("الرجاء اختيار ملفات صور صالحة (PNG, JPEG, JPG).");
      return;
    }
    setError(null);
    setResult(null);
    setMultiResults([]);

    const compressed: string[] = [];
    for (const file of validFiles) {
      try {
        const dataUrl = await compressImage(file);
        compressed.push(dataUrl);
      } catch {}
    }
    if (compressed.length > 0) {
      setMultiImages(compressed);
      setImage(compressed[0]);
      setImagePreview(compressed[0]);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      if (e.dataTransfer.files.length > 1) {
        processMultipleFiles(e.dataTransfer.files);
      } else {
        processFile(e.dataTransfer.files[0]);
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      if (e.target.files.length > 1) {
        processMultipleFiles(e.target.files);
      } else {
        processFile(e.target.files[0]);
      }
    }
  };

  // Reset current selection
  const handleReset = () => {
    setImage(null);
    setImagePreview(null);
    setMultiImages([]);
    setMultiResults([]);
    setResult(null);
    setError(null);
  };

  // Analyze request handler with streaming progress
  const handleAnalyze = async () => {
    const imagesToAnalyze = multiImages.length > 0 ? multiImages : (image ? [image] : []);
    if (imagesToAnalyze.length === 0) {
      setError("يرجى رفع لقطة شاشة لكشف الدوام أولاً.");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setMultiResults([]);
    setProgressMessage("جاري الاتصال بالخادم...");

    try {
      const allResults: TimesheetAnalysisResult[] = [];

      for (let i = 0; i < imagesToAnalyze.length; i++) {
        if (imagesToAnalyze.length > 1) {
          setProgressMessage(`جاري تحليل الصورة ${i + 1} من ${imagesToAnalyze.length}...`);
        }

        const response = await fetch("/api/analyze/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: imagesToAnalyze[i], officialStartTime, officialEndTime })
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => null);
          throw new Error(errData?.error || `خطأ في الخادم (${response.status}) للصورة ${i + 1}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("فشل في الاتصال بالخادم للتدفق المباشر.");

        const decoder = new TextDecoder();
        let buffer = "";
        let imageResult: TimesheetAnalysisResult | null = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          let eventType = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) {
              eventType = line.slice(7).trim();
            } else if (line.startsWith("data: ")) {
              const jsonStr = line.slice(6);
              try {
                const data = JSON.parse(jsonStr);
                if (eventType === "progress") {
                  setProgressMessage(data.message || "جاري المعالجة...");
                } else if (eventType === "complete") {
                  imageResult = data;
                  allResults.push(data);
                  saveToHistory(data);
                } else if (eventType === "error") {
                  throw new Error(data.message || "خطأ غير معروف من الخادم.");
                }
              } catch (parseErr: any) {
                if (parseErr.message.includes("خطأ") || parseErr.message.includes("حدث خطأ")) {
                  throw parseErr;
                }
              }
            }
          }
        }
      }

      if (allResults.length === 1) {
        setResult(allResults[0]);
      } else if (allResults.length > 1) {
        setMultiResults(allResults);
        const merged = mergeResults(allResults);
        setResult(merged);
      }
      setProgressMessage(null);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "حدث خطأ غير متوقع أثناء الاتصال بالخادم.");
    } finally {
      setLoading(false);
      setProgressMessage(null);
    }
  };

  // Merge multiple analysis results into one combined result
  const mergeResults = (results: TimesheetAnalysisResult[]): TimesheetAnalysisResult => {
    const first = results[0];
    const allAttendance: any[] = [];
    const allPermissions: any[] = [];
    const allLeaves: any[] = [];
    const names = new Set<string>();
    let totalDelay = 0;
    let totalEarlyOut = 0;
    let totalAbsences = 0;
    let totalLeavesUsed = 0;
    let totalWorkingDays = 0;

    for (const r of results) {
      if (r.extracted_data?.attendance_records) {
        allAttendance.push(...r.extracted_data.attendance_records);
      }
      if (r.extracted_data?.permissions) {
        allPermissions.push(...r.extracted_data.permissions);
      }
      if (r.extracted_data?.leaves) {
        allLeaves.push(...r.extracted_data.leaves);
      }
      names.add(r.employee_info?.name || "غير معروف");
      totalDelay += r.kpis?.totalDelayMinutes || 0;
      totalEarlyOut += r.kpis?.totalEarlyOutMinutes || 0;
      totalAbsences += r.kpis?.totalAbsences || 0;
      totalLeavesUsed += r.kpis?.totalLeavesUsed || 0;
      totalWorkingDays += r.kpis?.totalWorkingDays || 0;
    }

    return {
      employee_info: {
        id: first.employee_info?.id || "MULTI",
        name: Array.from(names).join(" + "),
        role: first.employee_info?.role || "员工",
      },
      kpis: {
        totalDelayMinutes: totalDelay,
        totalEarlyOutMinutes: totalEarlyOut,
        totalAbsences,
        totalLeavesUsed,
        totalWorkingDays,
      },
      daily_report: results.flatMap((r) => r.daily_report || []),
      extracted_data: {
        employee_info: first.extracted_data?.employee_info || first.employee_info,
        attendance_records: allAttendance,
        permissions: allPermissions,
        leaves: allLeaves,
      },
    };
  };

  // Helper to get status item styling classes in Tailwind
  const getStatusBadgeClass = (style: string) => {
    switch (style) {
      case "success":
        return "bg-emerald-50 text-emerald-700 border-emerald-200/60 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/30";
      case "danger":
        return "bg-rose-50 text-rose-700 border-rose-200/60 dark:bg-rose-950/20 dark:text-rose-400 dark:border-rose-900/30 animate-pulse-subtle";
      case "warning":
        return "bg-amber-50 text-amber-700 border-amber-200/60 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900/30";
      case "secondary":
      default:
        return "bg-slate-50 text-slate-600 border-slate-200/60 dark:bg-slate-800/30 dark:text-slate-400 dark:border-slate-700/40";
    }
  };

  // Recalculate KPIs and row fields on client side for dynamic updates
  const recalculateRowAndKPIs = (updatedReports: any[]) => {
    if (!result) return;

    const officialStartSec = parseTimeToSeconds(officialStartTime) || 28800; // 08:00:00
    const officialEndSec = parseTimeToSeconds(officialEndTime) || 61200; // 17:00:00

    let totalDelayMinutes = 0;
    let totalEarlyOutMinutes = 0;
    let totalAbsences = 0;
    let totalLeavesUsed = 0;
    let totalWorkingDays = 0;
    let perfectComplianceDays = 0;
    let totalWorkHours = 0;
    let totalDuplicateFingerprintDays = 0;
    const duplicateFingerprintsSummary: DuplicateFingerprintItem[] = [];

    const processedReports = updatedReports.map((row) => {
      if (row.isWeekend) {
        return {
          ...row,
          workHours: 0,
          delayMinutes: 0,
          earlyOutMinutes: 0,
          status: "عطلة نهاية الأسبوع",
          statusStyle: "secondary",
          note: ""
        };
      }

      totalWorkingDays++;

      let statusText = "منتظم";
      let statusStyle = "success";
      let delayMinutes = 0;
      let earlyOutMinutes = 0;
      let note = "";
      let workHours = 0;

      const checkInTime = row.checkIn;
      const checkOutTime = row.checkOut;

      // Calculate work hours
      if (checkInTime && checkOutTime) {
        const inSec = parseTimeToSeconds(checkInTime);
        const outSec = parseTimeToSeconds(checkOutTime);
        if (inSec !== null && outSec !== null && outSec > inSec) {
          workHours = Number(((outSec - inSec) / 3600).toFixed(2));
        }
      }

      if (row.hasLeave) {
        statusText = `إجازة رسمية (${row.leaveType || "سنوية"})`;
        statusStyle = "warning";
        note = `مغطى بإجازة: ${row.leaveType || "سنوية"}`;
        totalLeavesUsed++;
      } else if (!checkInTime && !checkOutTime) {
        statusText = "غياب بدون عذر";
        statusStyle = "danger";
        note = "لم يتم رصد أي حركات حضور أو خروج";
        totalAbsences++;
      } else {
        let hasViolation = false;

        // Check In
        if (checkInTime) {
          const checkInSec = parseTimeToSeconds(checkInTime);
          if (checkInSec !== null && checkInSec > officialStartSec) {
            if (row.hasPermission) {
              statusText = "تأخير معذور بمغادرة";
              statusStyle = "warning";
              note += `مغادرة رسمية معتمدة. `;
            } else {
              delayMinutes = Math.ceil((checkInSec - officialStartSec) / 60);
              totalDelayMinutes += delayMinutes;
              statusText = `تأخير ${delayMinutes} دقيقة`;
              statusStyle = "danger";
              hasViolation = true;
              note += "تأخير غير معذور. ";
            }
          }
        } else {
          hasViolation = true;
          statusText = "بدون دخول";
          statusStyle = "danger";
          note += "لم يتم رصد حركة دخول. ";
        }

        // Check Out
        if (checkOutTime) {
          const checkOutSec = parseTimeToSeconds(checkOutTime);
          if (checkOutSec !== null && checkOutSec < officialEndSec) {
            earlyOutMinutes = Math.ceil((officialEndSec - checkOutSec) / 60);
            totalEarlyOutMinutes += earlyOutMinutes;
            if (statusText === "منتظم" || statusText === "حضور منتظم") {
              statusText = `خروج مبكر ${earlyOutMinutes} دقيقة`;
              statusStyle = "danger";
            } else {
              statusText += ` و خروج مبكر ${earlyOutMinutes} د`;
            }
            hasViolation = true;
            note += "خروج مبكر غير معذور. ";
          }
        } else {
          hasViolation = true;
          if (statusText === "منتظم" || statusText === "حضور منتظم") {
            statusText = "بدون خروج";
            statusStyle = "danger";
          } else {
            statusText += " وبدون خروج";
          }
          note += "لم يتم رصد حركة خروج. ";
        }

        if (!hasViolation) {
          statusText = "حضور منتظم";
          statusStyle = "success";
          note = "في الوقت المحدد";
          perfectComplianceDays++;
        }
      }

      totalWorkHours += workHours;

      // Detect duplicate fingerprints
      const checkInCnt = row.checkInCount || 0;
      const checkOutCnt = row.checkOutCount || 0;
      if (!row.isWeekend && (checkInCnt > 1 || checkOutCnt > 1)) {
        totalDuplicateFingerprintDays++;
        const details: string[] = [];
        if (checkInCnt > 1) details.push(`دخول ${checkInCnt} مرات`);
        if (checkOutCnt > 1) details.push(`خروج ${checkOutCnt} مرات`);
        duplicateFingerprintsSummary.push({
          date: row.date,
          dayName: row.dayName,
          checkInCount: checkInCnt,
          checkOutCount: checkOutCnt,
          details: details.join(" و ")
        });
      }

      return {
        ...row,
        workHours,
        delayMinutes,
        earlyOutMinutes,
        status: statusText,
        statusStyle,
        note: note.trim()
      };
    });

    const correctAttendancePercentage = totalWorkingDays > 0 
      ? Math.round((perfectComplianceDays / totalWorkingDays) * 100) 
      : 100;

    const newResult = {
      ...result,
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
      duplicateFingerprintsSummary,
      daily_report: processedReports
    };

    setResult(newResult);
  };

  const handleStartEdit = (index: number, row: any) => {
    setEditingIndex(index);
    setEditCheckIn(row.checkIn || "");
    setEditCheckOut(row.checkOut || "");
    setEditHasLeave(!!row.hasLeave);
    setEditLeaveType(row.leaveType || "");
    setEditHasPermission(!!row.hasPermission);
  };

  const handleCancelEdit = () => {
    setEditingIndex(null);
  };

  const handleSaveEdit = (index: number) => {
    if (!result) return;
    
    const updatedReports = [...result.daily_report];
    
    const normalizeTimeInput = (input: string): string | null => {
      const trimmed = input.trim();
      if (!trimmed || trimmed === "-" || trimmed === "null") return null;
      const matches = trimmed.match(/^([0-1]?[0-9]|2[0-3]):([0-5][0-9])(:([0-5][0-9]))?$/);
      if (matches) {
        const h = matches[1].padStart(2, "0");
        const m = matches[2];
        const s = matches[4] ? matches[4] : "00";
        return `${h}:${m}:${s}`;
      }
      return trimmed;
    };

    const inTime = normalizeTimeInput(editCheckIn);
    const outTime = normalizeTimeInput(editCheckOut);

    updatedReports[index] = {
      ...updatedReports[index],
      checkIn: inTime,
      checkOut: outTime,
      hasLeave: editHasLeave,
      leaveType: editHasLeave ? editLeaveType || "سنوية" : null,
      hasPermission: editHasPermission,
      permissionDetails: editHasPermission ? "مغادرة معتمدة" : ""
    };

    recalculateRowAndKPIs(updatedReports);
    setEditingIndex(null);
  };

  // Print results page
  const handlePrint = () => {
    window.print();
  };

  // Export results to Excel (CSV format with Arabic BOM support)
  const handleExportExcel = () => {
    if (!result) return;
    
    // Create headers (Arabic)
    const headers = [
      "اليوم والتاريخ",
      "وقت الدخول",
      "وقت الخروج",
      "ساعات العمل الفعلية (ساعة)",
      "حالة الالتزام",
      "ملاحظات التحليل"
    ];

    // Map rows
    const rows = result.daily_report.map(row => [
      `${row.dayName} (${row.date})`,
      row.checkIn || "-",
      row.checkOut || "-",
      row.workHours !== undefined && row.workHours !== null ? `${row.workHours} ساعة` : "-",
      row.status,
      row.note || "-"
    ]);

    // Build CSV Content
    const csvRows = [
      headers.join(","),
      ...rows.map(r => r.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","))
    ];
    
    const csvContent = csvRows.join("\r\n");

    // Add UTF-8 BOM so Excel opens with proper Arabic characters
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `تقرير_حضور_وانصراف_${result.employee_info.name || "employee"}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filtered daily reports row list
  const filteredDailyReport = result?.daily_report.filter(row => {
    if (filter === "all") return true;
    if (filter === "violations") {
      return row.statusStyle === "danger" || row.delayMinutes > 0 || row.status.includes("غياب");
    }
    if (filter === "regular") {
      return row.statusStyle === "success" || row.status.includes("منتظم");
    }
    if (filter === "leaves") {
      return row.statusStyle === "warning" || row.status.includes("إجازة") || row.status.includes("مغادرة");
    }
    return true;
  }) || [];

  return (
    <div id="app-root" className="min-h-screen bg-[#f5f6f8] dark:bg-slate-950 text-slate-800 dark:text-slate-100 font-sans selection:bg-slate-200 selection:text-slate-900 transition-colors duration-200">
      
      {/* Skip to content link for keyboard users */}
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:bg-indigo-600 focus:text-white focus:px-4 focus:py-2 focus:rounded-xl focus:text-sm focus:font-bold">
        {t("skipToContent")}
      </a>

      {/* Header Bar */}
      <header id="app-header" className="sticky top-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200/60 dark:border-slate-800 shadow-sm print:hidden transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-slate-700 dark:bg-slate-600 rounded-xl text-white">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-extrabold tracking-tight text-slate-800 dark:text-white">
                محلل كشوفات الدوام
              </h1>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">
                تحليل ذكي للحضور والانصراف باللغة العربية
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {/* User Role Badge + Logout */}
            {isAdmin ? (
              <div className="hidden sm:flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold border bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-900/60">
                  <User className="h-3 w-3" />
                  {authName} — مدير
                </span>
                <button
                  onClick={handleLogout}
                  className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-all"
                  title="تسجيل الخروج"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowAdminLogin(true)}
                className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-[10px] font-bold rounded-lg border border-slate-200 dark:border-slate-700 transition-all"
              >
                <Shield className="h-3 w-3" />
                {t("adminLogin")}
              </button>
            )}

            {/* DB Status Indicator */}
            <div
              className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold border ${
                dbAvailable
                  ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/60"
                  : "bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700"
              }`}
            >
              {dbAvailable ? "MongoDB" : "Local"}
            </div>

            {/* View Mode Navigation */}
            <div className="hidden sm:flex items-center gap-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
              <button onClick={() => setViewMode("main")} className={`px-3 py-1.5 rounded-md text-[11px] font-bold transition-all ${viewMode === "main" ? "bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"}`} title={t("appTitle")}>
                <FileText className="h-3.5 w-3.5 inline ml-1" />
                {t("tabReport")}
              </button>
              <button onClick={() => setViewMode("schedule")} className={`px-3 py-1.5 rounded-md text-[11px] font-bold transition-all ${viewMode === "schedule" ? "bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"}`} title={t("tabSchedule")}>
                <Calendar className="h-3.5 w-3.5 inline ml-1" />
                {t("tabSchedule")}
              </button>
              <button onClick={() => setViewMode("overtime")} className={`px-3 py-1.5 rounded-md text-[11px] font-bold transition-all ${viewMode === "overtime" ? "bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"}`} title={t("tabOvertime")}>
                <Clock className="h-3.5 w-3.5 inline ml-1" />
                {t("tabOvertime")}
              </button>
            </div>

            {/* Language Toggle */}
            <button
              onClick={() => setLang(lang === "ar" ? "en" : "ar")}
              className="p-2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all"
              title={t("switchLang")}
            >
              <Globe className="h-4 w-4" />
            </button>

            {/* Dark Mode Toggle */}
            <button
              onClick={toggleTheme}
              className="p-2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all"
              title={dark ? t("lightMode") : t("darkMode")}
            >
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            <a 
              href="#instructions" 
              className="p-2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all"
              title={t("guideTitle")}
            >
              <HelpCircle className="h-4 w-4" />
            </a>
          </div>

        </div>
      </header>

      {/* Main Content Area */}
      <main id="main-content" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6" tabIndex={-1}>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Overtime View */}
          {viewMode === "overtime" && (
            <div className="lg:col-span-12">
              <Suspense fallback={<div className="flex items-center justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>}>
                <OvertimeTracker entries={overtimeEntries} onUpdate={handleUpdateOvertime} isAdmin={isAdmin} />
              </Suspense>
            </div>
          )}

          {/* Schedule View */}
          {viewMode === "schedule" && (
            <div className="lg:col-span-12">
              <Suspense fallback={<div className="flex items-center justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>}>
                <ScheduleManager schedules={schedules} onUpdate={handleUpdateSchedules} />
              </Suspense>
            </div>
          )}

          {/* Main View */}
          {viewMode === "main" && (
          <>
          <div className="lg:col-span-4 space-y-6 print:hidden">
            
            {/* Saved Reports Sidebar */}
            <div id="history-panel" className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-lg p-5 transition-colors">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-4">
                <div className="flex items-center gap-2 text-slate-700 dark:text-white font-bold text-sm">
                  <History className="h-4 w-4 text-slate-400" />
                  <span>{t("savedReports")} ({history.length})</span>
                </div>
                {history.length > 0 && (
                  <button 
                    onClick={clearAllHistory}
                    className="text-xs text-rose-600 dark:text-rose-400 hover:text-rose-700 font-medium hover:underline flex items-center gap-1"
                  >
                    <Trash2 className="h-3 w-3" />
                    {t("clearAll")}
                  </button>
                )}
              </div>

              {history.length === 0 ? (
                <div className="py-8 text-center text-slate-400 dark:text-slate-500">
                  <History className="h-8 w-8 mx-auto mb-2 opacity-40 text-slate-300 dark:text-slate-600" />
                  <p className="text-xs">{t("noReports")}</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                  {history.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => {
                        setResult(item.result);
                        setOfficialStartTime(item.officialStartTime);
                        setOfficialEndTime(item.officialEndTime || "17:00:00");
                        setImagePreview("HISTORY");
                      }}
                      className="group flex items-start justify-between p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 hover:bg-slate-100/50 dark:hover:bg-slate-800/50 hover:border-slate-200 dark:hover:border-slate-700 cursor-pointer transition-all text-right"
                    >
                      <div className="space-y-1">
                        <p className="text-sm font-bold text-slate-700 dark:text-slate-200 group-hover:text-slate-900 dark:group-hover:text-white">
                          {item.result.employee_info.name}
                        </p>
                        <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                          <span>{t("numberLabel")} {item.result.employee_info.id}</span>
                          <span>•</span>
                          <span>{item.savedAt}</span>
                        </div>
                        <div className="flex gap-2 mt-1">
                          <span className="text-[10px] bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border border-amber-100 dark:border-amber-900 px-1.5 py-0.5 rounded">
                            {t("delayBadge")} {item.result.kpis.totalDelayMinutes} {t("minuteShort")}
                          </span>
                          <span className="text-[10px] bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 border border-rose-100 dark:border-rose-900 px-1.5 py-0.5 rounded">
                            {t("absenceBadge")} {item.result.kpis.totalAbsences}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={(e) => deleteHistoryItem(item.id, e)}
                        className="p-1 text-slate-400 dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-all opacity-0 group-hover:opacity-100"
                        title={t("deleteReport")}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Main Upload Box */}
            <div id="upload-card" className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden transition-colors">
              <div className="p-5 border-b border-slate-100 dark:border-slate-800">
                <h2 className="font-bold text-slate-800 dark:text-white flex items-center gap-2 text-sm">
                  <Upload className="h-4 w-4 text-slate-400" />
                  <span>{t("uploadTitle")}</span>
                </h2>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                  {t("uploadMultiDesc")}
                </p>
              </div>

              <div className="p-5 space-y-4">
                
                {/* Drag-n-Drop Container */}
                <div
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  role="region"
                  aria-label="منطقة رفع الصور"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); document.getElementById('file-input-main')?.click(); } }}
                  className={`border border-dashed rounded-xl p-6 text-center transition-all focus:outline-none focus:ring-2 focus:ring-slate-300/50 ${
                    imagePreview && imagePreview !== "DEMO_MODE"
                      ? "border-slate-300 dark:border-slate-700 bg-slate-50/30 dark:bg-slate-800/20"
                      : "border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-slate-50/40 dark:bg-slate-800/5"
                  }`}
                >
                  {imagePreview && imagePreview !== "DEMO_MODE" ? (
                    <div className="space-y-3">
                      {/* Multi-image thumbnails */}
                      {multiImages.length > 1 && (
                        <div className="flex items-center justify-center gap-2 mb-2">
                          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500">{multiImages.length} {t("images")}</span>
                          {multiImages.map((img, idx) => (
                            <button
                              key={idx}
                              onClick={() => { setImage(img); setImagePreview(img); }}
                              className={`w-10 h-10 rounded-lg border-2 overflow-hidden transition-all ${
                                imagePreview === img
                                  ? "border-slate-700 dark:border-slate-300 shadow-sm"
                                  : "border-slate-200 dark:border-slate-700 opacity-50 hover:opacity-100"
                              }`}
                            >
                              <img src={img} alt={`${t("singleImage")} ${idx + 1}`} className="w-full h-full object-cover" />
                            </button>
                          ))}
                        </div>
                      )}
                      <img 
                        src={imagePreview} 
                        alt={t("uploadedTimesheet")} 
                        className="max-h-48 mx-auto rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 object-contain" 
                      />
                      <div className="flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={handleReset}
                          className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-semibold rounded-lg border border-rose-200/60 transition-all"
                        >
                          {t("remove")}
                        </button>
                        <label className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-semibold rounded-lg border border-slate-200 transition-all cursor-pointer">
                          {t("changeImage")}
                          <input 
                            id="file-input-change"
                            type="file" 
                            accept="image/*" 
                            multiple
                            className="hidden" 
                            onChange={handleFileChange} 
                          />
                        </label>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3 py-4">
                      <div className="mx-auto w-11 h-11 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400">
                        <Upload className="h-5 w-5" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-bold text-slate-600 dark:text-slate-300">
                          {t("dragDrop")}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          {t("dragDropMultiHint")}
                        </p>
                      </div>
                      <div>
                        <label className="inline-flex items-center justify-center px-4 py-2 bg-slate-700 hover:bg-slate-800 dark:bg-slate-600 dark:hover:bg-slate-500 text-white text-xs font-bold rounded-lg transition-all cursor-pointer">
                          {t("chooseFile")}
                          <input 
                            id="file-input-main"
                            type="file" 
                            accept="image/*" 
                            multiple
                            className="hidden" 
                            onChange={handleFileChange} 
                          />
                        </label>
                      </div>
                    </div>
                  )}
                </div>

                {/* Configuration Options */}
                <div className="bg-slate-50/70 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-800/80 space-y-3">
                  <h3 className="text-xs font-bold text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    <span>{t("officialWorkHours")}</span>
                  </h3>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-400 dark:text-slate-500 mb-1">
                        {t("startLabel")}
                      </label>
                      <div className="relative">
                        <select 
                          value={officialStartTime}
                          onChange={(e) => setOfficialStartTime(e.target.value)}
                          aria-label="بداية الدوام الرسمي"
                          className="w-full text-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg px-2 py-1.5 text-sm font-medium focus:ring-2 focus:ring-slate-300/50 focus:border-slate-400 outline-none transition-all cursor-pointer"
                        >
                          {[...TIME_OPTIONS, ...(officialStartTime && !TIME_OPTIONS.includes(officialStartTime) ? [officialStartTime] : [])].sort().map((opt) => (
                            <option key={opt} value={opt} className="bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100">
                              {opt.substring(0, 5)}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-slate-400 dark:text-slate-500 mb-1">
                        {t("endLabel")}
                      </label>
                      <div className="relative">
                        <select 
                          value={officialEndTime}
                          onChange={(e) => setOfficialEndTime(e.target.value)}
                          aria-label="نهاية الدوام الرسمي"
                          className="w-full text-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg px-2 py-1.5 text-sm font-medium focus:ring-2 focus:ring-slate-300/50 focus:border-slate-400 outline-none transition-all cursor-pointer"
                        >
                          {[...TIME_OPTIONS, ...(officialEndTime && !TIME_OPTIONS.includes(officialEndTime) ? [officialEndTime] : [])].sort().map((opt) => (
                            <option key={opt} value={opt} className="bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100">
                              {opt.substring(0, 5)}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 text-center">اختر الأوقات الرسمية للتحليل (بفواصل نصف ساعة)</p>
                </div>

                {/* Submit Action Button */}
                <button
                  type="button"
                  onClick={handleAnalyze}
                  disabled={loading || !image || !isAdmin}
                  aria-label="تحليل لقطة الشاشة"
                  aria-busy={loading}
                  className={`w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-sm transition-all ${
                    loading 
                      ? "bg-slate-100 text-slate-400 cursor-not-allowed" 
                      : !image 
                        ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                        : !isAdmin
                        ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                        : "bg-slate-700 hover:bg-slate-800 dark:bg-slate-600 dark:hover:bg-slate-500 text-white active:scale-[0.98]"
                  }`}
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                      <span>{progressMessage || "جاري المعالجة وقراءة الكشف..."}</span>
                    </>
                  ) : !isAdmin ? (
                    <>
                      <Eye className="h-4 w-4" />
                      <span>{t("viewerCantAnalyze")}</span>
                    </>
                  ) : multiImages.length > 1 ? (
                    <>
                      <TrendingUp className="h-4 w-4" />
                      <span>{t("analyzeImageCount", { count: multiImages.length })}</span>
                    </>
                  ) : (
                    <>
                      <TrendingUp className="h-4 w-4" />
                      <span>حلل لقطة الشاشة الآن</span>
                    </>
                  )}
                </button>

                {error && (
                  <div className="p-3 bg-rose-50 dark:bg-rose-950/20 border border-rose-200/60 dark:border-rose-900/40 text-rose-700 dark:text-rose-400 text-xs rounded-xl flex items-start gap-2 animate-fade-in-up">
                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-rose-500" />
                    <span className="leading-relaxed">{error}</span>
                  </div>
                )}

              </div>
            </div>

          </div>

          {/* Left Column: Dashboard Results Area */}
          <div className="lg:col-span-8 space-y-6">
            
            {/* Empty State */}
            {!result && !loading && (
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-sm p-12 text-center space-y-4 transition-colors">
                <div className="mx-auto w-14 h-14 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400">
                  <FileText className="h-7 w-7" />
                </div>
                <div className="max-w-md mx-auto space-y-2">
                  <h3 className="text-base font-bold text-slate-700 dark:text-white">{t("emptyState")}</h3>
                  <p className="text-[13px] text-slate-400 dark:text-slate-500 leading-relaxed">
                    {t("emptyStateDesc")}
                  </p>
                </div>
              </div>
            )}

            {/* Loading Skeleton */}
            {loading && (
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-sm p-8 space-y-6 animate-pulse transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                    <Loader2 className="h-5 w-5 text-slate-400 animate-spin" />
                  </div>
                  <div className="space-y-2 flex-1">
                    <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-1/4"></div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-bold animate-pulse">{progressMessage || "جاري المعالجة..."}</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="h-24 bg-slate-200 dark:bg-slate-800 rounded-xl"></div>
                  <div className="h-24 bg-slate-200 dark:bg-slate-800 rounded-xl"></div>
                  <div className="h-24 bg-slate-200 dark:bg-slate-800 rounded-xl"></div>
                </div>
                <div className="space-y-3">
                  <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-1/3"></div>
                  <div className="h-10 bg-slate-200 dark:bg-slate-800 rounded"></div>
                  <div className="h-10 bg-slate-200 dark:bg-slate-800 rounded"></div>
                  <div className="h-10 bg-slate-200 dark:bg-slate-800 rounded"></div>
                </div>
              </div>
            )}

            {/* Results Content */}
            {result && !loading && (
              <div id="print-area" className="space-y-6">
                
                {/* Employee Header Info */}
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden transition-colors">
                  
                  <div className="p-6">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-5 border-b border-slate-100">
                      
                      <div className="flex items-center gap-3.5">
                        <div className="p-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-xl">
                          <User className="h-5 w-5" />
                        </div>
                        <div>
                          <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 tracking-wider uppercase">{t("employeeInfo")}</span>
                          <h2 className="text-lg font-black text-slate-800 dark:text-white mt-0.5">
                            {result.employee_info.name}
                          </h2>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 print:hidden">
                        <button
                          onClick={handlePrint}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-semibold rounded-lg border border-slate-200 transition-all"
                        >
                          <Printer className="h-3.5 w-3.5" />
                          <span>{t("print")}</span>
                        </button>

                        <button
                          onClick={handleExportPDF}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg transition-all"
                        >
                          <FileDown className="h-3.5 w-3.5" />
                          <span>PDF</span>
                        </button>

                        <button
                          onClick={handleExportExcel}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg transition-all"
                        >
                          <Download className="h-3.5 w-3.5" />
                          <span>Excel</span>
                        </button>
                        
                        <button
                          onClick={() => setShowRawJson(!showRawJson)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-semibold rounded-lg border border-slate-200 transition-all"
                        >
                          {showRawJson ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          <span>{showRawJson ? t("hideJson") : t("showJson")}</span>
                        </button>
                      </div>

                    </div>

                    {/* Metadata Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-5">
                      
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-slate-100 dark:bg-slate-800 text-slate-400 rounded-lg">
                          <Hash className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500">{t("employeeId")}</p>
                          <p className="text-sm font-extrabold text-slate-700 dark:text-slate-200 mt-0.5">
                            {result.employee_info.id || t("notAvailable")}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-slate-100 dark:bg-slate-800 text-slate-400 rounded-lg">
                          <Briefcase className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500">{t("jobTitle")}</p>
                          <p className="text-sm font-extrabold text-slate-700 dark:text-slate-200 mt-0.5">
                            {result.employee_info.role || t("notAvailable")}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-slate-100 dark:bg-slate-800 text-slate-400 rounded-lg">
                          <Clock className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500">{t("workPeriod")}</p>
                          <p className="text-sm font-extrabold text-slate-700 dark:text-slate-200 mt-0.5">
                            {officialStartTime} — {officialEndTime}
                          </p>
                        </div>
                      </div>

                    </div>

                  </div>
                </div>

                {/* KPIs Dashboard */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" role="region" aria-label="مؤشرات الأداء الرئيسية">
                  
                  {/* KPI 1: Correct Attendance */}
                  <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-sm transition-colors">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500">{t("attendanceRate")}</span>
                        <div className="flex items-baseline gap-1 pt-1">
                          <span className="text-3xl font-black text-slate-700 dark:text-white">
                            {result.kpis.correctAttendancePercentage ?? 100}%
                          </span>
                        </div>
                      </div>
                      <div className="p-2.5 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-xl">
                        <TrendingUp className="h-5 w-5" />
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-1.5 text-[10px] text-slate-400 dark:text-slate-500">
                      <span>{t("attendanceRateDesc")}</span>
                    </div>
                  </div>

                  {/* KPI 2: Total Delay */}
                  <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-sm transition-colors">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500">{t("delayEarlyOut")}</span>
                        <div className="flex items-baseline gap-1 pt-1">
                          <span className="text-2xl font-black text-amber-600 dark:text-amber-400">
                            {result.kpis.totalDelayMinutes}
                          </span>
                              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500">د تأخير</span>
                          {result.kpis.totalEarlyOutMinutes ? (
                            <>
                              <span className="text-[10px] text-slate-300 dark:text-slate-600 mx-0.5">/</span>
                              <span className="text-lg font-bold text-slate-500 dark:text-slate-400">
                                {result.kpis.totalEarlyOutMinutes}
                              </span>
                              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500">د خروج</span>
                            </>
                          ) : null}
                        </div>
                      </div>
                      <div className="p-2.5 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-xl">
                        <Clock className="h-5 w-5" />
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-1.5 text-[10px] text-slate-400 dark:text-slate-500">
                      <span>{t("delayEarlyOutDesc")}</span>
                    </div>
                  </div>

                  {/* KPI 3: Absences */}
                  <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-sm transition-colors">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500">{t("absences")}</span>
                        <div className="flex items-baseline gap-1 pt-1">
                          <span className="text-2xl font-black text-rose-600 dark:text-rose-400">
                            {result.kpis.totalAbsences}
                          </span>
                          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500">{t("days")}</span>
                        </div>
                      </div>
                      <div className="p-2.5 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-xl">
                        <AlertTriangle className="h-5 w-5" />
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-1.5 text-[10px] text-slate-400 dark:text-slate-500">
                      <span>{t("absencesDesc")}</span>
                    </div>
                  </div>

                  {/* KPI 4: Leaves */}
                  <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-sm transition-colors">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500">{t("leavesUsed")}</span>
                        <div className="flex items-baseline gap-1 pt-1">
                          <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                            {result.kpis.totalLeavesUsed}
                          </span>
                          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500">{t("days")}</span>
                        </div>
                      </div>
                      <div className="p-2.5 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-xl">
                        <Calendar className="h-5 w-5" />
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-1.5 text-[10px] text-slate-400 dark:text-slate-500">
                      <span>{t("leavesUsedDesc")}</span>
                    </div>
                  </div>

                  {/* KPI 5: Work Hours */}
                  <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-sm transition-colors">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500">{t("workHours")}</span>
                        <div className="flex items-baseline gap-1 pt-1">
                          <span className="text-2xl font-black text-slate-700 dark:text-white">
                            {result.kpis.totalWorkHours ?? 0}
                          </span>
                          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500">{t("hour")}</span>
                        </div>
                      </div>
                      <div className="p-2.5 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-xl">
                        <Clock className="h-5 w-5" />
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-1.5 text-[10px] text-slate-400 dark:text-slate-500">
                      <span>{t("workHoursDesc")}</span>
                    </div>
                  </div>

                  {/* KPI 6: Duplicate Fingerprints */}
                  <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-sm transition-colors">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500">{t("duplicateFp")}</span>
                        <div className="flex items-baseline gap-1 pt-1">
                          <span className="text-2xl font-black text-slate-700 dark:text-white">
                            {result.kpis.totalDuplicateFingerprintDays ?? 0}
                          </span>
                          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500">{t("days")}</span>
                        </div>
                      </div>
                      <div className="p-2.5 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-xl">
                        <Fingerprint className="h-5 w-5" />
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-1.5 text-[10px] text-slate-400 dark:text-slate-500">
                      <span>{t("duplicateFpDesc")}</span>
                    </div>
                  </div>

                </div>

                {/* Schedule Comparison Button + Violations */}
                {schedules.length > 0 && (
                  <div className="space-y-4">
                    {!showScheduleComparison && (
                      <button
                        onClick={handleCompareSchedule}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all"
                      >
                        <Calendar className="h-4 w-4" />
                        {t("compareScheduleBtn")}
                      </button>
                    )}

                    {showScheduleComparison && (
                      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-sm p-6 space-y-4 transition-colors">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                          <h3 className="font-bold text-slate-700 dark:text-white text-sm flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-slate-400" />
                            <span>{t("scheduleComparison")}</span>
                          </h3>
                          <button
                            onClick={() => setShowScheduleComparison(false)}
                            className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-all"
                          >
                            {t("hideJson")}
                          </button>
                        </div>
                        <p className="text-[11px] text-slate-400 dark:text-slate-500">
                          {t("scheduleComparisonDesc")}
                        </p>

                        {scheduleViolations.length === 0 ? (
                          <div className="py-6 text-center">
                            <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
                            <p className="text-xs font-bold text-slate-800 dark:text-slate-200">{t("noViolations")}</p>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30 px-2.5 py-1 rounded-lg border border-rose-100 dark:border-rose-900/60">
                                {t("violationsFound", { count: scheduleViolations.length })}
                              </span>
                            </div>
                            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                              {scheduleViolations.map((v, idx) => (
                                <div
                                  key={idx}
                                  className={`flex items-start justify-between p-3 rounded-lg border text-xs ${
                                    v.type === "absence"
                                      ? "border-rose-200 dark:border-rose-900/40 bg-rose-50/30 dark:bg-rose-950/10"
                                      : v.type === "late_arrival"
                                        ? "border-amber-200 dark:border-amber-900/40 bg-amber-50/30 dark:bg-amber-950/10"
                                        : v.type === "early_departure"
                                          ? "border-violet-200 dark:border-violet-900/40 bg-violet-50/30 dark:bg-violet-950/10"
                                          : v.type === "unscheduled"
                                            ? "border-orange-200 dark:border-orange-900/40 bg-orange-50/30 dark:bg-orange-950/10"
                                            : "border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20"
                                  }`}
                                >
                                  <div className="space-y-1">
                                    <div className="font-extrabold text-slate-800 dark:text-slate-200">
                                      {v.dayName} <span className="font-normal text-slate-400 dark:text-slate-500">({v.date})</span>
                                    </div>
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400">{v.details}</p>
                                    {v.expectedTime && v.actualTime && (
                                      <div className="flex items-center gap-2 text-[10px] text-slate-400 dark:text-slate-500">
                                        <span>{t("expectedTime", { time: v.expectedTime })}</span>
                                        <span>→</span>
                                        <span className="font-bold text-slate-600 dark:text-slate-300">{t("actualTime", { time: v.actualTime })}</span>
                                      </div>
                                    )}
                                  </div>
                                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded whitespace-nowrap ${
                                    v.type === "absence"
                                      ? "bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-400"
                                      : v.type === "late_arrival"
                                        ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400"
                                        : v.type === "early_departure"
                                          ? "bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-400"
                                          : v.type === "unscheduled"
                                            ? "bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-400"
                                            : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                                  }`}>
                                    {v.type === "absence" ? t("violationAbsence") : v.type === "late_arrival" ? t("violationLate") : v.type === "early_departure" ? t("violationEarly") : v.type === "unscheduled" ? t("violationUnscheduled") : t("violationNoCheckout")}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Attendance Breakdown Pie Chart */}
                {result && (
                  <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-sm p-6 space-y-4 print:break-inside-avoid transition-colors">
                    <h3 className="font-bold text-slate-700 dark:text-white text-sm flex items-center gap-2">
                      <PieChart className="h-4 w-4 text-slate-400" />
                      <span>{t("attendanceDistribution")}</span>
                    </h3>
                    <div className="h-56 w-full flex items-center justify-center">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={[
                              { name: "منتظم", value: result.kpis.perfectComplianceDays || 0, color: "#10b981" },
                              { name: "تأخير", value: result.lateDaysSummary?.length || 0, color: "#d97706" },
                              { name: "غياب", value: result.kpis.totalAbsences, color: "#ef4444" },
                              { name: "إجازة", value: result.kpis.totalLeavesUsed, color: "#6b7280" },
                            ].filter(d => d.value > 0)}
                            cx="50%"
                            cy="50%"
                            innerRadius={50}
                            outerRadius={80}
                            paddingAngle={3}
                            dataKey="value"
                          >
                            {[
                              { name: "منتظم", value: result.kpis.perfectComplianceDays || 0, color: "#10b981" },
                              { name: "تأخير", value: result.lateDaysSummary?.length || 0, color: "#d97706" },
                              { name: "غياب", value: result.kpis.totalAbsences, color: "#ef4444" },
                              { name: "إجازة", value: result.kpis.totalLeavesUsed, color: "#6b7280" },
                            ].filter(d => d.value > 0).map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "#1e293b",
                              border: "none",
                              borderRadius: "12px",
                              color: "#fff",
                              fontSize: "11px",
                            }}
                          />
                          <Legend
                            verticalAlign="bottom"
                            iconType="circle"
                            iconSize={8}
                            wrapperStyle={{ fontSize: "11px", fontWeight: "bold" }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {/* Late Days & Early Exit Summary Card */}
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-sm p-6 space-y-4 transition-colors">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                    <h3 className="font-bold text-slate-700 dark:text-white text-sm flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-slate-400" />
                      <span>{t("lateSummary")}</span>
                    </h3>
                  </div>

                  {(!result.lateDaysSummary || result.lateDaysSummary.length === 0) && (!result.kpis.totalEarlyOutMinutes) ? (
                    <div className="py-6 text-center text-slate-400">
                      <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
                      <p className="text-xs font-bold text-slate-800 dark:text-slate-200">{t("perfectRecord")}</p>
                      <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">{t("perfectRecordDesc")}</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Late Days List */}
                      <div>
                        <h4 className="text-xs font-bold text-slate-600 dark:text-slate-400 mb-2.5 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                          {t("lateDaysCount", { count: result.lateDaysSummary?.length || 0 })}
                        </h4>
                        {!result.lateDaysSummary || result.lateDaysSummary.length === 0 ? (
                          <p className="text-xs text-slate-400 dark:text-slate-500 italic bg-slate-50 dark:bg-slate-800/30 p-3 rounded-lg border border-slate-100 dark:border-slate-800">{t("noLate")}</p>
                        ) : (
                          <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                            {result.lateDaysSummary.map((item, idx) => (
                              <div key={idx} className="flex items-center justify-between p-2.5 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20 text-xs">
                                <div className="font-extrabold text-slate-800 dark:text-slate-200">
                                  {item.dayName} <span className="text-slate-400 dark:text-slate-500 font-normal">({item.date})</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="font-mono bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                                    {t("checkInLabel")} {item.time}
                                  </span>
                                  <span className="font-bold text-amber-600 dark:text-amber-400">
                                    +{item.delayMinutes} د
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Early Out Days List */}
                      <div>
                        <h4 className="text-xs font-bold text-slate-600 dark:text-slate-400 mb-2.5 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                          {t("earlyOutDays")}
                        </h4>
                        {!result.kpis.totalEarlyOutMinutes ? (
                          <p className="text-xs text-slate-400 dark:text-slate-500 italic bg-slate-50 dark:bg-slate-800/30 p-3 rounded-lg border border-slate-100 dark:border-slate-800">{t("noEarlyOut")}</p>
                        ) : (
                          <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                            {result.daily_report
                              .filter(day => (day.earlyOutMinutes || 0) > 0)
                              .map((day, idx) => (
                                <div key={idx} className="flex items-center justify-between p-2.5 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20 text-xs">
                                  <div className="font-extrabold text-slate-800 dark:text-slate-200">
                                    {day.dayName} <span className="text-slate-400 dark:text-slate-500 font-normal">({day.date})</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                                      {t("checkOutLabel")} {day.checkOut}
                                    </span>
                                    <span className="font-bold text-slate-500 dark:text-slate-400">
                                      -{day.earlyOutMinutes} د
                                    </span>
                                  </div>
                                </div>
                              ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Duplicate Fingerprints Alert Section */}
                {result.duplicateFingerprintsSummary && result.duplicateFingerprintsSummary.length > 0 && (
                  <div className="bg-white dark:bg-slate-900 rounded-xl border border-amber-200/60 dark:border-amber-900/30 shadow-sm p-6 space-y-4 transition-colors">
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                      <h3 className="font-bold text-slate-700 dark:text-white text-sm flex items-center gap-2">
                        <Fingerprint className="h-4 w-4 text-slate-400" />
                        <span>{t("duplicateFpDays", { count: result.duplicateFingerprintsSummary.length })}</span>
                      </h3>
                      <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 px-2 py-0.5 rounded">
                        {t("alertBadge")}
                      </span>
                    </div>
                      <p className="text-[11px] text-slate-400 dark:text-slate-500">
                        {t("duplicateFpDesc2")}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {result.duplicateFingerprintsSummary.map((item, idx) => (
                        <div key={idx} className="flex items-start gap-3 p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20">
                          <div className="p-1.5 bg-slate-100 dark:bg-slate-800 text-slate-400 rounded-lg mt-0.5">
                            <Fingerprint className="h-3.5 w-3.5" />
                          </div>
                          <div className="space-y-1">
                            <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
                              {item.dayName} <span className="font-normal text-slate-400 dark:text-slate-500">({item.date})</span>
                            </p>
                            <p className="text-[11px] text-slate-400 dark:text-slate-500">{item.details}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Recharts Daily Delay & Early Out Line Chart */}
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-sm p-6 space-y-4 print:break-inside-avoid transition-colors">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                    <div>
                      <h3 className="font-bold text-slate-700 dark:text-white text-sm flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-slate-400" />
                        <span>{t("chartTitle")}</span>
                      </h3>
                      <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">{t("chartDesc")}</p>
                    </div>
                  </div>

                  <div className="h-72 w-full pt-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={result.daily_report.map(day => ({
                          name: day.date.split('/')[0] || day.date,
                          "دقائق التأخير": day.delayMinutes || 0,
                          "دقائق الخروج المبكر": day.earlyOutMinutes || 0,
                          dayName: day.dayName,
                          fullDate: day.date
                        }))}
                        margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis 
                          dataKey="name" 
                          stroke="#94a3b8" 
                          fontSize={11}
                          tickLine={false}
                          tickFormatter={(value) => `يوم ${value}`}
                        />
                        <YAxis 
                          stroke="#94a3b8" 
                          fontSize={11}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(value) => `${value} د`}
                        />
                        <Tooltip 
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const data = payload[0].payload;
                              return (
                                <div className="bg-slate-900 text-white p-3 rounded-xl shadow-lg border border-slate-800 text-xs space-y-1.5 font-sans text-right" dir="rtl">
                                  <p className="font-black border-b border-slate-800 pb-1 flex items-center justify-between gap-4">
                                    <span>{data.dayName}</span>
                                    <span className="text-slate-400 font-normal">({data.fullDate})</span>
                                  </p>
                                  {payload.map((p, idx) => (
                                    <p key={idx} className="flex items-center justify-between gap-6" style={{ color: p.color }}>
                                      <span>{p.name}:</span>
                                      <span className="font-mono font-bold">{p.value} دقيقة</span>
                                    </p>
                                  ))}
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Legend 
                          verticalAlign="top" 
                          height={36} 
                          iconType="circle"
                          iconSize={8}
                          wrapperStyle={{ fontSize: '11px', fontWeight: 'bold' }}
                        />
                        <Line 
                          type="monotone" 
                          dataKey="دقائق التأخير" 
                          stroke="#d97706" 
                          strokeWidth={2} 
                          activeDot={{ r: 5 }} 
                          dot={{ r: 2.5 }}
                        />
                        <Line 
                          type="monotone" 
                          dataKey="دقائق الخروج المبكر" 
                          stroke="#6b7280" 
                          strokeWidth={2} 
                          activeDot={{ r: 5 }} 
                          dot={{ r: 2.5 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Raw JSON Debug Viewer */}
                {showRawJson && (
                  <div className="bg-slate-900 text-slate-200 p-5 rounded-2xl border border-slate-800 shadow-lg overflow-x-auto font-mono text-xs space-y-2 print:hidden animate-fade-in-down">
                    <div className="flex justify-between items-center pb-2 border-b border-slate-800">
                      <span className="text-slate-400">{t("extractedDataJson")}</span>
                      <button 
                        onClick={() => {
                          const blob = new Blob([JSON.stringify(result.extracted_data, null, 2)], {type: "application/json"});
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = `extracted_${result.employee_info.id || "employee"}.json`;
                          a.click();
                        }}
                        className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold px-2.5 py-1 rounded-md"
                      >
                        {t("downloadJson")}
                      </button>
                    </div>
                    <pre className="max-h-60 overflow-y-auto leading-relaxed tab-size-2">
                      {JSON.stringify(result.extracted_data, null, 2)}
                    </pre>
                  </div>
                )}

                {/* Detailed Table Header and Filter */}
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden">
                  
                  <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                      <h3 className="font-bold text-slate-700 dark:text-white text-sm flex items-center gap-2">
                        <FileText className="h-4 w-4 text-slate-400" />
                        <span>{t("detailedReport")}</span>
                      </h3>
                      <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                        {t("reportSubtitle")}
                      </p>
                    </div>

                    {/* Filters */}
                    <div className="flex flex-wrap items-center gap-1.5 print:hidden" role="group" aria-label="فلاتر عرض التقرير">
                      <button
                        onClick={() => setFilter("all")}
                        className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-all ${
                          filter === "all"
                            ? "bg-slate-700 border-slate-700 text-white dark:bg-slate-600 dark:border-slate-600"
                            : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400"
                        }`}
                      >
                        {t("all")} ({result.daily_report.length})
                      </button>
                      <button
                        onClick={() => setFilter("violations")}
                        className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-all ${
                          filter === "violations"
                            ? "bg-rose-600 border-rose-600 text-white"
                            : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400"
                        }`}
                      >
                        {t("violations")} ({result.daily_report.filter(r => r.statusStyle === 'danger' || r.delayMinutes > 0 || r.status.includes('غياب')).length})
                      </button>
                      <button
                        onClick={() => setFilter("leaves")}
                        className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-all ${
                          filter === "leaves"
                            ? "bg-amber-500 border-amber-500 text-white"
                            : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400"
                        }`}
                      >
                        {t("leavesFilter")} ({result.daily_report.filter(r => r.statusStyle === 'warning' || r.status.includes('إجازة') || r.status.includes('مغادرة')).length})
                      </button>
                      <button
                        onClick={() => setFilter("regular")}
                        className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-all ${
                          filter === "regular"
                            ? "bg-emerald-600 border-emerald-600 text-white"
                            : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400"
                        }`}
                      >
                        {t("regular")} ({result.daily_report.filter(r => r.statusStyle === 'success' || r.status.includes('منتظم')).length})
                      </button>
                    </div>

                  </div>

                  {/* Daily Report Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-right border-collapse" role="table" aria-label="تقرير السجل التفصيلي للحضور والانصراف">
                      <thead>
                        <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20 text-[11px] font-bold text-slate-400 dark:text-slate-500">
                          <th className="py-3.5 px-4 font-semibold">{t("tableDayDate")}</th>
                          <th className="py-3.5 px-4 font-semibold">{t("tableCheckIn")}</th>
                          <th className="py-3.5 px-4 font-semibold">{t("tableCheckOut")}</th>
                          <th className="py-3.5 px-4 font-semibold">{t("tableWorkHours")}</th>
                          <th className="py-3.5 px-4 font-semibold">{t("tableStatus")}</th>
                          <th className="py-3.5 px-4 font-semibold">{t("tableNotes")}</th>
                          <th className="py-3.5 px-4 font-semibold text-center print:hidden">{t("tableEdit")}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                        {filteredDailyReport.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="py-12 text-center text-slate-400 dark:text-slate-500 text-xs">
                              <HelpCircle className="h-8 w-8 mx-auto mb-2 opacity-30 text-slate-400" />
                              {t("tableNoData")}
                            </td>
                          </tr>
                        ) : (
                          filteredDailyReport.map((row, index) => {
                            const originalIndex = result.daily_report.findIndex(r => r.date === row.date);
                            const isEditing = editingIndex === originalIndex;

                            return (
                              <tr 
                                key={index} 
                                className={`transition-all hover:bg-slate-50/40 dark:hover:bg-slate-800/20 ${
                                  row.isWeekend 
                                    ? "bg-slate-50/30 dark:bg-slate-800/10 text-slate-400 dark:text-slate-500" 
                                    : row.statusStyle === "danger"
                                      ? "bg-rose-50/10 dark:bg-rose-950/5"
                                      : row.statusStyle === "warning"
                                        ? "bg-amber-50/10 dark:bg-amber-950/5"
                                        : ""
                                }`}
                              >
                                <td className="py-4 px-4">
                                  <div className="font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 flex-wrap">
                                    <span>{row.dayName}</span>
                                    <span className="text-xs font-normal text-slate-400 dark:text-slate-500">({row.date})</span>
                                    
                                    {row.hasLeave && !isEditing && (
                                      <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-2 py-0.5 rounded-full border border-emerald-100 dark:border-emerald-900/60 flex items-center gap-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                        تم أخذ إجازة {row.leaveType ? `(${row.leaveType})` : ""}
                                      </span>
                                    )}
                                    
                                    {row.hasPermission && !isEditing && (
                                      <span className="text-[10px] font-bold text-indigo-700 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/30 px-2 py-0.5 rounded-full border border-indigo-100 dark:border-indigo-900/60 flex items-center gap-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></span>
                                        تم أخذ مغادرة
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="py-4 px-4 font-mono text-xs text-slate-600 dark:text-slate-300">
                                  {isEditing ? (
                                    <div className="space-y-1">
                                      <input 
                                        type="text" 
                                        value={editCheckIn} 
                                        onChange={(e) => setEditCheckIn(e.target.value)} 
                                        placeholder="مثال 08:00:00" 
                                        className="px-2 py-1 border border-slate-200 dark:border-slate-700 rounded text-xs font-mono w-28 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:border-indigo-500 shadow-sm"
                                      />
                                      <div className="text-[9px] text-slate-400 dark:text-slate-500">امسح لتحديد غياب/إجازة</div>
                                    </div>
                                  ) : row.checkIn ? (
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                      <span>{row.checkIn}</span>
                                      {row.delayMinutes > 0 && (
                                        <span className="text-[9px] font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30 px-1 py-0.5 rounded border border-rose-100 dark:border-rose-900/60 whitespace-nowrap">
                                          +{row.delayMinutes} د تأخير
                                        </span>
                                      )}
                                      {row.checkInCount && row.checkInCount > 1 && (
                                        <span className="text-[9px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 px-1 py-0.5 rounded border border-amber-100 dark:border-amber-900/60 whitespace-nowrap" title={`تم رصد ${row.checkInCount} حركات دخول`}>
                                          {row.checkInCount} حركات دخول
                                        </span>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-slate-300 dark:text-slate-700">-</span>
                                  )}
                                </td>
                                <td className="py-4 px-4 font-mono text-xs text-slate-600 dark:text-slate-300">
                                  {isEditing ? (
                                    <div className="space-y-1">
                                      <input 
                                        type="text" 
                                        value={editCheckOut} 
                                        onChange={(e) => setEditCheckOut(e.target.value)} 
                                        placeholder="مثال 17:00:00" 
                                        className="px-2 py-1 border border-slate-200 dark:border-slate-700 rounded text-xs font-mono w-28 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:border-indigo-500 shadow-sm"
                                      />
                                    </div>
                                  ) : row.checkOut ? (
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                                      <span>{row.checkOut}</span>
                                      {(row.earlyOutMinutes || 0) > 0 && (
                                        <span className="text-[9px] font-bold text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/30 px-1 py-0.5 rounded border border-violet-100 dark:border-violet-900/60 whitespace-nowrap">
                                          -{row.earlyOutMinutes} د خروج مبكر
                                        </span>
                                      )}
                                      {row.checkOutCount && row.checkOutCount > 1 && (
                                        <span className="text-[9px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 px-1 py-0.5 rounded border border-amber-100 dark:border-amber-900/60 whitespace-nowrap" title={`تم رصد ${row.checkOutCount} حركات خروج`}>
                                          {row.checkOutCount} حركات خروج
                                        </span>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-slate-300 dark:text-slate-700">-</span>
                                  )}
                                </td>
                                <td className="py-4 px-4 font-mono text-xs">
                                  {row.workHours !== undefined && row.workHours > 0 ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold">
                                      <Clock className="h-3 w-3 text-slate-400 dark:text-slate-500" />
                                      <span>{row.workHours} س</span>
                                    </span>
                                  ) : (
                                    <span className="text-slate-300 dark:text-slate-700">-</span>
                                  )}
                                </td>
                                <td className="py-4 px-4">
                                  {isEditing ? (
                                    <div className="flex flex-col gap-2 bg-slate-50 p-2 rounded-xl border border-slate-100 w-44">
                                      <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700">
                                        <input 
                                          type="checkbox" 
                                          checked={editHasLeave} 
                                          onChange={(e) => {
                                            setEditHasLeave(e.target.checked);
                                            if (e.target.checked) {
                                              setEditHasPermission(false);
                                              setEditCheckIn("");
                                              setEditCheckOut("");
                                            }
                                          }} 
                                          className="rounded text-amber-600 focus:ring-amber-500 h-3.5 w-3.5"
                                        />
                                        <span>إجازة رسمية</span>
                                      </label>
                                      
                                      {editHasLeave && (
                                        <input 
                                          type="text" 
                                          value={editLeaveType} 
                                          onChange={(e) => setEditLeaveType(e.target.value)} 
                                          placeholder="نوع الإجازة (مرضية، سنوية...)" 
                                          className="px-2 py-1 border border-slate-200 rounded text-xs w-full bg-white"
                                        />
                                      )}

                                      <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700">
                                        <input 
                                          type="checkbox" 
                                          checked={editHasPermission} 
                                          onChange={(e) => {
                                            setEditHasPermission(e.target.checked);
                                            if (e.target.checked) {
                                              setEditHasLeave(false);
                                            }
                                          }} 
                                          className="rounded text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5"
                                        />
                                        <span>مغادرة معتمدة</span>
                                      </label>
                                    </div>
                                  ) : (
                                    <div className="relative group inline-block">
                                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border cursor-help ${getStatusBadgeClass(row.statusStyle)}`}>
                                        {row.statusStyle === "success" && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />}
                                        {row.statusStyle === "danger" && <XCircle className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />}
                                        {row.statusStyle === "warning" && <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />}
                                        <span>{row.status}</span>
                                        <Info className="h-3 w-3 opacity-60 ml-0.5 text-slate-400" />
                                      </span>
                                      
                                      {/* Tooltip Content Panel explaining programmatic rules */}
                                      <div className="absolute z-50 bottom-full right-1/2 translate-x-1/2 mb-2 hidden group-hover:block w-72 p-3 bg-slate-900 dark:bg-slate-800 text-white text-[11px] rounded-xl shadow-xl border border-slate-800 dark:border-slate-700 font-sans pointer-events-none transition-all text-right" dir="rtl">
                                        <div className="font-extrabold text-xs mb-1.5 border-b border-slate-800 dark:border-slate-700 pb-1 flex items-center justify-between">
                                          <span>قاعدة احتساب النظام</span>
                                          <span className="text-indigo-400 font-normal">شفافية التحليل</span>
                                        </div>
                                        <p className="leading-relaxed text-slate-300 whitespace-pre-line">{getStatusExplanation(row, officialStartTime, officialEndTime)}</p>
                                        {/* Tooltip Arrow */}
                                        <div className="absolute top-full right-1/2 translate-x-1/2 -mt-1 border-4 border-transparent border-t-slate-900 dark:border-t-slate-800"></div>
                                      </div>
                                    </div>
                                  )}
                                </td>
                                <td className="py-4 px-4 text-xs font-medium text-slate-500 max-w-[240px] truncate" title={row.note}>
                                  {isEditing ? (
                                    <span className="text-indigo-600 font-bold animate-pulse">تعديل...</span>
                                  ) : (
                                    row.note || <span className="text-slate-300">-</span>
                                  )}
                                </td>
                                <td className="py-4 px-4 text-center print:hidden">
                                  {isEditing ? (
                                    <div className="flex items-center justify-center gap-1.5">
                                      <button 
                                        onClick={() => handleSaveEdit(originalIndex)}
                                        className="p-1.5 bg-slate-700 hover:bg-slate-800 text-white rounded-lg transition-all flex items-center justify-center"
                                        title="حفظ التعديلات"
                                      >
                                        <CheckCircle2 className="w-4 h-4" />
                                      </button>
                                      <button 
                                        onClick={handleCancelEdit}
                                        className="p-1.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 rounded-lg transition-all flex items-center justify-center"
                                        title="إلغاء"
                                      >
                                        <XCircle className="w-4 h-4" />
                                      </button>
                                    </div>
                                  ) : (
                                    !row.isWeekend && (
                                      <button 
                                        onClick={() => handleStartEdit(originalIndex, row)}
                                        className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all inline-flex items-center justify-center"
                                        title="تعديل السجل يدوياً"
                                      >
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                                        </svg>
                                      </button>
                                    )
                                  )}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Table Footer Stats Summary */}
                  <div className="p-4 bg-slate-50 dark:bg-slate-800/30 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row justify-between text-[11px] text-slate-400 dark:text-slate-500 gap-2">
                    <span>{t("tableFooter")}</span>
                    <span>{t("tableTotalDays", { count: filteredDailyReport.length })}</span>
                  </div>

                </div>

              </div>
            )}

            {/* Explanatory Guide Section / System Info */}
            <div id="instructions" className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-sm p-6 space-y-4 print:hidden transition-colors">
              <h3 className="font-bold text-slate-700 dark:text-white text-sm flex items-center gap-2">
                <HelpCircle className="h-4 w-4 text-slate-400" />
                <span>{t("howItWorks")}</span>
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-[11px] text-slate-400 dark:text-slate-500 leading-relaxed">
                
                <div className="space-y-2">
                  <div className="w-6 h-6 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center text-[10px] font-bold">1</div>
                  <h4 className="font-bold text-slate-600 dark:text-slate-300">{t("step1Title")}</h4>
                  <p>{t("step1Desc")}</p>
                </div>

                <div className="space-y-2">
                  <div className="w-6 h-6 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center text-[10px] font-bold">2</div>
                  <h4 className="font-bold text-slate-600 dark:text-slate-300">{t("step2Title")}</h4>
                  <p>{t("step2Desc")}</p>
                </div>

                <div className="space-y-2">
                  <div className="w-6 h-6 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center text-[10px] font-bold">3</div>
                  <h4 className="font-bold text-slate-600 dark:text-slate-300">{t("step3Title")}</h4>
                  <p>{t("step3Desc")}</p>
                </div>

              </div>
            </div>

          </div>
          </>
          )}
          {/* End main view */}

        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-100 dark:border-slate-800 py-6 mt-12 text-center text-[11px] text-slate-400 dark:text-slate-500 print:hidden">
        <div className="max-w-7xl mx-auto px-4">
          <p>{t("footerCopyright")} © {new Date().getFullYear()}</p>
          <p className="mt-1 font-bold text-slate-500 dark:text-slate-400">YAZEED AL-ARAISHA</p>
        </div>
      </footer>

      {/* Admin Login Modal */}
      {showAdminLogin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-sm mx-4 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                <Shield className="h-4 w-4 text-amber-600" />
                <span>{t("adminLogin")}</span>
              </h3>
              <button onClick={() => setShowAdminLogin(false)} className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">{t("adminLoginDesc")}</p>
            <input
              type="password"
              value={adminPasswordInput}
              onChange={(e) => setAdminPasswordInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAdminLogin(); }}
              placeholder={t("adminPasswordPlaceholder")}
              autoFocus
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-xl px-3 py-2.5 text-sm font-medium focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all"
            />
            {adminLoginError && (
              <div className="p-2 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/40 text-rose-700 dark:text-rose-400 text-xs rounded-xl">
                {adminLoginError}
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => { setShowAdminLogin(false); setAdminPasswordInput(""); setAdminLoginError(null); }}
                className="flex-1 px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-sm font-bold rounded-xl transition-all">
                {t("cancelBtn")}
              </button>
              <button onClick={handleAdminLogin} disabled={!adminPasswordInput}
                className={`flex-1 px-4 py-2 text-white text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2 ${!adminPasswordInput ? "opacity-50 cursor-not-allowed" : "bg-amber-600 hover:bg-amber-700"}`}>
                <LogIn className="h-4 w-4" />
                {t("login")}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
