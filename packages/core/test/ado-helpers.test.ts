import { describe, expect, it } from "vitest";
import { adoWorkItemUrl, extractAdoWorkItemIds } from "../src/integrations/ado/tools.js";

describe("extractAdoWorkItemIds", () => {
  it("returns an empty array for text with no references", () => {
    expect(extractAdoWorkItemIds("nothing here")).toEqual([]);
    expect(extractAdoWorkItemIds("")).toEqual([]);
  });

  it("extracts a single AB#NNNN reference", () => {
    expect(extractAdoWorkItemIds("fixes AB#1234")).toEqual([1234]);
  });

  it("extracts multiple references and dedupes (first occurrence wins)", () => {
    expect(
      extractAdoWorkItemIds("relates to AB#1, AB#2, and again AB#1"),
    ).toEqual([1, 2]);
  });

  it("scans across multi-line input (title + body concatenation case)", () => {
    const text = "Fix the thing (AB#5)\n\nDetails about AB#6 here.";
    expect(extractAdoWorkItemIds(text)).toEqual([5, 6]);
  });

  it("does NOT match bare #NNNN (collides with GitHub issue refs)", () => {
    expect(extractAdoWorkItemIds("closes #42 and #99")).toEqual([]);
  });

  it("requires word boundary before AB — won't match LABABC#1234", () => {
    expect(extractAdoWorkItemIds("LABAB#1234 is not a work item")).toEqual([]);
  });

  it("requires digits after AB# — AB#abc doesn't match", () => {
    expect(extractAdoWorkItemIds("AB#abc")).toEqual([]);
  });

  it("rejects implausibly long numeric tails (>9 digits) silently", () => {
    expect(extractAdoWorkItemIds("AB#12345678901")).toEqual([]);
  });
});

describe("adoWorkItemUrl", () => {
  it("composes the workitems/edit/:id URL", () => {
    expect(adoWorkItemUrl("https://dev.azure.com/acme", 1234)).toBe(
      "https://dev.azure.com/acme/_workitems/edit/1234",
    );
  });

  it("strips a trailing slash from the org URL", () => {
    expect(adoWorkItemUrl("https://dev.azure.com/acme/", 5)).toBe(
      "https://dev.azure.com/acme/_workitems/edit/5",
    );
  });
});
