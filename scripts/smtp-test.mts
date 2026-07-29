/**
 * Quick SMTP delivery check. Run: npx tsx scripts/smtp-test.mts you@gmail.com
 */
import { loadEnvConfig } from "@next/env";
import { sendSmtpTestEmail, isEmailConfigured } from "../src/lib/smtp";

loadEnvConfig(process.cwd());

const to = process.argv[2] || process.env.ADMIN_EMAIL || "";
if (!to) {
  console.error("Usage: npx tsx scripts/smtp-test.mts you@gmail.com");
  process.exit(1);
}
if (!isEmailConfigured()) {
  console.error("SMTP is not configured in .env.local");
  process.exit(1);
}

sendSmtpTestEmail(to).then((result) => {
  console.log(result);
  process.exit(result.sent ? 0 : 1);
});
