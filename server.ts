import express from "express";
import path from "path";
import helmet from "helmet";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import { connectDB } from "./src/db";
import apiRouter from "./src/routes";

dotenv.config();

const MAX_IMAGE_SIZE_MB = 10;
const MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024;

// Prevent crash on unhandled errors
process.on("uncaughtException", (err) => {
  console.error("[FATAL] Uncaught Exception:", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("[FATAL] Unhandled Rejection:", reason);
});

// Simple in-memory rate limiter
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_MAX = 10; // max requests
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute window

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(ip);
  
  if (!record || now > record.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }
  
  if (record.count >= RATE_LIMIT_MAX) {
    return false;
  }
  
  record.count++;
  return true;
}

// Clean up old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of rateLimitMap.entries()) {
    if (now > record.resetTime) {
      rateLimitMap.delete(ip);
    }
  }
}, 5 * 60 * 1000);

// Helpers for Arabic/Eastern numerals conversion
function cleanArabicNumbers(str: string): string {
  if (!str) return "";
  const arabicNumbers = [/٠/g, /١/g, /٢/g, /٣/g, /٤/g, /٥/g, /٦/g, /٧/g, /٨/g, /٩/g];
  let cleaned = str;
  for (let i = 0; i < 10; i++) {
    cleaned = cleaned.replace(arabicNumbers[i], String(i));
  }
  return cleaned;
}

// Parse date in format DD-MM-YYYY or similar
function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const cleanStr = cleanArabicNumbers(dateStr).trim();
  
  // Try DD-MM-YYYY or DD/MM/YYYY
  const parts = cleanStr.split(/[-/.]/);
  if (parts.length === 3) {
    // If year is first (YYYY-MM-DD)
    if (parts[0].length === 4) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1; // 0-indexed
      const day = parseInt(parts[2], 10);
      const date = new Date(year, month, day);
      return isNaN(date.getTime()) ? null : date;
    }
    // If year is last (DD-MM-YYYY)
    if (parts[2].length === 4 || parts[2].length === 2) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1; // 0-indexed
      let year = parseInt(parts[2], 10);
      if (year < 100) {
        year += 2000; // assume 20xx
      }
      const date = new Date(year, month, day);
      return isNaN(date.getTime()) ? null : date;
    }
  }

  // Fallback to native parsing
  const timestamp = Date.parse(cleanStr);
  if (!isNaN(timestamp)) {
    return new Date(timestamp);
  }
  return null;
}

// Parse time string to seconds from midnight (handles 12h AM/PM and 24h)
function parseTimeToSeconds(timeStr: string): number | null {
  if (!timeStr) return null;
  let cleanStr = cleanArabicNumbers(timeStr).trim();
  
  // Detect AM/PM before stripping
  let isPM = false;
  let hasAMPM = false;
  const pmMatch = cleanStr.match(/(?:pm|م$|مساءً?|م\s*$)/i);
  const amMatch = cleanStr.match(/(?:am|ص$|صباحاً?|ص\s*$)/i);
  if (pmMatch) { isPM = true; hasAMPM = true; }
  if (amMatch) { hasAMPM = true; }
  
  // Strip AM/PM markers
  cleanStr = cleanStr.replace(/[أا]م|[بب]م|صباحا|مساء|AM|PM|ص(?=\s|$)|م(?=\s|$)/gi, "").trim();
  
  const parts = cleanStr.split(':');
  if (parts.length >= 2) {
    let hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    const seconds = parts.length > 2 ? parseInt(parts[2], 10) : 0;
    
    if (isNaN(hours) || isNaN(minutes) || isNaN(seconds)) return null;
    
    // Convert 12-hour to 24-hour
    if (hasAMPM) {
      if (isPM && hours < 12) hours += 12;
      if (!isPM && hours === 12) hours = 0;
    }
    
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
    
    return hours * 3600 + minutes * 60 + seconds;
  }
  return null;
}

// Format Date object to key YYYY-MM-DD
function formatDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Format Date object to display format DD-MM-YYYY
function formatDateDisplay(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${d}-${m}-${y}`;
}

// Get Arabic day name for a date
function getArabicDayName(date: Date): string {
  const days = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
  return days[date.getDay()];
}

let aiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("مفتاح واجهة برمجة التطبيقات لـ Gemini (GEMINI_API_KEY) غير مكوّن. يرجى إضافته من قائمة الإعدادات (Settings > Secrets).");
    }
    aiClient = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

async function callGeminiWithRetryAndFallback(
  ai: GoogleGenAI,
  imagePart: any,
  promptPart: any,
  schema: any
): Promise<any> {
  const modelsToTry = [
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite"
  ];
  let lastError: any = null;

  for (const model of modelsToTry) {
    let attempts = 3;
    let delay = 1500; // start with a slightly larger delay for 503 errors
    while (attempts > 0) {
      try {
        console.log(`[Gemini] Attempting analysis using model: ${model} (Attempts remaining: ${attempts})`);
        const response = await ai.models.generateContent({
          model: model,
          contents: { parts: [imagePart, promptPart] },
          config: {
            responseMimeType: "application/json",
            responseSchema: schema,
            temperature: 0.1,
          },
        });
        return response;
      } catch (err: any) {
        lastError = err;
        console.error(`[Gemini Error] Model ${model} failed:`, err.message || err);
        
        const errorMessage = String(err.message || "").toLowerCase();
        const isTransient = errorMessage.includes("503") || 
                            errorMessage.includes("demand") || 
                            errorMessage.includes("temporary") || 
                            errorMessage.includes("limit") || 
                            errorMessage.includes("429") || 
                            errorMessage.includes("unavailable") ||
                            errorMessage.includes("overloaded");
                            
        if (isTransient && attempts > 1) {
          console.log(`[Gemini Retry] Transient error detected, backing off for ${delay}ms before retry...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          delay *= 2; // exponential backoff
          attempts--;
        } else {
          // If not transient, or we ran out of attempts, try the next model
          break;
        }
      }
    }
  }
  throw lastError;
}

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || "3000", 10);

  // Security headers
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }));

  // Set high JSON body limit to handle large screenshot base64 strings
  app.use(express.json({ limit: "50mb" }));

  // Optional API key authentication middleware
  const API_KEY = process.env.API_KEY;
  if (API_KEY) {
    app.use("/api", (req, res, next) => {
      const providedKey = req.headers["x-api-key"] || req.query.api_key;
      if (!providedKey || providedKey !== API_KEY) {
        return res.status(401).json({
          error: "مفتاح الوصول (API Key) غير صالح أو مفقود."
        });
      }
      next();
    });
    console.log("[Security] API key authentication enabled for /api routes");
  } else {
    console.log("[Security] No API_KEY set — API endpoints are open");
  }

  // Health check endpoint
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Connect to MongoDB (non-blocking)
  connectDB().then((db) => {
    if (db) console.log("[DB] MongoDB ready");
  }).catch((err) => {
    console.error("[DB] MongoDB connection error:", err.message);
  });

  // Mount API routes (reports, leave-balances, policies, db-status)
  app.use("/api", apiRouter);

  // API Endpoint for timesheet analysis
  app.post("/api/analyze", async (req, res) => {
    try {
      // Rate limiting check
      const clientIp = req.ip || req.socket.remoteAddress || "unknown";
      if (!checkRateLimit(clientIp)) {
        return res.status(429).json({ 
          error: "تم تجاوز الحد المسموح من الطلبات. يرجى الانتظار دقيقة واحدة ثم المحاولة مرة أخرى." 
        });
      }

      const { image, officialStartTime = "08:00:00", officialEndTime = "17:00:00" } = req.body;
      
      if (!image) {
        return res.status(400).json({ error: "الرجاء توفير لقطة الشاشة في الطلب (صيغة Base64)." });
      }

      // Check if image string contains metadata header, if so strip it
      let base64Data = image;
      let mimeType = "image/png";
      if (image.startsWith("data:")) {
        const matches = image.match(/^data:([^;]+);base64,(.*)$/);
        if (matches && matches.length === 3) {
          mimeType = matches[1];
          base64Data = matches[2];
        }
      }

      // Validate image size (base64 is ~33% larger than raw bytes)
      const estimatedSizeBytes = Math.ceil((base64Data.length * 3) / 4);
      if (estimatedSizeBytes > MAX_IMAGE_SIZE_BYTES) {
        return res.status(413).json({
          error: `حجم الصورة يتجاوز الحد المسموح (${MAX_IMAGE_SIZE_MB} ميغابايت). يرجى تصغير الصورة أو ضغطها قبل الرفع.`
        });
      }

      // Reject images that are too small (likely corrupted or thumbnails)
      if (estimatedSizeBytes < 5120) {
        return res.status(400).json({
          error: "الصورة صغيرة جداً أو فارغة. يرجى رفع لقطة شاشة واضحة بدقة عالية."
        });
      }

      // Lazy load Gemini API client
      const ai = getGeminiClient();

      const imagePart = {
        inlineData: {
          mimeType,
          data: base64Data,
        },
      };

      const promptPart = {
        text: `أنت خبير استخراج بيانات من كشوفات الدوام العربية. قم بقراءة الصورة بدقة متناهية.

تعليمات حرجة للدقة:
1. الأرقام العربية (٠١٢٣٤٥٦٧٨٩) يجب تحويلها للأرقام اللاتينية (0123456789).
2. اقرأ كل خلية في الجدول على حدة. لا تتخمن أو تكمل بيانات غير واضحة.
3. إذا كانت خلية غير مقروءة أو مشوشة، أعد القيمة كما تراها مع أفضل تفسير لك، ولا تتركها فارغة.
4. تحقق من توافق اسم اليوم بالتاريخ: مثلاً إذا التاريخ يقابل يوم الأحد، تأكد أن اليوم المكتوب "الأحد".
5. وقت الدخول يجب أن يكون قبل وقت الخروج لنفس اليوم.
6. إذا وجدت أكثر من حركة دخول في يوم واحد، احتفظ بالسجلات جميعها.
7. الأوقات اكتبها بنظام 24 ساعة فقط (بدون AM/PM).

هيكل كشف الدوام:
- رأس الصفحة: رقم الموظف (id)، اسم الموظف الكامل (name)، المسمى الوظيفي (role).
- جدول الحضور والخروج: لكل حركة: يوم (day)، تاريخ (date) بصيغة DD-MM-YYYY، وقت (time) بصيغة HH:MM أو HH:MM:SS بنظام 24 ساعة، نوع الحركة (type) = 'حضور' للدخول فقط أو 'خروج' للخروج فقط. لا تستخدم أي كلمة أخرى.
- جدول المغادرات/التصاريح: تاريخ (date)، وقت البداية (start_time)، وقت النهاية (end_time).
- جدول الإجازات: تاريخ البداية (start_date)، تاريخ النهاية (end_date)، نوع الإجازة (leave_type).

تأكد من:
- استخراج جميع السجلات دون حذف أي صف.
- التأكد من أن التواريخ بصيغة DD-MM-YYYY صحيحة (اليوم 01-31، الشهر 01-12).
- الأوقات بنظام 24 ساعة فقط.`,
      };

      // Call Gemini with retry and fallback mechanism using our utility
      const response = await callGeminiWithRetryAndFallback(
        ai,
        imagePart,
        promptPart,
        {
          type: Type.OBJECT,
          properties: {
            employee_info: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING, description: "رقم الموظف" },
                name: { type: Type.STRING, description: "اسم الموظف الكامل" },
                role: { type: Type.STRING, description: "المسمى الوظيفي أو الوظيفة" }
              },
              required: ["id", "name", "role"]
            },
            attendance_records: {
              type: Type.ARRAY,
              description: "قائمة بكافة حركات الحضور والخروج المستخرجة من الجدول الرئيسي",
              items: {
                type: Type.OBJECT,
                properties: {
                  day: { type: Type.STRING, description: "اسم اليوم باللغة العربية (الاثنين، الثلاثاء، إلخ)" },
                  date: { type: Type.STRING, description: "التاريخ بصيغة DD-MM-YYYY" },
                  time: { type: Type.STRING, description: "الوقت بصيغة HH:MM:SS أو HH:MM بنظام 24 ساعة" },
                  type: { type: Type.STRING, description: "نوع الحركة: 'حضور' للدخول فقط أو 'خروج' للخروج فقط. لا تستخدم أي كلمة أخرى.", enum: ["حضور", "خروج"] }
                },
                required: ["day", "date", "time", "type"]
              }
            },
            permissions: {
              type: Type.ARRAY,
              description: "قائمة بالمغادرات والتصاريح المعطاة خلال الشهر",
              items: {
                type: Type.OBJECT,
                properties: {
                  date: { type: Type.STRING, description: "تاريخ المغادرة بصيغة DD-MM-YYYY" },
                  start_time: { type: Type.STRING, description: "وقت بداية المغادرة بصيغة HH:MM:SS أو HH:MM" },
                  end_time: { type: Type.STRING, description: "وقت نهاية المغادرة بصيغة HH:MM:SS أو HH:MM" }
                },
                required: ["date", "start_time", "end_time"]
              }
            },
            leaves: {
              type: Type.ARRAY,
              description: "قائمة بالإجازات الرسمية المستهلكة خلال الشهر",
              items: {
                type: Type.OBJECT,
                properties: {
                  start_date: { type: Type.STRING, description: "تاريخ بداية الإجازة بصيغة DD-MM-YYYY" },
                  end_date: { type: Type.STRING, description: "تاريخ نهاية الإجازة بصيغة DD-MM-YYYY" },
                  leave_type: { type: Type.STRING, description: "نوع الإجازة (سنوية، مرضية، إلخ)" }
                },
                required: ["start_date", "end_date", "leave_type"]
              }
            }
          },
          required: ["employee_info", "attendance_records", "permissions", "leaves"]
        }
      );

      let extractedText = response.text || "{}";
      // Robust markdown code block stripping
      extractedText = extractedText.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
      const rawExtracted = JSON.parse(extractedText.trim());

      // Let's implement the Business Logic and Cleaning!
      
      // 1. Employee Info
      const employee_info = {
        id: cleanArabicNumbers(rawExtracted.employee_info?.id || "").trim() || "غير معروف",
        name: (rawExtracted.employee_info?.name || "غير معروف").trim(),
        role: (rawExtracted.employee_info?.role || "غير معروف").trim()
      };

      // 2. Normalize Official Start & End Times
      const officialStartSec = parseTimeToSeconds(officialStartTime) || (8 * 3600); // Default to 08:00:00
      const officialEndSec = parseTimeToSeconds(officialEndTime) || (17 * 3600); // Default to 17:00:00

      // 3. Normalized Collections
      const attendanceList = (rawExtracted.attendance_records || []).map((rec: any) => {
        return {
          day: (rec.day || "").trim(),
          date: cleanArabicNumbers(rec.date || "").trim(),
          time: cleanArabicNumbers(rec.time || "").trim(),
          type: (rec.type || "").trim() // "حضور" or "خروج"
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

      // Group attendance records by normalized date
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
          // If multiple checks, keep the earliest
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
          // If multiple check-outs, keep the latest
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

      // Helper to check if a date falls inside a leave range
      const isDateInLeave = (date: Date): { inLeave: boolean; type: string } => {
        const dTime = date.getTime();
        for (const lv of leavesList) {
          const startD = parseDate(lv.start_date);
          const endD = parseDate(lv.end_date);
          if (startD && endD) {
            // Set times to midnight to compare dates safely
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

      // Find the date range spanned by the timesheet.
      // If no attendance records, default to the current month's start/end dates.
      let startDate = new Date();
      let endDate = new Date();
      let hasRecords = false;

      const validParsedDates = attendanceList
        .map((rec: any) => parseDate(rec.date))
        .filter((d: Date | null) => d !== null) as Date[];

      if (validParsedDates.length > 0) {
        hasRecords = true;
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
        // Fallback: 1st of current month to current date
        startDate = new Date();
        startDate.setDate(1);
      }

      // Safeguard against runaway date generation
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

      // Generate report day by day
      for (let i = 0; i < daysCount; i++) {
        const currentDate = new Date(startDate);
        currentDate.setDate(startDate.getDate() + i);

        const dateKey = formatDateKey(currentDate);
        const dayOfWeek = currentDate.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
        const dayArabic = getArabicDayName(currentDate);
        const isWeekend = dayOfWeek === 5 || dayOfWeek === 6; // Friday and Saturday

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
        let statusStyle = "success"; // success, danger, warning, secondary
        let delayMinutes = 0;
        let earlyOutMinutes = 0;
        let note = "";
        const checkInTime = attendance?.checkIn?.time || null;
        const checkOutTime = attendance?.checkOut?.time || null;

        if (attendance) {
          let hasViolation = false;
          let delayMsg = "";
          let earlyMsg = "";

          if (attendance.checkInCount > 1) {
            note += `تنبيه: تم رصد حركتي دخول (${attendance.checkInCount} مرات). `;
          }
          if (attendance.checkOutCount > 1) {
            note += `تنبيه: تم رصد حركتي خروج (${attendance.checkOutCount} مرات). `;
          }

          // Check In Analysis
          if (checkInTime) {
            const checkInSec = parseTimeToSeconds(checkInTime);
            if (checkInSec !== null && checkInSec > officialStartSec) {
              // Delayed! Let's check for permission
              let excusedByPermission = false;
              let coveringPermission: any = null;

              for (const perm of permissionsList) {
                const pDate = parseDate(perm.date);
                if (pDate && formatDateKey(pDate) === dateKey) {
                  const pStartSec = parseTimeToSeconds(perm.start_time);
                  const pEndSec = parseTimeToSeconds(perm.end_time);

                  // A permission covers the delay if it starts at or before official start time
                  // and covers the actual arrival time.
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

          // Check Out Analysis (To check for early checkout)
          if (checkOutTime) {
            const checkOutSec = parseTimeToSeconds(checkOutTime);
            if (checkOutSec !== null && checkOutSec < officialEndSec) {
              // Left early! Check if they have an afternoon permission
              let excusedByPermission = false;
              let coveringPermission: any = null;

              for (const perm of permissionsList) {
                const pDate = parseDate(perm.date);
                if (pDate && formatDateKey(pDate) === dateKey) {
                  const pStartSec = parseTimeToSeconds(perm.start_time);
                  const pEndSec = parseTimeToSeconds(perm.end_time);

                  // Covers early checkout if the permission starts at or before checkout and goes to or after official end
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
                earlyMsg = "خروج مبكر معذور";
                note += `مغادرة خروج من ${coveringPermission.start_time} إلى ${coveringPermission.end_time}. `;
              } else {
                earlyOutMinutes = Math.ceil((officialEndSec - checkOutSec) / 60);
                totalEarlyOutMinutes += earlyOutMinutes;
                earlyMsg = `خروج مبكر ${earlyOutMinutes} دقيقة`;
                hasViolation = true;
                note += `خرج مبكراً بـ ${earlyOutMinutes} دقيقة. `;
              }
            }
          } else {
            // No checkout registered
            // For compliance, we can notice it but let's not double punish if they did check in on time
            note += "لم يتم رصد حركة خروج. ";
          }

          // Final daily status text composition
          if (hasViolation) {
            statusStyle = "danger";
            const parts = [];
            if (delayMinutes > 0) parts.push(`تأخير ${delayMinutes} د`);
            if (earlyOutMinutes > 0) parts.push(`خروج مبكر ${earlyOutMinutes} د`);
            if (parts.length === 0) {
              parts.push("غير ملتزم");
            }
            statusText = parts.join(" و ");
          } else {
            statusStyle = "success";
            statusText = delayMsg && delayMsg.includes("معذور") ? "حضور (تأخير معذور)" : "حضور منتظم";
            if (!isWeekend) {
              perfectComplianceDays++;
            }
          }

        } else {
          // No attendance records at all on this day
          if (isWeekend) {
            statusText = "عطلة نهاية الأسبوع";
            statusStyle = "secondary";
          } else {
            // It's a working day
            if (inLeave) {
              statusText = `إجازة رسمية (${leaveType})`;
              statusStyle = "warning";
              totalLeavesUsed++;
              perfectComplianceDays++; // leaves are excused, so they count as "compliant/excused"
              note = `مغطى بإجازة: ${leaveType}`;
            } else {
              statusText = "غياب بدون عذر";
              statusStyle = "danger";
              totalAbsences++;
              note = "لم يتم رصد أي حركات حضور أو خروج";
            }
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

      // Detect duplicate fingerprints (بصمات مكررة)
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

      // Calculate Adherence Rate Percentage
      // Adherence rate = (Perfect compliant working days) / (Total working days) * 100
      let correctAttendancePercentage = 100;
      if (totalWorkingDays > 0) {
        correctAttendancePercentage = Math.round((perfectComplianceDays / totalWorkingDays) * 100);
      }
      
      const results = {
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

      return res.json(results);

    } catch (error: any) {
      console.error("Analysis Error:", error);
      return res.status(500).json({
        error: error.message || "حدث خطأ غير متوقع أثناء معالجة كشف الدوام."
      });
    }
  });

  // Streaming analysis endpoint (SSE)
  app.post("/api/analyze/stream", async (req, res) => {
    try {
      const clientIp = req.ip || req.socket.remoteAddress || "unknown";
      if (!checkRateLimit(clientIp)) {
        return res.status(429).json({ 
          error: "تم تجاوز الحد المسموح من الطلبات. يرجى الانتظار دقيقة واحدة ثم المحاولة مرة أخرى." 
        });
      }

      const { image, officialStartTime = "08:00:00", officialEndTime = "17:00:00" } = req.body;
      
      if (!image) {
        return res.status(400).json({ error: "الرجاء توفير لقطة الشاشة في الطلب (صيغة Base64)." });
      }

      let base64Data = image;
      let mimeType = "image/png";
      if (image.startsWith("data:")) {
        const matches = image.match(/^data:([^;]+);base64,(.*)$/);
        if (matches && matches.length === 3) {
          mimeType = matches[1];
          base64Data = matches[2];
        }
      }

      const estimatedSizeBytes = Math.ceil((base64Data.length * 3) / 4);
      if (estimatedSizeBytes > MAX_IMAGE_SIZE_BYTES) {
        return res.status(413).json({
          error: `حجم الصورة يتجاوز الحد المسموح (${MAX_IMAGE_SIZE_MB} ميغابايت).`
        });
      }

      // Set up SSE headers
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();

      const sendEvent = (event: string, data: any) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };

      sendEvent("progress", { step: "start", message: "جاري تحليل الصورة..." });

      const ai = getGeminiClient();
      sendEvent("progress", { step: "ocr", message: "جاري قراءة البيانات من لقطة الشاشة..." });

      const imagePart = {
        inlineData: { mimeType, data: base64Data },
      };

      const promptPart = {
        text: `أنت خبير استخراج بيانات من كشوفات الدوام العربية. قم بقراءة الصورة بدقة متناهية.

تعليمات حرجة للدقة:
1. الأرقام العربية (٠١٢٣٤٥٦٧٨٩) يجب تحويلها للأرقام اللاتينية (0123456789).
2. اقرأ كل خلية في الجدول على حدة. لا تتخمن أو تكمل بيانات غير واضحة.
3. إذا كانت خلية غير مقروءة أو مشوشة، أعد القيمة كما تراها مع أفضل تفسير لك، ولا تتركها فارغة.
4. تحقق من توافق اسم اليوم بالتاريخ: مثلاً إذا التاريخ يقابل يوم الأحد، تأكد أن اليوم المكتوب "الأحد".
5. وقت الدخول يجب أن يكون قبل وقت الخروج لنفس اليوم.
6. إذا وجدت أكثر من حركة دخول في يوم واحد، احتفظ بالسجلات جميعها.
7. الأوقات اكتبها بنظام 24 ساعة فقط (بدون AM/PM).

هيكل كشف الدوام:
- رأس الصفحة: رقم الموظف (id)، اسم الموظف الكامل (name)، المسمى الوظيفي (role).
- جدول الحضور والخروج: لكل حركة: يوم (day)، تاريخ (date) بصيغة DD-MM-YYYY، وقت (time) بصيغة HH:MM أو HH:MM:SS بنظام 24 ساعة، نوع الحركة (type) = 'حضور' للدخول فقط أو 'خروج' للخروج فقط. لا تستخدم أي كلمة أخرى.
- جدول المغادرات/التصاريح: تاريخ (date)، وقت البداية (start_time)، وقت النهاية (end_time).
- جدول الإجازات: تاريخ البداية (start_date)، تاريخ النهاية (end_date)، نوع الإجازة (leave_type).

تأكد من:
- استخراج جميع السجلات دون حذف أي صف.
- التأكد من أن التواريخ بصيغة DD-MM-YYYY صحيحة (اليوم 01-31، الشهر 01-12).
- الأوقات بنظام 24 ساعة فقط.`,
      };

      const schema = {
        type: Type.OBJECT,
        properties: {
          employee_info: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING, description: "رقم الموظف" },
              name: { type: Type.STRING, description: "اسم الموظف الكامل" },
              role: { type: Type.STRING, description: "المسمى الوظيفي أو الوظيفة" }
            },
            required: ["id", "name", "role"]
          },
          attendance_records: {
            type: Type.ARRAY,
            description: "قائمة بكافة حركات الحضور والخروج المستخرجة من الجدول الرئيسي",
            items: {
              type: Type.OBJECT,
              properties: {
                day: { type: Type.STRING, description: "اسم اليوم باللغة العربية" },
                date: { type: Type.STRING, description: "التاريخ بصيغة DD-MM-YYYY" },
                time: { type: Type.STRING, description: "الوقت بصيغة HH:MM:SS أو HH:MM بنظام 24 ساعة" },
                type: { type: Type.STRING, description: "نوع الحركة: 'حضور' للدخول فقط أو 'خروج' للخروج فقط. لا تستخدم أي كلمة أخرى.", enum: ["حضور", "خروج"] }
              },
              required: ["day", "date", "time", "type"]
            }
          },
          permissions: {
            type: Type.ARRAY,
            description: "قائمة بالمغادرات والتصاريح",
            items: {
              type: Type.OBJECT,
              properties: {
                date: { type: Type.STRING, description: "تاريخ المغادرة بصيغة DD-MM-YYYY" },
                start_time: { type: Type.STRING, description: "وقت بداية المغادرة" },
                end_time: { type: Type.STRING, description: "وقت نهاية المغادرة" }
              },
              required: ["date", "start_time", "end_time"]
            }
          },
          leaves: {
            type: Type.ARRAY,
            description: "قائمة بالإجازات الرسمية",
            items: {
              type: Type.OBJECT,
              properties: {
                start_date: { type: Type.STRING, description: "تاريخ بداية الإجازة" },
                end_date: { type: Type.STRING, description: "تاريخ نهاية الإجازة" },
                leave_type: { type: Type.STRING, description: "نوع الإجازة" }
              },
              required: ["start_date", "end_date", "leave_type"]
            }
          }
        },
        required: ["employee_info", "attendance_records", "permissions", "leaves"]
      };

      sendEvent("progress", { step: "analyze", message: "جاري تحليل البيانات واستخراج النتائج..." });

      const response = await callGeminiWithRetryAndFallback(ai, imagePart, promptPart, schema);

      sendEvent("progress", { step: "process", message: "جاري معالجة البيانات وحساب الإحصائيات..." });

      let extractedText = response.text || "{}";
      extractedText = extractedText.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
      const rawExtracted = JSON.parse(extractedText);

      // --- Business Logic (same as non-streaming) ---
      const employee_info = {
        id: cleanArabicNumbers(rawExtracted.employee_info?.id || "").trim() || "غير معروف",
        name: (rawExtracted.employee_info?.name || "غير معروف").trim(),
        role: (rawExtracted.employee_info?.role || "غير معروف").trim()
      };

      const officialStartSec = parseTimeToSeconds(officialStartTime) || (8 * 3600);
      const officialEndSec = parseTimeToSeconds(officialEndTime) || (17 * 3600);

      const attendanceList = (rawExtracted.attendance_records || []).map((rec: any) => ({
        day: (rec.day || "").trim(),
        date: cleanArabicNumbers(rec.date || "").trim(),
        time: cleanArabicNumbers(rec.time || "").trim(),
        type: (rec.type || "").trim()
      }));

      const permissionsList = (rawExtracted.permissions || []).map((perm: any) => ({
        date: cleanArabicNumbers(perm.date || "").trim(),
        start_time: cleanArabicNumbers(perm.start_time || "").trim(),
        end_time: cleanArabicNumbers(perm.end_time || "").trim()
      }));

      const leavesList = (rawExtracted.leaves || []).map((lv: any) => ({
        start_date: cleanArabicNumbers(lv.start_date || "").trim(),
        end_date: cleanArabicNumbers(lv.end_date || "").trim(),
        leave_type: (lv.leave_type || "إجازة").trim()
      }));

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
            if (newSec < currentSec) attendanceByDate[dateKey].checkIn = rec;
          }
        } else if (normType === "خروج") {
          attendanceByDate[dateKey].checkOutCount++;
          if (!attendanceByDate[dateKey].checkOut) {
            attendanceByDate[dateKey].checkOut = rec;
          } else {
            const currentSec = parseTimeToSeconds(attendanceByDate[dateKey].checkOut.time) || 0;
            const newSec = parseTimeToSeconds(rec.time) || 0;
            if (newSec > currentSec) attendanceByDate[dateKey].checkOut = rec;
          }
        }
      });

      const isDateInLeave = (date: Date): { inLeave: boolean; type: string } => {
        const dTime = date.getTime();
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
      let hasRecords = false;
      const validParsedDates = attendanceList
        .map((rec: any) => parseDate(rec.date))
        .filter((d: Date | null) => d !== null) as Date[];

      if (validParsedDates.length > 0) {
        hasRecords = true;
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
      const daysCount = Math.min(maxDays, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 3600 * 24)) + 1);

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
        if (!isWeekend) totalWorkingDays++;

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
          if (attendance.checkInCount > 1) note += `تنبيه: تم رصد حركتي دخول (${attendance.checkInCount} مرات). `;
          if (attendance.checkOutCount > 1) note += `تنبيه: تم رصد حركتي خروج (${attendance.checkOutCount} مرات). `;

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
                  if (pStartSec !== null && pEndSec !== null && pStartSec <= officialStartSec && pEndSec >= checkInSec) {
                    excusedByPermission = true;
                    coveringPermission = perm;
                    break;
                  }
                }
              }
              if (excusedByPermission) {
                note += `مغادرة رسمية من ${coveringPermission.start_time} إلى ${coveringPermission.end_time}. `;
              } else {
                delayMinutes = Math.ceil((checkInSec - officialStartSec) / 60);
                totalDelayMinutes += delayMinutes;
                hasViolation = true;
                note += "تأخير غير معذور. ";
                lateDaysSummary.push({ date: formatDateDisplay(currentDate), dayName: dayArabic, delayMinutes, time: checkInTime });
              }
            }
          } else {
            hasViolation = true;
            note += "لم يتم رصد حركة دخول. ";
          }

          if (checkOutTime) {
            const checkOutSec = parseTimeToSeconds(checkOutTime);
            if (checkOutSec !== null && checkOutSec < officialEndSec) {
              let excusedByPermission = false;
              for (const perm of permissionsList) {
                const pDate = parseDate(perm.date);
                if (pDate && formatDateKey(pDate) === dateKey) {
                  const pStartSec = parseTimeToSeconds(perm.start_time);
                  const pEndSec = parseTimeToSeconds(perm.end_time);
                  if (pStartSec !== null && pEndSec !== null && pStartSec <= checkOutSec && pEndSec >= officialEndSec) {
                    excusedByPermission = true;
                    break;
                  }
                }
              }
              if (!excusedByPermission) {
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
            statusText = "حضور منتظم";
            if (!isWeekend) perfectComplianceDays++;
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
          if (report.checkInCount > 1) details.push(`دخول ${report.checkInCount} مرات`);
          if (report.checkOutCount > 1) details.push(`خروج ${report.checkOutCount} مرات`);
          duplicateFingerprintsSummary.push({ date: report.date, dayName: report.dayName, checkInCount: report.checkInCount, checkOutCount: report.checkOutCount, details: details.join(" و ") });
        }
      }

      let correctAttendancePercentage = 100;
      if (totalWorkingDays > 0) {
        correctAttendancePercentage = Math.round((perfectComplianceDays / totalWorkingDays) * 100);
      }

      const results = {
        employee_info,
        kpis: { totalDelayMinutes, totalEarlyOutMinutes, totalAbsences, totalLeavesUsed, totalWorkingDays, perfectComplianceDays, correctAttendancePercentage, totalWorkHours: Number(totalWorkHours.toFixed(1)), totalDuplicateFingerprintDays },
        lateDaysSummary,
        duplicateFingerprintsSummary,
        daily_report: dailyReports,
        extracted_data: rawExtracted
      };

      sendEvent("complete", results);
      res.end();

    } catch (error: any) {
      console.error("Stream Analysis Error:", error);
      const sendEvent = (event: string, data: any) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };
      sendEvent("error", { message: error.message || "حدث خطأ غير متوقع أثناء معالجة كشف الدوام." });
      res.end();
    }
  });

  // Vite development integration or static files serving
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("[FATAL] Server failed to start:", err);
  process.exit(1);
});
