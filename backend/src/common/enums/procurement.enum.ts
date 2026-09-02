export enum PurchaseDestination {
  DIRECT_TO_SITE = 'direct_to_site',
  WAREHOUSE = 'warehouse',
}

export enum PurchaseOrderStatus {
  ISSUED = 'issued',
  PARTIAL = 'partial',
  RECEIVED = 'received',
  CANCELLED = 'cancelled',
}

export enum VendorLedgerType {
  RECEIPT = 'receipt',
  RETURN = 'return',
}
