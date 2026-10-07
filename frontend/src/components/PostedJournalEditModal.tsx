import { useEffect, useState, type FormEvent } from "react";
import { api } from "../api/client";
import {
  JOURNAL_LINE_DESCRIPTION_MAX,
  money,
  type JournalEntry,
} from "../types/accounting";
import { Modal } from "./ui";

type Props = {
  entry: JournalEntry | null;
  onClose: () => void;
  onSaved: (updated: JournalEntry) => void;
};

/**
 * Date and line descriptions of a posted journal. Accounts, amounts, parties
 * and projects stay read-only — changing them needs a reversal.
 */
export function PostedJournalEditModal({ entry, onClose, onSaved }: Props) {
  const [full, setFull] = useState<JournalEntry | null>(null);
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState<string[]>([]);
  const [dateLockedReason, setDateLockedReason] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setFull(null);
    setError(null);
    setDateLockedReason(null);
    if (!entry) return;
    let cancelled = false;
    Promise.all([
      entry.lines?.length ? Promise.resolve(entry) : api.journal(entry.id),
      api.journalEditability(entry.id),
    ])
      .then(([journal, editability]) => {
        if (cancelled) return;
        setFull(journal);
        setDate(journal.date.slice(0, 10));
        setNotes(journal.lines.map((line) => line.description ?? ""));
        setDateLockedReason(editability.dateLockedReason);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unable to load journal");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [entry]);

  const overLimit = (index: number) => {
    const text = (notes[index] ?? "").trim();
    return (
      text.length > JOURNAL_LINE_DESCRIPTION_MAX &&
      text !== (full?.lines[index]?.description ?? "").trim()
    );
  };
  const blocked = notes.some((_, index) => overLimit(index));

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!full) return;
    const changedLines = notes
      .map((text, index) => ({ index, description: text.trim() }))
      .filter(
        ({ index, description }) =>
          description !== (full.lines[index].description ?? "").trim(),
      );
    const dateChanged = date !== full.date.slice(0, 10);
    if (!dateChanged && changedLines.length === 0) {
      onClose();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await api.updatePostedJournal(full.id, {
        ...(dateChanged ? { date } : {}),
        ...(changedLines.length > 0 ? { lines: changedLines } : {}),
      });
      onSaved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save changes");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={Boolean(entry)}
      title={entry ? `Edit ${entry.entryNumber}` : "Edit journal"}
      description="Posted journal: only the date and descriptions can change. To change accounts or amounts, reverse it and post a corrected entry."
      onClose={() => {
        if (!saving) onClose();
      }}
      wide
    >
      {!full ? (
        error ? (
          <p className="form-error">{error}</p>
        ) : (
          <p className="muted">Loading journal…</p>
        )
      ) : (
        <form className="stack-form" onSubmit={(e) => void onSubmit(e)}>
          <label>
            Date
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              disabled={Boolean(dateLockedReason)}
              required
            />
            {dateLockedReason ? (
              <span className="field-hint">{dateLockedReason}</span>
            ) : null}
          </label>

          <div className="posted-edit-lines">
            {full.lines.map((line, index) => (
              <div key={`${line.accountCode}-${index}`} className="posted-edit-line">
                <div className="posted-edit-line-head">
                  <strong>{line.accountName || line.accountCode}</strong>
                  {line.entityName ? (
                    <span className="muted"> · {line.entityName}</span>
                  ) : null}
                  <span className="posted-edit-line-amount">
                    {line.debit > 0
                      ? `Dr ${money(line.debit)}`
                      : `Cr ${money(line.credit)}`}
                  </span>
                </div>
                <textarea
                  aria-label={`Description line ${index + 1}`}
                  value={notes[index] ?? ""}
                  onChange={(e) =>
                    setNotes((current) =>
                      current.map((text, i) => (i === index ? e.target.value : text)),
                    )
                  }
                  maxLength={JOURNAL_LINE_DESCRIPTION_MAX}
                  rows={3}
                  placeholder="Line note"
                />
                <span className={overLimit(index) ? "form-error" : "field-hint"}>
                  {(notes[index] ?? "").length} / {JOURNAL_LINE_DESCRIPTION_MAX}
                  {(notes[index] ?? "").length > JOURNAL_LINE_DESCRIPTION_MAX
                    ? overLimit(index)
                      ? " · shorten to save this line"
                      : " · saved before the limit; kept unless you edit it"
                    : ""}
                </span>
              </div>
            ))}
          </div>

          {error ? <p className="form-error">{error}</p> : null}
          <div className="form-actions">
            <button
              type="button"
              className="ghost"
              disabled={saving}
              onClick={onClose}
            >
              Cancel
            </button>
            <button type="submit" disabled={saving || blocked}>
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
