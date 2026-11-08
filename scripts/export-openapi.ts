// Writes docs/travelway-gpt-actions.json from the same spec the API route serves. Run: bun scripts/export-openapi.ts
import { writeFileSync } from "node:fs";
import { openApiSpec } from "../src/lib/openapi-spec";
writeFileSync(new URL("../docs/travelway-gpt-actions.json", import.meta.url), JSON.stringify(openApiSpec, null, 2) + "\n");
