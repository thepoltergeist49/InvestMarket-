import { db } from './db.ts';
import { formatRef } from './crypto.ts';
import { appendLedgerEntry, createNotification, getNextSeq, recordAuditLog } from './ledgerService.ts';

export function runMaturityCheck(): { maturedCount: number; remindedCount: number } {
  let maturedCount = 0;
  let remindedCount = 0;

  const dueInvestments = db.prepare(`
    SELECT i.*, p.name as plan_name
    FROM investments i
    JOIN investment_plans p ON p.id = i.plan_id
    WHERE i.status = 'active' AND i.end_date IS NOT NULL AND datetime(i.end_date) <= datetime('now')
  `).all() as Array<{
    id: number;
    reference: string;
    user_id: number;
    plan_id: number;
    plan_name: string;
    amount: number;
    fee_amount: number;
    end_date: string;
  }>;

  if (dueInvestments.length > 0) {
    const settle = db.transaction(() => {
      for (const inv of dueInvestments) {
        const txSeq = getNextSeq('transactions');
        const txRef = formatRef('TRX', txSeq);
        const txRes = db.prepare(`
          INSERT INTO transactions (reference, user_id, investment_id, type, direction, amount, status, description)
          VALUES (?, ?, ?, 'refund', 'credit', ?, 'confirmed', ?)
        `).run(txRef, inv.user_id, inv.id, inv.amount, `Dénouement à l’échéance — ${inv.reference}`);
        const txId = Number(txRes.lastInsertRowid);

        appendLedgerEntry({
          transactionId: txId,
          userId: inv.user_id,
          accountCode: 'USER_INVESTED',
          entryType: 'DEBIT',
          amount: inv.amount,
          description: `Sortie d’investissement arrivé à échéance — ${inv.reference}`,
        });
        appendLedgerEntry({
          transactionId: txId,
          userId: inv.user_id,
          accountCode: 'USER_AVAILABLE',
          entryType: 'CREDIT',
          amount: inv.amount,
          description: `Crédit capital à l’échéance — ${inv.reference}`,
        });

        db.prepare(`
          UPDATE investments
          SET status = 'matured', settled_at = datetime('now')
          WHERE id = ?
        `).run(inv.id);

        const docSeq = getNextSeq('documents');
        db.prepare(`
          INSERT INTO documents (reference, user_id, investment_id, plan_id, title, doc_type, content_json)
          VALUES (?, ?, ?, ?, ?, 'statement', ?)
        `).run(
          formatRef('DOC', docSeq),
          inv.user_id,
          inv.id,
          inv.plan_id,
          `Relevé d’échéance — ${inv.reference}`,
          JSON.stringify({
            reference: inv.reference,
            planName: inv.plan_name,
            amount: inv.amount,
            fee: inv.fee_amount,
            currency: 'XOF',
            status: 'Arrivé à échéance — Capital restitué selon conditions contractuelles',
            settledAt: new Date().toISOString(),
          })
        );

        createNotification({
          userId: inv.user_id,
          title: 'Investissement arrivé à échéance',
          message: `Votre investissement ${inv.reference} (${inv.plan_name}) est arrivé à échéance. Le relevé correspondant a été généré.`,
          category: 'maturity',
          actionUrl: '/dashboard/investissements',
        });

        recordAuditLog({
          actorEmail: 'scheduler@investmarket.tg',
          actorRole: 'system',
          action: 'INVESTMENT_MATURED',
          entityType: 'investment',
          entityId: inv.reference,
          details: { amount: inv.amount, userId: inv.user_id },
        });

        maturedCount++;
      }
    });
    settle();
  }

  // Send pre-maturity reminder for investments expiring within 7 days that haven't been reminded recently
  const upcoming = db.prepare(`
    SELECT i.id, i.reference, i.user_id, i.end_date, p.name as plan_name
    FROM investments i
    JOIN investment_plans p ON p.id = i.plan_id
    WHERE i.status = 'active'
      AND i.end_date IS NOT NULL
      AND datetime(i.end_date) > datetime('now')
      AND datetime(i.end_date) <= datetime('now', '+7 days')
  `).all() as Array<{ id: number; reference: string; user_id: number; end_date: string; plan_name: string }>;

  for (const inv of upcoming) {
    const alreadyNotified = db.prepare(`
      SELECT id FROM notifications
      WHERE user_id = ? AND category = 'maturity_reminder' AND message LIKE ?
    `).get(inv.user_id, `%${inv.reference}%`);
    if (!alreadyNotified) {
      createNotification({
        userId: inv.user_id,
        title: 'Échéance prochaine',
        message: `Votre investissement ${inv.reference} (${inv.plan_name}) arrive à échéance le ${inv.end_date.slice(0, 10)}.`,
        category: 'maturity_reminder',
        actionUrl: '/dashboard/investissements',
      });
      remindedCount++;
    }
  }

  return { maturedCount, remindedCount };
}
