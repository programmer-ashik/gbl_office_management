import type { MouseEvent as ReactMouseEvent } from 'react'
import { resolveAssetUrl } from '../types/report-template'
import {
  formatInvoiceMoney,
  invoiceTotals,
  lineTotal,
  type InvoiceLine,
  type InvoiceTextBox,
  type ProjectInvoiceDraft,
} from '../types/project-invoice'

type Props = {
  draft: ProjectInvoiceDraft
  selectedId: string | null
  onSelect: (id: string | null) => void
  onPatchDraft: (patch: Partial<ProjectInvoiceDraft>) => void
  onChangeLine: (id: string, patch: Partial<InvoiceLine>) => void
  onChangeTextBox: (id: string, patch: Partial<InvoiceTextBox>) => void
  onMoveTextBox: (id: string, x: number, y: number) => void
  editable?: boolean
}

function qtyLabel(value: number): string {
  return String(Math.round(value)).padStart(2, '0')
}

export function ProjectInvoiceDocument({
  draft,
  selectedId,
  onSelect,
  onPatchDraft,
  onChangeLine,
  onChangeTextBox,
  onMoveTextBox,
  editable = true,
}: Props) {
  const totals = invoiceTotals(draft)
  const logo = resolveAssetUrl(draft.logoUrl)

  function startDrag(boxId: string, event: ReactMouseEvent<HTMLDivElement>) {
    if (!editable) return
    event.preventDefault()
    event.stopPropagation()
    onSelect(boxId)
    const sheet = event.currentTarget.parentElement
    if (!sheet) return
    const rect = sheet.getBoundingClientRect()
    const startX = event.clientX
    const startY = event.clientY
    const box = draft.textBoxes.find((row) => row.id === boxId)
    if (!box) return
    const originX = box.x
    const originY = box.y

    function onMove(ev: MouseEvent) {
      const dx = ((ev.clientX - startX) / rect.width) * 100
      const dy = ((ev.clientY - startY) / rect.height) * 100
      onMoveTextBox(
        boxId,
        Math.min(90, Math.max(0, originX + dx)),
        Math.min(90, Math.max(0, originY + dy)),
      )
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <article
      className="inv-sheet"
      onClick={() => onSelect(null)}
      id="project-invoice-sheet"
    >
      <header className="inv-header">
        <div className="inv-brand">
          {logo ? (
            <img src={logo} alt="" className="inv-logo" />
          ) : (
            <div className="inv-logo-fallback">
              {draft.companyName.slice(0, 1) || 'G'}
            </div>
          )}
          <p className="inv-company-name">{draft.companyName}</p>
        </div>
        <div className="inv-contact">
          <p>
            <span className="inv-contact-ico" aria-hidden>
              ⌖
            </span>
            {draft.companyAddress || 'Company address'}
          </p>
          <p>
            <span className="inv-contact-ico" aria-hidden>
              ✉
            </span>
            {draft.companyEmail || 'email@company.com'}
          </p>
          <p>
            <span className="inv-contact-ico" aria-hidden>
              ☎
            </span>
            {draft.companyPhone || '+000 000 000'}
          </p>
        </div>
      </header>

      <section className="inv-meta">
        <div
          className={`inv-billto${selectedId === 'billto' ? ' is-selected' : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            onSelect('billto')
          }}
        >
          <p className="inv-label">
            Bill To:{' '}
            {editable ? (
              <input
                className="inv-inline-input inv-bill-name"
                value={draft.billToName}
                onChange={(e) => onPatchDraft({ billToName: e.target.value })}
              />
            ) : (
              <strong>{draft.billToName}</strong>
            )}
          </p>
          <div className="inv-bill-grid">
            <span>Client:</span>
            {editable ? (
              <input
                className="inv-inline-input"
                value={draft.client}
                onChange={(e) => onPatchDraft({ client: e.target.value })}
              />
            ) : (
              <span>{draft.client || '—'}</span>
            )}
            <span>Phone:</span>
            {editable ? (
              <input
                className="inv-inline-input"
                value={draft.phone}
                onChange={(e) => onPatchDraft({ phone: e.target.value })}
              />
            ) : (
              <span>{draft.phone || '—'}</span>
            )}
            <span>Email:</span>
            {editable ? (
              <input
                className="inv-inline-input"
                value={draft.email}
                onChange={(e) => onPatchDraft({ email: e.target.value })}
              />
            ) : (
              <span>{draft.email || '—'}</span>
            )}
            <span>Address:</span>
            {editable ? (
              <input
                className="inv-inline-input"
                value={draft.address}
                onChange={(e) => onPatchDraft({ address: e.target.value })}
              />
            ) : (
              <span>{draft.address || '—'}</span>
            )}
          </div>
        </div>
        <div className="inv-total-due">
          <p className="inv-total-due-label">TOTAL DUE</p>
          <p className="inv-total-due-value">
            {formatInvoiceMoney(totals.grandTotal, draft.currencyCode)}
          </p>
          <p className="muted">
            {draft.invoiceNumber} · Due {draft.dueDate.slice(0, 10)}
          </p>
        </div>
      </section>

      <table className="inv-table">
        <colgroup>
          <col style={{ width: `${draft.columnWidths.item}%` }} />
          <col style={{ width: `${draft.columnWidths.description}%` }} />
          <col style={{ width: `${draft.columnWidths.unitPrice}%` }} />
          <col style={{ width: `${draft.columnWidths.quantity}%` }} />
          <col style={{ width: `${draft.columnWidths.total}%` }} />
        </colgroup>
        <thead>
          <tr>
            <th>Item</th>
            <th>Description</th>
            <th>Unit Price</th>
            <th>Quantity</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {draft.lines.map((line, index) => {
            return (
              <tr
                key={line.id}
                className={`${index % 2 ? 'is-alt' : ''}${
                  selectedId === line.id ? ' is-selected' : ''
                }`}
                onClick={(e) => {
                  e.stopPropagation()
                  onSelect(line.id)
                }}
              >
                <td>
                  {editable ? (
                    <input
                      className="inv-inline-input inv-line-title"
                      value={line.title}
                      onChange={(e) =>
                        onChangeLine(line.id, { title: e.target.value })
                      }
                      style={{
                        fontSize: line.fontSize,
                        fontWeight: line.bold ? 700 : 400,
                        color: line.color,
                        textAlign: line.align,
                      }}
                    />
                  ) : (
                    <strong
                      style={{
                        fontSize: line.fontSize,
                        fontWeight: line.bold ? 700 : 400,
                        color: line.color,
                      }}
                    >
                      {line.title}
                    </strong>
                  )}
                </td>
                <td>
                  {editable ? (
                    <textarea
                      className="inv-inline-input inv-line-desc"
                      value={line.description}
                      rows={2}
                      onChange={(e) =>
                        onChangeLine(line.id, {
                          description: e.target.value,
                        })
                      }
                    />
                  ) : (
                    <p className="inv-desc">{line.description || '—'}</p>
                  )}
                </td>
                <td>
                  {editable ? (
                    <input
                      className="inv-inline-input inv-num"
                      type="number"
                      min={0}
                      step="0.01"
                      value={line.unitPrice}
                      onChange={(e) =>
                        onChangeLine(line.id, {
                          unitPrice: Number(e.target.value) || 0,
                        })
                      }
                    />
                  ) : (
                    formatInvoiceMoney(line.unitPrice, draft.currencyCode)
                  )}
                </td>
                <td>
                  {editable ? (
                    <input
                      className="inv-inline-input inv-num"
                      type="number"
                      min={0}
                      step="1"
                      value={line.quantity}
                      onChange={(e) =>
                        onChangeLine(line.id, {
                          quantity: Number(e.target.value) || 0,
                        })
                      }
                    />
                  ) : (
                    qtyLabel(line.quantity)
                  )}
                </td>
                <td className="inv-num">
                  {formatInvoiceMoney(lineTotal(line), draft.currencyCode)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <section className="inv-summary">
        <div className="inv-summary-rows">
          <div>
            <span>SUBTOTAL</span>
            <strong>
              {formatInvoiceMoney(totals.subtotal, draft.currencyCode)}
            </strong>
          </div>
          <div>
            <span>Tax (VAT @ {draft.taxRate}%)</span>
            <strong>
              {formatInvoiceMoney(totals.tax, draft.currencyCode)}
            </strong>
          </div>
          <div>
            <span>Discount ({draft.discountRate}%)</span>
            <strong>
              -{formatInvoiceMoney(totals.discount, draft.currencyCode)}
            </strong>
          </div>
          <div className="inv-grand">
            <span>Grand Total</span>
            <strong>
              {formatInvoiceMoney(totals.grandTotal, draft.currencyCode)}
            </strong>
          </div>
        </div>
      </section>

      <section className="inv-bottom">
        {draft.showPaymentMethods ? (
          <div className="inv-payment">
            <h3>Payment Method We Accept</h3>
            {draft.paymentPaypal.trim() ? (
              <p className="muted">PayPal · {draft.paymentPaypal.trim()}</p>
            ) : null}
            {draft.acceptCard ? (
              <p className="muted">Card Payment · Visa / Mastercard / Amex</p>
            ) : null}
            {!draft.paymentPaypal.trim() && !draft.acceptCard ? (
              <p className="muted">Contact us for payment options.</p>
            ) : null}
          </div>
        ) : (
          <div />
        )}

        <div className="inv-auth-sign">
          <p className="inv-auth-label">
            {draft.authorizedLabel || 'Authorized Signature'}
          </p>
          {draft.useDigitalSignature && draft.digitalSignatureDataUrl ? (
            <img
              src={draft.digitalSignatureDataUrl}
              alt="Digital signature"
              className="inv-digital-sign"
            />
          ) : (
            <div className="inv-sign-line" />
          )}
          {draft.authorizedName ? (
            <p className="inv-auth-name">{draft.authorizedName}</p>
          ) : null}
          {draft.authorizedTitle ? (
            <p className="inv-auth-title">{draft.authorizedTitle}</p>
          ) : null}
        </div>
      </section>

      <div className="inv-color-footer">
        <p>
          NOTE:{' '}
          {editable ? (
            <input
              className="inv-inline-input"
              value={draft.note}
              onChange={(e) => onPatchDraft({ note: e.target.value })}
            />
          ) : (
            draft.note
          )}
        </p>
      </div>

      {draft.textBoxes.map((box) => (
        <div
          key={box.id}
          className={`inv-textbox${selectedId === box.id ? ' is-selected' : ''}`}
          style={{
            left: `${box.x}%`,
            top: `${box.y}%`,
            width: `${box.width}%`,
            fontSize: box.fontSize,
            fontWeight: box.bold ? 700 : 400,
            color: box.color,
            textAlign: box.align,
          }}
          onMouseDown={(e) => startDrag(box.id, e)}
          onClick={(e) => {
            e.stopPropagation()
            onSelect(box.id)
          }}
        >
          {editable ? (
            <textarea
              value={box.text}
              onChange={(e) => onChangeTextBox(box.id, { text: e.target.value })}
              rows={2}
            />
          ) : (
            box.text
          )}
        </div>
      ))}
    </article>
  )
}
