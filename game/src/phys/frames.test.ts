import { describe, expect, it } from "vitest";
import { blendFrames, frameAt, headingOf, headingQuat, type VehicleFrame } from "./frames";

const frame = (x: number, heading: number, spin: number, ground = true): VehicleFrame => ({
  pos: { x, y: 0, z: 0 },
  rot: headingQuat(heading),
  acc: { x: x * 2, y: 0, z: 0 },
  wheels: [{ steer: heading, spin, suspension: x / 10, ground }],
});

describe("frameAt", () => {
  const frames = [frame(0, 0, 0), frame(1, 0.2, 4, false), frame(3, 0.4, 8)];

  it("shows each physics step exactly at its own time", () => {
    expect(frameAt(frames, 1)).toEqual(frames[1]);
  });

  it("moves the truck between steps in proportion to the time between them", () => {
    const f = frameAt(frames, 1.25)!;
    expect(f.pos.x).toBeCloseTo(1.5);
    expect(f.acc.x).toBeCloseTo(3);
    expect(headingOf(f.rot)).toBeCloseTo(0.25);
    expect(f.wheels[0]).toMatchObject({ spin: 5, ground: false });
    expect(f.wheels[0].steer).toBeCloseTo(0.25);
    expect(f.wheels[0].suspension).toBeCloseTo(0.15);
  });

  it("blends from the pose shown at the turn start into the first step, so turns join without a skip", () => {
    const start = frame(-1, 0, 0);
    expect(frameAt(frames, -1, start)!.pos).toEqual(start.pos);
    expect(frameAt(frames, -0.5, start)!.pos.x).toBeCloseTo(-0.5);
    expect(frameAt(frames, -0.5)).toBe(frames[0]);
  });

  it("holds the last pose past the end of the turn", () => {
    expect(frameAt(frames, 2.7)).toBe(frames[2]);
  });

  it("gives nothing for a truck with no frames", () => {
    expect(frameAt(undefined, 1)).toBeUndefined();
    expect(frameAt(frames, 5)).toBeUndefined();
  });
});

describe("blendFrames", () => {
  it("turns the short way when the two rotations have opposite signs", () => {
    const a = frame(0, 0.1, 0);
    const b = frame(0, 0.3, 0);
    const flipped = { ...b, rot: { x: -b.rot.x, y: -b.rot.y, z: -b.rot.z, w: -b.rot.w } };
    expect(headingOf(blendFrames(a, flipped, 0.5).rot)).toBeCloseTo(0.2);
  });

  it("rejects a share outside the two frames", () => {
    expect(() => blendFrames(frame(0, 0, 0), frame(1, 0, 0), 1.5)).toThrow(/0\.\.1/);
  });
});
