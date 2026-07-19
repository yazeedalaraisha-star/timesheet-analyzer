import express from "express";
import path from "path";
import helmet from "helmet";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import { connectDB } from "./src/db";
import apiRouter from "./src/routes";
import { processAttendanceData } from "./src/analysis";

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
const rateLimitCleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of rateLimitMap.entries()) {
    if (now > record.resetTime) {
      rateLimitMap.delete(ip);
    }
  }
}, 5 * 60 * 1000);

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
    "gemini-3.5-flash",
    "gemini-3.1-flash-lite"
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
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }));

  // Set high JSON body limit to handle large screenshot base64 strings
  app.use(express.json({ limit: "50mb" }));

  // Optional API key authentication middleware
  const API_KEY = process.env.API_KEY;
  if (API_KEY) {
    app.use("/api", (req, res, next) => {
      const providedKey = req.headers["x-api-key"];
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

  // Connect to MongoDB (non-blocking with retry)
  connectDB().then((db) => {
    if (db) {
      console.log("[DB] MongoDB ready");
    } else {
      console.log("[DB] MongoDB not available, retrying in 10s...");
      setTimeout(() => {
        connectDB().then((db2) => {
          if (db2) console.log("[DB] MongoDB connected on retry");
          else console.log("[DB] MongoDB still unavailable");
        });
      }, 10000);
    }
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

      const results = processAttendanceData(rawExtracted, officialStartTime, officialEndTime);
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
      if (estimatedSizeBytes < 5120) {
        return res.status(400).json({
          error: "الصورة صغيرة جداً وربما غير صالحة. يرجى رفع صورة كشف دوام حقيقية."
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

      const results = processAttendanceData(rawExtracted, officialStartTime, officialEndTime);

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

  // API Endpoint for schedule image OCR
  app.post("/api/analyze-schedule", async (req, res) => {
    try {
      const clientIp = req.ip || req.socket.remoteAddress || "unknown";
      if (!checkRateLimit(clientIp)) {
        return res.status(429).json({ error: "تم تجاوز الحد المسموح. انتظر دقيقة ثم حاول مرة أخرى." });
      }

      const { image, month, year } = req.body;
      if (!image) {
        return res.status(400).json({ error: "الرجاء توفير صورة جدول الدوام." });
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
        return res.status(413).json({ error: `حجم الصورة يتجاوز ${MAX_IMAGE_SIZE_MB} ميغابايت.` });
      }

      const ai = getGeminiClient();

      const imagePart = {
        inlineData: { mimeType, data: base64Data },
      };

      const targetMonth = month || new Date().getMonth() + 1;
      const targetYear = year || new Date().getFullYear();

      const promptPart = {
        text: `أنت خبير استخراج بيانات من جداول الدوام الشهرية. قم بقراءة الصورة بدقة.

الشهر المطلوب: ${targetMonth}/${targetYear}

التعليمات:
1. اقرأ جميع أسماء الموظفين من أول عمود بالجدول.
2. كل عمود يمثل يوماً من الشهر (1 إلى 31).
3. في كل خلية، اقرأ الشفتات: A أو B أو C أو مزيج منها (مثل AB).
4. A = نهاري (06-14)، B = مسائي (14-22)، C = ليلي (22-06).
5. إذا كان اليوم مكتوب فيه "إجازة" أو "OFF" أو "ع" اعتبره OFF.
6. الأرقام العربية حوّلها لأرقام لاتينية.
7. إذا كانت الخلية فارغة، اكتب "".
8. لا تتخمن — إذا ما قريت الخلية اكتب "".

أعطني النتيجة فقط كمصفوفة JSON بدون أي نص إضافي:
{"employees":[{"name":"اسم الموظف","days":{"1":"A","2":"B","3":"OFF","4":"AB","5":"C",...}}]}

days: المفتاح رقم اليوم (1-31)، القيمة الشفتات. فقط الأيام اللي فيها بيانات.`
      };

      const modelsToTry = ["gemini-3.5-flash", "gemini-3.1-flash-lite"];
      let lastError: any = null;
      let result: any = null;

      for (const model of modelsToTry) {
        let attempts = 3;
        let delay = 1500;
        while (attempts > 0) {
          try {
            console.log(`[Schedule OCR] Trying model: ${model} (attempts: ${attempts})`);
            const response = await ai.models.generateContent({
              model,
              contents: { parts: [imagePart, promptPart] },
              config: { temperature: 0.1 },
            });
            let text = (response.text || "").trim();
            text = text.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
            const jsonMatch = text.match(/\{[\s\S]*"employees"[\s\S]*\}/);
            if (jsonMatch) {
              result = JSON.parse(jsonMatch[0]);
              break;
            }
            result = JSON.parse(text);
            break;
          } catch (err: any) {
            lastError = err;
            console.error(`[Schedule OCR] ${model} failed:`, err.message);
            const msg = String(err.message || "").toLowerCase();
            const isTransient = msg.includes("503") || msg.includes("429") || msg.includes("unavailable") || msg.includes("overloaded");
            if (isTransient && attempts > 1) {
              await new Promise((r) => setTimeout(r, delay));
              delay *= 2;
              attempts--;
            } else {
              break;
            }
          }
        }
        if (result) break;
      }

      if (!result) {
        throw lastError || new Error("فشل تحليل الصورة. حاول مرة أخرى.");
      }

      return res.json(result);
    } catch (error: any) {
      console.error("Schedule OCR Error:", error);
      return res.status(500).json({
        error: error.message || "حدث خطأ أثناء قراءة صورة الجدول."
      });
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

  // Graceful shutdown
  process.on("SIGTERM", async () => {
    console.log("[Server] SIGTERM received, shutting down...");
    clearInterval(rateLimitCleanupInterval);
    const { closeDB } = await import("./src/db");
    await closeDB();
    process.exit(0);
  });
  process.on("SIGINT", async () => {
    console.log("[Server] SIGINT received, shutting down...");
    clearInterval(rateLimitCleanupInterval);
    const { closeDB } = await import("./src/db");
    await closeDB();
    process.exit(0);
  });
}

startServer().catch((err) => {
  console.error("[FATAL] Server failed to start:", err);
  process.exit(1);
});
