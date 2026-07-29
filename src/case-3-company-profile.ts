/**
 * Case 3 — Company Profile
 *
 * "A user gives a company name and asks for a short company profile with website
 * and industry."
 *
 * Menggabungkan 2 pattern:
 * 1. Research Extraction Pipeline - generate search queries dari nama perusahaan,
 *                                   lalu jalankan pencarian internet (Tavily) untuk tiap query.
 * 2. Structured Extraction        - hasil pencarian diekstrak ke skema
 *                                   {name, industry, website, shortProfile}.
 */

import z from "zod";
import { createParsedCompletion } from "@anvia/core";
import { getModel, tavilyClient } from "./utils";

const companyName = "Traveloka";

const SearchQueriesSchema = z.object({
  queries: z
    .array(z.string())
    .describe("List of search queries to be performed"),
});

// 1. Generate search queries relevant to the company
const queriesResult = await createParsedCompletion(getModel(), {
  instructions: `
    You are researching a company to build a short company profile.
    Generate 3 to 4 focused search queries to find: what the company does,
    its industry, and its official website.
  `,
  input: `Company name: ${companyName}`,
  schema: SearchQueriesSchema,
});

console.log("\n\nSearch queries:\n", queriesResult.data.queries);

// 2. Run the queries using Tavily
const searchResults = await Promise.all(
  queriesResult.data.queries.map((query) =>
    tavilyClient.search(query, { searchDepth: "basic" }),
  ),
);

// 3. Extract a structured company profile from the combined search results
const CompanyProfileSchema = z.object({
  name: z.string().describe("Official company name"),
  industry: z.string().describe("Primary industry the company operates in"),
  website: z.string().describe("Official company website URL"),
  shortProfile: z
    .string()
    .describe("2-3 sentence summary of what the company does"),
});

const profile = await createParsedCompletion(getModel(), {
  instructions: `
    Extract a short company profile from the search results below.
    If a field truly cannot be found, return 'NONE' for that field without quotes.
  `,
  input: `Company name: ${companyName}

Search results: ${JSON.stringify(searchResults.map((r) => r.results))}`,
  schema: CompanyProfileSchema,
});

console.log("\n\nCompany profile:\n");
console.dir(profile.data, { depth: null });
