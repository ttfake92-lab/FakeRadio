import { describe, expect, it } from "vitest";
import rootPackage from "../package.json";

describe("repository baseline", () => {
  it("identifies the FakeRadio root package", () => {
    expect(rootPackage.name).toBe("fakeradio");
    expect(rootPackage.private).toBe(true);
  });
});
