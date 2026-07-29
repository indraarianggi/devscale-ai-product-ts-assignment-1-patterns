/**
 * Case 2 — Meeting Transcript
 *
 * "You receive a long meeting transcript and need decisions, risks, and action items."
 *
 * Menggabungkan 2 pattern:
 * 1. Map-Reduce Summarization - transcript dipecah jadi beberapa chunk (per topik),
 *                               tiap chunk di-summarize terpisah (map, dijalankan
 *                               paralel), lalu digabung jadi satu hasil akhir (reduce).
 * 2. Structured Extraction    - baik hasil per-chunk maupun hasil akhir mengikuti skema
 *                               {decisions, risks, actionItems}.
 */

import z from "zod";
import { createParsedCompletion } from "@anvia/core";
import { getModel } from "./utils";

const meetingTranscript = `
Meeting: Nimbus Product Sync — July 29, 2026
Attendees: Ari (PM), Bunga (Engineering Lead), Chandra (Design), Dewi (Marketing)

Ari: Let's start with the payment gateway migration. Bunga, where are we?

Bunga: We finished the sandbox integration with the new provider, Midtrans v2. The main risk is that our legacy webhook signature verification doesn't match their new format, so if we don't update it before cutover, we could silently drop payment confirmations in production. I think we need at least three more days to rewrite that handler and test it against their staging environment.

Ari: That's a real risk, let's not rush it. Decision: we push the payment gateway cutover from August 1st to August 5th to give engineering room to fix the webhook handler properly. Bunga, can you own rewriting the webhook verification logic and have it ready for QA by August 3rd?

Bunga: Yes, I'll take that.

Ari: Great, next topic — the mobile app performance issue reported by the support team.

Chandra: I looked into it. The issue is the product listing screen re-renders the entire list on every scroll event because we're not memoizing the row components. Users on older Android devices are seeing frame drops severe enough that some are leaving one-star reviews. This is becoming a real risk to our App Store rating, which affects new user acquisition.

Ari: Decision: this becomes a P1 fix for this sprint instead of next sprint as originally planned. Chandra, can you pair with whoever picks this up and have a fix ready for testing by Friday, August 1st?

Chandra: I'll coordinate with the mobile team and get that done.

Ari: Thanks. Dewi, how's the marketing launch timeline looking given the payment gateway delay?

Dewi: This is actually a risk on my end now. Our launch campaign, including paid ads and the influencer partnership, was scheduled around the original August 1st cutover date. If payments move to August 5th, we either delay the whole campaign or risk running ads that drive traffic to a broken checkout flow.

Ari: Let's not risk broken checkouts. Decision: marketing launch moves to August 6th, one day after the new payment cutover, to have a buffer for any last-minute issues. Dewi, can you notify the influencer partners and adjust the ad scheduling by end of week, July 31st?

Dewi: Understood, I'll handle the partner communication and ad scheduling change.

Ari: Last item — hiring. We're still down one backend engineer, and with the payment gateway rework, that's stretching Bunga's team thin. This is a staffing risk heading into launch, since Bunga's team is now absorbing extra work with less headcount than planned.

Bunga: Agreed, we need at least a contractor to help through launch, otherwise other roadmap items will slip.

Ari: Decision: we'll bring in a short-term contractor for six weeks to cover backend capacity through launch. I'll own reaching out to our staffing agency and have someone identified by August 4th.

Ari: Good, I think that covers everything for today. Thanks everyone.
`.trim();

// Pecah transcript jadi beberapa chunk berdasarkan batas paragraf, dibatasi maxChars per chunk
function chunkText(text: string, maxChars: number): string[] {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    if (
      current.length > 0 &&
      current.length + paragraph.length + 2 > maxChars
    ) {
      chunks.push(current);
      current = paragraph;
    } else {
      current = current ? `${current}\n\n${paragraph}` : paragraph;
    }
  }

  if (current) chunks.push(current);

  return chunks;
}

const MeetingChunkSchema = z.object({
  decisions: z
    .array(z.string())
    .describe("Concrete decisions explicitly made in this text"),
  risks: z.array(z.string()).describe("Risks explicitly raised in this text"),
  actionItems: z.array(
    z.object({
      owner: z.string(),
      task: z.string(),
      dueDate: z
        .string()
        .describe("Due date if mentioned, otherwise 'Not specified'"),
    }),
  ),
});

const chunks = chunkText(meetingTranscript, 700);
console.log(`\n\nSplit transcript into ${chunks.length} chunks.`);

// 1. Map - extract per chunk, in parallel
const chunkResults = await Promise.all(
  chunks.map(async (chunk, index) => {
    const result = await createParsedCompletion(getModel(), {
      instructions: `
        Extract only what is explicitly stated in this meeting transcript chunk.
        Leave arrays empty if none are found in this chunk. Do not invent information.
      `,
      input: `Chunk ${index + 1}:\n${chunk}`,
      schema: MeetingChunkSchema,
    });

    return result.data;
  }),
);

console.log(
  "\n\nPer-chunk extraction:\n",
  JSON.stringify(chunkResults, null, 2),
);

// 2. Reduce - merge all chunk results, then clean up with one final call
const merged = {
  decisions: chunkResults.flatMap((c) => c.decisions),
  risks: chunkResults.flatMap((c) => c.risks),
  actionItems: chunkResults.flatMap((c) => c.actionItems),
};

const finalSummary = await createParsedCompletion(getModel(), {
  instructions: `
    Merge and clean up these extracted meeting notes. Remove duplicates, merge
    near-identical items, and keep the wording concise.
  `,
  input: JSON.stringify(merged, null, 2),
  schema: MeetingChunkSchema,
});

console.log("\n\nFinal meeting summary:\n");
console.dir(finalSummary.data, { depth: null });
