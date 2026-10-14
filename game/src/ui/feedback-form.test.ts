import { describe, expect, it, vi } from "vitest";
import { resolve } from "../text/resolve";
import type { Msg } from "../text/msg";
import { feedbackBuild, feedbackStatus, FEEDBACK_TEXT_LIMIT, sendFeedback, type FeedbackReport } from "./game-menu";

const render = (msg: Msg) => resolve(msg, "en");

const report: FeedbackReport = { kind: "bug", text: "the door sticks", version: "v1.2.3", build: "dev" };
const URL_OF_SERVER = "https://example.test/feedback";

const answer = (status: number, body: unknown) => new Response(typeof body === "string" ? body : JSON.stringify(body), { status });

describe("sendFeedback", () => {
  it("posts the report as JSON and returns a sent answer", async () => {
    const post = vi.fn().mockResolvedValue(answer(200, { status: "sent" }));
    expect(await sendFeedback(post, URL_OF_SERVER, report)).toEqual({ status: "sent" });
    const [url, init] = post.mock.calls[0];
    expect(url).toBe(URL_OF_SERVER);
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "content-type": "application/json" });
    expect(JSON.parse(init.body)).toEqual(report);
  });

  it("shows each answer in the player's language", () => {
    expect(render(feedbackStatus({ status: "sent" }))).toBe("Thank you. Your report is sent.");
    expect(render(feedbackStatus({ status: "failed" }))).toBe("Could not send. Try again.");
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
