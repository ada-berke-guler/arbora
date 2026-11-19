import { describe, expect, it } from "vitest";
import { weakPassword } from "./passwordCheck";

describe("weakPassword", () => {
  it("rejects common passwords (also with digits/symbols tacked on)", async () => {
    expect(await weakPassword("1q2w3e4r5t", "ada")).not.toBeNull();
    expect(await weakPassword("galatasaray", "ada")).toBe("common");
    expect(await weakPassword("Galatasaray1905!", "ada")).toBe("common");
    expect(await weakPassword("seniseviyorum", "ada")).toBe("common");
    expect(await weakPassword("PASSWORD123", "ada")).toBe("common");
  });

  it("rejects patterns", async () => {
    for (const p of ["aaaaaaaaaa", "1234567890", "0987654321", "abcabcabca", "qwertyuiop", "1212121212", "abcdefghijk"]) {
      expect(await weakPassword(p, "ada"), p).toBe("pattern");
    }
  });

  it("rejects passwords containing the username", async () => {
    expect(await weakPassword("Ahmet-ormanda-77", "ahmet")).toBe("username");
  });

  it("accepts unique passwords", async () => {
    expect(await weakPassword("mavi çaydanlık uçuyor", "ada")).toBeNull();
    expect(await weakPassword("kedi-pencere-limon-7", "ada")).toBeNull();
    expect(await weakPassword("%$#@!&*^(?", "ada")).toBeNull();
  });
});
