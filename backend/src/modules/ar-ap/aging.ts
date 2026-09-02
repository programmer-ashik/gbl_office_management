import type { AgingBucketKey } from '../../common/enums/ar-ap.enum';

export type AgingLine = {
  id: string;
  reference: string;
  partyName: string;
  date: string;
  dueDate: string;
  daysPastDue: number;
  bucket: AgingBucketKey;
  openAmount: number;
};

export type AgingBucket = {
  key: AgingBucketKey;
  label: string;
  amount: number;
  lines: AgingLine[];
};

export type AgingReport = {
  asOf: string;
  total: number;
  buckets: AgingBucket[];
};

const BUCKET_ORDER: AgingBucketKey[] = [
  'current',
  'days_1_30',
  'days_31_60',
  'days_61_90',
  'days_90_plus',
];

const BUCKET_LABEL: Record<AgingBucketKey, string> = {
  current: 'Current',
  days_1_30: '1–30 days',
  days_31_60: '31–60 days',
  days_61_90: '61–90 days',
  days_90_plus: '90+ days',
};

export function classifyAgingBucket(daysPastDue: number): AgingBucketKey {
  if (daysPastDue <= 0) {
    return 'current';
  }
  if (daysPastDue <= 30) {
    return 'days_1_30';
  }
  if (daysPastDue <= 60) {
    return 'days_31_60';
  }
  if (daysPastDue <= 90) {
    return 'days_61_90';
  }
  return 'days_90_plus';
}

export function daysPastDue(asOf: Date, dueDate: Date): number {
  const start = Date.UTC(
    asOf.getUTCFullYear(),
    asOf.getUTCMonth(),
    asOf.getUTCDate(),
  );
  const end = Date.UTC(
    dueDate.getUTCFullYear(),
    dueDate.getUTCMonth(),
    dueDate.getUTCDate(),
  );
  return Math.floor((start - end) / 86_400_000);
}

export function buildAgingReport(
  asOf: Date,
  lines: Omit<AgingLine, 'bucket' | 'daysPastDue'>[],
): AgingReport {
  const enriched = lines.map((line) => {
    const due = new Date(line.dueDate);
    const pastDue = daysPastDue(asOf, due);
    return {
      ...line,
      daysPastDue: pastDue,
      bucket: classifyAgingBucket(pastDue),
    };
  });

  const buckets = BUCKET_ORDER.map((key) => {
    const bucketLines = enriched.filter((line) => line.bucket === key);
    const amount = bucketLines.reduce((sum, line) => sum + line.openAmount, 0);
    return {
      key,
      label: BUCKET_LABEL[key],
      amount: Number(amount.toFixed(2)),
      lines: bucketLines,
    };
  });

  return {
    asOf: asOf.toISOString(),
    total: Number(
      enriched.reduce((sum, line) => sum + line.openAmount, 0).toFixed(2),
    ),
    buckets,
  };
}
