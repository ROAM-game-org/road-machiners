import { gunzipSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import type { ReportContext } from "../three/error-report";
import { resolve } from "../text/resolve";
import type { Msg } from "../text/msg";
import { feedbackBuild, feedbackStatus, FEEDBACK_TEXT_LIMIT, sendFeedback, type FeedbackReport } from "./feedback-form";

const render = (msg: Msg) => resolve(msg, "en");
const renderRu = (msg: Msg) => resolve(msg, "ru");

const context: ReportContext = {
  build: "dev",
  version: "1.2.3+abc1234",
  userAgent: "test",
  language: "en",
  screen: { width: 1280, height: 720, pixelRatio: 1, uiSize: 1 },
  turn: 12,
  log: ["Day 1 08:00 Arrived"],
  world: { format: "test", world: { turn: 12 } },
  autosave: null,
  autosaveIsWorld: true,
};
const report: FeedbackReport = { kind: "bug", text: "the door sticks", build: "3fa9c1e", context };
const URL_OF_SERVER = "https://example.test/feedback";

const answer = (status: number, body: unknown) => new Response(typeof body === "string" ? body : JSON.stringify(body), { status });

describe("sendFeedback", () => {
  it("posts the report with the game context as gzipped JSON and returns a sent answer", async () => {
    const post = vi.fn().mockResolvedValue(answer(200, { status: "sent" }));
    expect(await sendFeedback(post, URL_OF_SERVER, report)).toEqual({ status: "sent" });
    const [url, init] = post.mock.calls[0];
    expect(url).toBe(URL_OF_SERVER);
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "content-type": "application/gzip" });
    const bytes = new Uint8Array(await (init.body as Blob).arrayBuffer());
    expect(JSON.parse(gunzipSync(bytes).toString("utf8"))).toEqual(report);
  });

  it("shows each answer in the player's language", () => {
    expect(render(feedbackStatus({ status: "sent" }))).toBe("Thank you. Your report is sent.");
    expect(render(feedbackStatus({ status: "failed" }))).toBe("Could not send. Try again.");
  });

  it("reports a rate limit with the minutes until the server takes reports again", async () => {
    const post = vi.fn().mockResolvedValue(answer(429, { status: "limited", retryAfterSeconds: 1501 }));
    expect(await sendFeedback(post, URL_OF_SERVER, report)).toEqual({ status: "limited", minutes: 26 });
  });

  it("reports a rate limit with no time when the 429 does not say when it ends", async () => {
    for (const body of ["Too many requests", { status: "limited" }, { status: "limited", retryAfterSeconds: -5 }]) {
      const post = vi.fn().mockResolvedValue(answer(429, body));
      expect(await sendFeedback(post, URL_OF_SERVER, report)).toEqual({ status: "limited", minutes: null });
    }
  });

  it("keeps each blocked retry limited, and sends once the server takes reports again", async () => {
    const post = vi.fn().mockImplementation(async () => answer(429, { status: "limited", retryAfterSeconds: 60 }));
    for (let i = 0; i < 3; i++) expect(await sendFeedback(post, URL_OF_SERVER, report)).toEqual({ status: "limited", minutes: 1 });
    post.mockResolvedValue(answer(200, { status: "sent" }));
    expect(await sendFeedback(post, URL_OF_SERVER, report)).toEqual({ status: "sent" });
  });

  it("tells a limited player when to send again, in English and Russian, and never says to try again now", () => {
    const limited = feedbackStatus({ status: "limited", minutes: 26 });
    const later = feedbackStatus({ status: "limited", minutes: null });
    expect(render(limited)).toContain("26 minutes");
    expect(renderRu(limited)).toContain("26 минут");
    for (const text of [render(limited), render(later)]) expect(text).not.toBe(render(feedbackStatus({ status: "failed" })));
    for (const text of [renderRu(limited), renderRu(later)]) expect(text).not.toBe(renderRu(feedbackStatus({ status: "failed" })));
    expect(render(feedbackStatus({ status: "limited", minutes: 1 }))).toContain("1 minute.");
  });

  it("fails on an error status", async () => {
    const post = vi.fn().mockResolvedValue(answer(500, "server broke"));
    expect(await sendFeedback(post, URL_OF_SERVER, report)).toEqual({ status: "failed" });
  });

  it("fails on a network error", async () => {
    const post = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    expect(await sendFeedback(post, URL_OF_SERVER, report)).toEqual({ status: "failed" });
  });

  it("fails on an answer that is not the contract", async () => {
    for (const body of [{ status: "maybe" }, { status: "refused" }, "sent"]) {
      const post = vi.fn().mockResolvedValue(answer(200, body));
      expect(await sendFeedback(post, URL_OF_SERVER, report)).toEqual({ status: "failed" });
    }
  });

  it("throws and sends nothing with an empty URL", async () => {
    const post = vi.fn();
    await expect(sendFeedback(post, "", report)).rejects.toThrow("FEEDBACK_URL is empty");
    expect(post).not.toHaveBeenCalled();
  });

  it("throws and sends nothing over the text limit", async () => {
    const post = vi.fn();
    await expect(sendFeedback(post, URL_OF_SERVER, { ...report, text: "x".repeat(FEEDBACK_TEXT_LIMIT + 1) })).rejects.toThrow("over 3000");
    expect(post).not.toHaveBeenCalled();
  });
});

describe("feedbackBuild", () => {
  it("is release on the release build", () => {
    expect(feedbackBuild("release", "/index.html")).toBe("release");
  });

  it("is the first folder of the path on other builds", () => {
    expect(feedbackBuild("", "/dev/")).toBe("dev");
    expect(feedbackBuild("", "/rc/index.html")).toBe("rc");
    expect(feedbackBuild("dev", "/3fa9c1e/play/")).toBe("3fa9c1e");
  });

  it("is empty with no folder", () => {
    expect(feedbackBuild("", "/")).toBe("");
  });
});
