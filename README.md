# AI Product Engineering with TypeScript - Assignment 1: AI Engineering Patterns

Three real-world cases, each solved by combining common AI engineering patterns
(prompt routing, guardrail & escalation, map-reduce summarization, structured
extraction, research extraction pipeline) using the [Anvia](https://anvia.dev/) SDK.

## Setup

```bash
pnpm install
```

Create a `.env` file (see `.env` for the required variables):

```
OPENROUTER_BASE_URL=
OPENROUTER_API_KEY=
TAVILY_API_KEY=
```

## Cases

### Case 1 — Billing Support (`src/case-1-billing-support.ts`)

> "Why was I charged twice? Please fix it now."

**Patterns:** Prompt Routing → Agentic Workflow Decision

The request is first routed by topic (`billing_dispute` / `technical_support` /
`general_inquiry`). Inside the billing branch, the AI cannot promise a refund or
take account actions directly, so it decides between `verify_transaction`,
`ask_clarifying_question`, or `escalate_to_human`. `verify_transaction` checks a
mock transaction table for a real duplicate charge before drafting a reply, so
the final answer depends on real evidence rather than the model guessing.

```bash
pnpm run case1
```

### Case 2 — Meeting Transcript (`src/case-2-meeting-transcript.ts`)

> "You receive a long meeting transcript and need decisions, risks, and action items."

**Patterns:** Map-Reduce Summarization → Structured Extraction

A sample meeting transcript is split into chunks, each chunk is extracted in
parallel into `{ decisions, risks, actionItems }` (map), and the results are
merged and deduplicated into one final structured summary (reduce).

```bash
pnpm run case2
```

### Case 3 — Company Profile (`src/case-3-company-profile.ts`)

> "A user gives a company name and asks for a short company profile with website and industry."

**Patterns:** Research Extraction Pipeline → Structured Extraction

The AI generates targeted search queries for the given company name, runs them
against Tavily's search API, then extracts a structured profile
`{ name, industry, website, shortProfile }` from the combined results.

```bash
pnpm run case3
```

## Project structure

```
04-first-assignment/
├── src/
│   ├── utils.ts                     # shared model client + Tavily client
│   ├── case-1-billing-support.ts
│   ├── case-2-meeting-minutes.ts
│   └── case-3-company-profile.ts
├── package.json
└── tsconfig.json
```
