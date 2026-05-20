import { lookupCompany } from "./lookupCompany.js";
import { validateVat } from "./validateVat.js";
import { screenSanctions } from "./screenSanctions.js";
import { kybFull } from "./kybFull.js";
import { autocompleteAddress } from "./autocompleteAddress.js";
import { lookupLei } from "./lookupLei.js";
import { companyEnriched } from "./companyEnriched.js";
import type { McpTool } from "../types.js";

export const tools: McpTool[] = [
  lookupCompany,
  validateVat,
  screenSanctions,
  kybFull,
  autocompleteAddress,
  lookupLei,
  companyEnriched,
];

export {
  lookupCompany,
  validateVat,
  screenSanctions,
  kybFull,
  autocompleteAddress,
  lookupLei,
  companyEnriched,
};
