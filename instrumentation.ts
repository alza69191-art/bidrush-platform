export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  try {
    const { ensureAdminSchema } = await import("@/lib/admin-schema");
    await ensureAdminSchema();
    console.info("bidrush_schema_bootstrap_complete");
  } catch (error: unknown) {
    const e = error as { code?: string; sqlState?: string; message?: string };
    console.error("bidrush_schema_bootstrap_failed", {
      code: e.code ?? "UNKNOWN",
      sqlState: e.sqlState ?? null,
      message: (e.message ?? "Unknown schema bootstrap error").slice(0, 240),
    });
    // Keep the web process alive so the health endpoint can report and retry.
  }
}
