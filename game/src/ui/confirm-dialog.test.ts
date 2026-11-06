import { afterEach, describe, expect, it, vi } from "vitest";
import { stubPage } from "../test/fake-dom";
import { t } from "../text/msg";
import { askConfirm, isConfirmOpen } from "./confirm-dialog";

const ASK = { question: t("save.confirmLoad"), yes: t("menu.loadSave") };

let current: ReturnType<typeof stubPage> | null = null;

function ask() {
  const page = stubPage();
  current = page;
  const answers: boolean[] = [];
  const asked = askConfirm(ASK).then((a) => answers.push(a));
  const dialog = page.ui.withClass("confirm-dialog")!;
  const key = (code: string, extra: object = {}) => page.win.fire("keydown", { code, ...extra });
  return { ...page, answers, asked, dialog, key };
}

describe("the confirm dialog", () => {
  afterEach(() => {
    if (isConfirmOpen()) current?.win.fire("keydown", { code: "Escape" });
    vi.unstubAllGlobals();
  });

  it("draws the question with Cancel and a yes button, and focuses Cancel", () => {
    const { dialog, ui } = ask();
    expect(dialog.attrs.role).toBe("alertdialog");
    expect(dialog.attrs["aria-modal"]).toBe("true");
    expect(dialog.textContent).toContain("Load this save?");
    expect(dialog.button("Cancel").focused).toBe(1);
    expect(dialog.button("Load save").className).toBe("btn-danger");
    expect(ui.withClass("confirm-block")).not.toBeNull();
    expect(isConfirmOpen()).toBe(true);
  });

  it("answers true once on yes and is gone before the answer arrives", async () => {
    const { dialog, ui, asked, answers, opener } = ask();
    dialog.button("Load save").fire("click");
    expect(isConfirmOpen()).toBe(false);
    expect(ui.children).toEqual([]);
    await asked;
    expect(answers).toEqual([true]);
    expect(opener.focused).toBe(1);
  });

  it("answers false on Cancel", async () => {
    const { dialog, asked, answers } = ask();
    dialog.button("Cancel").fire("click");
    await asked;
    expect(answers).toEqual([false]);
    expect(isConfirmOpen()).toBe(false);
  });

  it("answers false on Escape, and Escape reaches nothing else", async () => {
    const { key, asked, answers, ui } = ask();
    let stopped = false;
    key("Escape", { stopPropagation: () => (stopped = true) });
    await asked;
    expect(answers).toEqual([false]);
    expect(stopped).toBe(true);
    expect(ui.children).toEqual([]);
  });

  it("refuses a second ask while one is open and draws nothing", async () => {
    const { ui, dialog } = ask();
    expect(await askConfirm(ASK)).toBe(false);
    expect(ui.all((n) => n.className.split(" ").includes("confirm-dialog"))).toEqual([dialog]);
    expect(isConfirmOpen()).toBe(true);
  });

  it("wraps Tab between the two buttons in both directions", () => {
    const { dialog, key } = ask();
    const cancel = dialog.button("Cancel");
    const yes = dialog.button("Load save");
    key("Tab");
    expect(yes.focused).toBe(1);
    key("Tab");
    expect(cancel.focused).toBe(2);
    key("Tab", { shiftKey: true });
    expect(yes.focused).toBe(2);
  });

  it("stops every other key but leaves browser chords alone", () => {
    const { key } = ask();
    const stopped: string[] = [];
    for (const code of ["Space", "Enter", "KeyI"]) key(code, { stopPropagation: () => stopped.push(code) });
    key("KeyR", { ctrlKey: true, stopPropagation: () => stopped.push("chord") });
    expect(stopped).toEqual(["Space", "Enter", "KeyI"]);
  });

  it("takes no key after it closes", async () => {
    const { dialog, key, asked } = ask();
    dialog.button("Cancel").fire("click");
    await asked;
    const stopped: string[] = [];
    key("Space", { stopPropagation: () => stopped.push("Space") });
    expect(stopped).toEqual([]);
  });
});
