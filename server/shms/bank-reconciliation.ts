/**
 * SHMS Module 10 — Bank Reconciliation (Financeiro/Budget Tracking)
 * MOTHER v7 | server/shms/bank-reconciliation.ts
 *
 * Scientific basis:
 * - Double-entry bookkeeping (Pacioli, 1494) — every transaction has debit + credit
 * - Budget variance analysis: Earned Value Management (PMBOK 7th ed., §4.5)
 * - Cost Performance Index (CPI) = EV/AC; Schedule Performance Index (SPI) = EV/PV
 * - Brazilian accounting standards: CFC NBC TG 00 (conceptual framework)
 */

// ============================================================
// Types
// ============================================================

export type TransactionType =
  | 'budget_allocation'
  | 'invoice'
  | 'payment'
  | 'adjustment'
  | 'refund';

export type TransactionStatus =
  | 'pending'
  | 'reconciled'
  | 'disputed'
  | 'cancelled';

export type CostCategory =
  | 'instrumentation'
  | 'maintenance'
  | 'inspection'
  | 'emergency_repair'
  | 'consulting'
  | 'software'
  | 'training'
  | 'other';

export interface BudgetItem {
  id: string;
  structureId: string;
  category: CostCategory;
  description: string;
  plannedAmount: number; // BRL
  currency: string;
  fiscalYear: number;
  quarter?: 1 | 2 | 3 | 4;
}

export interface Transaction {
  id: string;
  structureId: string;
  budgetItemId?: string;
  type: TransactionType;
  status: TransactionStatus;
  amount: number; // BRL, positive = debit, negative = credit
  date: string; // ISO 8601
  description: string;
  reference?: string; // invoice/PO number
  vendor?: string;
  category: CostCategory;
  attachmentIds?: string[];
}

export interface BudgetSummary {
  structureId: string;
  fiscalYear: number;
  totalBudget: number;
  totalSpent: number;
  totalCommitted: number; // pending transactions
  remaining: number;
  cpi: number; // Cost Performance Index (EVM)
  spi: number; // Schedule Performance Index
  variancePercent: number;
  byCategory: Record<CostCategory, { budget: number; spent: number; variance: number }>;
}

export interface ReconciliationReport {
  structureId: string;
  period: { from: string; to: string };
  openingBalance: number;
  closingBalance: number;
  totalDebits: number;
  totalCredits: number;
  unreconciledCount: number;
  transactions: Transaction[];
}

// ============================================================
// Helpers
// ============================================================

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Returns current quarter (1–4) for a given ISO date string */
function quarterFromDate(dateStr: string): 1 | 2 | 3 | 4 {
  const month = new Date(dateStr).getUTCMonth(); // 0-based
  return (Math.floor(month / 3) + 1) as 1 | 2 | 3 | 4;
}

/** Elapsed-fraction of the fiscal year as a proxy for schedule progress (0–1) */
function fiscalYearElapsed(fiscalYear: number): number {
  const now = new Date();
  const yearStart = new Date(Date.UTC(fiscalYear, 0, 1)).getTime();
  const yearEnd = new Date(Date.UTC(fiscalYear + 1, 0, 1)).getTime();
  const elapsed = Math.min(Math.max(now.getTime() - yearStart, 0), yearEnd - yearStart);
  return elapsed / (yearEnd - yearStart);
}

const ALL_CATEGORIES: CostCategory[] = [
  'instrumentation',
  'maintenance',
  'inspection',
  'emergency_repair',
  'consulting',
  'software',
  'training',
  'other',
];

// ============================================================
// BankReconciliationManager
// ============================================================

export class BankReconciliationManager {
  private budgetItems: Map<string, BudgetItem> = new Map();
  private transactions: Map<string, Transaction> = new Map();

  // ----------------------------------------------------------
  // Budget Items
  // ----------------------------------------------------------

  addBudgetItem(item: Omit<BudgetItem, 'id'>): BudgetItem {
    const newItem: BudgetItem = { ...item, id: generateId('BUD') };
    this.budgetItems.set(newItem.id, newItem);
    return newItem;
  }

  getBudgetItemsByStructure(structureId: string, fiscalYear?: number): BudgetItem[] {
    const items = Array.from(this.budgetItems.values()).filter(
      (b) => b.structureId === structureId,
    );
    if (fiscalYear !== undefined) {
      return items.filter((b) => b.fiscalYear === fiscalYear);
    }
    return items;
  }

  // ----------------------------------------------------------
  // Transactions
  // ----------------------------------------------------------

  addTransaction(tx: Omit<Transaction, 'id'>): Transaction {
    const newTx: Transaction = { ...tx, id: generateId('TXN') };
    this.transactions.set(newTx.id, newTx);
    return newTx;
  }

  reconcileTransaction(id: string): void {
    const tx = this.transactions.get(id);
    if (!tx) throw new Error(`Transaction not found: ${id}`);
    if (tx.status === 'cancelled') throw new Error(`Cannot reconcile a cancelled transaction: ${id}`);
    this.transactions.set(id, { ...tx, status: 'reconciled' });
  }

  disputeTransaction(id: string): void {
    const tx = this.transactions.get(id);
    if (!tx) throw new Error(`Transaction not found: ${id}`);
    this.transactions.set(id, { ...tx, status: 'disputed' });
  }

  getTransactionsByStructure(
    structureId: string,
    filter?: { status?: TransactionStatus; category?: CostCategory },
  ): Transaction[] {
    let txs = Array.from(this.transactions.values()).filter(
      (t) => t.structureId === structureId,
    );
    if (filter?.status) {
      txs = txs.filter((t) => t.status === filter.status);
    }
    if (filter?.category) {
      txs = txs.filter((t) => t.category === filter.category);
    }
    return txs;
  }

  // ----------------------------------------------------------
  // Budget Summary
  // ----------------------------------------------------------

  getBudgetSummary(structureId: string, fiscalYear: number): BudgetSummary {
    const items = this.getBudgetItemsByStructure(structureId, fiscalYear);
    const txs = this.getTransactionsByStructure(structureId);

    const totalBudget = items.reduce((sum, b) => sum + b.plannedAmount, 0);

    // Reconciled/completed transactions count as actual cost
    const reconciledTxs = txs.filter(
      (t) =>
        t.status === 'reconciled' &&
        new Date(t.date).getUTCFullYear() === fiscalYear,
    );

    // Pending transactions are commitments
    const pendingTxs = txs.filter(
      (t) =>
        t.status === 'pending' &&
        new Date(t.date).getUTCFullYear() === fiscalYear,
    );

    // Actual Cost (AC) — sum of absolute debit amounts (positive amounts = expense)
    const totalSpent = reconciledTxs.reduce(
      (sum, t) => sum + Math.max(t.amount, 0),
      0,
    );

    // Committed (pending debits)
    const totalCommitted = pendingTxs.reduce(
      (sum, t) => sum + Math.max(t.amount, 0),
      0,
    );

    const remaining = totalBudget - totalSpent - totalCommitted;

    // EVM — Planned Value (PV) = budget × elapsed fraction of fiscal year
    const elapsed = fiscalYearElapsed(fiscalYear);
    const pv = totalBudget * elapsed;

    // Earned Value (EV) — approximated as budget × (totalSpent/totalBudget) when budget > 0
    const ev = totalBudget > 0 ? totalBudget * (totalSpent / totalBudget) : 0;
    const ac = totalSpent;

    const cpi = ac > 0 ? ev / ac : 1;
    const spi = pv > 0 ? ev / pv : 1;

    const variancePercent =
      totalBudget > 0 ? ((totalBudget - totalSpent) / totalBudget) * 100 : 0;

    // Per-category breakdown
    const byCategory = {} as Record<
      CostCategory,
      { budget: number; spent: number; variance: number }
    >;
    for (const cat of ALL_CATEGORIES) {
      const catBudget = items
        .filter((b) => b.category === cat)
        .reduce((s, b) => s + b.plannedAmount, 0);
      const catSpent = reconciledTxs
        .filter((t) => t.category === cat)
        .reduce((s, t) => s + Math.max(t.amount, 0), 0);
      byCategory[cat] = {
        budget: catBudget,
        spent: catSpent,
        variance: catBudget - catSpent,
      };
    }

    return {
      structureId,
      fiscalYear,
      totalBudget,
      totalSpent,
      totalCommitted,
      remaining,
      cpi,
      spi,
      variancePercent,
      byCategory,
    };
  }

  // ----------------------------------------------------------
  // Reconciliation Report
  // ----------------------------------------------------------

  getReconciliationReport(
    structureId: string,
    from: string,
    to: string,
  ): ReconciliationReport {
    const fromTime = new Date(from).getTime();
    const toTime = new Date(to).getTime();

    const periodTxs = Array.from(this.transactions.values()).filter((t) => {
      const txTime = new Date(t.date).getTime();
      return t.structureId === structureId && txTime >= fromTime && txTime <= toTime;
    });

    // Opening balance: sum of all reconciled txs before `from` for this structure
    const priorTxs = Array.from(this.transactions.values()).filter((t) => {
      const txTime = new Date(t.date).getTime();
      return (
        t.structureId === structureId &&
        txTime < fromTime &&
        t.status === 'reconciled'
      );
    });
    const openingBalance = priorTxs.reduce((sum, t) => sum + t.amount, 0);

    const totalDebits = periodTxs
      .filter((t) => t.amount > 0)
      .reduce((sum, t) => sum + t.amount, 0);
    const totalCredits = periodTxs
      .filter((t) => t.amount < 0)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);

    const netPeriod = totalDebits - totalCredits;
    const closingBalance = openingBalance + netPeriod;

    const unreconciledCount = periodTxs.filter(
      (t) => t.status === 'pending' || t.status === 'disputed',
    ).length;

    return {
      structureId,
      period: { from, to },
      openingBalance,
      closingBalance,
      totalDebits,
      totalCredits,
      unreconciledCount,
      transactions: periodTxs,
    };
  }

  // ----------------------------------------------------------
  // EVM Computation
  // PMBOK 7th ed., §4.5 — CPI, SPI, EAC, VAC
  // ----------------------------------------------------------

  computeEVM(
    structureId: string,
    fiscalYear: number,
  ): { cpi: number; spi: number; eac: number; vac: number } {
    const summary = this.getBudgetSummary(structureId, fiscalYear);
    const bac = summary.totalBudget; // Budget at Completion
    const cpi = summary.cpi;
    const spi = summary.spi;

    // EAC = BAC / CPI  (PMBOK 7th ed., §4.5)
    const eac = cpi > 0 ? bac / cpi : bac;

    // VAC = BAC - EAC  (Variance at Completion)
    const vac = bac - eac;

    return { cpi, spi, eac, vac };
  }
}

export const bankReconciliationManager = new BankReconciliationManager();
