import type { PipelineStage, Types } from "mongoose";
import mongoose from "mongoose";
import { AccountTransaction } from "@/models/account-transaction";
import { dateRange } from "@/lib/accounts/money";

export type AccountReportPeriod = "day" | "week" | "month" | "year";

function transactionDateMatch(start?: Date, endExclusive?: Date) {
  return {
    ...(start || endExclusive ? { date: { ...(start ? { $gte: start } : {}), ...(endExclusive ? { $lt: endExclusive } : {}) } } : {}),
  };
}

export function buildAccountReportPipeline(input: {
  from?: string;
  to?: string;
  period: AccountReportPeriod;
  categoryId?: string;
}) {
  if (!["day", "week", "month", "year"].includes(input.period)) throw new Error("রিপোর্টের সময়সীমা সঠিক নয়।");
  const { start, endExclusive } = dateRange(input.from, input.to);
  if (input.categoryId && !mongoose.isValidObjectId(input.categoryId)) throw new Error("খাত সঠিক নয়।");
  const categoryId = input.categoryId ? new mongoose.Types.ObjectId(input.categoryId) : undefined;
  const baseMatch = transactionDateMatch(start, endExclusive);
  const expenseMatch = {
    ...baseMatch,
    type: "expense",
    ...(categoryId ? { category: categoryId } : {}),
  };
  const receivableMatch = transactionDateMatch(undefined, endExclusive);

  return [
    {
      $facet: {
        summary: [
          { $match: baseMatch },
          {
            $group: {
              _id: null,
              totalSales: { $sum: { $cond: [{ $eq: ["$type", "sale"] }, "$amount", 0] } },
              saleReceived: { $sum: { $cond: [{ $eq: ["$type", "sale"] }, "$paidAmount", 0] } },
              dueCollected: { $sum: { $cond: [{ $eq: ["$type", "due_collection"] }, "$amount", 0] } },
              totalExpenses: { $sum: { $cond: [{ $and: [{ $eq: ["$type", "expense"] }, ...(categoryId ? [{ $eq: ["$category", categoryId] }] : [])] }, "$amount", 0] } },
              totalPayments: { $sum: { $cond: [{ $eq: ["$type", "payment"] }, "$amount", 0] } },
            },
          },
          { $project: { _id: 0, totalSales: 1, saleReceived: 1, dueCollected: 1, totalExpenses: 1, totalPayments: 1, profitLoss: { $subtract: ["$totalSales", "$totalExpenses"] } } },
        ],
        series: [
          { $match: baseMatch },
          {
            $group: {
              _id: { $dateTrunc: { date: "$date", unit: input.period, timezone: "Asia/Dhaka", ...(input.period === "week" ? { startOfWeek: "monday" } : {}) } },
              sales: { $sum: { $cond: [{ $eq: ["$type", "sale"] }, "$amount", 0] } },
              expenses: { $sum: { $cond: [{ $and: [{ $eq: ["$type", "expense"] }, ...(categoryId ? [{ $eq: ["$category", categoryId] }] : [])] }, "$amount", 0] } },
              payments: { $sum: { $cond: [{ $eq: ["$type", "payment"] }, "$amount", 0] } },
            },
          },
          { $project: { date: "$_id", _id: 0, sales: 1, expenses: 1, payments: 1, profitLoss: { $subtract: ["$sales", "$expenses"] } } },
          { $sort: { date: 1 } },
        ],
        expenseCategories: [
          { $match: expenseMatch },
          { $group: { _id: "$category", total: { $sum: "$amount" } } },
          { $sort: { total: -1 } },
        ],
        receivables: [
          { $match: receivableMatch },
          {
            $group: {
              _id: null,
              saleDue: { $sum: { $cond: [{ $eq: ["$type", "sale"] }, "$dueAmount", 0] } },
              dueCollected: { $sum: { $cond: [{ $eq: ["$type", "due_collection"] }, "$amount", 0] } },
            },
          },
          { $project: { _id: 0, totalDue: { $max: [0, { $subtract: ["$saleDue", "$dueCollected"] }] } } },
        ],
      },
    },
  ] as PipelineStage[];
}

export async function getAccountsReport(input: {
  from?: string;
  to?: string;
  period: AccountReportPeriod;
  categoryId?: string;
}) {
  return AccountTransaction.aggregate(buildAccountReportPipeline(input));
}

export function buildPartyStatementPipeline(input: {
  partyId: Types.ObjectId;
  from?: string;
  to?: string;
}) {
  const { start, endExclusive } = dateRange(input.from, input.to);
  const partyMatch = { partyId: input.partyId };
  const throughEndMatch = transactionDateMatch(undefined, endExclusive);
  const periodMatch = transactionDateMatch(start, endExclusive);
  return [
    { $match: partyMatch },
    {
      $facet: {
        opening: [
          start ? { $match: { date: { $lt: start } } } : { $match: { _id: { $exists: false } } },
          {
            $group: {
              _id: null,
              due: { $sum: { $cond: [{ $eq: ["$type", "sale"] }, "$dueAmount", { $cond: [{ $eq: ["$type", "due_collection"] }, { $multiply: ["$amount", -1] }, 0] }] } },
              paidOut: { $sum: { $cond: [{ $in: ["$type", ["expense", "payment"]] }, "$amount", 0] } },
            },
          },
        ],
        entries: [
          { $match: periodMatch },
          { $sort: { date: 1, createdAt: 1 } },
          {
            $project: {
              type: 1, amount: 1, paidAmount: 1, dueAmount: 1, category: 1, partyId: 1,
              partyName: 1, paymentMethod: 1, note: 1, date: 1, createdAt: 1,
              dueDelta: { $cond: [{ $eq: ["$type", "sale"] }, "$dueAmount", { $cond: [{ $eq: ["$type", "due_collection"] }, { $multiply: ["$amount", -1] }, 0] }] },
              paidOutDelta: { $cond: [{ $in: ["$type", ["expense", "payment"]] }, "$amount", 0] },
            },
          },
        ],
        closing: [
          { $match: throughEndMatch },
          {
            $group: {
              _id: null,
              due: { $sum: { $cond: [{ $eq: ["$type", "sale"] }, "$dueAmount", { $cond: [{ $eq: ["$type", "due_collection"] }, { $multiply: ["$amount", -1] }, 0] }] } },
              paidOut: { $sum: { $cond: [{ $in: ["$type", ["expense", "payment"]] }, "$amount", 0] } },
            },
          },
        ],
      },
    },
  ] as PipelineStage[];
}

export async function getPartyStatement(input: {
  partyId: Types.ObjectId;
  from?: string;
  to?: string;
}) {
  const [result] = await AccountTransaction.aggregate(buildPartyStatementPipeline(input));
  const opening = result?.opening?.[0] ?? { due: 0, paidOut: 0 };
  let dueBalance = Number(opening.due ?? 0);
  let totalPaidOut = Number(opening.paidOut ?? 0);
  const entries = (result?.entries ?? []).map((entry: { dueDelta?: number; paidOutDelta?: number }) => {
    dueBalance += Number(entry.dueDelta ?? 0);
    totalPaidOut += Number(entry.paidOutDelta ?? 0);
    return { ...entry, runningDue: dueBalance, runningPaidOut: totalPaidOut };
  });
  const closing = result?.closing?.[0] ?? { due: dueBalance, paidOut: totalPaidOut };
  return {
    openingDue: Number(opening.due ?? 0),
    openingPaidOut: Number(opening.paidOut ?? 0),
    entries,
    closingDue: Number(closing.due ?? 0),
    closingPaidOut: Number(closing.paidOut ?? 0),
  };
}
