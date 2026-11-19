import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [rows] = await db().query("SELECT 1 AS connected");
    return NextResponse.json({ status: "ok", database: "connected", check: rows }, { status: 200 });
  } catch (error: unknown) {
    const e = error as { code?: string; errno?: number; sqlState?: string; message?: string };
    // Log only non-secret diagnostic metadata. Never log credentials or connection strings.
    console.error("database_health_check_failed", {
      code: e.code ?? "UNKNOWN",
      errno: e.errno ?? null,
      sqlState: e.sqlState ?? null,
      message: (e.message ?? "Unknown database error").slice(0, 300),
    });
    return NextResponse.json(
      { status: "error", database: "unavailable", errorCode: e.code ?? "UNKNOWN" },
      { status: 503 }
    );
  }
}
