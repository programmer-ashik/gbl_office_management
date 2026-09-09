import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import { MetricCard } from "../components/MetricCard";
import { FileUploadField } from "../components/FileUploadField";
import { Select } from "../components/ui";
import { money } from "../types/accounting";
import {
  TREASURY_KIND_LABEL,
  type BankAdjustKind,
  type Reconciliation,
  type StatementLine,
  type TreasuryAccount,
} from "../types/banking";

const SAMPLE_CSV = `date,description,amount,reference
2026-09-01,Opening Balance,50000,
2026-09-02,Cash deposit,15000,TRF-1
2026-09-03,ATM withdrawal,-2000,WD-1
2026-09-03,Closing Balance,63000,`;

const ADJUST_OPTIONS = [
  { value: "bank_charge", label: "Bank charge (Dr 5250)" },
  { value: "bank_interest", label: "Bank interest (Cr 4200)" },
];

/** Matches backend DATE_MATCH_WINDOW_DAYS */
const DATE_MATCH_WINDOW_DAYS = 7;

function daysApartUtc(a: string, b: string): number {
  const ms =
    Date.UTC(
      new Date(a).getUTCFullYear(),
      new Date(a).getUTCMonth(),
      new Date(a).getUTCDate(),
    ) -
    Date.UTC(
      new Date(b).getUTCFullYear(),
      new Date(b).getUTCMonth(),
      new Date(b).getUTCDate(),
    );
  return Math.abs(Math.round(ms / 86_400_000));
}

function amountMatchesBook(
  statementAmount: number,
  entry: { debit: number; credit: number },
): boolean {
  if (statementAmount > 0) {
    return Math.abs(entry.debit - statementAmount) < 0.005;
  }
  if (statementAmount < 0) {
    return Math.abs(entry.credit - Math.abs(statementAmount)) < 0.005;
  }
  return false;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Unable to read file"));
    reader.readAsDataURL(file);
  });
}

function ReconClipText({
  id,
  text,
  expandedId,
  onToggle,
}: {
  id: string;
  text: string;
  expandedId: string | null;
  onToggle: (id: string | null) => void;
}) {
  const open = expandedId === id;
  const value = text.trim() || "—";
  return (
    <p
      className={`recon-clip${open ? " is-open" : ""}`}
      title={open ? "Click to collapse" : value}
      onClick={(event) => {
        event.stopPropagation();
        onToggle(open ? null : id);
      }}
    >
      {value}
    </p>
  );
}

export function TreasuryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [account, setAccount] = useState<TreasuryAccount | null>(null);
  const [sessions, setSessions] = useState<Reconciliation[]>([]);
  const [session, setSession] = useState<Reconciliation | null>(null);
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10));
  const [statementBalance, setStatementBalance] = useState("");
  const [openingBalance, setOpeningBalance] = useState("");
  const [csv, setCsv] = useState(SAMPLE_CSV);
  const [pdfBase64, setPdfBase64] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [parsingFile, setParsingFile] = useState(false);
  const [balanceHint, setBalanceHint] = useState<string | null>(null);
  const [selectedStatementId, setSelectedStatementId] = useState<string | null>(
    null,
  );
  const [expandedCell, setExpandedCell] = useState<string | null>(null);
  const [adjustKind, setAdjustKind] = useState<BankAdjustKind>("bank_charge");
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustDate, setAdjustDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [adjustMemo, setAdjustMemo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    if (!id) return;
    const ledger = await api.treasuryLedger(id);
    setAccount(ledger.account);
    const rows = await api.listTreasuryReconciliations(id);
    setSessions(rows);
    if (!session && rows[0] && rows[0].status !== "completed") {
      setSession(rows[0]);
    }
  }

  useEffect(() => {
    load().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "Unable to load account");
    });
  }, [id]);

  async function applyStatementPreview(body: {
    csv?: string;
    pdfBase64?: string;
  }) {
    if (!id) return;
    const preview = await api.previewStatement(id, body);
    if (preview.asOf) setAsOf(preview.asOf);
    if (preview.openingBalance != null) {
      setOpeningBalance(String(preview.openingBalance));
    }
    if (preview.closingBalance != null) {
      setStatementBalance(String(preview.closingBalance));
    }
    const parts: string[] = [];
    if (preview.periodFrom && preview.periodTo) {
      parts.push(
        `Period ${preview.periodFrom.slice(0, 10)} → ${preview.periodTo.slice(0, 10)}`,
      );
    }
    parts.push(`${preview.lineCount} transaction line(s)`);
    if (preview.openingBalance != null || preview.closingBalance != null) {
      parts.push("balances filled from statement");
    } else {
      parts.push("opening/closing not found — enter manually");
    }
    setBalanceHint(parts.join(" · "));
  }

  async function onImport(event: FormEvent) {
    event.preventDefault();
    if (!id) return;
    if (!pdfBase64 && !csv.trim()) {
      setError("Provide CSV text or upload a PDF/CSV statement file");
      return;
    }
    if (!statementBalance.trim()) {
      setError("Closing / ending balance is required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const imported = await api.importReconciliation(id, {
        asOf,
        statementBalance: Number(statementBalance),
        ...(pdfBase64 ? { pdfBase64 } : { csv }),
        openingBalance: openingBalance ? Number(openingBalance) : undefined,
        fileName: fileName || undefined,
      });
      setSession(imported);
      setSelectedStatementId(null);
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to import statement",
      );
    } finally {
      setSaving(false);
    }
  }

  async function onFile(file: File | null) {
    if (!file) return;
    setError(null);
    setBalanceHint(null);
    setFileName(file.name);
    const lower = file.name.toLowerCase();
    const isPdf = lower.endsWith(".pdf") || file.type === "application/pdf";
    const isExcel = lower.endsWith(".xlsx") || lower.endsWith(".xls");

    if (isExcel) {
      setPdfBase64(null);
      setError(
        "Excel (.xls/.xlsx) binary import is not supported yet — export the statement as CSV or PDF.",
      );
      return;
    }

    setParsingFile(true);
    try {
      if (isPdf) {
        const dataUrl = await readFileAsDataUrl(file);
        setPdfBase64(dataUrl);
        setCsv("");
        await applyStatementPreview({ pdfBase64: dataUrl });
      } else {
        const text = await file.text();
        setPdfBase64(null);
        setCsv(text);
        await applyStatementPreview({ csv: text });
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to read statement file",
      );
    } finally {
      setParsingFile(false);
    }
  }

  async function onDetectFromCsv() {
    if (!id || !csv.trim() || pdfBase64) return;
    setParsingFile(true);
    setError(null);
    try {
      await applyStatementPreview({ csv });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to detect statement balances",
      );
    } finally {
      setParsingFile(false);
    }
  }

  async function onAutoMatch() {
    if (!session) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await api.autoMatchReconciliation(session.id);
      setSession(updated);
      setSelectedStatementId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to auto-match");
    } finally {
      setSaving(false);
    }
  }

  async function onMatch(statementLineId: string, ledgerLineId: string) {
    if (!session) return;
    setError(null);
    try {
      const updated = await api.matchReconciliation(session.id, {
        statementLineId,
        ledgerLineId,
      });
      setSession(updated);
      setSelectedStatementId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to match line");
    }
  }

  async function onUnmatch(statementLineId: string) {
    if (!session) return;
    setError(null);
    try {
      const updated = await api.unmatchReconciliation(session.id, {
        statementLineId,
      });
      setSession(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to unmatch line");
    }
  }

  async function onAdjust(event: FormEvent) {
    event.preventDefault();
    if (!session) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await api.adjustReconciliation(session.id, {
        kind: adjustKind,
        amount: Number(adjustAmount),
        date: adjustDate,
        memo: adjustMemo || undefined,
      });
      setSession(updated);
      setAdjustAmount("");
      setAdjustMemo("");
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to post adjustment",
      );
    } finally {
      setSaving(false);
    }
  }

  async function onComplete() {
    if (!session) return;
    setError(null);
    try {
      const updated = await api.completeReconciliation(session.id);
      setSession(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to complete");
    }
  }

  const unmatchedStatement = useMemo(
    () => (session?.lines ?? []).filter((line) => line.status === "unmatched"),
    [session],
  );

  const selectedLine: StatementLine | undefined = useMemo(
    () => session?.lines.find((line) => line.id === selectedStatementId),
    [session, selectedStatementId],
  );

  const bookRows = useMemo(() => {
    if (!session) return [];
    const rows = session.unmatchedBook.map((entry) => {
      const candidate = selectedLine
        ? amountMatchesBook(selectedLine.amount, entry) &&
          daysApartUtc(entry.date, selectedLine.date) <= DATE_MATCH_WINDOW_DAYS
        : false;
      return { ...entry, candidate };
    });
    if (!selectedLine) return rows;
    return [...rows].sort((a, b) => Number(b.candidate) - Number(a.candidate));
  }, [session, selectedLine]);

  if (!account) {
    return error ? (
      <p className='form-error'>{error}</p>
    ) : (
      <p className='muted'>Loading…</p>
    );
  }

  const differenceTone =
    session && Math.abs(session.difference) < 0.005 ? "up" : "down";
  const importingLabel = parsingFile
    ? "Reading file…"
    : saving
      ? "Importing…"
      : "Import Bank Statement";

  return (
    <>
      <header className='workspace-header'>
        <div>
          <p className='eyebrow'>{account.glAccountCode}</p>
          <h1>{account.name}</h1>
          <p className='muted'>
            {TREASURY_KIND_LABEL[account.kind]}
            {account.institution ? ` · ${account.institution}` : ""}
            {" · "}
            Project-tagged bank reconciliation
          </p>
        </div>
        <div className='form-actions'>
          <Link to='/banking/reconciliation' className='ghost-link'>
            All channels
          </Link>
          <Link to='/banking' className='ghost-link'>
            Banking
          </Link>
        </div>
      </header>

      <section className='table-card recon-controls'>
        <div className='flex justify-between items-center'>
          <h2>Import bank statement</h2>
          <div className='w-3/4'>
            <p className='text-xs text-gray-400'>
              Upload PDF, CSV, or paste CSV. Opening, closing, and as-of date
              are filled automatically when the statement includes them (or when
              the date range can be inferred from transactions). You can still
              edit before import. Auto-match uses exact amount plus ref or ±
              {DATE_MATCH_WINDOW_DAYS} days.
            </p>
          </div>
        </div>
        <form className='stack-form' onSubmit={(event) => void onImport(event)}>
          <div className='name-row'>
            <label>
              Statement as of
              <input
                type='date'
                value={asOf}
                onChange={(e) => setAsOf(e.target.value)}
                required
              />
            </label>
            <label>
              Opening balance (optional)
              <input
                inputMode='decimal'
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
              />
            </label>
            <label>
              Closing / ending balance
              <input
                inputMode='decimal'
                value={statementBalance}
                onChange={(e) => setStatementBalance(e.target.value)}
                required
              />
            </label>
          </div>
          <FileUploadField
            label='Upload statement'
            accept='.pdf,.csv,.xlsx,.xls,application/pdf,text/csv,text/plain'
            hint='PDF or CSV · drag & drop or browse'
            onFile={(file) => void onFile(file)}
          />
          {balanceHint ? <p className='muted'>{balanceHint}</p> : null}
          {pdfBase64 ? (
            <p className='muted'>
              PDF ready{fileName ? `: ${fileName}` : ""} — balances detected on
              upload when present.
              {parsingFile ? " Reading…" : ""}
            </p>
          ) : (
            <label>
              CSV text {fileName ? `(${fileName})` : ""}
              <textarea
                rows={5}
                value={csv}
                onChange={(e) => {
                  setCsv(e.target.value);
                  setPdfBase64(null);
                  setBalanceHint(null);
                }}
                onBlur={() => {
                  if (csv.trim()) void onDetectFromCsv();
                }}
                required={!pdfBase64}
              />
            </label>
          )}
          <div className='form-actions'>
            {pdfBase64 ? (
              <button
                type='button'
                className='ghost'
                onClick={() => {
                  setPdfBase64(null);
                  setFileName("");
                  setCsv(SAMPLE_CSV);
                  setBalanceHint(null);
                }}
              >
                Clear PDF / use CSV
              </button>
            ) : (
              <button
                type='button'
                className='ghost'
                disabled={parsingFile || !csv.trim()}
                onClick={() => void onDetectFromCsv()}
              >
                Detect balances
              </button>
            )}
            <button type='submit' disabled={saving || parsingFile}>
              {importingLabel}
            </button>
          </div>
        </form>
      </section>

      {session ? (
        <>
          <section className='grid metric-card-grid mt-2'>
            <MetricCard
              variant='blue'
              title='Statement ending'
              value={money(session.statementBalance)}
              meta={session.reconciliationNumber}
            />
            <MetricCard
              variant='teal'
              title='Book balance'
              value={money(session.bookBalance)}
              meta={session.displayStatus.replace("_", " ")}
            />
            <MetricCard
              variant={Math.abs(session.difference) < 0.005 ? "green" : "amber"}
              title='Difference'
              value={money(session.difference)}
              valueTone={differenceTone}
              meta={
                session.isReconciled
                  ? "Ready to finalize"
                  : "Still out of balance"
              }
            />
          </section>

          <section className='recon-split'>
            <div className='table-card recon-pane'>
              <div className='table-head'>
                <h2>Bank statement lines</h2>
                <button
                  type='button'
                  className='ghost'
                  disabled={saving || session.status === "completed"}
                  onClick={() => void onAutoMatch()}
                >
                  Auto-match
                </button>
              </div>
              <div className='table-wrap'>
                <table className='recon-table'>
                  <thead>
                    <tr>
                      <th className='recon-col-date'>Date</th>
                      <th className='recon-col-ref'>Ref</th>
                      <th className='recon-col-memo'>Description</th>
                      <th className='num recon-col-amt'>Amount</th>
                      <th className='recon-col-status'>Status</th>
                      <th className='recon-col-action'></th>
                    </tr>
                  </thead>
                  <tbody>
                    {session.lines.map((line) => (
                      <tr
                        key={line.id}
                        className={
                          selectedStatementId === line.id
                            ? "is-selected"
                            : undefined
                        }
                        onClick={() =>
                          line.status === "unmatched"
                            ? setSelectedStatementId(line.id)
                            : setSelectedStatementId(null)
                        }
                      >
                        <td className='recon-col-date'>
                          {line.date.slice(0, 10)}
                        </td>
                        <td className='recon-col-ref'>
                          <ReconClipText
                            id={`stmt-ref-${line.id}`}
                            text={line.reference ?? "—"}
                            expandedId={expandedCell}
                            onToggle={setExpandedCell}
                          />
                        </td>
                        <td className='recon-col-memo'>
                          <ReconClipText
                            id={`stmt-desc-${line.id}`}
                            text={line.description}
                            expandedId={expandedCell}
                            onToggle={setExpandedCell}
                          />
                        </td>
                        <td className='num recon-col-amt'>
                          {money(line.amount)}
                        </td>
                        <td className='recon-col-status'>
                          <span
                            className={
                              line.status === "matched"
                                ? "badge-ok"
                                : "badge-warn"
                            }
                          >
                            {line.status === "matched"
                              ? "MATCHED"
                              : "UNMATCHED"}
                          </span>
                        </td>
                        <td className='recon-col-action'>
                          {line.status === "matched" &&
                          session.status !== "completed" ? (
                            <button
                              type='button'
                              className='ghost'
                              onClick={(event) => {
                                event.stopPropagation();
                                void onUnmatch(line.id);
                              }}
                            >
                              Unmatch
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className='table-card recon-pane'>
              <div className='table-head'>
                <h2>System bank book (unmatched)</h2>
                <p className='muted'>
                  {selectedLine
                    ? `Candidates (same amount, ±${DATE_MATCH_WINDOW_DAYS} days) highlighted — click Match`
                    : "Select an unmatched statement line first"}
                </p>
              </div>
              <div className='table-wrap'>
                <table className='recon-table'>
                  <thead>
                    <tr>
                      <th className='recon-col-date'>Date</th>
                      <th className='recon-col-journal'>Journal</th>
                      <th className='recon-col-memo'>Memo / ref</th>
                      <th className='num recon-col-amt'>Debit</th>
                      <th className='num recon-col-amt'>Credit</th>
                      <th className='recon-col-action'></th>
                    </tr>
                  </thead>
                  <tbody>
                    {bookRows.map((entry) => {
                      const memoText = entry.reference
                        ? `${entry.memo} · ${entry.reference}`
                        : entry.memo;
                      return (
                        <tr
                          key={entry.id}
                          className={
                            entry.candidate ? "is-candidate" : undefined
                          }
                        >
                          <td className='recon-col-date'>
                            {entry.date.slice(0, 10)}
                          </td>
                          <td className='recon-col-journal'>
                            {entry.entryNumber}
                          </td>
                          <td className='recon-col-memo'>
                            <ReconClipText
                              id={`book-memo-${entry.id}`}
                              text={memoText}
                              expandedId={expandedCell}
                              onToggle={setExpandedCell}
                            />
                          </td>
                          <td className='num recon-col-amt'>
                            {entry.debit ? money(entry.debit) : ""}
                          </td>
                          <td className='num recon-col-amt'>
                            {entry.credit ? money(entry.credit) : ""}
                          </td>
                          <td className='recon-col-action'>
                            <button
                              type='button'
                              className='ghost'
                              disabled={
                                !selectedStatementId ||
                                session.status === "completed"
                              }
                              onClick={() =>
                                selectedStatementId
                                  ? void onMatch(selectedStatementId, entry.id)
                                  : undefined
                              }
                            >
                              Match
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {bookRows.length === 0 ? (
                      <tr>
                        <td colSpan={6} className='muted'>
                          No unmatched book lines
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section className='table-card'>
            <div className='table-head'>
              <h2>Bank adjustment</h2>
              <p className='muted'>
                Post missed bank charges (5250) or interest (4200). Optional
                later project tagging via API projectId.
              </p>
            </div>
            <form
              className='stack-form'
              onSubmit={(event) => void onAdjust(event)}
            >
              <div className='name-row'>
                <label>
                  Type
                  <Select
                    value={adjustKind}
                    options={ADJUST_OPTIONS}
                    onChange={(value) => setAdjustKind(value as BankAdjustKind)}
                    disabled={session.status === "completed"}
                  />
                </label>
                <label>
                  Amount
                  <input
                    inputMode='decimal'
                    value={adjustAmount}
                    onChange={(e) => setAdjustAmount(e.target.value)}
                    required
                    disabled={session.status === "completed"}
                  />
                </label>
                <label>
                  Date
                  <input
                    type='date'
                    value={adjustDate}
                    onChange={(e) => setAdjustDate(e.target.value)}
                    required
                    disabled={session.status === "completed"}
                  />
                </label>
                <label>
                  Memo
                  <input
                    value={adjustMemo}
                    onChange={(e) => setAdjustMemo(e.target.value)}
                    disabled={session.status === "completed"}
                  />
                </label>
              </div>
              <div className='form-actions'>
                <button
                  type='submit'
                  disabled={saving || session.status === "completed"}
                >
                  Post adjustment
                </button>
              </div>
            </form>
          </section>

          <section className='recon-summary-bar'>
            <div>
              <span>Bank statement ending</span>
              <strong>{money(session.statementBalance)}</strong>
            </div>
            <div>
              <span>(+) Uncollected deposits</span>
              <strong>{money(session.uncollectedDeposits)}</strong>
            </div>
            <div>
              <span>(−) Unpresented cheques</span>
              <strong>{money(session.unpresentedCheques)}</strong>
            </div>
            <div>
              <span>(=) Calculated book</span>
              <strong>{money(session.calculatedBookBalance)}</strong>
            </div>
            <div
              className={
                Math.abs(session.difference) < 0.005
                  ? "is-balanced"
                  : "is-unbalanced"
              }
            >
              <span>Difference</span>
              <strong>{money(session.difference)}</strong>
            </div>
            <button
              type='button'
              disabled={!session.isReconciled || session.status === "completed"}
              onClick={() => void onComplete()}
            >
              {session.status === "completed"
                ? "Finalized"
                : "Finalize Reconciliation"}
            </button>
          </section>

          {unmatchedStatement.length > 0 ? (
            <p className='muted'>
              {unmatchedStatement.length} unmatched statement line(s) remain —
              select one and Match a book line, Auto-match, or post an
              adjustment.
            </p>
          ) : null}
        </>
      ) : null}

      {sessions.length > 0 ? (
        <section className='table-card'>
          <h2>Prior sessions</h2>
          <table>
            <thead>
              <tr>
                <th>Number</th>
                <th>As of</th>
                <th>Status</th>
                <th>Difference</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((row) => (
                <tr key={row.id}>
                  <td>{row.reconciliationNumber}</td>
                  <td>{row.asOf.slice(0, 10)}</td>
                  <td>{row.displayStatus}</td>
                  <td>{money(row.difference)}</td>
                  <td>
                    <button
                      type='button'
                      className='ghost'
                      onClick={() => setSession(row)}
                    >
                      Open
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {error ? <p className='form-error'>{error}</p> : null}
    </>
  );
}
