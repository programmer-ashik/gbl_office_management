import type { Model, Types } from 'mongoose';
import { ClientInvoiceModel } from '../ar-ap/client-invoice.model';
import { CustomerOpeningReceiptModel } from '../ar-ap/customer-opening-receipt.model';
import { InvoiceCollectionModel } from '../ar-ap/invoice-collection.model';
import { SupplierBillModel } from '../ar-ap/supplier-bill.model';
import { SupplierPaymentModel } from '../ar-ap/supplier-payment.model';
import { FundTransferModel } from '../banking/fund-transfer.model';
import { ReconciliationModel } from '../banking/reconciliation.model';
import { PayrollRunModel } from '../payroll/payroll-run.model';
import { SalaryFacilityModel } from '../payroll/salary-facility.model';
import { GoodsMovementModel } from '../procurement/goods-movement.model';
import { StockIssueModel } from '../procurement/stock-issue.model';
import type { JournalEntryDocument } from './journal-entry.model';
import { LedgerLineModel } from './ledger.model';

type Linked = {
  model: Model<any>;
  label: string;
  numberField?: string;
};

/** Documents that carry their own date and point at the journal that posted them. */
const LINKED_DOCUMENTS: Linked[] = [
  { model: ClientInvoiceModel, label: 'client invoice', numberField: 'invoiceNumber' },
  { model: InvoiceCollectionModel, label: 'invoice collection', numberField: 'collectionNumber' },
  { model: SupplierBillModel, label: 'supplier bill', numberField: 'billNumber' },
  { model: SupplierPaymentModel, label: 'supplier payment', numberField: 'paymentNumber' },
  { model: CustomerOpeningReceiptModel, label: 'opening receipt', numberField: 'receiptNumber' },
  { model: FundTransferModel, label: 'fund transfer', numberField: 'transferNumber' },
  { model: StockIssueModel, label: 'stock issue', numberField: 'issueNumber' },
  { model: GoodsMovementModel, label: 'goods movement', numberField: 'movementNumber' },
  { model: PayrollRunModel, label: 'payroll run' },
  { model: SalaryFacilityModel, label: 'salary facility' },
];

/**
 * Why a posted journal's date must stay as posted, or null when it may move.
 * Descriptions are always editable; amounts always need a reversal.
 */
export async function journalDateLockReason(
  entry: JournalEntryDocument,
): Promise<string | null> {
  if (entry.source === 'system') {
    return 'System-generated journals keep the date of the document that posted them.';
  }
  if (entry.reversesEntryId || entry.reversedByEntryId) {
    return 'Reversal journals keep their posting date.';
  }
  if (entry.isPdc || entry.pdcClearsEntryId) {
    return 'Post-dated cheque journals follow the cheque dates.';
  }

  const journalId = entry._id as Types.ObjectId;
  for (const { model, label, numberField } of LINKED_DOCUMENTS) {
    const doc = await model
      .findOne({ journalId }, numberField ? { [numberField]: 1 } : { _id: 1 })
      .lean<Record<string, unknown>>()
      .exec();
    if (doc) {
      const number = numberField ? doc[numberField] : null;
      return `Linked to ${label}${number ? ` ${String(number)}` : ''}. Reverse and re-post to change the date.`;
    }
  }

  const ledgerIds = await LedgerLineModel.distinct('_id', { journalEntryId: journalId }).exec();
  if (ledgerIds.length > 0) {
    const reconciled = await ReconciliationModel.findOne(
      { 'lines.matchedLedgerLineId': { $in: ledgerIds } },
      { reconciliationNumber: 1 },
    )
      .lean()
      .exec();
    if (reconciled) {
      return `A line is matched in bank reconciliation ${reconciled.reconciliationNumber}.`;
    }
  }
  return null;
}
