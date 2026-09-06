export const PurchaseDestination = {
  DIRECT_TO_SITE: 'direct_to_site',
  WAREHOUSE: 'warehouse',
} as const

export type PurchaseDestination =
  (typeof PurchaseDestination)[keyof typeof PurchaseDestination]

export const PURCHASE_DESTINATION_LABEL: Record<PurchaseDestination, string> = {
  direct_to_site: 'Direct to site',
  warehouse: 'Central warehouse',
}

export const PurchaseOrderStatus = {
  ISSUED: 'issued',
  PARTIAL: 'partial',
  RECEIVED: 'received',
  CANCELLED: 'cancelled',
} as const

export type PurchaseOrderStatus =
  (typeof PurchaseOrderStatus)[keyof typeof PurchaseOrderStatus]

export const PO_STATUS_LABEL: Record<PurchaseOrderStatus, string> = {
  issued: 'Issued',
  partial: 'Partial',
  received: 'Received',
  cancelled: 'Cancelled',
}

export const VendorLedgerType = {
  RECEIPT: 'receipt',
  RETURN: 'return',
  BILL: 'bill',
  PAYMENT: 'payment',
} as const

export type VendorLedgerType =
  (typeof VendorLedgerType)[keyof typeof VendorLedgerType]

export const VENDOR_LEDGER_LABEL: Record<VendorLedgerType, string> = {
  receipt: 'Goods received',
  return: 'Vendor return',
  bill: 'Credit bill',
  payment: 'Payment',
}

export type Supplier = {
  id: string
  supplierNumber: string
  name: string
  contactName: string | null
  email: string | null
  phone: string | null
  address: string | null
  taxId: string | null
  paymentTermsDays: number
  notes: string | null
  isActive: boolean
}

export type Item = {
  id: string
  sku: string
  name: string
  unit: string
  isActive: boolean
}

export type Warehouse = {
  id: string
  code: string
  name: string
  isDefault: boolean
}

export type PurchaseOrderLine = {
  id: string
  itemId: string
  sku: string
  name: string
  unit: string
  quantity: number
  unitCost: number
  lineTotal: number
  receivedQty: number
  returnedQty: number
  outstandingQty: number
}

export type PurchaseOrder = {
  id: string
  poNumber: string
  status: PurchaseOrderStatus
  destination: PurchaseDestination
  supplierId: string
  supplierNumber: string
  supplierName: string
  projectId: string | null
  projectCode: string | null
  projectName: string | null
  warehouseId: string | null
  warehouseCode: string | null
  warehouseName: string | null
  date: string
  notes: string | null
  orderedAmount: number
  receivedAmount: number
  returnedAmount: number
  outstandingPayable: number
  lines: PurchaseOrderLine[]
}

export type StockRow = {
  warehouseId: string
  warehouseCode: string
  warehouseName: string
  itemId: string
  sku: string
  name: string
  unit: string
  quantity: number
  value: number
}

export type StockIssueLine = {
  itemId: string
  sku: string
  name: string
  unit: string
  quantity: number
  unitCost: number
  amount: number
}

export type StockIssue = {
  id: string
  issueNumber: string
  warehouseCode: string
  warehouseName: string
  projectId?: string
  projectCode: string
  projectName: string
  date: string
  quantity: number
  amount: number
  journalNumber: string
  lines: StockIssueLine[]
}

export type VendorLedger = {
  supplier: Supplier
  purchased: number
  returned: number
  billed: number
  paid: number
  outstanding: number
  entries: Array<{
    id: string
    date: string
    type: VendorLedgerType
    reference: string
    poNumber: string | null
    journalNumber: string
    amount: number
    runningOutstanding: number
  }>
}

export function qty(value: number): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  })
}
