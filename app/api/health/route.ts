import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureAdminSchema } from "@/lib/admin-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Apply the idempotent platform/support schema before reporting readiness.
    await ensureAdminSchema();
    await db().query("SELECT 1 AS connected");
    return NextResponse.json(
      { status: "ok", database: "connected", schema: "ready" },
      { status: 200 }
    );
  } catch (error: unknown) {
    const e = error as {
      code?: string;
      errno?: number;
      sqlState?: string;
      message?: string;
    };
    // Keep credentials and connection strings out of logs and HTTP responses.
    console.error("platform_health_check_failed", {
      code: e.code ?? "UNKNOWN",
      errno: e.errno ?? null,
      sqlState: e.sqlState ?? null,
      message: (e.message ?? "Unknown database error").slice(0, 240),
    });
    return NextResponse.json(
      {
        status: "error",
        database: "unavailable",
        schema: "not_ready",
        errorCode: e.code ?? "UNKNOWN",
      },
      { status: 503 }
    );
  }
}
