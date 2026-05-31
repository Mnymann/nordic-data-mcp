import { lookupCompany } from "./lookupCompany.js";
import { validateVat } from "./validateVat.js";
import { screenSanctions } from "./screenSanctions.js";
import { kybFull } from "./kybFull.js";
import { autocompleteAddress } from "./autocompleteAddress.js";
import { lookupLei } from "./lookupLei.js";
import { companyEnriched } from "./companyEnriched.js";
import { frHistory } from "./frHistory.js";
import { listEndpoints } from "./listEndpoints.js";
import { getEndpointSchema } from "./getEndpointSchema.js";
import { callEndpoint } from "./callEndpoint.js";
import type { McpTool } from "../types.js";

export const tools: McpTool[] = [
  // ── Curated, high-level tools (8) — unchanged ──
  lookupCompany,
  validateVat,
  screenSanctions,
  kybFull,
  autocompleteAddress,
  lookupLei,
  companyEnriched,
  frHistory,
  // ── Hybrid discovery meta-tools (3) — runtime access to the full API ──
  listEndpoints,
  getEndpointSchema,
  callEndpoint,
];

export {
  lookupCompany,
  validateVat,
  screenSanctions,
  kybFull,
  autocompleteAddress,
  lookupLei,
  companyEnriched,
  frHistory,
  listEndpoints,
  getEndpointSchema,
  callEndpoint,
};
