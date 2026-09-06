import { Router } from "express";
import { getDB, getDBError } from "./db";
import { createHash } from "crypto";

const router = Router();

function hashPassword(pw: string): string {
  return createHash("sha256").update(pw).digest("hex");
}

function serverError(res: any, err: any) {
  console.error("[API Error]", err?.message || err);
  return res.status(500).json({ error: "حدث خطأ في الخادم. حاول مرة أخرى لاحقاً." });
}

const MAX_ITEMS = {
  reports: 10000,
  leave_balances: 5000,
  overtime: 20000,
  schedules: 5000,
};

function validateArray(body: any, max: number): any[] | null {
  if (!Array.isArray(body)) return null;
  if (body.length > max) return null;
  return body;
}

const DEFAULT_ADMIN_HASH = hashPassword(process.env.ADMIN_PASSWORD || "admin@2026");
const DEFAULT_OVERTIME_HASH = hashPassword(process.env.OVERTIME_PASSWORD || "YAzeed");

const authAttempts = new Map<string, { count: number; resetAt: number }>();

function checkAuthRateLimit(ip: string, maxAttempts: number = 5): boolean {
  const now = Date.now();
  const entry = authAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    authAttempts.set(ip, { count: 1, resetAt: now + 5 * 60 * 1000 });
    return true;
  }
  if (entry.count >= maxAttempts) {
    return false;
  }
  entry.count++;
  return true;
}

// Health check for DB
router.get("/db-status", async (_req, res) => {
  const db = getDB();
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    return res.json({ connected: false, reason: "MONGODB_URI not set" });
  }
  if (!db) {
    return res.json({ connected: false, reason: getDBError() || "DB not initialized yet" });
  }
  try {
    await db.command({ ping: 1 });
    res.json({ connected: true });
  } catch (err: any) {
    res.json({ connected: false, reason: err.message });
  }
});

// ========== REPORTS ==========

router.get("/reports", async (_req, res) => {
  try {
    const db = getDB();
    if (!db) return res.json([]);
    const reports = await db.collection("reports").find().sort({ savedAt: -1 }).toArray();
    res.json(reports);
  } catch (err: any) {
    serverError(res, err);
  }
});

router.post("/reports", async (req, res) => {
  try {
    const db = getDB();
    if (!db) return res.status(503).json({ error: "قاعدة البيانات غير متصلة" });
    const report = req.body;
    if (!report || typeof report !== "object" || typeof report.id !== "string") {
      return res.status(400).json({ error: "بيانات غير صالحة" });
    }
    const clean = { ...report };
    delete clean._id;
    await db.collection("reports").updateOne(
      { id: clean.id },
      { $set: clean },
      { upsert: true }
    );
    res.json({ ok: true });
  } catch (err: any) {
    serverError(res, err);
  }
});

router.delete("/reports/:id", async (req, res) => {
  try {
    const db = getDB();
    if (!db) return res.status(503).json({ error: "قاعدة البيانات غير متصلة" });
    await db.collection("reports").deleteOne({ id: req.params.id });
    res.json({ ok: true });
  } catch (err: any) {
    serverError(res, err);
  }
});

router.delete("/reports", async (_req, res) => {
  try {
    const db = getDB();
    if (!db) return res.status(503).json({ error: "قاعدة البيانات غير متصلة" });
    await db.collection("reports").deleteMany({});
    res.json({ ok: true });
  } catch (err: any) {
    serverError(res, err);
  }
});

// ========== LEAVE BALANCES ==========

router.get("/leave-balances", async (_req, res) => {
  try {
    const db = getDB();
    if (!db) return res.json([]);
    const balances = await db.collection("leave_balances").find().toArray();
    res.json(balances);
  } catch (err: any) {
    serverError(res, err);
  }
});

router.post("/leave-balances", async (req, res) => {
  try {
    const db = getDB();
    if (!db) return res.status(503).json({ error: "قاعدة البيانات غير متصلة" });
    const balances = validateArray(req.body, MAX_ITEMS.leave_balances);
    if (!balances) return res.status(400).json({ error: "بيانات غير صالحة" });
    await db.collection("leave_balances").deleteMany({});
    if (balances.length > 0) {
      await db.collection("leave_balances").insertMany(balances);
    }
    res.json({ ok: true });
  } catch (err: any) {
    serverError(res, err);
  }
});

// ========== AUTH ==========

router.post("/verify-password", async (req, res) => {
  try {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    if (!checkAuthRateLimit(ip)) {
      return res.status(429).json({ error: "تم تجاوز الحد المسموح من المحاولات، حاول بعد 5 دقائق" });
    }
    const db = getDB();
    const hashedInput = hashPassword(req.body.password || "");
    let storedHash = DEFAULT_OVERTIME_HASH;
    if (db) {
      const doc = await db.collection("settings").findOne({ docId: "overtime_password" });
      if (doc?.value) storedHash = doc.value;
    }
    res.json({ valid: hashedInput === storedHash });
  } catch (err: any) {
    res.json({ valid: false });
  }
});

router.post("/verify-admin", async (req, res) => {
  try {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    if (!checkAuthRateLimit(ip)) {
      return res.status(429).json({ error: "تم تجاوز الحد المسموح من المحاولات، حاول بعد 5 دقائق" });
    }
    const db = getDB();
    const hashedInput = hashPassword(req.body.password || "");
    let storedHash = DEFAULT_ADMIN_HASH;
    if (db) {
      const doc = await db.collection("settings").findOne({ docId: "admin_password" });
      if (doc?.value) storedHash = doc.value;
    }
    res.json({ valid: hashedInput === storedHash });
  } catch (err: any) {
    res.json({ valid: false });
  }
});

// ========== OVERTIME ==========

router.get("/overtime", async (_req, res) => {
  try {
    const db = getDB();
    if (!db) return res.json([]);
    const entries = await db.collection("overtime").find().sort({ date: -1 }).toArray();
    res.json(entries);
  } catch (err: any) {
    serverError(res, err);
  }
});

router.post("/overtime", async (req, res) => {
  try {
    const db = getDB();
    if (!db) return res.status(503).json({ error: "قاعدة البيانات غير متصلة" });
    const entries = validateArray(req.body, MAX_ITEMS.overtime);
    if (!entries) return res.status(400).json({ error: "بيانات غير صالحة" });
    await db.collection("overtime").deleteMany({});
    if (entries.length > 0) {
      await db.collection("overtime").insertMany(entries);
    }
    res.json({ ok: true });
  } catch (err: any) {
    serverError(res, err);
  }
});

// ========== SCHEDULES ==========

router.get("/schedules", async (_req, res) => {
  try {
    const db = getDB();
    if (!db) return res.json([]);
    const schedules = await db.collection("schedules").find().sort({ department: 1, employeeName: 1 }).toArray();
    res.json(schedules);
  } catch (err: any) {
    serverError(res, err);
  }
});

router.post("/schedules", async (req, res) => {
  try {
    const db = getDB();
    if (!db) return res.status(503).json({ error: "قاعدة البيانات غير متصلة" });
    const schedules = validateArray(req.body, MAX_ITEMS.schedules);
    if (!schedules) return res.status(400).json({ error: "بيانات غير صالحة" });
    await db.collection("schedules").deleteMany({});
    if (schedules.length > 0) {
      await db.collection("schedules").insertMany(schedules);
    }
    res.json({ ok: true });
  } catch (err: any) {
    serverError(res, err);
  }
});

// ========== POLICIES ==========

router.get("/policies", async (_req, res) => {
  try {
    const db = getDB();
    if (!db) return res.json(null);
    const doc = await db.collection("policies").findOne({ docId: "main" });
    res.json(doc?.value || null);
  } catch (err: any) {
    serverError(res, err);
  }
});

router.post("/policies", async (req, res) => {
  try {
    const db = getDB();
    if (!db) return res.status(503).json({ error: "قاعدة البيانات غير متصلة" });
    if (!req.body || typeof req.body !== "object") {
      return res.status(400).json({ error: "بيانات غير صالحة" });
    }
    await db.collection("policies").updateOne(
      { docId: "main" },
      { $set: { value: req.body } },
      { upsert: true }
    );
    res.json({ ok: true });
  } catch (err: any) {
    serverError(res, err);
  }
});

// ========== OPERATIONS LOG ==========

const MAX_OPERATIONS = 500;

router.get("/operations", async (_req, res) => {
  try {
    const db = getDB();
    if (!db) return res.json([]);
    const logs = await db.collection("operations").find().sort({ timestamp: -1 }).limit(MAX_OPERATIONS).toArray();
    res.json(logs);
  } catch (err: any) {
    serverError(res, err);
  }
});

router.post("/operations", async (req, res) => {
  try {
    const db = getDB();
    if (!db) return res.status(503).json({ error: "قاعدة البيانات غير متصلة" });
    const log = req.body;
    if (!log || typeof log !== "object" || typeof log.action !== "string" || typeof log.operator !== "string") {
      return res.status(400).json({ error: "بيانات غير صالحة" });
    }
    const clean = {
      action: log.action,
      employeeName: typeof log.employeeName === "string" ? log.employeeName.slice(0, 200) : undefined,
      hours:
        typeof log.hours === "number" && isFinite(log.hours)
          ? log.hours
          : typeof log.hours === "string"
          ? log.hours.slice(0, 50)
          : undefined,
      operator: log.operator.slice(0, 200),
      date: log.date || new Date().toISOString().split("T")[0],
      timestamp: Date.now(),
    };
    await db.collection("operations").insertOne(clean);
    await db.collection("operations").deleteMany({ timestamp: { $lt: Date.now() - 90 * 24 * 60 * 60 * 1000 } });
    const count = await db.collection("operations").countDocuments();
    if (count > MAX_OPERATIONS) {
      const extra = await db.collection("operations").find().sort({ timestamp: 1 }).limit(count - MAX_OPERATIONS).toArray();
      if (extra.length > 0) {
        await db.collection("operations").deleteMany({ _id: { $in: extra.map((x: any) => x._id) } });
      }
    }
    res.json({ ok: true });
  } catch (err: any) {
    serverError(res, err);
  }
});

export default router;
