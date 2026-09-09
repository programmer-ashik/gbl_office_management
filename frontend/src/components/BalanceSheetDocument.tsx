import { Link } from 'react-router-dom'
import { MetricCard } from './MetricCard'
import {
  money,
  type BalanceSheetLine,
  type BalanceSheetReport,
  type BalanceSheetSection,
} from '../types/accounting'
import {
  isBlockVisible,
  resolveAssetUrl,
  type BalanceSheetTemplate,
  type TemplateBlock,
} from '../types/report-template'

function partyHref(line: BalanceSheetLine): string | null {
  if (!line.isParty || !line.entityId) return null
  if (line.entityType === 'employee') return `/employees/${line.entityId}/ledger`
  if (line.entityType === 'customer') return `/customers/${line.entityId}`
  if (line.entityType === 'supplier') return `/suppliers/${line.entityId}`
  return null
}

function SectionBlock({
  section,
  showAccountCodes,
  showPartyBreakdown,
  interactive,
}: {
  section: BalanceSheetSection
  showAccountCodes: boolean
  showPartyBreakdown: boolean
  interactive: boolean
}) {
  const visible = section.lines.filter((line) => {
    if (line.isParty && !showPartyBreakdown) return false
    return line.isHeader || line.isParty || Math.abs(line.balance) >= 0.005
  })

  return (
    <div className="bs-section">
      <div className="bs-section-banner">
        <span className="bs-section-title">{section.title}</span>
        <span className="bs-amount bs-amount-category">{money(section.total)}</span>
      </div>
      <table className="bs-table">
        <colgroup>
          <col className="bs-col-account" />
          <col className="bs-col-amount" />
        </colgroup>
        <tbody>
          {visible.map((line) => (
            <LineRow
              key={line.code}
              line={line}
              showAccountCodes={showAccountCodes}
              interactive={interactive}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function LineRow({
  line,
  showAccountCodes,
  interactive,
}: {
  line: BalanceSheetLine
  showAccountCodes: boolean
  interactive: boolean
}) {
  const depth = Math.max(0, line.depth)
  const isHeader = (line.isHeader || !line.isPostable) && !line.isParty
  const label = (
    <>
      {showAccountCodes && !line.isParty ? (
        <span className="bs-code">{line.code}</span>
      ) : null}
      <span className={line.isParty ? 'bs-name bs-party-name' : 'bs-name'}>
        {line.name}
      </span>
    </>
  )

  if (isHeader) {
    return (
      <tr className={`bs-header-row bs-depth-${Math.min(depth, 4)}`}>
        <td className="bs-cell-account">{label}</td>
        <td className="bs-amount bs-amount-category">{money(line.balance)}</td>
      </tr>
    )
  }

  const href = line.isParty
    ? partyHref(line)
    : line.isPostable
      ? `/ledgers/${line.code}`
      : null

  return (
    <tr
      className={`bs-line-row bs-depth-${Math.min(depth, 4)}${
        line.isParty ? ' bs-party-row' : ''
      }`}
    >
      <td className="bs-cell-account">
        {interactive && href ? (
          <Link to={href} className="bs-drill">
            {label}
          </Link>
        ) : (
          <span className="bs-drill">{label}</span>
        )}
      </td>
      <td className="bs-amount">{money(line.balance)}</td>
    </tr>
  )
}

function StatementTotal({
  label,
  amount,
  variant,
}: {
  label: string
  amount: number
  variant: 'subtotal' | 'grand'
}) {
  return (
    <div className={variant === 'grand' ? 'bs-total-row' : 'bs-subtotal-row'}>
      <span className="bs-total-label">{label}</span>
      <span className="bs-amount bs-amount-total">{money(amount)}</span>
    </div>
  )
}

function LogoBlock({
  url,
  align,
}: {
  url: string | null
  align: 'left' | 'center' | 'right'
}) {
  const src = resolveAssetUrl(url)
  return (
    <div className={`bs-logo-block bs-logo-${align}`}>
      {src ? (
        <img src={src} alt="Company logo" className="bs-logo-img" />
      ) : (
        <div className="bs-logo-placeholder">Logo</div>
      )}
    </div>
  )
}

function HeaderBlock({
  template,
  asOf,
  isBalanced,
  difference,
}: {
  template: BalanceSheetTemplate
  asOf: string
  isBalanced: boolean
  difference: number
}) {
  const { headerConfig } = template
  return (
    <header className="bs-doc-header">
      <h2 className="bs-doc-company">{headerConfig.companyName}</h2>
      <p className="bs-doc-title">{headerConfig.reportTitle}</p>
      {headerConfig.address ? (
        <p className="muted bs-doc-meta">{headerConfig.address}</p>
      ) : null}
      {headerConfig.taxId ? (
        <p className="muted bs-doc-meta">Tax ID / BIN: {headerConfig.taxId}</p>
      ) : null}
      {headerConfig.showDate ? (
        <p className="muted bs-doc-meta">As of {asOf.slice(0, 10)}</p>
      ) : null}
      {headerConfig.showStatusBadge ? (
        <p className="bs-doc-badge-wrap">
          {isBalanced ? (
            <span className="bs-badge-balanced">
              <span aria-hidden>✓</span> Balanced
            </span>
          ) : (
            <span className="bs-badge-imbalance">
              <span aria-hidden>⚠</span> Imbalance ({money(difference)})
            </span>
          )}
        </p>
      ) : null}
    </header>
  )
}

function MetricsBlock({ report }: { report: BalanceSheetReport }) {
  return (
    <section className="grid metric-card-grid bs-kpi-grid">
      <MetricCard
        className="bs-kpi-assets"
        variant="green"
        title="Total Assets"
        value={money(report.assets.total)}
      />
      <MetricCard
        className="bs-kpi-liabilities"
        variant="red"
        title="Total Liabilities"
        value={money(report.liabilities.total)}
      />
      <MetricCard
        className="bs-kpi-equity"
        variant="teal"
        title="Total Equity"
        value={money(report.equity.total)}
        meta={`Net income ${money(report.equity.netIncome)}`}
      />
      <MetricCard
        variant="purple"
        title="L&E Total"
        value={money(report.totalLiabilitiesAndEquity)}
      />
    </section>
  )
}

function FooterBlock({ template }: { template: BalanceSheetTemplate }) {
  const { footerConfig } = template
  const lines = [
    footerConfig.preparedByLabel,
    footerConfig.checkedByLabel,
    footerConfig.authorizedLabel,
  ]
  if (footerConfig.showManagingDirector) {
    lines.push(footerConfig.managingDirectorLabel)
  }
  if (footerConfig.showAuditor) {
    lines.push(footerConfig.auditorLabel)
  }

  return (
    <footer className="bs-signature-grid">
      {lines.map((label) => (
        <div key={label} className="bs-signature-slot">
          <div className="bs-signature-line" />
          <p>{label}</p>
        </div>
      ))}
    </footer>
  )
}

function showCodesFor(block: TemplateBlock | undefined): boolean {
  return block?.styles?.showAccountCodes !== false
}

function showPartiesFor(block: TemplateBlock | undefined): boolean {
  return block?.styles?.showPartyBreakdown === true
}

type Props = {
  report: BalanceSheetReport
  template: BalanceSheetTemplate
  interactive?: boolean
}

export function BalanceSheetDocument({
  report,
  template,
  interactive = true,
}: Props) {
  const blocks = [...template.layoutStructure]
    .filter(isBlockVisible)
    .sort((a, b) => a.position - b.position)

  const assetsBlock = blocks.find((b) => b.type === 'ASSETS_SECTION')
  const liabilitiesBlock = blocks.find((b) => b.type === 'LIABILITIES_SECTION')
  const equityBlock = blocks.find((b) => b.type === 'EQUITY_SECTION')

  return (
    <div className="bs-report bs-document bs-report--landscape">
      {blocks.map((block) => {
        switch (block.type) {
          case 'LOGO':
            return (
              <LogoBlock
                key={block.id}
                url={template.companyLogoUrl}
                align={block.styles?.logoAlign ?? 'center'}
              />
            )
          case 'COMPANY_HEADER':
            return (
              <HeaderBlock
                key={block.id}
                template={template}
                asOf={report.asOf}
                isBalanced={report.isBalanced}
                difference={report.difference}
              />
            )
          case 'METRIC_TILES':
            return <MetricsBlock key={block.id} report={report} />
          case 'ASSETS_SECTION':
            // Rendered once with liabilities/equity in landscape columns
            if (block.id !== assetsBlock?.id) return null
            return (
              <div key="bs-landscape-columns" className="bs-columns">
                <div className="table-card bs-column">
                  <div className="bs-column-head">
                    <h2>Assets (Debit)</h2>
                  </div>
                  {assetsBlock ? (
                    <>
                      <SectionBlock
                        section={report.assets.current}
                        showAccountCodes={showCodesFor(assetsBlock)}
                        showPartyBreakdown={showPartiesFor(assetsBlock)}
                        interactive={interactive}
                      />
                      <SectionBlock
                        section={report.assets.fixed}
                        showAccountCodes={showCodesFor(assetsBlock)}
                        showPartyBreakdown={showPartiesFor(assetsBlock)}
                        interactive={interactive}
                      />
                      <StatementTotal
                        label="TOTAL ASSETS"
                        amount={report.assets.total}
                        variant="grand"
                      />
                    </>
                  ) : null}
                </div>
                <div className="table-card bs-column">
                  <div className="bs-column-head">
                    <h2>Liabilities & Equity (Credit)</h2>
                  </div>
                  {liabilitiesBlock ? (
                    <>
                      <SectionBlock
                        section={report.liabilities.current}
                        showAccountCodes={showCodesFor(liabilitiesBlock)}
                        showPartyBreakdown={showPartiesFor(liabilitiesBlock)}
                        interactive={interactive}
                      />
                      <SectionBlock
                        section={report.liabilities.longTerm}
                        showAccountCodes={showCodesFor(liabilitiesBlock)}
                        showPartyBreakdown={showPartiesFor(liabilitiesBlock)}
                        interactive={interactive}
                      />
                      <StatementTotal
                        label="TOTAL LIABILITIES"
                        amount={report.liabilities.total}
                        variant="subtotal"
                      />
                    </>
                  ) : null}
                  {equityBlock ? (
                    <>
                      <SectionBlock
                        section={report.equity.section}
                        showAccountCodes={showCodesFor(equityBlock)}
                        showPartyBreakdown={false}
                        interactive={interactive}
                      />
                      <StatementTotal
                        label="TOTAL EQUITY"
                        amount={report.equity.total}
                        variant="subtotal"
                      />
                      <StatementTotal
                        label="TOTAL LIABILITIES & EQUITY"
                        amount={report.totalLiabilitiesAndEquity}
                        variant="grand"
                      />
                    </>
                  ) : null}
                </div>
              </div>
            )
          case 'LIABILITIES_SECTION':
          case 'EQUITY_SECTION':
            return null
          case 'FOOTER_SIGNATURES':
            return <FooterBlock key={block.id} template={template} />
          default:
            return null
        }
      })}
    </div>
  )
}

/** Lightweight sample figures for the template builder canvas. */
export function sampleBalanceSheetReport(): BalanceSheetReport {
  const line = (
    code: string,
    name: string,
    balance: number,
    depth: number,
    isHeader: boolean,
    extra?: Partial<BalanceSheetLine>,
  ): BalanceSheetLine => ({
    code,
    name,
    parentCode: null,
    balance,
    isHeader,
    isPostable: !isHeader,
    depth,
    ...extra,
  })

  return {
    asOf: new Date().toISOString(),
    assets: {
      current: {
        id: 'current_assets',
        title: 'Current Assets',
        total: 1_000_000,
        lines: [
          line('1100', 'Current Assets', 1_000_000, 0, true),
          line('1121', 'Client Receivables', 200_000, 2, false),
          line('1121:c1', 'Acme Ltd', 120_000, 3, false, {
            isParty: true,
            entityType: 'customer',
            entityId: 'c1',
            isPostable: false,
          }),
          line('1121:c2', 'Beta Traders', 80_000, 3, false, {
            isParty: true,
            entityType: 'customer',
            entityId: 'c2',
            isPostable: false,
          }),
          line('1131', 'Advance to Staff', 50_000, 2, false),
          line('1131:e1', 'Rahim Uddin', 50_000, 3, false, {
            isParty: true,
            entityType: 'employee',
            entityId: 'e1',
            isPostable: false,
          }),
          line('1111', 'Hand Cash', 150_000, 2, false),
          line('1112', 'BRAC Bank', 600_000, 2, false),
        ],
      },
      fixed: {
        id: 'fixed_assets',
        title: 'Fixed Assets',
        total: 0,
        lines: [line('1200', 'Fixed Assets', 0, 0, true)],
      },
      total: 1_000_000,
    },
    liabilities: {
      current: {
        id: 'current_liabilities',
        title: 'Current Liabilities',
        total: 250_000,
        lines: [
          line('2100', 'Current Liabilities', 250_000, 0, true),
          line('2111', 'Supplier Payables', 80_000, 2, false),
          line('2111:s1', 'Steel Supply Co', 80_000, 3, false, {
            isParty: true,
            entityType: 'supplier',
            entityId: 's1',
            isPostable: false,
          }),
          line('2113', 'Subcontractor Payables', 40_000, 2, false),
          line('2121', 'Unpaid Staff Salaries', 130_000, 2, false),
          line('2121:e1', 'Rahim Uddin', 70_000, 3, false, {
            isParty: true,
            entityType: 'employee',
            entityId: 'e1',
            isPostable: false,
          }),
          line('2121:e2', 'Karim Ali', 60_000, 3, false, {
            isParty: true,
            entityType: 'employee',
            entityId: 'e2',
            isPostable: false,
          }),
        ],
      },
      longTerm: {
        id: 'long_term_liabilities',
        title: 'Long-Term Liabilities',
        total: 0,
        lines: [line('2200', 'Long-Term Liabilities', 0, 0, true)],
      },
      total: 250_000,
    },
    equity: {
      section: {
        id: 'equity',
        title: 'Equity',
        total: 750_000,
        lines: [
          line('3000', 'Equity', 750_000, 0, true),
          line('3100', "Owner's Capital", 750_000, 1, false),
        ],
      },
      retainedEarnings: 0,
      netIncome: 0,
      total: 750_000,
    },
    totalLiabilitiesAndEquity: 1_000_000,
    isBalanced: true,
    difference: 0,
  }
}
