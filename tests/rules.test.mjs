import { describe, it, expect } from "vitest";
import { resolve, twistTone, poolSize, trackMarks, fillTrack, addCounter, easeCounter, damageAspect, projectLength, aspectLength, dangerStart, barterValue } from "../system/module/rules.mjs";

describe("action roll", () => {
  it("reads the highest die", () => {
    expect(resolve([2, 6, 3]).result).toBe("triumph");
    expect(resolve([4, 1]).result).toBe("conflict");
    expect(resolve([3, 2, 1]).result).toBe("disaster");
  });
  it("cuts remove the highest dice first", () => {
    const r = resolve([6, 5, 2], { cuts: 1 });
    expect(r.cut).toEqual([6]);
    expect(r.highest).toBe(5);
    expect(r.result).toBe("conflict");
    expect(resolve([6], { cuts: 1 }).result).toBe("disaster");
  });
  it("doubles among kept dice are a twist", () => {
    expect(resolve([5, 5, 1]).twist).toBe(true);
    expect(resolve([5, 5, 1]).twistValue).toBe(5);
    expect(resolve([6, 6, 2], { cuts: 1 }).twist).toBe(false);
    expect(resolve([3, 3, 6, 6]).twistValue).toBe(6);
  });
  it("zero dice can never triumph", () => {
    expect(resolve([6], { desperate: true }).result).toBe("conflict");
    expect(resolve([2], { desperate: true }).result).toBe("disaster");
  });
  it("twist tone", () => {
    expect(twistTone(6)).toBe("positive");
    expect(twistTone(4)).toBe("neutral");
    expect(twistTone(1)).toBe("negative");
  });
});

describe("pool and tracks", () => {
  it("caps skill and advantages", () => {
    expect(poolSize({ base: 2, advantages: 5 })).toBe(5);
    expect(poolSize({ base: 4, advantages: 3, camp: true })).toBe(6);
  });
  it("marks from result and impact", () => {
    expect(trackMarks("triumph")).toBe(2);
    expect(trackMarks("conflict")).toBe(1);
    expect(trackMarks("disaster", "high")).toBe(0);
    expect(trackMarks("triumph", "low")).toBe(1);
    expect(trackMarks("conflict", "high")).toBe(2);
    expect(trackMarks("conflict", "massive")).toBe("all");
    expect(trackMarks("conflict", "medium", { twistBoost: true })).toBe(2);
    expect(fillTrack({ value: 3, max: 5 }, "all")).toBe(5);
    expect(fillTrack({ value: 4, max: 5 }, 2)).toBe(5);
  });
});

describe("counters and aspects", () => {
  it("counter rolls over into levels", () => {
    expect(addCounter({ level: 0, track: 2 }, 1)).toMatchObject({ level: 1, track: 0, gained: 1 });
    expect(addCounter({ level: 2, track: 2 }, 2, 3)).toMatchObject({ level: 3, maxed: true, track: 0 });
    expect(easeCounter({ level: 1, track: 0 })).toEqual({ level: 1, track: 0 });
  });
  it("aspect damage overflows into harm", () => {
    expect(damageAspect({ length: 3, damage: 1 }, 3)).toEqual({ damage: 3, overflow: 1, broken: true });
    expect(damageAspect({ length: 5, damage: 0 }, 2)).toEqual({ damage: 2, overflow: 0, broken: false });
  });
  it("project and aspect lengths", () => {
    expect(projectLength("skill", 0)).toBe(3);
    expect(projectLength("skill", 2)).toBe(7);
    expect(projectLength("rating", 0)).toBe(1);
    expect(projectLength("campAspect")).toBe(8);
    expect(aspectLength([2, 1, 1])).toBe(4); // the book's dog companion example
  });
  it("danger and barter", () => {
    expect(dangerStart(undefined, 2)).toBe(6);
    expect(dangerStart(9, 3)).toBe(10);
    expect(barterValue("gear", { good: 1 })).toBe(3);
    expect(barterValue("map", { bad: 1 })).toBe(2);
  });
});
