import { describe, expect, it } from "vitest";
import { fmtQty, lineText, mmss, unitPrice } from "@/lib/units";

describe("fmtQty", () => {
  it("shows weights and volumes in small units below one", () => {
    expect(fmtQty(0.25, "kg")).toBe("250 g");
    expect(fmtQty(1.5, "kg")).toBe("1.5 kg");
    expect(fmtQty(0.5, "litre")).toBe("500 ml");
    expect(fmtQty(2, "litre")).toBe("2 L");
  });
  it("speaks units in full words", () => {
    expect(fmtQty(0.5, "kg", true)).toBe("500 grams");
    expect(fmtQty(1, "litre", true)).toBe("1 litre");
  });
  it("pluralises packets and leaves counts plain", () => {
    expect(fmtQty(1, "packet")).toBe("1 packet");
    expect(fmtQty(3, "packet")).toBe("3 packets");
    expect(fmtQty(2, "plate")).toBe("2");
  });
});
describe("text helpers", () => {
  it("lineText includes the note", () => expect(lineText({ qty: 2, unit: "plate", name: "Dosa", note: "less oil" })).toBe("2 Dosa (less oil)"));
  it("unitPrice hides the unit for count items", () => {
    expect(unitPrice({ price: 60, unit: "plate" })).toBe("₹60");
    expect(unitPrice({ price: 80, unit: "kg" })).toBe("₹80/kg");
  });
  it("mmss pads and clamps", () => {
    expect(mmss(65_000)).toBe("01:05");
    expect(mmss(-5)).toBe("00:00");
  });
});
