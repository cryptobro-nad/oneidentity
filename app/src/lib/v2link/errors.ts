/**
 * Error sanitation for API responses. Server logs keep the full error; the
 * client only ever sees a redacted first line so secrets (connection strings,
 * the verifier key, the cron secret) can never leak through an error body.
 */

const SECRET_ENV = ["DATABASE_URL", "VERIFIER_PRIVATE_KEY", "CRON_SECRET"] as const;

export function safeErrorMessage(err: unknown): string {
  let msg = err instanceof Error ? err.message.split("\n")[0] : String(err);
  for (const key of SECRET_ENV) {
    const val = process.env[key];
    if (val && val.length >= 6) msg = msg.split(val).join(`[${key} redacted]`);
  }
  // Redact anything that looks like a connection string or a 32-byte hex key,
  // even if it did not come from a known env var.
  msg = msg.replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, "[connection string redacted]");
  msg = msg.replace(/0x[0-9a-fA-F]{64}/g, "[key redacted]");
  return msg;
}
