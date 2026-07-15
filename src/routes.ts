import { Router } from "express";
import { getDB, getDBError } from "./db";
import { createHash } from "crypto";

const router = Router();

function hashPassword(pw: string): string {
  return createHash("sha256").update(pw).digest("hex");
}

const DEFAULT_PASSWORD_HASH = hashPassword(process.env.OVERTIME_PASSWORD || "ot@2026");

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
    res.status(500).json({ error: err.message });
  }
});

router.post("/reports", async (req, res) => {
  try {
    const db = getDB();
    if (!db) return res.status(503).json({ error: "قاعدة البيانات غير متصلة" });
    const report = req.body;
    if (!report.id) return res.status(400).json({ error: "Missing report id" });
    await db.collection("reports").updateOne(
      { id: report.id },
      { $set: report },
      { upsert: true }
    );
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/reports/:id", async (req, res) => {
  try {
    const db = getDB();
    if (!db) return res.status(503).json({ error: "قاعدة البيانات غير متصلة" });
    await db.collection("reports").deleteOne({ id: req.params.id });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/reports", async (_req, res) => {
  try {
    const db = getDB();
    if (!db) return res.status(503).json({ error: "قاعدة البيانات غير متصلة" });
    await db.collection("reports").deleteMany({});
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
  }
});

router.post("/leave-balances", async (req, res) => {
  try {
    const db = getDB();
    if (!db) return res.status(503).json({ error: "قاعدة البيانات غير متصلة" });
    const balances = req.body;
    if (!Array.isArray(balances)) return res.status(400).json({ error: "Expected array" });
    await db.collection("leave_balances").deleteMany({});
    if (balances.length > 0) {
      await db.collection("leave_balances").insertMany(balances);
    }
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ========== OVERTIME PASSWORD ==========

router.post("/verify-password", async (req, res) => {
  try {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    if (!checkAuthRateLimit(ip)) {
      return res.status(429).json({ error: "تم تجاوز الحد المسموح من المحاولات، حاول بعد 5 دقائق" });
    }
    const db = getDB();
    const hashedInput = hashPassword(req.body.password || "");
    let storedHash = DEFAULT_PASSWORD_HASH;
    if (db) {
      const doc = await db.collection("settings").findOne({ docId: "overtime_password" });
      if (doc?.value) storedHash = doc.value;
    }
    res.json({ valid: hashedInput === storedHash });
  } catch (err: any) {
    res.json({ valid: false });
  }
});

router.post("/change-password", async (req, res) => {
  try {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    if (!checkAuthRateLimit(ip)) {
      return res.status(429).json({ error: "تم تجاوز الحد المسموح من المحاولات، حاول بعد 5 دقائق" });
    }
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: "الباسورد القديم والجديد مطلوبين" });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: "الباسورد الجديد لازم يكون 8 أحرف على الأقل" });
    }

    const hashedOld = hashPassword(oldPassword);
    let currentHash = DEFAULT_PASSWORD_HASH;
    const db = getDB();
    if (db) {
      const doc = await db.collection("settings").findOne({ docId: "overtime_password" });
      if (doc?.value) currentHash = doc.value;
    }

    if (hashedOld !== currentHash) {
      return res.status(403).json({ error: "الباسورد القديم غير صحيح" });
    }

    const hashedNew = hashPassword(newPassword);
    if (db) {
      await db.collection("settings").updateOne(
        { docId: "overtime_password" },
        { $set: { value: hashedNew } },
        { upsert: true }
      );
    }

    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
  }
});

router.post("/overtime", async (req, res) => {
  try {
    const db = getDB();
    if (!db) return res.status(503).json({ error: "قاعدة البيانات غير متصلة" });
    const entries = req.body;
    if (!Array.isArray(entries)) return res.status(400).json({ error: "Expected array" });
    await db.collection("overtime").deleteMany({});
    if (entries.length > 0) {
      await db.collection("overtime").insertMany(entries);
    }
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
  }
});

router.post("/policies", async (req, res) => {
  try {
    const db = getDB();
    if (!db) return res.status(503).json({ error: "قاعدة البيانات غير متصلة" });
    await db.collection("policies").updateOne(
      { docId: "main" },
      { $set: { value: req.body } },
      { upsert: true }
    );
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
