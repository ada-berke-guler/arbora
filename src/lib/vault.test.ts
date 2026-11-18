// @vitest-environment node
import { describe, expect, it } from "vitest";
import { isVaultId, newVaultId, open, seal } from "./vault";

describe("zero-knowledge vault", () => {
  it("round-trips with the right passphrase; ciphertext hides the plaintext", async () => {
    const plain = JSON.stringify({ secret: "günlüğüm", n: 42 });
    const s = await seal(plain, "correct horse battery", 1000);
    expect(s.ct).not.toContain("günlüğüm");
    expect(JSON.stringify(s)).not.toContain("secret");
    expect(await open(s, "correct horse battery")).toBe(plain);
  });

  it("refuses a wrong passphrase", async () => {
    const s = await seal("x", "right-pass-123", 1000);
    await expect(open(s, "wrong-pass-123")).rejects.toThrow("wrong-passphrase");
  });

  it("vault ids are random 256-bit hex", () => {
    const a = newVaultId();
    expect(isVaultId(a)).toBe(true);
    expect(a).not.toBe(newVaultId());
    expect(isVaultId("nope")).toBe(false);
  });
});
