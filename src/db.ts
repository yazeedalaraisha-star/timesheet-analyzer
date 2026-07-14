import { MongoClient, Db } from "mongodb";

let client: MongoClient | null = null;
let db: Db | null = null;
let connecting = false;
let lastError: string | null = null;

export async function connectDB(): Promise<Db | null> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.log("[DB] MONGODB_URI not set — running without database");
    return null;
  }

  if (db) return db;
  if (connecting) return null;

  connecting = true;
  try {
    client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
    });
    await client.connect();
    db = client.db("timesheet_analyzer");
    console.log("[DB] Connected to MongoDB Atlas");
    return db;
  } catch (err: any) {
    console.error("[DB] Connection failed:", err.message);
    lastError = err.message;
    client = null;
    db = null;
    return null;
  } finally {
    connecting = false;
  }
}

export function getDB(): Db | null {
  return db;
}

export function getDBError(): string | null {
  return lastError;
}

export async function closeDB(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
    console.log("[DB] Connection closed");
  }
}
