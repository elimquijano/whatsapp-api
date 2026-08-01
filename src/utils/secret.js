import crypto from "node:crypto";

const key = () => crypto.createHash("sha256").update(process.env.AI_CREDENTIALS_SECRET || process.env.JWT_SECRET || "change-this-secret").digest();

export const encryptSecret = (value) => {
  if (!value) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  return `enc:v1:${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${encrypted.toString("base64")}`;
};

export const decryptSecret = (value) => {
  if (!value || !String(value).startsWith("enc:v1:")) return value || "";
  try {
    const [, , iv, tag, encrypted] = String(value).split(":");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64")), decipher.final()]).toString("utf8");
  } catch { return ""; }
};
