const {
  decryptCredential,
  encryptCredential,
} = require("./credentials");

describe("queued SMTP credential encryption", () => {
  beforeEach(() => {
    process.env.EMAIL_CREDENTIAL_KEY =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  });

  test("round trips without storing plaintext", () => {
    const encrypted = encryptCredential("smtp-secret");
    expect(encrypted).toMatchObject({ version: 1 });
    expect(JSON.stringify(encrypted)).not.toContain("smtp-secret");
    expect(decryptCredential(encrypted)).toBe("smtp-secret");
  });

  test("rejects tampered ciphertext", () => {
    const encrypted = encryptCredential("smtp-secret");
    encrypted.ciphertext = Buffer.from("tampered").toString("base64");
    expect(() => decryptCredential(encrypted)).toThrow();
  });
});
