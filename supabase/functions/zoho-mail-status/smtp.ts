import "jsr:@supabase/functions-js/edge-runtime.d.ts";

export type ZohoSmtpConfig = {
  username: string;
  password: string;
  fromAddress: string;
  hosts: string[];
  port: number;
};

export type ZohoSmtpSession = {
  conn: Deno.TlsConn;
  host: string;
};

class SmtpProtocolError extends Error {
  code: number;
  constructor(code: number, message: string) {
    super(message);
    this.name = "SmtpProtocolError";
    this.code = code;
  }
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function timeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: number | undefined;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

async function writeAll(conn: Deno.TlsConn, data: Uint8Array) {
  let offset = 0;
  while (offset < data.length) {
    const written = await timeout(conn.write(data.subarray(offset)), 12000, "SMTP write timed out.");
    if (!written) throw new Error("SMTP connection closed while writing.");
    offset += written;
  }
}

async function writeLine(conn: Deno.TlsConn, line: string) {
  await writeAll(conn, encoder.encode(line + "\r\n"));
}

async function readResponse(conn: Deno.TlsConn) {
  let text = "";
  const buffer = new Uint8Array(4096);

  for (let attempt = 0; attempt < 32; attempt += 1) {
    const count = await timeout(conn.read(buffer), 12000, "SMTP response timed out.");
    if (count === null) throw new Error("SMTP connection closed unexpectedly.");
    text += decoder.decode(buffer.subarray(0, count), { stream: true });

    const lines = text.replace(/\r\n/g, "\n").split("\n").filter(Boolean);
    const last = lines[lines.length - 1] || "";
    const match = last.match(/^(\d{3}) /);
    if (match && text.endsWith("\r\n")) {
      return { code: Number(match[1]), text: lines.join("\n") };
    }

    if (text.length > 65536) throw new Error("SMTP response was unexpectedly large.");
  }

  throw new Error("SMTP response could not be completed.");
}

function compactResponse(text: string) {
  return text.replace(/[\r\n]+/g, " ").slice(0, 280);
}

function expectCode(response: { code: number; text: string }, allowed: number[]) {
  if (!allowed.includes(response.code)) {
    throw new SmtpProtocolError(response.code, "SMTP returned " + response.code + ": " + compactResponse(response.text));
  }
}

function encodeUtf8Base64(value: string) {
  const bytes = encoder.encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function sanitizeHeader(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function isEmail(value: string) {
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value) && !/[\r\n]/.test(value);
}

function dotStuff(body: string) {
  const normalized = body.replace(/\r?\n/g, "\r\n");
  return normalized.replace(/(^|\r\n)\./g, "$1..");
}

function friendlyConnectionError(error: unknown) {
  if (error instanceof SmtpProtocolError) {
    if (error.code === 535 || error.code === 534) {
      return "authentication was rejected (" + error.code + ")";
    }
    return "server returned " + error.code;
  }
  return error instanceof Error ? error.message : "connection failed";
}

export function getZohoSmtpConfig(): { config: ZohoSmtpConfig | null; missing: string[] } {
  const username = (Deno.env.get("ZOHO_SMTP_USERNAME") || "").trim();
  const password = (Deno.env.get("ZOHO_SMTP_PASSWORD") || "").trim();
  const missing = [
    !username ? "ZOHO_SMTP_USERNAME" : "",
    !password ? "ZOHO_SMTP_PASSWORD" : "",
  ].filter(Boolean);

  if (missing.length) return { config: null, missing };

  const explicitHost = (Deno.env.get("ZOHO_SMTP_HOST") || "").trim();
  const fromAddress = (Deno.env.get("ZOHO_FROM_ADDRESS") || username).trim();
  const portValue = Number(Deno.env.get("ZOHO_SMTP_PORT") || "465");
  const port = Number.isFinite(portValue) && portValue > 0 ? portValue : 465;
  const hosts = explicitHost ? [explicitHost] : ["smtppro.zoho.com", "smtp.zoho.com"];

  return {
    config: {
      username,
      password,
      fromAddress,
      hosts,
      port,
    },
    missing: [],
  };
}

async function authenticateOnHost(config: ZohoSmtpConfig, host: string): Promise<ZohoSmtpSession> {
  const conn = await timeout(
    Deno.connectTls({ hostname: host, port: config.port }),
    15000,
    "Timed out connecting to " + host + ".",
  );

  try {
    expectCode(await readResponse(conn), [220]);

    await writeLine(conn, "EHLO applyflow");
    expectCode(await readResponse(conn), [250]);

    await writeLine(conn, "AUTH LOGIN");
    expectCode(await readResponse(conn), [334]);

    await writeLine(conn, btoa(config.username));
    expectCode(await readResponse(conn), [334]);

    await writeLine(conn, btoa(config.password));
    expectCode(await readResponse(conn), [235]);

    return { conn, host };
  } catch (error) {
    try { conn.close(); } catch { /* no-op */ }
    throw error;
  }
}

export async function openZohoSmtp(config: ZohoSmtpConfig): Promise<ZohoSmtpSession> {
  const failures: string[] = [];

  for (const host of config.hosts) {
    try {
      return await authenticateOnHost(config, host);
    } catch (error) {
      failures.push(host + ": " + friendlyConnectionError(error));
    }
  }

  throw new Error(
    "Could not authenticate with SMTP. Check the provider App Password and that SMTP access is enabled. " +
    failures.join(" | "),
  );
}

export async function validateZohoSmtpSender(
  session: ZohoSmtpSession,
  config: ZohoSmtpConfig,
) {
  if (!isEmail(config.fromAddress)) {
    throw new Error("Configured sender address is invalid.");
  }
  try {
    await writeLine(session.conn, "MAIL FROM:<" + config.fromAddress + ">");
    expectCode(await readResponse(session.conn), [250]);
    await writeLine(session.conn, "RSET");
    expectCode(await readResponse(session.conn), [250]);
  } catch (error) {
    try {
      await writeLine(session.conn, "RSET");
      await readResponse(session.conn);
    } catch {
      // Caller will reconnect if the session is no longer healthy.
    }
    throw error;
  }
}

export async function closeZohoSmtp(session: ZohoSmtpSession | null) {
  if (!session) return;
  try {
    await writeLine(session.conn, "QUIT");
    await readResponse(session.conn);
  } catch {
    // The message transaction is already complete; ignore close errors.
  }
  try { session.conn.close(); } catch { /* no-op */ }
}

export async function sendZohoSmtpMessage(
  session: ZohoSmtpSession,
  config: ZohoSmtpConfig,
  toAddress: string,
  subject: string,
  content: string,
) {
  if (!isEmail(config.fromAddress) || !isEmail(toAddress)) {
    throw new Error("Invalid sender or recipient email address.");
  }

  const conn = session.conn;
  const safeSubject = sanitizeHeader(subject);
  const encodedSubject = "=?UTF-8?B?" + encodeUtf8Base64(safeSubject) + "?=";
  const domain = config.fromAddress.split("@")[1] || "applyflow.local";
  const message = [
    "From: <" + config.fromAddress + ">",
    "To: <" + toAddress + ">",
    "Subject: " + encodedSubject,
    "Date: " + new Date().toUTCString(),
    "Message-ID: <" + crypto.randomUUID() + "@" + domain + ">",
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    dotStuff(content),
  ].join("\r\n");

  try {
    await writeLine(conn, "MAIL FROM:<" + config.fromAddress + ">");
    expectCode(await readResponse(conn), [250]);

    await writeLine(conn, "RCPT TO:<" + toAddress + ">");
    expectCode(await readResponse(conn), [250, 251]);

    await writeLine(conn, "DATA");
    expectCode(await readResponse(conn), [354]);

    await writeAll(conn, encoder.encode(message + "\r\n.\r\n"));
    expectCode(await readResponse(conn), [250]);
  } catch (error) {
    try {
      await writeLine(conn, "RSET");
      await readResponse(conn);
    } catch {
      // Caller will reconnect if the session is no longer healthy.
    }
    throw error;
  }
}
