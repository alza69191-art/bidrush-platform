import mysql from "mysql2/promise";

const globalForDb = globalThis as unknown as { pool?: mysql.Pool };
export function db() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  if (!globalForDb.pool) globalForDb.pool = mysql.createPool({ uri: process.env.DATABASE_URL, waitForConnections: true, connectionLimit: 8, queueLimit: 0, ssl: { rejectUnauthorized: true } });
  return globalForDb.pool;
}
