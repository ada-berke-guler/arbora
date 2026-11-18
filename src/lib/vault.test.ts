// @vitest-environment node
import { describe, expect, it } from "vitest";
import { accountFrom, deriveAccount, isVaultId, normalizeUsername, open, openWith, seal, sealWith } from "./vault";

const IT = 1000;

describe("zero-knowledge account vault", () => {
  it("same username + password → same vault id, token and key on any device", async () => {
    const a = await accountFrom(await deriveAccount("Ada ", "correct horse battery", IT));
    const b = await accountFrom(await deriveAccount("ada", "correct horse battery", IT));
    expect(a.vaultId).toBe(b.vaultId);
    expect(a.authToken).toBe(b.authToken);
    expect(isVaultId(a.vaultId)).toBe(true);
    expect(a.authToken).not.toBe(a.vaultId);
    const s = await sealWith("günlüğüm", a.encKey);
    expect(await openWith(s, b.encKey)).toBe("günlüğüm");
  });

  it("a different password or username gives an unrelated vault", async () => {
    const a = await accountFrom(await deriveAccount("ada", "correct horse battery", IT));
    const b = await accountFrom(await deriveAccount("ada", "correct horse batterz", IT));
    const c = await accountFrom(await deriveAccount("bob", "correct horse battery", IT));
    expect(new Set([a.vaultId, b.vaultId, c.vaultId]).size).toBe(3);
    const s = await sealWith("x", a.encKey);
    await expect(openWith(s, b.encKey)).rejects.toThrow("wrong-passphrase");
  });

  it("ciphertext and ids reveal neither the data nor the username", async () => {
    const a = await accountFrom(await deriveAccount("zeynep", "correct horse battery", IT));
    const s = await sealWith(JSON.stringify({ secret: "günlüğüm" }), a.encKey);
    const wire = JSON.stringify(s) + a.vaultId + a.authToken;
    expect(wire).not.toContain("secret");
    expect(wire).not.toContain("zeynep");
  });

  it("normalizes usernames", () => {
    expect(normalizeUsername("  ADA ")).toBe("ada");
  });

  it("legacy v1 files still open", async () => {
    const s = await seal("x", "right-pass-123", IT);
    expect(await open(s, "right-pass-123")).toBe("x");
    await expect(open(s, "wrong-pass-123")).rejects.toThrow("wrong-passphrase");
  });
});
