import crypto from "node:crypto";

/**
 * 주민등록번호(RRN) at-rest encryption — AES-256-GCM.
 *
 * Ciphertext layout (base64): [12-byte IV][16-byte auth tag][ciphertext].
 * Plaintext RRN is never stored or logged. Only admin/accounting may decrypt
 * (enforced by the caller via `requireSensitiveAccess`), and every reveal is
 * written to `audit_log`.
 *
 * Key: `RRN_ENC_KEY` (any string; hashed to 32 bytes). Falls back to
 * `BETTER_AUTH_SECRET` in dev so the app runs without extra config — set a
 * dedicated `RRN_ENC_KEY` in production and do not rotate it without re-encrypting.
 */
function getKey(): Buffer {
  const secret = process.env.RRN_ENC_KEY || process.env.BETTER_AUTH_SECRET;
  if (!secret) {
    throw new Error("RRN_ENC_KEY (or BETTER_AUTH_SECRET) is not set");
  }
  return crypto.createHash("sha256").update(secret).digest();
}

/** Strip to digits. Returns "" if no usable digits. */
function digitsOnly(value: string): string {
  return (value ?? "").replace(/\D/g, "");
}

/** Encrypt an RRN. Stores digits only. Returns "" for empty input. */
export function encryptRrn(plain: string): string {
  const digits = digitsOnly(plain);
  if (!digits) return "";
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const enc = Buffer.concat([cipher.update(digits, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

/** Decrypt a stored RRN ciphertext to its digit string. */
export function decryptRrn(stored: string): string {
  const raw = Buffer.from(stored, "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const enc = raw.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString("utf8");
}

/** Format 13 digits as `######-#######`. */
export function formatRrn(digits: string): string {
  const d = digitsOnly(digits);
  if (d.length !== 13) return d;
  return `${d.slice(0, 6)}-${d.slice(6)}`;
}

/** Masked placeholder shown to authorized users before they reveal. */
export const RRN_MASK = "●●●●●●-●●●●●●●";
