import { db } from './db.ts';
import { formatRef } from './crypto.ts';

export type AccountCode =
  | 'USER_AVAILABLE'
  | 'USER_INVESTED'
  | 'PLATFORM_FEES'
  | 'ESCROW_CLEARING'
  | 'PAYOUT_CLEARING';

export function getNextSeq(table: string): number {
  const row = db.prepare(`SELECT COALESCE(MAX(id), 0) + 1 as nextId FROM ${table}`).get() as { nextId: number };
  return row.nextId;
}

export function getUserAccountBalance(userId: number, accountCode: AccountCode): number {
  const row = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN entry_type = 'CREDIT' THEN amount ELSE 0 END), 0) -
      COALESCE(SUM(CASE WHEN entry_type = 'DEBIT' THEN amount ELSE 0 END), 0) as balance
    FROM ledger_entries
    WHERE user_id = ? AND account_code = ?
  `).get(userId, accountCode) as { balance: number };
  return row.balance || 0;
}

export function getPlatformFeeTotal(): number {
  const row = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN entry_type = 'CREDIT' THEN amount ELSE 0 END), 0) -
      COALESCE(SUM(CASE WHEN entry_type = 'DEBIT' THEN amount ELSE 0 END), 0) as balance
    FROM ledger_entries
    WHERE account_code = 'PLATFORM_FEES'
  `).get() as { balance: number };
  return row.balance || 0;
}

export function appendLedgerEntry(params: {
  transactionId: number;
  userId: number;
  accountCode: AccountCode;
  entryType: 'CREDIT' | 'DEBIT';
  amount: number;
  description: string;
}): void {
  const currentBal =
    params.accountCode === 'PLATFORM_FEES'
      ? getPlatformFeeTotal()
      : getUserAccountBalance(params.userId, params.accountCode);

  const balanceAfter =
    params.entryType === 'CREDIT' ? currentBal + params.amount : currentBal - params.amount;

  const seq = getNextSeq('ledger_entries');
  const entryRef = formatRef('LDG', seq);

  db.prepare(`
    INSERT INTO ledger_entries (entry_reference, transaction_id, user_id, account_code, entry_type, amount, currency, balance_after, description)
    VALUES (?, ?, ?, ?, ?, ?, 'XOF', ?, ?)
  `).run(entryRef, params.transactionId, params.userId, params.accountCode, params.entryType, params.amount, balanceAfter, params.description);
}

export function recordAuditLog(params: {
  actorUserId?: number | null;
  actorEmail?: string | null;
  actorRole?: string | null;
  action: string;
  entityType: string;
  entityId?: string | number | null;
  oldValue?: unknown;
  newValue?: unknown;
  result?: 'succès' | 'échec';
  details?: Record<string, unknown>;
  ipAddress?: string | null;
}): void {
  db.prepare(`
    INSERT INTO audit_logs (
      actor_user_id, actor_email, actor_role, action, entity_type, entity_id,
      old_value_json, new_value_json, result, details_json, ip_address
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    params.actorUserId ?? null,
    params.actorEmail ?? null,
    params.actorRole ?? null,
    params.action,
    params.entityType,
    params.entityId != null ? String(params.entityId) : null,
    params.oldValue !== undefined ? JSON.stringify(params.oldValue) : null,
    params.newValue !== undefined ? JSON.stringify(params.newValue) : null,
    params.result || 'succès',
    JSON.stringify(params.details ?? {}),
    params.ipAddress ?? null
  );
}

export function createNotification(params: {
  userId: number;
  title: string;
  message: string;
  category?: string;
  actionUrl?: string;
}): void {
  db.prepare(`
    INSERT INTO notifications (user_id, title, message, category, action_url)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    params.userId,
    params.title,
    params.message,
    params.category || 'system',
    params.actionUrl || '/dashboard'
  );
}
