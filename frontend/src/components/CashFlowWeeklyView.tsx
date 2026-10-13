import { useMemo, useState } from "react";
import { money } from "../types/accounting";
import type { CashFlowForecast } from "../types/analytics";
import { CashFlowChart } from "./CashFlowChart";

type ForecastView = "chart" | "table";
const VIEW_KEY = "cashflow-view";

/** Weekly cash-flow outlook with a chart / table switch. */
export function CashFlowWeeklyView({ forecast }: { forecast: CashFlowForecast }) {
  const [view, setView] = useState<ForecastView>(() =>
    localStorage.getItem(VIEW_KEY) === "table" ? "table" : "chart",
  );

  function changeView(next: ForecastView) {
    setView(next);
    localStorage.setItem(VIEW_KEY, next);
  }

  const weekRows = useMemo(() => {
    let balance = forecast.openingCash;
    return forecast.weeks.map((week) => {
      balance += week.net;
      return { week, balance };
    });
  }, [forecast]);

  const totalNet = forecast.totalInflow - forecast.totalOutflow;

  return (
    <>
      <div className='cf-toolbar'>
        <h3>Weekly outlook</h3>
        <div className='cf-view-toggle' role='group' aria-label='Forecast view'>
          <button
            type='button'
            className={view === "chart" ? "ghost is-active" : "ghost"}
            aria-pressed={view === "chart"}
            onClick={() => changeView("chart")}
          >
            Chart
          </button>
          <button
            type='button'
            className={view === "table" ? "ghost is-active" : "ghost"}
            aria-pressed={view === "table"}
            onClick={() => changeView("table")}
          >
            Table
          </button>
        </div>
      </div>

      {view === "chart" ? (
        <CashFlowChart weeks={forecast.weeks} openingCash={forecast.openingCash} />
      ) : (
        <div className='table-scroll'>
          <table className='fixed-table cf-table'>
            <thead>
              <tr>
                <th>Week</th>
                <th className='num'>Inflow</th>
                <th className='num'>Outflow</th>
                <th className='num'>Net</th>
                <th className='num'>Projected cash</th>
              </tr>
            </thead>
            <tbody>
              <tr className='cf-opening-row'>
                <td>Opening cash</td>
                <td className='num'>—</td>
                <td className='num'>—</td>
                <td className='num'>—</td>
                <td className='num'>{money(forecast.openingCash)}</td>
              </tr>
              {weekRows.map(({ week, balance }) => (
                <tr key={week.weekStart}>
                  <td>{week.weekLabel}</td>
                  <td className='num gain'>{money(week.inflow)}</td>
                  <td className='num loss'>{money(week.outflow)}</td>
                  <td className={`num ${week.net < 0 ? "loss" : "gain"}`}>
                    {money(week.net)}
                  </td>
                  <td className={`num${balance < 0 ? " loss" : ""}`}>
                    {money(balance)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Total · {forecast.weeks.length} weeks</td>
                <td className='num'>{money(forecast.totalInflow)}</td>
                <td className='num'>{money(forecast.totalOutflow)}</td>
                <td className={`num ${totalNet < 0 ? "loss" : "gain"}`}>
                  {money(totalNet)}
                </td>
                <td className='num'>{money(forecast.projectedClosingCash)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </>
  );
}
