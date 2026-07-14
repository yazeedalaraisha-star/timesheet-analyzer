import { MongoClient, Db } from "mongodb";

let client: MongoClient | null = null;
let db: Db | null = null;

export async function connectDB(): Promise<Db | null> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.log("[DB] MONGODB_URI not set — running without database");
    return null;
  }

  try {
    if (db) return db;
    client = new MongoClient(uri);
    await client.connect();
    db = client.db("timesheet_analyzer");
    console.log("[DB] Connected to MongoDB Atlas");
    return db;
  } catch (err: any) {
    console.error("[DB] Connection failed:", err.message);
    return null;
  }
}

export function getDB(): Db | null {
  return db;
}

export async function closeDB(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
    console.log("[DB] Connection closed");
  }
}
