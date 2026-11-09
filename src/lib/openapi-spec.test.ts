// @ts-nocheck -- run with `bun test`
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { openApiSpec } from "./openapi-spec";

test("exported docs file matches the served spec", () => {
  expect(JSON.parse(readFileSync(new URL("../../docs/travelway-gpt-actions.json", import.meta.url), "utf8"))).toEqual(JSON.parse(JSON.stringify(openApiSpec)));
});
test("Actions constraints: descriptions <=300, objects have properties, no nullable, 6 operations", () => {
  const ops = Object.values(openApiSpec.paths).flatMap((m) => Object.values(m));
  expect(ops.map((o) => o.operationId).sort()).toEqual(["getTripContext", "proposeChecklistChanges", "proposeDayReplacement", "proposeDocumentChanges", "proposeExpenseChanges", "proposeItineraryChanges"]);
  for (const o of ops) expect((o.description ?? "").length).toBeLessThanOrEqual(300);
  const walk = (x) => { if (x && typeof x === "object") { if (x.type === "object") expect(x.properties).toBeDefined(); expect("nullable" in x).toBe(false); Object.values(x).forEach(walk); } };
  walk(openApiSpec);
  expect(openApiSpec.openapi).toBe("3.1.0");
});
