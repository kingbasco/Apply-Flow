import { getZohoSmtpConfig, type ZohoSmtpConfig } from "./smtp.ts";
import { getZeptoMailConfig } from "./zeptomail.ts";

export function getGmailSmtpConfig(): { config: ZohoSmtpConfig | null; missing: string[] } {
  const username = (Deno.env.get("GMAIL_SMTP_USERNAME") || "").trim();
  const password = (Deno.env.get("GMAIL_SMTP_PASSWORD") || "").replace(/\s/g, "");
  const missing = [!username ? "GMAIL_SMTP_USERNAME" : "", !password ? "GMAIL_SMTP_PASSWORD" : ""].filter(Boolean);
  return missing.length ? { config: null, missing } : {
    config: { username, password, fromAddress: username, hosts: ["smtp.gmail.com"], port: 465 }, missing: [],
  };
}

// Omitted provider preserves the existing ZeptoMail -> Zoho default for older clients.
// An explicit selection never falls back to a different provider.
export function resolveEmailProvider(requested: unknown) {
  if (requested !== undefined && requested !== null && !["auto", "gmail", "zoho", "zeptomail"].includes(String(requested))) {
    throw new Error("INVALID_PROVIDER");
  }
  const zepto = getZeptoMailConfig();
  const provider = !requested || requested === "auto" ? (zepto.config ? "zeptomail" : "zoho") : String(requested);
  const smtp = provider === "gmail" ? getGmailSmtpConfig() : getZohoSmtpConfig();
  return {
    provider,
    transport: provider === "zeptomail" ? "api" : "smtp",
    zeptoConfig: provider === "zeptomail" ? zepto.config : null,
    smtpConfig: provider === "zeptomail" ? null : smtp.config,
    missing: provider === "zeptomail" ? zepto.missing : smtp.missing,
  };
}
