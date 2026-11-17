import { db } from './db.ts';
import { formatRef } from './crypto.ts';
import { appendLedgerEntry, createNotification, getNextSeq, recordAuditLog } from './ledgerService.ts';

export interface InitiatePaymentInput {
  userId: number;
  investmentId: number | null;
  providerCode: string;
  phoneNumber?: string;
  externalReference?: string;
  amount: number;
  feeAmount: number;
  totalAmount: number;
  idempotencyKey: string;
  purpose?: 'investment' | 'deposit';
}

export interface GatewayInitiationResult {
  receivingAccount: string;
  receivingName: string;
  instructions: string;
  status: 'pending_confirmation';
}

export interface PaymentGatewayAdapter {
  code: string;
  initiate(
    paymentRef: string,
    amount: number,
    receivingAccount: string,
    receivingName: string,
    phoneNumber?: string
  ): Promise<GatewayInitiationResult>;
}

class FloozGateway implements PaymentGatewayAdapter {
  code = 'flooz';

  async initiate(
    paymentRef: string,
    amount: number,
    receivingAccount: string,
    receivingName: string
  ): Promise<GatewayInitiationResult> {
    const account = receivingAccount || '97172729';
    return {
      receivingAccount: account,
      receivingName: receivingName || 'InvestMarket Flooz',
      instructions: `Envoyez exactement ${amount.toLocaleString('fr-FR')} FCFA par Flooz (*155#) au numéro ${account} (${receivingName || 'InvestMarket Flooz'}), puis renseignez la référence SMS du transfert pour la validation (${paymentRef}).`,
      status: 'pending_confirmation',
    };
  }
}

class TMoneyGateway implements PaymentGatewayAdapter {
  code = 'tmoney';

  async initiate(
    paymentRef: string,
    amount: number,
    receivingAccount: string,
    receivingName: string
  ): Promise<GatewayInitiationResult> {
    const account = receivingAccount || '93736916';
    return {
      receivingAccount: account,
      receivingName: receivingName || 'InvestMarket TMoney',
      instructions: `Envoyez exactement ${amount.toLocaleString('fr-FR')} FCFA par TMoney (*145#) au numéro ${account} (${receivingName || 'InvestMarket TMoney'}), puis renseignez la référence SMS du transfert pour la validation (${paymentRef}).`,
      status: 'pending_confirmation',
    };
  }
}

class BankTransferGateway implements PaymentGatewayAdapter {
  code = 'bank_transfer';

  async initiate(
    paymentRef: string,
    amount: number,
    receivingAccount: string,
    receivingName: string
  ): Promise<GatewayInitiationResult> {
    return {
      receivingAccount: receivingAccount || 'TG055 01001 00004829100 42',
      receivingName: receivingName || 'InvestMarket Séquestre UEMOA',
      instructions: `Effectuez un virement UEMOA de ${amount.toLocaleString('fr-FR')} FCFA vers ${receivingAccount} avec la référence ${paymentRef}.`,
      status: 'pending_confirmation',
    };
  }
}

class CardGateway implements PaymentGatewayAdapter {
  code = 'card';

  async initiate(
    paymentRef: string,
    _amount: number,
    receivingAccount: string,
    receivingName: string
  ): Promise<GatewayInitiationResult> {
    return {
      receivingAccount,
      receivingName,
      instructions: `Session carte initialisée (${paymentRef}).`,
      status: 'pending_confirmation',
    };
  }
}

export class PaymentService {
  private gateways: Map<string, PaymentGatewayAdapter>;

  constructor() {
    this.gateways = new Map<string, PaymentGatewayAdapter>([
      ['flooz', new FloozGateway()],
      ['tmoney', new TMoneyGateway()],
      ['bank_transfer', new BankTransferGateway()],
      ['card', new CardGateway()],
    ]);
  }

  getGateway(providerCode: string): PaymentGatewayAdapter {
    const gw = this.gateways.get(providerCode);
    if (!gw) {
      throw new Error(`Moyen de paiement non supporté : ${providerCode}`);
    }
    return gw;
  }

  async initiatePayment(input: InitiatePaymentInput) {
    const existing = db.prepare('SELECT * FROM payments WHERE idempotency_key = ?').get(input.idempotencyKey) as Record<string, unknown> | undefined;
    if (existing) {
      return {
        payment: existing,
        idempotentReplay: true,
        instructions: 'Requête déjà enregistrée (protection idempotence).',
      };
    }

    const provider = db.prepare('SELECT * FROM payment_providers WHERE code = ? AND is_active = 1').get(input.providerCode) as Record<string, any> | undefined;
    if (!provider) {
      throw new Error('Ce moyen de paiement est indisponible ou désactivé.');
    }

    const gateway = this.getGateway(input.providerCode);
    const seq = getNextSeq('payments');
    const prefix = input.providerCode === 'flooz' ? 'PAY-FLZ' : input.providerCode === 'tmoney' ? 'PAY-TMN' : 'PAY-UEM';
    const paymentRef = formatRef(prefix, seq);
    const txnId = formatRef('TXN', seq);

    const gwResult = await gateway.initiate(
      paymentRef,
      input.totalAmount,
      String(provider.receiving_account || ''),
      String(provider.receiving_name || provider.name),
      input.phoneNumber
    );

    const insertRes = db.prepare(`
      INSERT INTO payments (
        payment_reference, idempotency_key, transaction_id, investment_id, user_id,
        provider_code, phone_number, amount, fee_amount, total_amount, currency, purpose, status, external_reference
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'XOF', ?, 'pending_confirmation', ?)
    `).run(
      paymentRef,
      input.idempotencyKey,
      txnId,
      input.investmentId,
      input.userId,
      input.providerCode,
      input.phoneNumber || null,
      input.amount,
      input.feeAmount,
      input.totalAmount,
      input.purpose || 'investment',
      input.externalReference ? String(input.externalReference).trim() : null
    );

    const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(Number(insertRes.lastInsertRowid)) as Record<string, unknown>;

    createNotification({
      userId: input.userId,
      title: 'Dépôt / Paiement en attente de vérification',
      message: `Votre ordre ${paymentRef} (${input.totalAmount.toLocaleString('fr-FR')} FCFA) vers ${provider.name} (${gwResult.receivingAccount}) a été enregistré et est en cours de vérification.`,
      category: 'payment',
      actionUrl: '/dashboard/transactions',
    });

    recordAuditLog({
      actorUserId: input.userId,
      action: 'PAYMENT_INITIATED',
      entityType: 'payment',
      entityId: paymentRef,
      details: {
        provider: input.providerCode,
        receivingAccount: gwResult.receivingAccount,
        totalAmount: input.totalAmount,
        investmentId: input.investmentId,
      },
    });

    return {
      payment,
      idempotentReplay: false,
      receivingAccount: gwResult.receivingAccount,
      receivingName: gwResult.receivingName,
      instructions: gwResult.instructions,
    };
  }

  submitTransferProof(params: {
    userId: number;
    paymentReference: string;
    externalReference: string;
    phoneNumber?: string;
  }) {
    const payment = db.prepare('SELECT * FROM payments WHERE payment_reference = ? AND user_id = ?').get(params.paymentReference, params.userId) as Record<string, any> | undefined;
    if (!payment) {
      throw new Error('Référence de paiement introuvable.');
    }
    if (payment.status === 'confirmed' || payment.status === 'failed') {
      throw new Error('Ce paiement est déjà clôturé.');
    }

    db.prepare(`
      UPDATE payments
      SET external_reference = ?, phone_number = COALESCE(?, phone_number)
      WHERE id = ?
    `).run(params.externalReference.trim(), params.phoneNumber ? params.phoneNumber.trim() : null, payment.id);

    recordAuditLog({
      actorUserId: params.userId,
      action: 'PAYMENT_PROOF_SUBMITTED',
      entityType: 'payment',
      entityId: params.paymentReference,
      details: { externalReference: params.externalReference.trim(), phoneNumber: params.phoneNumber },
    });

    return db.prepare('SELECT * FROM payments WHERE id = ?').get(payment.id);
  }

  /**
   * Idempotent server-side confirmation handler triggered upon reception verification
   * (Finance / Super Admin reconciliation on receiving numbers 93736916 / 97172729).
   */
  processProviderConfirmation(params: {
    providerCode: string;
    paymentReference: string;
    externalReference: string;
    status: 'confirmed' | 'failed';
    failureReason?: string;
    rawBody: string;
    adminActor: { id: number; email: string; role: string };
  }) {
    this.getGateway(params.providerCode);

    const executeTx = db.transaction(() => {
      const payment = db.prepare('SELECT * FROM payments WHERE payment_reference = ?').get(params.paymentReference) as {
        id: number;
        payment_reference: string;
        transaction_id: string;
        investment_id: number | null;
        user_id: number;
        provider_code: string;
        amount: number;
        fee_amount: number;
        total_amount: number;
        purpose: string;
        status: string;
        external_reference: string | null;
      } | undefined;

      if (!payment) {
        throw new Error('Référence de paiement introuvable.');
      }

      if (payment.provider_code !== params.providerCode) {
        throw new Error('Incohérence de moyen de paiement sur cette référence.');
      }

      // IDEMPOTENCY GUARD: if already finalized, return immediately without touching ledger!
      if (payment.status === 'confirmed' || payment.status === 'failed') {
        recordAuditLog({
          actorUserId: params.adminActor.id,
          actorEmail: params.adminActor.email,
          actorRole: params.adminActor.role,
          action: 'PAYMENT_IDEMPOTENT_REPLAY',
          entityType: 'payment',
          entityId: payment.payment_reference,
          details: { existingStatus: payment.status, externalReference: params.externalReference },
        });
        return {
          status: payment.status,
          alreadyProcessed: true,
          paymentReference: payment.payment_reference,
        };
      }

      const finalExtRef = params.externalReference || payment.external_reference || `${payment.provider_code.toUpperCase()}-${Date.now()}`;

      if (params.status === 'failed') {
        db.prepare(`
          UPDATE payments
          SET status = 'failed', external_reference = ?, failure_reason = ?, webhook_payload_json = ?
          WHERE id = ?
        `).run(finalExtRef, params.failureReason || 'Transfert non retrouvé ou montant non conforme.', params.rawBody, payment.id);

        if (payment.investment_id) {
          db.prepare(`UPDATE investments SET status = 'failed' WHERE id = ? AND status = 'pending_payment'`).run(payment.investment_id);
        }

        const txSeq = getNextSeq('transactions');
        const txRef = formatRef('TRX', txSeq);
        db.prepare(`
          INSERT INTO transactions (reference, user_id, investment_id, payment_id, type, direction, amount, status, description)
          VALUES (?, ?, ?, ?, 'deposit', 'credit', ?, 'failed', ?)
        `).run(txRef, payment.user_id, payment.investment_id, payment.id, payment.total_amount, `Dépôt rejeté ${payment.provider_code.toUpperCase()} (${payment.payment_reference})`);

        createNotification({
          userId: payment.user_id,
          title: 'Dépôt non validé',
          message: `Votre transfert ${payment.payment_reference} n’a pas pu être validé (${params.failureReason || 'non reçu'}). Aucun montant n’a été crédité.`,
          category: 'payment',
          actionUrl: '/dashboard/transactions',
        });

        recordAuditLog({
          actorUserId: params.adminActor.id,
          actorEmail: params.adminActor.email,
          actorRole: params.adminActor.role,
          action: 'PAYMENT_FAILED',
          entityType: 'payment',
          entityId: payment.payment_reference,
          details: { reason: params.failureReason, externalReference: finalExtRef },
        });

        return {
          status: 'failed',
          alreadyProcessed: false,
          paymentReference: payment.payment_reference,
        };
      }

      // CONFIRMED FLOW
      db.prepare(`
        UPDATE payments
        SET status = 'confirmed', external_reference = ?, webhook_payload_json = ?, confirmed_at = datetime('now')
        WHERE id = ?
      `).run(finalExtRef, params.rawBody, payment.id);

      const txDepositSeq = getNextSeq('transactions');
      const txDepositRef = formatRef('TRX', txDepositSeq);
      const depTxRes = db.prepare(`
        INSERT INTO transactions (reference, user_id, investment_id, payment_id, type, direction, amount, status, description)
        VALUES (?, ?, ?, ?, 'deposit', 'credit', ?, 'confirmed', ?)
      `).run(txDepositRef, payment.user_id, payment.investment_id, payment.id, payment.total_amount, `Dépôt reçu ${payment.provider_code.toUpperCase()} (${finalExtRef})`);
      const depTxId = Number(depTxRes.lastInsertRowid);

      appendLedgerEntry({
        transactionId: depTxId,
        userId: payment.user_id,
        accountCode: 'USER_AVAILABLE',
        entryType: 'CREDIT',
        amount: payment.total_amount,
        description: `Réception ${payment.provider_code.toUpperCase()} · Réf ${finalExtRef}`,
      });

      createNotification({
        userId: payment.user_id,
        title: 'Dépôt confirmé',
        message: `Votre transfert de ${payment.total_amount.toLocaleString('fr-FR')} FCFA (Réf. ${finalExtRef}) a été confirmé.`,
        category: 'payment',
        actionUrl: '/dashboard/transactions',
      });

      if (payment.investment_id) {
        const inv = db.prepare(`
          SELECT i.*, p.name as plan_name
          FROM investments i
          JOIN investment_plans p ON p.id = i.plan_id
          WHERE i.id = ?
        `).get(payment.investment_id) as {
          id: number;
          reference: string;
          plan_id: number;
          plan_name: string;
          duration_days: number;
          duration_label: string;
          amount: number;
          fee_amount: number;
          total_paid: number;
        };

        if (payment.fee_amount > 0) {
          const txFeeSeq = getNextSeq('transactions');
          const feeTxRes = db.prepare(`
            INSERT INTO transactions (reference, user_id, investment_id, payment_id, type, direction, amount, status, description)
            VALUES (?, ?, ?, ?, 'fee', 'debit', ?, 'confirmed', ?)
          `).run(formatRef('TRX', txFeeSeq), payment.user_id, inv.id, payment.id, payment.fee_amount, `Frais de structuration — ${inv.reference}`);
          const feeTxId = Number(feeTxRes.lastInsertRowid);

          appendLedgerEntry({
            transactionId: feeTxId,
            userId: payment.user_id,
            accountCode: 'USER_AVAILABLE',
            entryType: 'DEBIT',
            amount: payment.fee_amount,
            description: `Prélèvement frais — ${inv.reference}`,
          });
          appendLedgerEntry({
            transactionId: feeTxId,
            userId: payment.user_id,
            accountCode: 'PLATFORM_FEES',
            entryType: 'CREDIT',
            amount: payment.fee_amount,
            description: `Commission plateforme — ${inv.reference}`,
          });
        }

        const txInvSeq = getNextSeq('transactions');
        const invTxRes = db.prepare(`
          INSERT INTO transactions (reference, user_id, investment_id, payment_id, type, direction, amount, status, description)
          VALUES (?, ?, ?, ?, 'investment', 'debit', ?, 'confirmed', ?)
        `).run(formatRef('TRX', txInvSeq), payment.user_id, inv.id, payment.id, inv.amount, `Souscription activée — ${inv.plan_name} (${inv.reference})`);
        const invTxId = Number(invTxRes.lastInsertRowid);

        appendLedgerEntry({
          transactionId: invTxId,
          userId: payment.user_id,
          accountCode: 'USER_AVAILABLE',
          entryType: 'DEBIT',
          amount: inv.amount,
          description: `Affectation capital — ${inv.reference}`,
        });
        appendLedgerEntry({
          transactionId: invTxId,
          userId: payment.user_id,
          accountCode: 'USER_INVESTED',
          entryType: 'CREDIT',
          amount: inv.amount,
          description: `Capital investi actif — ${inv.reference}`,
        });

        db.prepare(`
          UPDATE investments
          SET status = 'active',
              start_date = datetime('now'),
              end_date = datetime('now', '+' || duration_days || ' days')
          WHERE id = ?
        `).run(inv.id);

        db.prepare(`
          UPDATE investment_plans
          SET allocated_cap = allocated_cap + ?
          WHERE id = ?
        `).run(inv.amount, inv.plan_id);

        const docSeq = getNextSeq('documents');
        const docRef = formatRef('DOC', docSeq);
        const updatedInv = db.prepare('SELECT start_date, end_date FROM investments WHERE id = ?').get(inv.id) as { start_date: string; end_date: string };
        db.prepare(`
          INSERT INTO documents (reference, user_id, investment_id, plan_id, title, doc_type, content_json)
          VALUES (?, ?, ?, ?, ?, 'receipt', ?)
        `).run(
          docRef,
          payment.user_id,
          inv.id,
          inv.plan_id,
          `Reçu de souscription — ${inv.reference}`,
          JSON.stringify({
            reference: inv.reference,
            paymentReference: payment.payment_reference,
            externalReference: finalExtRef,
            planName: inv.plan_name,
            duration: inv.duration_label,
            amount: inv.amount,
            fee: inv.fee_amount,
            totalPaid: inv.total_paid,
            provider: payment.provider_code.toUpperCase(),
            startDate: updatedInv.start_date,
            endDate: updatedInv.end_date,
            currency: 'XOF',
          })
        );

        createNotification({
          userId: payment.user_id,
          title: 'Investissement enregistré',
          message: `Votre investissement ${inv.reference} (${inv.amount.toLocaleString('fr-FR')} FCFA sur ${inv.plan_name}) a été enregistré et activé.`,
          category: 'investment',
          actionUrl: '/dashboard/investissements',
        });
      }

      recordAuditLog({
        actorUserId: params.adminActor.id,
        actorEmail: params.adminActor.email,
        actorRole: params.adminActor.role,
        action: 'PAYMENT_CONFIRMED',
        entityType: 'payment',
        entityId: payment.payment_reference,
        details: {
          externalReference: finalExtRef,
          amount: payment.total_amount,
          investmentId: payment.investment_id,
        },
      });

      return {
        status: 'confirmed',
        alreadyProcessed: false,
        paymentReference: payment.payment_reference,
      };
    });

    return executeTx();
  }
}

export const paymentService = new PaymentService();
