/**
 * Case 1 — Billing Support
 *
 * "Why was I charged twice? Please fix it now."
 *
 * Menggabungkan 2 pattern:
 * 1. Prompt Routing   - klasifikasikan dulu topik request (billing/technical/general)
 *                       sebelum memutuskan flow mana yang menangani.
 * 2. Agentic Workflow Decision - khusus di jalur billing, request menyangkut uang dan
 *                                aksi akun, jadi AI tidak boleh langsung menjanjikan refund.
 *                                AI harus memutuskan: verifikasi dulu, tanya detail, atau
 *                                serahkan ke manusia.
 */

import z from "zod";
import { createCompletion, createParsedCompletion } from "@anvia/core";
import { getModel } from "./utils";

const userMessage = "Why was I charged twice? Please fix it now.";

// Simulasi sesi customer yang sedang login
const currentCustomerId = "cust-01";

type Transaction = {
  transactionId: string;
  customerId: string;
  merchant: string;
  amount: number;
  currency: string;
  chargedAt: string;
  status: "captured" | "refunded" | "failed";
};

// Mock transactions
const mockTransactionDB: Transaction[] = [
  {
    transactionId: "trx-001",
    customerId: "cust-01",
    merchant: "CloudStream Pro",
    amount: 149000,
    currency: "IDR",
    chargedAt: "2026-07-28T09:12:00Z",
    status: "captured",
  },
  {
    transactionId: "trx-002",
    customerId: "cust-01",
    merchant: "CloudStream Pro",
    amount: 149000,
    currency: "IDR",
    chargedAt: "2026-07-28T09:12:41Z",
    status: "captured",
  },
  {
    transactionId: "trx-123",
    customerId: "cust-01",
    merchant: "CloudStream Pro",
    amount: 149000,
    currency: "IDR",
    chargedAt: "2026-06-28T09:10:00Z",
    status: "captured",
  },
  {
    transactionId: "trx-433",
    customerId: "cust-01",
    merchant: "FitTrack",
    amount: 89000,
    currency: "IDR",
    chargedAt: "2026-07-20T14:00:00Z",
    status: "captured",
  },
];

// Anggap "duplikat" jika merchant + amount sama dan jaraknya < 24 jam
function findDuplicateCharge(customerId: string) {
  const txns = mockTransactionDB.filter(
    (t) => t.customerId === customerId && t.status === "captured",
  );

  for (let i = 0; i < txns.length; i++) {
    for (let j = i + 1; j < txns.length; j++) {
      const a = txns[i]!;
      const b = txns[j]!;
      const sameCharge = a.merchant === b.merchant && a.amount === b.amount;
      const diffMs = Math.abs(
        new Date(a.chargedAt).getTime() - new Date(b.chargedAt).getTime(),
      );

      if (sameCharge && diffMs <= 1000 * 60 * 60 * 24) {
        return { first: a, second: b };
      }
    }
  }

  return null;
}

// 1. Prompt Routing - klasifikasikan topik request
const RouteSchema = z.object({
  category: z.enum(["billing_dispute", "technical_support", "general_inquiry"]),
  reason: z.string(),
});

const route = await createParsedCompletion(getModel(), {
  instructions: `
    Classify the customer message into one category:
    - billing_dispute: charges, payments, refunds, invoices
    - technical_support: bugs, errors, app/feature not working
    - general_inquiry: anything else
  `,
  input: `Customer message: "${userMessage}"`,
  schema: RouteSchema,
});

console.log("\n\nRoute:\n", route.data);

if (route.data.category !== "billing_dispute") {
  // Bukan billing, cukup jawab langsung
  const answer = await createCompletion(getModel(), {
    instructions: `You are a ${route.data.category} support agent. Answer briefly and helpfully.`,
    input: userMessage,
  });

  console.log("\n\nReply:\n", answer.text);
} else {
  // 2. Agentic Workflow Decision - keputusan sebelum menjawab request billing
  const DecisionSchema = z.object({
    action: z.enum([
      "verify_transaction",
      "escalate_to_human",
      "ask_clarifying_question",
    ]),
    reason: z.string(),
    clarifyingQuestion: z
      .string()
      .describe("Only fill this when action is ask_clarifying_question"),
  });

  const decision = await createParsedCompletion(getModel(), {
    instructions: `
      This is a billing dispute from an authenticated, logged-in customer. You (AI)
      must NOT promise a refund or take account actions directly - that requires
      verified evidence or a human.

      The customer's own recent charge history is directly available to check,
      no extra details from the customer are needed for that.

      Use verify_transaction whenever the dispute is about a charge that can be
      checked against the customer's own transaction history (e.g. duplicate,
      wrong amount, unrecognized charge).
      Use ask_clarifying_question only when the request itself is too vague to
      even know what to check (e.g. no mention of any charge or issue).
      Use escalate_to_human when the request needs a human decision beyond what
      transaction data can settle (e.g. a policy exception, complaint about staff).
    `,
    input: `Customer message: "${userMessage}"`,
    schema: DecisionSchema,
  });

  console.log("\n\Decision:\n", decision.data);

  let finalReply: string;

  if (decision.data.action === "verify_transaction") {
    const duplicate = findDuplicateCharge(currentCustomerId);

    if (duplicate) {
      console.log(
        "\nDuplicate confirmed:",
        duplicate.first.transactionId,
        duplicate.second.transactionId,
      );
      console.log("Creating refund escalation ticket for billing team...");

      const reply = await createCompletion(getModel(), {
        instructions:
          "Write a short, empathetic reply confirming the duplicate charge was found and that the billing team has been notified to process the refund. Mention no exact refund date since a human still needs to process it.",
        input: `Customer message: "${userMessage}"

Confirmed duplicate transactions: ${JSON.stringify(duplicate)}`,
      });

      finalReply = reply.text;
    } else {
      const reply = await createCompletion(getModel(), {
        instructions:
          "Write a short, empathetic reply explaining no duplicate charge was found in the last 24 hours on record, and ask the customer for the exact date and last 4 digits of the card to investigate further.",
        input: `Customer message: "${userMessage}"`,
      });

      finalReply = reply.text;
    }
  } else if (decision.data.action === "escalate_to_human") {
    console.log("Creating handoff ticket for billing team...");

    const reply = await createCompletion(getModel(), {
      instructions:
        "Write a short, empathetic reply letting the customer know this has been escalated to the billing team and a human will follow up.",
      input: `Customer message: "${userMessage}"`,
    });

    finalReply = reply.text;
  } else {
    finalReply = decision.data.clarifyingQuestion;
  }

  console.log("\n\nFinal reply to customer:\n", finalReply);
}
