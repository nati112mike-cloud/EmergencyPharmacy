import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { FinanceAccountType, FinanceTransactionType, PaymentStatus } from "@/lib/types";

export type AccountWithBalance = {
  id: string;
  type: FinanceAccountType;
  name: string;
  bankName: string | null;
  accountNumber: string | null;
  openingBalance: number;
  archived: boolean;
  balance: number;
};

/** Every account with its current balance — always computed from the ledger, never stored. */
export async function getFinanceAccounts(opts: { includeArchived?: boolean } = {}): Promise<AccountWithBalance[]> {
  const accounts = await prisma.financeAccount.findMany({
    where: opts.includeArchived ? undefined : { archived: false },
    include: { transactions: { select: { amount: true } } },
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });
  return accounts.map((a) => ({
    id: a.id,
    type: a.type as FinanceAccountType,
    name: a.name,
    bankName: a.bankName,
    accountNumber: a.accountNumber,
    openingBalance: a.openingBalance,
    archived: a.archived,
    balance: a.openingBalance + a.transactions.reduce((s, t) => s + t.amount, 0),
  }));
}

export async function getAccountBalance(accountId: string): Promise<number> {
  const [account, agg] = await Promise.all([
    prisma.financeAccount.findUniqueOrThrow({ where: { id: accountId } }),
    prisma.financeTransaction.aggregate({ where: { accountId }, _sum: { amount: true } }),
  ]);
  return account.openingBalance + (agg._sum.amount ?? 0);
}

export async function createFinanceAccount(data: {
  type: FinanceAccountType;
  name: string;
  bankName?: string;
  accountNumber?: string;
  openingBalance?: number;
}) {
  return prisma.financeAccount.create({
    data: {
      type: data.type,
      name: data.name,
      bankName: data.bankName || null,
      accountNumber: data.accountNumber || null,
      openingBalance: data.openingBalance ?? 0,
    },
  });
}

/**
 * Lazily creates a well-known account (Cash Drawer, Telebirr) the first
 * time it's needed, so POS/deposit flows work without forcing the admin to
 * pre-provision them — they can still rename/manage it afterward like any
 * other account.
 */
export async function getOrCreateAccount(type: FinanceAccountType, name: string) {
  const existing = await prisma.financeAccount.findFirst({ where: { type, name } });
  if (existing) return existing;
  return prisma.financeAccount.create({ data: { type, name } });
}

/**
 * Posts one ledger entry — the building block every other finance function
 * composes with. Exported (not just used internally) so callers that need
 * to post a transaction inside their own prisma.$transaction — e.g.
 * lib/payments.ts marking a bill paid and debiting an account atomically —
 * can pass their own `tx` instead of going through a separate transaction.
 */
export async function postFinanceTransaction(
  tx: Prisma.TransactionClient,
  data: {
    accountId: string;
    type: FinanceTransactionType;
    amount: number;
    reference?: string;
    saleId?: string;
    transferGroupId?: string;
    performedBy?: string;
  }
) {
  return tx.financeTransaction.create({
    data: {
      accountId: data.accountId,
      type: data.type,
      amount: data.amount,
      reference: data.reference,
      saleId: data.saleId,
      transferGroupId: data.transferGroupId,
      performedBy: data.performedBy,
    },
  });
}

/** Posts a sale's proceeds directly into an account (bank transfer / Telebirr — money's already arrived). */
export async function postSaleTransaction(
  saleId: string,
  accountId: string,
  amount: number,
  performedBy?: string
) {
  return postFinanceTransaction(prisma, {
    accountId,
    type: "SALE",
    amount,
    reference: `Sale ${saleId}`,
    saleId,
    performedBy,
  });
}

/**
 * Cash deposited into a bank — the standard "move money between my own
 * accounts" operation, recorded as two linked legs (debit the source,
 * credit the destination) rather than one number, so both accounts stay
 * independently auditable and cross-checkable against each other.
 */
export async function recordCashDeposit(data: {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  note?: string;
  performedBy?: string;
}) {
  if (data.amount <= 0) throw new Error("Deposit amount must be positive");
  if (data.fromAccountId === data.toAccountId) throw new Error("Source and destination must differ");

  return prisma.$transaction(async (tx) => {
    const transferGroupId = crypto.randomUUID();
    const out = await postFinanceTransaction(tx, {
      accountId: data.fromAccountId,
      type: "CASH_DEPOSIT",
      amount: -data.amount,
      reference: data.note,
      transferGroupId,
      performedBy: data.performedBy,
    });
    const inn = await postFinanceTransaction(tx, {
      accountId: data.toAccountId,
      type: "CASH_DEPOSIT",
      amount: data.amount,
      reference: data.note,
      transferGroupId,
      performedBy: data.performedBy,
    });
    return { out, in: inn };
  });
}

export type CreditSaleSummary = {
  saleId: string;
  saleDate: Date;
  creditorName: string;
  totalAmount: number;
  cashierName: string | null;
};

/** Credit (loan) sales still awaiting collection, oldest first. */
export async function getOutstandingCreditSales(): Promise<CreditSaleSummary[]> {
  const sales = await prisma.sale.findMany({
    where: { paymentMethod: "CREDIT", creditPaymentStatus: "UNPAID" },
    orderBy: { saleDate: "asc" },
  });
  return sales.map((s) => ({
    saleId: s.id,
    saleDate: s.saleDate,
    creditorName: s.creditorName ?? "Unknown",
    totalAmount: s.totalAmount,
    cashierName: s.cashierName,
  }));
}

/** Marks a credit sale collected and posts the money into whichever account it was collected into. */
export async function collectCreditSale(saleId: string, accountId: string, performedBy?: string) {
  return prisma.$transaction(async (tx) => {
    const sale = await tx.sale.findUnique({ where: { id: saleId } });
    if (!sale) throw new Error("Sale not found");
    if (sale.paymentMethod !== "CREDIT") throw new Error("This sale wasn't a credit sale");
    if (sale.creditPaymentStatus === "PAID") throw new Error("Already marked collected");

    await tx.sale.update({
      where: { id: saleId },
      data: { creditPaymentStatus: "PAID" as PaymentStatus, creditPaidDate: new Date() },
    });

    return postFinanceTransaction(tx, {
      accountId,
      type: "CREDIT_COLLECTED",
      amount: sale.totalAmount,
      reference: `Collected credit sale ${saleId} (${sale.creditorName ?? "unknown"})`,
      saleId,
      performedBy,
    });
  });
}

export type LedgerEntry = {
  id: string;
  type: FinanceTransactionType;
  amount: number;
  reference: string | null;
  performedBy: string | null;
  createdAt: Date;
};

export async function getAccountLedger(accountId: string, limit = 200): Promise<LedgerEntry[]> {
  const rows = await prisma.financeTransaction.findMany({
    where: { accountId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map((r) => ({
    id: r.id,
    type: r.type as FinanceTransactionType,
    amount: r.amount,
    reference: r.reference,
    performedBy: r.performedBy,
    createdAt: r.createdAt,
  }));
}
