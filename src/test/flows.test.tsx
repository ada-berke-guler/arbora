import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import App from "../App";
import { db, putSetting } from "../db/schema";
import { startJourney } from "../db/cycles";
import { addRingTask } from "../db/ring";
import { todayLocal, addDays } from "../lib/dates";
import { themeTokens, PRESETS } from "../lib/theme";

async function resetDb() {
  await db.delete();
  await db.open();
  window.location.hash = "";
  try {
    localStorage.clear();
  } catch {
    /* ignore */
  }
}

async function seedApp(route: string) {
  await putSetting(db, "lang", "tr");
  await putSetting(db, "introSeen", true);
  await putSetting(db, "hasCompletedIntroBefore", true);
  const c = await startJourney(db, addDays(todayLocal(), -5), "Test", 60);
  await putSetting(db, `habitsOnboardingDone:${c.id}`, true);
  window.location.hash = `#${route}`;
  return c;
}

beforeEach(resetDb);
afterEach(cleanup);

describe("onboarding", () => {
  it("intro → skip → start journey → habit onboarding", async () => {
    await putSetting(db, "lang", "tr");
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Atla" }));
    const begin = await screen.findByRole("button", { name: "Başla" });
    expect(screen.getByRole("status").textContent).toMatch(/180 gün/);
    fireEvent.click(begin);
    expect(await screen.findByText("Ortamın hazırlanıyor…")).toBeTruthy();
    expect(await screen.findByRole("heading", { name: "Alışkanlıklarını seç" }, { timeout: 5000 })).toBeTruthy();
  });

  it("language switch flips the whole UI", async () => {
    await putSetting(db, "lang", "tr");
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "EN" }));
    expect(await screen.findByRole("button", { name: "Skip" })).toBeTruthy();
  });
});

describe("Day Ring", () => {
  it("adds a block, refuses an overlapping one, and lists both rings", async () => {
    await seedApp("/dayring");
    render(<App />);
    const name = await screen.findByLabelText("Ne yapacaksın?");
    fireEvent.change(name, { target: { value: "Derin çalışma" } });
    fireEvent.change(screen.getByLabelText("Başlangıç"), { target: { value: "09:00" } });
    fireEvent.blur(screen.getByLabelText("Başlangıç"));
    fireEvent.change(screen.getByLabelText("Bitiş"), { target: { value: "11:00" } });
    fireEvent.blur(screen.getByLabelText("Bitiş"));
    fireEvent.click(screen.getByRole("button", { name: "Kadrana ekle" }));

    const plan = await screen.findByRole("region", { name: "Günün planı" });
    expect(await within(plan).findByText("Derin çalışma")).toBeTruthy();
    expect(within(plan).getByText("İç halka · 00:00 – 12:00")).toBeTruthy();
    /* dial renders the sector with an accessible label */
    expect(screen.getByRole("button", { name: "Derin çalışma, 09:00 – 11:00" })).toBeTruthy();

    /* the form advanced to the next free slot (11:00–12:00); force an overlap */
    fireEvent.change(screen.getByLabelText("Ne yapacaksın?"), { target: { value: "Toplantı" } });
    fireEvent.change(screen.getByLabelText("Başlangıç"), { target: { value: "10:30" } });
    fireEvent.blur(screen.getByLabelText("Başlangıç"));
    fireEvent.click(screen.getByRole("button", { name: "Kadrana ekle" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("“Derin çalışma” (09:00 – 11:00) ile çakışıyor");
  });

  it("saves the day and applies it to another date with undo", async () => {
    await seedApp("/dayring");
    const today = todayLocal();
    await addRingTask(db, today, { title: "Uyku", start: 23 * 60, end: 31 * 60, color: "#386641", textColor: null });
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Aç" }));
    fireEvent.change(screen.getByLabelText("Hangi gün ya da rutin?"), { target: { value: "Rutin" } });
    fireEvent.click(screen.getByRole("button", { name: "Hafızaya al" }));
    expect(await screen.findByText("Rutin")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: /Kadran/ }));
    fireEvent.click(screen.getByRole("button", { name: "Sonraki gün" }));
    fireEvent.click(screen.getByRole("tab", { name: /Kayıtlı günler/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Rutin gününü kadrana uygula" }));
    const plan = await screen.findByRole("region", { name: "Günün planı" });
    expect(await within(plan).findByText("Uyku")).toBeTruthy();
    expect(within(plan).getByText(/gece yarısını geçiyor/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Geri al" }));
    await waitFor(() => expect(within(plan).queryByText("Uyku")).toBeNull());
  });
});

describe("60-30-10 theme builder", () => {
  it("applies a preset globally, then gives one section its own theme", async () => {
    await seedApp("/settings");
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Bahçe teması" }));
    const bahce = themeTokens(PRESETS.find((p) => p.id === "bahce")!);
    await waitFor(() => expect(document.documentElement.style.getPropertyValue("--bg")).toBe(bahce["--bg"]));

    fireEvent.change(screen.getByLabelText("Nereye uygulansın?"), { target: { value: "dayring" } });
    fireEvent.click(screen.getByRole("button", { name: "Onyx teması" }));
    await waitFor(async () => {
      const sel = (await db.settings.get("themeSelection"))?.value as { global: string; sections: Record<string, string> };
      expect(sel).toEqual({ global: "bahce", sections: { dayring: "onyx" } });
    });

    await act(async () => {
      window.location.hash = "#/dayring";
    });
    const main = await screen.findByRole("main");
    await waitFor(() => expect(main.style.getPropertyValue("--bg")).toBe(PRESETS.find((p) => p.id === "onyx")!.dominant));
    /* the root (sidebar etc.) keeps the global theme */
    expect(document.documentElement.style.getPropertyValue("--bg")).toBe(bahce["--bg"]);
  });

  it("builds and saves a custom theme from three colors", async () => {
    await seedApp("/settings");
    render(<App />);
    const hex = await screen.findByLabelText("%10 · Vurgu HEX");
    fireEvent.change(screen.getByLabelText("%60 · Baskın HEX"), { target: { value: "#101820" } });
    fireEvent.change(screen.getByLabelText("%30 · İkincil HEX"), { target: { value: "#1C2A38" } });
    fireEvent.change(hex, { target: { value: "#FEE715" } });
    fireEvent.change(screen.getAllByLabelText("Ad").at(-1)!, { target: { value: "Gece Sarısı" } });
    fireEvent.click(screen.getByRole("button", { name: "Tema olarak kaydet" }));
    expect(await screen.findByRole("button", { name: "Gece Sarısı teması" })).toBeTruthy();
    await waitFor(() => expect(document.documentElement.style.getPropertyValue("--accent")).toBe("#FEE715"));
    expect(screen.getByText(/Okunabilirlik iyi/)).toBeTruthy();
  });
});

describe("backup restore from onboarding", () => {
  it("shows the import dialog before any journey exists", async () => {
    await putSetting(db, "lang", "tr");
    await putSetting(db, "introSeen", true);
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Ya da bir yedekten geri yükle" }));
    expect(await screen.findByRole("dialog", { name: "Yedeği içe aktar…" })).toBeTruthy();
  });
});

describe("account sync UI", () => {
  it("first run offers 'I have an account' with the no-reset warning", async () => {
    await putSetting(db, "lang", "tr");
    await putSetting(db, "introSeen", true);
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Hesabım var — giriş yap" }));
    const dialog = await screen.findByRole("dialog", { name: "Hesabım var — giriş yap" });
    expect(within(dialog).getByLabelText("Kullanıcı adı")).toBeTruthy();
    expect(within(dialog).getByText("Şifre sıfırlama yok.")).toBeTruthy();
    fireEvent.click(within(dialog).getAllByRole("button", { name: "Giriş yap" }).at(-1)!);
    expect(await within(dialog).findByRole("alert")).toBeTruthy(); // empty form → validation message
  });

  it("settings shows the create-account form and links the KVKK page", async () => {
    await seedApp("/settings");
    render(<App />);
    expect(await screen.findByRole("button", { name: "Hesap oluştur", pressed: true })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Gizlilik ve KVKK metnini oku" }).getAttribute("href")).toBe("#/privacy");
    // creating an account needs explicit consent (storage abroad, KVKK m.9)
    const box = screen.getByRole("checkbox", { name: /yurt dışında/ }) as HTMLInputElement;
    expect(box.checked).toBe(false);
    fireEvent.change(screen.getByLabelText("Kullanıcı adı"), { target: { value: "ada" } });
    fireEvent.change(screen.getByLabelText("Parola"), { target: { value: "kedi-pencere-limon-7" } });
    fireEvent.change(screen.getByLabelText("Parola (tekrar — yalnızca gönderirken)"), { target: { value: "kedi-pencere-limon-7" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Hesap oluştur" }).at(-1)!);
    expect((await screen.findByRole("alert")).textContent).toContain("onay kutusunu");
  });
});
