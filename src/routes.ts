import { Router } from "express";
import { getDB, getDBError } from "./db";

const router = Router();

const DEFAULT_PASSWORD = process.env.OVERTIME_PASSWORD || "ot@2026";

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

router.get("/overtime-password", async (_req, res) => {
  try {
    const db = getDB();
    if (!db) return res.json({ password: DEFAULT_PASSWORD });
    const doc = await db.collection("settings").findOne({ docId: "overtime_password" });
    res.json({ password: doc?.value || DEFAULT_PASSWORD });
  } catch (err: any) {
    res.json({ password: DEFAULT_PASSWORD });
  }
});

router.post("/verify-password", async (req, res) => {
  try {
    const db = getDB();
    const storedPassword = DEFAULT_PASSWORD;
    if (db) {
      const doc = await db.collection("settings").findOne({ docId: "overtime_password" });
      if (doc?.value) {
        return res.json({ valid: req.body.password === doc.value });
      }
    }
    res.json({ valid: req.body.password === storedPassword });
  } catch (err: any) {
    res.json({ valid: req.body.password === DEFAULT_PASSWORD });
  }
});

router.post("/change-password", async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: "الباسورد القديم والجديد مطلوبين" });
    }
    if (newPassword.length < 4) {
      return res.status(400).json({ error: "الباسورد الجديد لازم يكون 4 أحرف على الأقل" });
    }

    let currentPassword = DEFAULT_PASSWORD;
    const db = getDB();
    if (db) {
      const doc = await db.collection("settings").findOne({ docId: "overtime_password" });
      if (doc?.value) currentPassword = doc.value;
    }

    if (oldPassword !== currentPassword) {
      return res.status(403).json({ error: "الباسورد القديم غير صحيح" });
    }

    if (db) {
      await db.collection("settings").updateOne(
        { docId: "overtime_password" },
        { $set: { value: newPassword } },
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
