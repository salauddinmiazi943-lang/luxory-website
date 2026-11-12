import type { PipelineStage, Types } from "mongoose";
import { AccountParty } from "@/models/account-party";
import { AccountTransaction } from "@/models/account-transaction";

const activeTransactionMatch = {
  $or: [{ voidedAt: { $exists: false } }, { voidedAt: null }],
};

export function parseDhakaDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error("তারিখ YYYY-MM-DD ফরম্যাটে দিন।");
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const utcCalendar = new Date(Date.UTC(year, month - 1, day));
  if (utcCalendar.getUTCFullYear() !== year || utcCalendar.getUTCMonth() !== month - 1 || utcCalendar.getUTCDate() !== day) {
    throw new Error("তারিখটি ক্যালেন্ডার অনুযায়ী বৈধ নয়।");
  }
  return new Date(Date.UTC(year, month - 1, day) - 6 * 60 * 60 * 1000);
}

export function getDhakaDayRange(value: string) {
  const start = parseDhakaDate(value);
  return { start, end: new Date(start.getTime() + 86_400_000) };
}

function amountSummaryPipeline(match: Record<string, unknown>) {
  return [
    { $match: match },
    { $group: {
      _id: null,
      sales: { $sum: { $cond: [{ $eq: ["$type", "sale"] }, "$amount", 0] } },
      saleReceived: { $sum: { $cond: [{ $eq: ["$type", "sale"] }, "$paidAmount", 0] } },
      collections: { $sum: { $cond: [{ $eq: ["$type", "due_collection"] }, "$amount", 0] } },
      purchases: { $sum: { $cond: [{ $eq: ["$type", "purchase"] }, "$amount", 0] } },
      purchasePaid: { $sum: { $cond: [{ $eq: ["$type", "purchase"] }, "$paidAmount", 0] } },
      supplierPayments: { $sum: { $cond: [{ $eq: ["$type", "payment"] }, "$amount", 0] } },
      expenses: { $sum: { $cond: [{ $eq: ["$type", "expense"] }, "$amount", 0] } },
    } },
  ] as PipelineStage[];
}

function cashMovementExpression() {
  return { $switch: { branches: [
    { case: { $eq: ["$type", "sale"] }, then: "$paidAmount" },
    { case: { $eq: ["$type", "due_collection"] }, then: "$amount" },
    { case: { $eq: ["$type", "purchase"] }, then: { $multiply: ["$paidAmount", -1] } },
    { case: { $eq: ["$type", "expense"] }, then: { $multiply: ["$amount", -1] } },
    { case: { $eq: ["$type", "payment"] }, then: { $multiply: ["$amount", -1] } },
  ], default: 0 } };
}

function cashByMethodPipeline(match: Record<string, unknown>) {
  return [
    { $match: match },
    { $group: { _id: "$paymentMethod", balance: { $sum: cashMovementExpression() } } },
  ] as PipelineStage[];
}

function partyBalancePipeline(match: Record<string, unknown>, partyCollection: string) {
  return [
    { $match: match },
    { $lookup: { from: partyCollection, localField: "partyId", foreignField: "_id", as: "party" } },
    { $unwind: { path: "$party", preserveNullAndEmptyArrays: true } },
    { $group: {
      _id: "$party.type",
      customerBalance: { $sum: { $switch: { branches: [
        { case: { $eq: ["$type", "sale"] }, then: "$dueAmount" },
        { case: { $eq: ["$type", "due_collection"] }, then: { $multiply: ["$amount", -1] } },
        { case: { $and: [{ $eq: ["$type", "opening_balance"] }, { $eq: ["$balanceSide", "receivable"] }] }, then: "$amount" },
      ], default: 0 } } },
      supplierBalance: { $sum: { $switch: { branches: [
        { case: { $eq: ["$type", "purchase"] }, then: "$dueAmount" },
        { case: { $eq: ["$type", "payment"] }, then: { $multiply: ["$amount", -1] } },
        { case: { $and: [{ $eq: ["$type", "opening_balance"] }, { $eq: ["$balanceSide", "payable"] }] }, then: "$amount" },
      ], default: 0 } } },
    } },
  ] as PipelineStage[];
}

function asNumber(value: unknown) { return Number(value ?? 0); }

export async function getDailyAccountsData(date: string) {
  const { start, end } = getDhakaDayRange(date);
  const beforeMatch = { ...activeTransactionMatch, date: { $lt: start } };
  const dayMatch = { ...activeTransactionMatch, date: { $gte: start, $lt: end } };
  const throughMatch = { ...activeTransactionMatch, date: { $lt: end } };
  const todayOpeningMatch = { ...activeTransactionMatch, type: "opening_balance", balanceSide: "cash", date: { $gte: start, $lt: end } };
  const [beforeCash, dayCash, sameDayOpening, beforeSummary, dailySummary, balances, transactions, parties, categories] = await Promise.all([
    AccountTransaction.aggregate(cashByMethodPipeline(beforeMatch)),
    AccountTransaction.aggregate(cashByMethodPipeline(dayMatch)),
    AccountTransaction.aggregate([{ $match: todayOpeningMatch }, { $group: { _id: "$paymentMethod", balance: { $sum: "$amount" } } }]),
    AccountTransaction.aggregate(amountSummaryPipeline(beforeMatch)),
    AccountTransaction.aggregate(amountSummaryPipeline(dayMatch)),
    AccountTransaction.aggregate(partyBalancePipeline(throughMatch, AccountParty.collection.name)),
    AccountTransaction.find(dayMatch).sort({ date: 1, createdAt: 1 }).populate("partyId", "name type").populate("category", "name type").lean(),
    AccountParty.find({}).sort({ type: 1, name: 1 }).select("name phone type").lean(),
    (await import("@/models/account-category")).AccountCategory.find({}).sort({ type: 1, name: 1 }).lean(),
  ]);
  const beforeCashByMethod = Object.fromEntries(beforeCash.map((row: { _id: string; balance: number }) => [row._id ?? "other", asNumber(row.balance)]));
  const dayCashByMethod = Object.fromEntries(dayCash.map((row: { _id: string; balance: number }) => [row._id ?? "other", asNumber(row.balance)]));
  const sameDayOpeningByMethod = Object.fromEntries(sameDayOpening.map((row: { _id: string; balance: number }) => [row._id ?? "other", asNumber(row.balance)]));
  const methods = ["cash", "bkash", "nagad", "rocket", "bank", "other"];
  const cashBalances = methods.map((method) => ({
    method,
    opening: (beforeCashByMethod[method] ?? 0) + (sameDayOpeningByMethod[method] ?? 0),
    movement: dayCashByMethod[method] ?? 0,
    closing: (beforeCashByMethod[method] ?? 0) + (dayCashByMethod[method] ?? 0),
  }));
  const before = beforeSummary[0] ?? {};
  const today = dailySummary[0] ?? {};
  const customerReceivable = balances.find((row: { _id?: string }) => row._id === "customer");
  const supplierPayable = balances.find((row: { _id?: string }) => row._id === "supplier");
  return {
    date,
    summary: {
      sales: asNumber(today.sales), saleReceived: asNumber(today.saleReceived), collections: asNumber(today.collections),
      purchases: asNumber(today.purchases), purchasePaid: asNumber(today.purchasePaid), supplierPayments: asNumber(today.supplierPayments),
      expenses: asNumber(today.expenses),
      cashIn: asNumber(today.saleReceived) + asNumber(today.collections),
      cashOut: asNumber(today.purchasePaid) + asNumber(today.supplierPayments) + asNumber(today.expenses),
      openingCash: cashBalances.reduce((sum, row) => sum + row.opening, 0),
      closingCash: cashBalances.reduce((sum, row) => sum + row.closing, 0),
      customerReceivable: asNumber(customerReceivable?.customerBalance),
      supplierPayable: asNumber(supplierPayable?.supplierBalance),
      profitLoss: null as number | null,
      profitLossNote: "পণ্যের প্রকৃত ক্রয়মূল্য (COGS) সংরক্ষিত নেই; তাই প্রকৃত লাভ-ক্ষতি নির্ণয় করা যাচ্ছে না।",
      previousPeriodTotals: { sales: asNumber(before.sales), expenses: asNumber(before.expenses) },
    },
    cashBalances,
    transactions,
    parties,
    categories,
  };
}

export async function getPartyLedger(partyId: Types.ObjectId, partyType: string, from?: string, to?: string) {
  const start = from ? parseDhakaDate(from) : undefined;
  const end = to ? new Date(parseDhakaDate(to).getTime() + 86_400_000) : undefined;
  if (start && end && start >= end) throw new Error("শুরুর তারিখ শেষ তারিখের পরে হতে পারবে না।");
  const deltaExpression = partyType === "customer"
    ? { $switch: { branches: [
      { case: { $eq: ["$type", "sale"] }, then: "$dueAmount" },
      { case: { $eq: ["$type", "due_collection"] }, then: { $multiply: ["$amount", -1] } },
      { case: { $and: [{ $eq: ["$type", "opening_balance"] }, { $eq: ["$balanceSide", "receivable"] }] }, then: "$amount" },
    ], default: 0 } }
    : { $switch: { branches: [
      { case: { $eq: ["$type", "purchase"] }, then: "$dueAmount" },
      { case: { $eq: ["$type", "payment"] }, then: { $multiply: ["$amount", -1] } },
      { case: { $and: [{ $eq: ["$type", "opening_balance"] }, { $eq: ["$balanceSide", "payable"] }] }, then: "$amount" },
    ], default: 0 } };
  const baseMatch = { ...activeTransactionMatch, partyId };
  const beforeFilter = { ...baseMatch, ...(start ? { date: { $lt: start } } : { _id: { $exists: false } }) };
  const throughFilter = { ...baseMatch, ...(end ? { date: { $lt: end } } : {}) };
  const entryFilter = { ...baseMatch, ...(start || end ? { date: { ...(start ? { $gte: start } : {}), ...(end ? { $lt: end } : {}) } } : {}) };
  const sumPipeline = (match: Record<string, unknown>) => [{ $match: match }, { $group: { _id: null, balance: { $sum: deltaExpression } } }] as PipelineStage[];
  const [openingRows, closingRows, entryRows] = await Promise.all([
    AccountTransaction.aggregate(sumPipeline(beforeFilter)),
    AccountTransaction.aggregate(sumPipeline(throughFilter)),
    AccountTransaction.find(entryFilter).sort({ date: 1, createdAt: 1 }).populate("category", "name").lean(),
  ]);
  let running = asNumber(openingRows[0]?.balance);
  const entries = entryRows.map((entry: Record<string, unknown>) => {
    const type = String(entry.type);
    const delta = partyType === "customer"
      ? type === "sale" ? asNumber(entry.dueAmount) : type === "due_collection" ? -asNumber(entry.amount) : type === "opening_balance" && entry.balanceSide === "receivable" ? asNumber(entry.amount) : 0
      : type === "purchase" ? asNumber(entry.dueAmount) : type === "payment" ? -asNumber(entry.amount) : type === "opening_balance" && entry.balanceSide === "payable" ? asNumber(entry.amount) : 0;
    running += delta;
    return { ...entry, balanceDelta: delta, runningBalance: running };
  });
  return { openingBalance: asNumber(openingRows[0]?.balance), entries, closingBalance: asNumber(closingRows[0]?.balance) };
}
