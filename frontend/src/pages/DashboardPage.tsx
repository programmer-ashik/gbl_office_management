import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { MetricCard } from "../components/MetricCard";
import { money } from "../types/accounting";
import type { CashFlowForecast, FinancialStatements } from "../types/analytics";
import { Role } from "../types/auth";
import type { TreasuryAccount } from "../types/banking";
import { NavIcon, type NavIconName } from "../nav/icons";
import { isPathDenied } from "../utils/rolePermissions";

type QuickLink = { to: string; label: string; hint: string; icon: NavIconName };

const EMPLOYEE_LINKS: QuickLink[] = [
  { to: "/advances", label: "Request advance", hint: "Submit and track requisitions", icon: "advance" },
  { to: "/advances/settlements", label: "Settle expenses", hint: "Vouchers for disbursed advances", icon: "settlement" },
  { to: "/quotations", label: "Quotations", hint: "Create and review quotes", icon: "invoice" },
  { to: "/settings/profile", label: "My profile", hint: "Account and password", icon: "profile" },
];

const PROJECT_MANAGER_LINKS: QuickLink[] = [
  { to: "/analytics/project-financials", label: "Project financials", hint: "Burn rate and budget KPIs", icon: "chart" },
  { to: "/projects", label: "Projects", hint: "Status and budgets", icon: "projects" },
  { to: "/approvals", label: "Approvals", hint: "Requests waiting on you", icon: "approval" },
  { to: "/advances", label: "Advances", hint: "Requisitions and settlements", icon: "advance" },
];

export function DashboardPage() {
  const { user } = useAuth();
  const [treasury, setTreasury] = useState<TreasuryAccount[] | null>(null);
  const [cashFlow, setCashFlow] = useState<CashFlowForecast | null>(null);
  const [statements, setStatements] = useState<FinancialStatements | null>(
    null,
  );
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);

  const isFinance = user?.role === Role.ADMIN || user?.role === Role.ACCOUNTANT;

  useEffect(() => {
    if (!isFinance) return;
    api
      .treasury()
      .then(setTreasury)
      .catch(() => setTreasury([]));
  }, [isFinance]);

  useEffect(() => {
    if (!isFinance) return;
    setAnalyticsError(null);
    void Promise.all([
      api
        .cashFlow()
        .then(setCashFlow)
        .catch((err: unknown) => {
          setAnalyticsError(
            err instanceof Error
              ? err.message
              : "Unable to load cash-flow forecast",
          );
        }),
      api
        .statements()
        .then(setStatements)
        .catch(() => setStatements(null)),
    ]);
  }, [isFinance]);

  const maxFlow = (() => {
    if (!cashFlow?.weeks.length) return 1;
    return Math.max(
      1,
      ...cashFlow.weeks.map((week) => Math.max(week.inflow, week.outflow)),
    );
  })();

  if (!user) {
    return null;
  }

  return (
    <>
      <header className='workspace-header'>
        <div>
          <h1>
            {isFinance ? "Executive overview" : `Welcome, ${user.firstName}`}
          </h1>
        </div>
      </header>

      {treasury ? (
        <section className='grid metric-card-grid'>
          <MetricCard
            variant='teal'
            title='Cash on hand'
            value={money(
              treasury
                .filter(
                  (row) => row.kind === "cash" || row.kind === "petty_cash",
                )
                .reduce((sum, row) => sum + row.bookBalance, 0),
            )}
            chart='wave'
            chartSeries={treasury
              .filter((row) => row.kind === "cash" || row.kind === "petty_cash")
              .map((row) => Math.max(0, row.bookBalance))}
            meta={<Link to='/banking'>Open banking</Link>}
          />
          <MetricCard
            variant='blue'
            title='Banks & wallets'
            value={money(
              treasury
                .filter(
                  (row) =>
                    row.kind === "commercial_bank" ||
                    row.kind === "mobile_banking",
                )
                .reduce((sum, row) => sum + row.bookBalance, 0),
            )}
            chart='bars'
            chartSeries={treasury
              .filter(
                (row) =>
                  row.kind === "commercial_bank" ||
                  row.kind === "mobile_banking",
              )
              .map((row) => Math.max(0, row.bookBalance))}
            meta={`${treasury.length} treasury channels`}
          />
          <MetricCard
            variant='purple'
            title='Total liquid'
            value={money(
              treasury.reduce((sum, row) => sum + row.bookBalance, 0),
            )}
            chart='donut'
            chartSeries={treasury.map((row) => Math.max(0, row.bookBalance))}
            meta='Book balances from the ledger'
          />
        </section>
      ) : null}

      {cashFlow ? (
        <section className='table-card'>
          <div className='table-head'>
            <h2>Cash-flow forecast</h2>
            <p className='muted'>
              8-week outlook · AR inflows vs AP, scheduled payments & draft
              payroll ·{" "}
              <Link to='/analytics/cash-flow'>Open full cash-flow view</Link>
            </p>
          </div>
          <section className='grid metric-card-grid'>
            <MetricCard
              variant='blue'
              title='Opening cash'
              value={money(cashFlow.openingCash)}
              chartSeries={cashFlow.weeks.map((w) => w.net)}
            />
            <MetricCard
              variant='green'
              title='Projected inflows'
              value={money(cashFlow.totalInflow)}
              valueTone='up'
              chart='spark'
              chartSeries={cashFlow.weeks.map((w) => w.inflow)}
              meta={`Open AR ${money(cashFlow.sources.openReceivables)}`}
            />
            <MetricCard
              variant='red'
              title='Projected outflows'
              value={money(cashFlow.totalOutflow)}
              valueTone='down'
              chart='spark'
              chartSeries={cashFlow.weeks.map((w) => w.outflow)}
              meta={
                <>
                  AP {money(cashFlow.sources.openPayables)} · Payroll{" "}
                  {money(cashFlow.sources.draftPayroll)}
                </>
              }
            />
            <MetricCard
              variant='amber'
              title='Projected close'
              value={money(cashFlow.projectedClosingCash)}
              valueTone={cashFlow.projectedClosingCash < 0 ? "down" : "default"}
              chartSeries={(() => {
                let running = cashFlow.openingCash
                return cashFlow.weeks.map((w) => {
                  running += w.net
                  return running
                })
              })()}
            />
          </section>
          <div className='cashflow-bars'>
            {cashFlow.weeks.map((week) => (
              <div key={week.weekStart} className='cashflow-row'>
                <span>{week.weekLabel}</span>
                <div className='cashflow-track' aria-hidden>
                  <div
                    className='cashflow-in'
                    style={{ width: `${(week.inflow / maxFlow) * 100}%` }}
                  />
                  <div
                    className='cashflow-out'
                    style={{ width: `${(week.outflow / maxFlow) * 100}%` }}
                  />
                </div>
                <span className={week.net < 0 ? "loss" : "gain"}>
                  {money(week.net)}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {analyticsError ? <p className='form-error'>{analyticsError}</p> : null}

      {statements ? (
        <section className='grid metric-card-grid mt-2'>
          <MetricCard
            variant='green'
            title='Revenue (P&L)'
            value={money(statements.profitAndLoss.revenue)}
            valueTone='up'
            meta={`As of ${statements.asOf.slice(0, 10)}`}
          />
          <MetricCard
            variant='red'
            title='Expenses (P&L)'
            value={money(statements.profitAndLoss.expenses)}
            valueTone='down'
          />
          <MetricCard
            variant='purple'
            title='Net income'
            value={money(statements.profitAndLoss.netIncome)}
            valueTone={statements.profitAndLoss.netIncome < 0 ? "down" : "up"}
          />
          <MetricCard
            variant='blue'
            title='Balance sheet'
            value={money(statements.balanceSheet.assets)}
            meta={
              <>
                Assets · Liab. {money(statements.balanceSheet.liabilities)} ·
                Equity {money(statements.balanceSheet.equity)}
              </>
            }
          />
        </section>
      ) : null}

      {!isFinance ? (
        <>
          <nav className='quick-links' aria-label='Quick links'>
            {(user.role === Role.PROJECT_MANAGER
              ? PROJECT_MANAGER_LINKS
              : EMPLOYEE_LINKS
            )
              .filter(
                (link) =>
                  !isPathDenied(
                    user.role,
                    link.to,
                    user.allowedPermissions,
                    user.deniedPermissions ?? [],
                  ),
              )
              .map((link) => (
              <Link key={link.to} to={link.to} className='quick-link'>
                <NavIcon name={link.icon} size={20} />
                <span>
                  <strong>{link.label}</strong>
                  <small>{link.hint}</small>
                </span>
              </Link>
            ))}
          </nav>
          <p className='muted'>
            Full financials stay with Admin and Accountant.
          </p>
        </>
      ) : null}
    </>
  );
}
