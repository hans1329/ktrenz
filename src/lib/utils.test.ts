import { describe, it, expect } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("joins simple class strings", () => {
    expect(cn("a", "b", "c")).toBe("a b c");
  });

  it("ignores falsy values", () => {
    expect(cn("a", false, null, undefined, "", "b")).toBe("a b");
  });

  it("flattens arrays", () => {
    expect(cn(["a", "b"], "c")).toBe("a b c");
  });

  it("supports object syntax (clsx)", () => {
    expect(cn({ a: true, b: false, c: true })).toBe("a c");
  });

  it("merges conflicting Tailwind classes — last wins (twMerge)", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
    expect(cn("text-sm text-lg")).toBe("text-lg");
    expect(cn("bg-red-500", "bg-blue-500")).toBe("bg-blue-500");
  });

  it("preserves non-conflicting Tailwind classes", () => {
    expect(cn("p-2", "m-4", "text-white")).toBe("p-2 m-4 text-white");
  });

  it("conditional + merge together", () => {
    const isActive = true;
    expect(cn("p-2", isActive && "p-4", "text-white")).toBe("p-4 text-white");
  });
});
