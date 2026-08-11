const crypto = require("crypto");

const getKey = () => {
  const configured = process.env.EMAIL_CREDENTIAL_KEY;
  if (!configured) {
    throw new Error("Email credential encryption key is not configured.");
  }
  const key = /^[a-f0-9]{64}$/i.test(configured)
    ? Buffer.from(configured, "hex")
    : Buffer.from(configured, "base64");
  if (key.length !== 32) {
    throw new Error("Email credential encryption key must be 32 bytes.");
  }
  return key;
};

const encryptCredential = (plaintext) => {
  if (typeof plaintext !== "string" || !plaintext) {
    throw new Error("SMTP password is required.");
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return {
    version: 1,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
};

const decryptCredential = (encrypted) => {
  if (!encrypted || encrypted.version !== 1) {
    throw new Error("Invalid encrypted SMTP credential.");
  }
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getKey(),
    Buffer.from(encrypted.iv, "base64")
  );
  decipher.setAuthTag(Buffer.from(encrypted.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
};

module.exports = { decryptCredential, encryptCredential };
