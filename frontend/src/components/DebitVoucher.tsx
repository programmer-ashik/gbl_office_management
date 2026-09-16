import type { CSSProperties } from "react";
import { resolveAssetUrl } from "../types/report-template";

export type VoucherThemeId =
  | "yellow"
  | "blue"
  | "emerald"
  | "crimson"
  | "charcoal";

export type VoucherTheme = {
  id: VoucherThemeId;
  name: string;
  /** Sidebar / accent hex for PDF + CSS */
  accent: string;
  /** Readable text/line color on the sidebar */
  sidebarText: string;
  sidebarClass: string;
  sidebarTextClass: string;
  sidebarMutedClass: string;
  sidebarLineClass: string;
  textClass: string;
  accentBarClass: string;
};

export const VOUCHER_COLOR_THEMES: VoucherTheme[] = [
  {
    id: "yellow",
    name: "Classic Yellow",
    accent: "#f1b80d",
    sidebarText: "#0f172a",
    sidebarClass: "bg-[#f1b80d]",
    sidebarTextClass: "text-slate-900",
    sidebarMutedClass: "text-slate-900/60",
    sidebarLineClass: "border-slate-950/40",
    textClass: "text-[#f1b80d]",
    accentBarClass: "bg-[#f1b80d]",
  },
  {
    id: "blue",
    name: "Royal Blue",
    accent: "#2563eb",
    sidebarText: "#ffffff",
    sidebarClass: "bg-blue-600",
    sidebarTextClass: "text-white",
    sidebarMutedClass: "text-white/70",
    sidebarLineClass: "border-white/50",
    textClass: "text-blue-600",
    accentBarClass: "bg-blue-600",
  },
  {
    id: "emerald",
    name: "Emerald Green",
    accent: "#059669",
    sidebarText: "#ffffff",
    sidebarClass: "bg-emerald-600",
    sidebarTextClass: "text-white",
    sidebarMutedClass: "text-white/70",
    sidebarLineClass: "border-white/50",
    textClass: "text-emerald-600",
    accentBarClass: "bg-emerald-600",
  },
  {
    id: "crimson",
    name: "Crimson Red",
    accent: "#e11d48",
    sidebarText: "#ffffff",
    sidebarClass: "bg-rose-600",
    sidebarTextClass: "text-white",
    sidebarMutedClass: "text-white/70",
    sidebarLineClass: "border-white/50",
    textClass: "text-rose-600",
    accentBarClass: "bg-rose-600",
  },
  {
    id: "charcoal",
    name: "Charcoal Dark",
    accent: "#1e293b",
    sidebarText: "#f8fafc",
    sidebarClass: "bg-slate-800",
    sidebarTextClass: "text-slate-50",
    sidebarMutedClass: "text-slate-300/80",
    sidebarLineClass: "border-slate-200/40",
    textClass: "text-slate-800",
    accentBarClass: "bg-slate-800",
  },
];

export function getVoucherTheme(id?: string | null): VoucherTheme {
  return (
    VOUCHER_COLOR_THEMES.find((t) => t.id === id) ?? VOUCHER_COLOR_THEMES[0]!
  );
}

export type VoucherLineItem = {
  id: string;
  description: string;
  major: string;
  minor: string;
};

export type VoucherSignatory = {
  id: string;
  title: string;
  name?: string;
};

export type DebitCreditVoucherProps = {
  kind: "debit" | "credit";
  companyName: string;
  companySubtitle?: string;
  companyLogoUrl?: string | null;
  voucherNo: string;
  day: string;
  month: string;
  year: string;
  receivedBy?: string;
  /** Debit: Paid to; Credit: Received from */
  partyLabel?: string;
  partyName?: string;
  currencyLabel?: string;
  majorUnitLabel?: string;
  minorUnitLabel?: string;
  amountInWordsLabel?: string;
  amountInWords?: string;
  items: VoucherLineItem[];
  signatories: VoucherSignatory[];
  themeId?: VoucherThemeId | string;
  showWatermark?: boolean;
  className?: string;
  style?: CSSProperties;
};

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  const n = Number.parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function voucherAccentRgb(
  themeId?: string | null,
): [number, number, number] {
  return hexToRgb(getVoucherTheme(themeId).accent);
}

export function voucherSidebarTextRgb(
  themeId?: string | null,
): [number, number, number] {
  return hexToRgb(getVoucherTheme(themeId).sidebarText);
}

/**
 * Print-ready Debit / Credit voucher layout (landscape paper template).
 * Used by Settings preview and mirrors the PDF output.
 */
export function DebitCreditVoucherView({
  kind,
  companyName,
  companySubtitle = "",
  companyLogoUrl,
  voucherNo,
  day,
  month,
  year,
  receivedBy = "",
  partyLabel,
  partyName = "",
  currencyLabel = "Amount in BDT",
  majorUnitLabel = "TAKA",
  minorUnitLabel = "PAISA",
  amountInWordsLabel = "Amount in words Taka:",
  amountInWords = "",
  items,
  signatories,
  themeId = "yellow",
  showWatermark = true,
  className = "",
  style,
}: DebitCreditVoucherProps) {
  const theme = getVoucherTheme(themeId);
  const title = kind === "debit" ? "DEBIT VOUCHER" : "CREDIT VOUCHER";
  const resolvedPartyLabel =
    partyLabel ?? (kind === "debit" ? "Paid to:" : "Received from:");
  const logoSrc = resolveAssetUrl(companyLogoUrl ?? null);

  const totalMajor = items.reduce(
    (sum, row) =>
      sum + (Number.parseFloat(String(row.major).replace(/,/g, "")) || 0),
    0,
  );
  const totalMinorRaw = items.reduce(
    (sum, row) => sum + (Number.parseInt(String(row.minor), 10) || 0),
    0,
  );
  const carry = Math.floor(totalMinorRaw / 100);
  const totalMinor = totalMinorRaw % 100;
  const totalMajorFmt = Math.floor(totalMajor + carry).toLocaleString("en-US");
  const totalMinorFmt = String(totalMinor).padStart(2, "0");

  const blankRows = Math.max(0, 3 - items.length);

  return (
    <div
      className={`w-full max-w-[920px] bg-white overflow-hidden border border-slate-200 ${className}`}
      style={{ minHeight: 540, ...style }}
    >
      <div className='flex flex-col md:flex-row h-full min-h-[540px]'>
        {/* Left sidebar */}
        <div
          className={`w-full md:w-[32%] ${theme.sidebarClass} ${theme.sidebarTextClass} p-6 flex flex-col justify-between relative overflow-hidden print:w-[32%]`}
        >
          <svg
            className={`absolute -left-12 -bottom-12 w-64 h-64 opacity-15 pointer-events-none ${theme.sidebarTextClass}`}
            fill='currentColor'
            viewBox='0 0 100 100'
            aria-hidden
          >
            <path d='M0,50 Q25,30 50,50 T100,50 L100,100 L0,100 Z' />
            <circle
              cx='50'
              cy='50'
              r='40'
              fill='none'
              stroke='currentColor'
              strokeWidth='2'
            />
          </svg>

          <div className='relative z-10'>
            <div className='w-full text-center'>
              {logoSrc ? (
                <img
                  src={logoSrc}
                  alt=''
                  className='mx-auto mb-2 h-12 w-12 object-contain'
                />
              ) : null}
              <h2
                className={`font-extrabold tracking-wider text-sm sm:text-base uppercase leading-tight ${theme.sidebarTextClass}`}
              >
                {companyName || "Company"}
              </h2>
              {companySubtitle ? (
                <p
                  className={`text-[9px] tracking-widest font-light uppercase mt-0.5 ${theme.sidebarMutedClass}`}
                >
                  {companySubtitle}
                </p>
              ) : null}
            </div>
          </div>

          <div className='relative z-10 my-8 space-y-5'>
            {signatories.map((sig) => (
              <div key={sig.id} className='space-y-1'>
                <div
                  className={`flex justify-between items-baseline text-[11px] font-bold tracking-tight ${theme.sidebarTextClass}`}
                >
                  <span>{sig.title}:</span>
                  {sig.name ? (
                    <span
                      className={`italic font-medium text-[11px] ${theme.sidebarTextClass}`}
                    >
                      {sig.name}
                    </span>
                  ) : null}
                </div>
                <div
                  className={`border-b w-full pt-1 ${theme.sidebarLineClass}`}
                />
              </div>
            ))}
          </div>

          <div
            className={`relative z-10 pt-2 text-[10px] font-mono tracking-wider uppercase ${theme.sidebarMutedClass}`}
          >
            Official Financial Document
          </div>
        </div>

        {/* Main content */}
        <div className='w-full md:w-[68%] bg-[#fcfcfc] p-6 sm:p-8 flex flex-col justify-between relative print:w-[68%]'>
          {showWatermark ? (
            <div className='absolute inset-0 opacity-[0.04] pointer-events-none flex items-center justify-center overflow-hidden'>
              <svg
                className='w-[120%] h-[120%]'
                fill='currentColor'
                viewBox='0 0 1000 500'
                aria-hidden
              >
                <path d='M150 150 Q 200 100 300 180 T 500 200 T 700 120 T 900 220 L 900 400 L 100 400 Z' />
                <circle cx='250' cy='200' r='80' />
                <circle cx='650' cy='250' r='110' />
                <circle cx='450' cy='180' r='60' />
              </svg>
            </div>
          ) : null}

          <div className='relative z-10 space-y-6'>
            <div className='flex flex-row justify-between items-start gap-4'>
              <div>
                <span className='text-[10px] font-black text-slate-800 tracking-wider block mb-1'>
                  DATE
                </span>
                <div className='flex space-x-1.5'>
                  {[
                    { label: "DAY", value: day, w: "w-11" },
                    { label: "MONTH", value: month, w: "w-11" },
                    { label: "YEAR", value: year, w: "w-14" },
                  ].map((box) => (
                    <div
                      key={box.label}
                      className={`border border-slate-300 rounded bg-white text-center ${box.w} h-11 flex flex-col justify-between py-0.5 shadow-sm`}
                    >
                      <span className='text-[11px] font-bold text-slate-800 leading-none mt-1 font-mono'>
                        {box.value}
                      </span>
                      <span className='text-[7px] font-semibold text-slate-400 tracking-widest uppercase'>
                        {box.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className='text-right'>
                <h1 className='text-2xl sm:text-3xl font-black tracking-tight text-slate-900 uppercase leading-none'>
                  {title}
                </h1>
                <div
                  className={`h-1.5 w-16 ml-auto mt-2 rounded-full ${theme.accentBarClass}`}
                />
              </div>
            </div>

            <div className='space-y-2 pt-2'>
              <div className='flex items-baseline justify-end space-x-2 text-xs'>
                <span className='text-slate-700 font-semibold'>
                  Voucher Nu#
                </span>
                <span className='font-mono font-bold text-base text-slate-900 tracking-wider'>
                  {voucherNo}
                </span>
              </div>
              <div className='flex items-baseline space-x-2 text-xs'>
                <span className='font-semibold text-slate-800 whitespace-nowrap'>
                  Received By:
                </span>
                <div className='flex-1 border-b border-slate-400 pb-0.5 font-medium text-slate-800 min-h-[1.1rem]'>
                  {receivedBy}
                </div>
              </div>
            </div>

            <div className='border border-slate-400 overflow-hidden bg-white'>
              <div className='grid grid-cols-12 border-b border-slate-400 text-xs'>
                <div className='col-span-8 p-2.5 font-semibold text-slate-800 flex items-center flex-wrap gap-1'>
                  {resolvedPartyLabel}
                  <span className='ml-1 font-normal text-slate-900'>
                    {partyName}
                  </span>
                </div>
                <div className='col-span-4 border-l border-slate-400 flex flex-col'>
                  <div className='text-center font-bold py-1 border-b border-slate-300 text-[11px] text-slate-800 bg-slate-50'>
                    {currencyLabel}
                  </div>
                  <div className='grid grid-cols-2 text-[9px] font-bold text-center py-0.5 text-slate-600 bg-slate-100'>
                    <span className='border-r border-slate-300'>
                      {majorUnitLabel}
                    </span>
                    <span>{minorUnitLabel}</span>
                  </div>
                </div>
              </div>

              <div className='grid grid-cols-12 min-h-[160px]'>
                <div className='col-span-8 p-3 space-y-2 text-xs relative'>
                  <span className='text-[10px] font-semibold text-slate-500 block mb-1'>
                    Being the amount
                  </span>
                  <div className='space-y-2.5'>
                    {items.map((item) => (
                      <div
                        key={item.id}
                        className='border-b border-slate-200 pb-1 text-slate-800 text-xs'
                      >
                        {item.description || "—"}
                      </div>
                    ))}
                    {Array.from({ length: blankRows }).map((_, i) => (
                      <div
                        key={`blank-${i}`}
                        className='border-b border-slate-200 h-5'
                      />
                    ))}
                  </div>
                </div>
                <div className='col-span-4 border-l border-slate-400 grid grid-cols-2 font-mono text-xs'>
                  <div className='border-r border-slate-300 p-2 text-right space-y-2.5'>
                    {items.map((item) => (
                      <div
                        key={`${item.id}-m`}
                        className='h-5 flex items-center justify-end font-semibold'
                      >
                        {item.major || "0"}
                      </div>
                    ))}
                  </div>
                  <div className='p-2 text-right space-y-2.5'>
                    {items.map((item) => (
                      <div
                        key={`${item.id}-c`}
                        className='h-5 flex items-center justify-end text-slate-600'
                      >
                        {item.minor || "00"}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className='grid grid-cols-12 border-t border-slate-400 bg-slate-50 text-xs'>
                <div className='col-span-8 p-2.5 flex flex-col justify-center'>
                  <span className='text-[9px] font-bold text-slate-600 uppercase tracking-tight'>
                    {amountInWordsLabel}
                  </span>
                  <p className='italic text-slate-900 font-medium text-xs mt-0.5 leading-snug'>
                    {amountInWords}
                  </p>
                </div>
                <div className='col-span-4 border-l border-slate-400 grid grid-cols-12 items-center bg-slate-200'>
                  <div className='col-span-5 text-center font-black text-xs text-slate-800 tracking-wider'>
                    TOTAL
                  </div>
                  <div className='col-span-7 border-l border-slate-400 h-full grid grid-cols-2 bg-slate-300 font-mono font-bold text-xs'>
                    <div className='border-r border-slate-400 flex items-center justify-end px-1.5 text-slate-950'>
                      {totalMajorFmt}
                    </div>
                    <div className='flex items-center justify-end px-1.5 text-slate-900'>
                      {totalMinorFmt}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className='relative z-10 pt-4 flex justify-between items-center text-[9px] text-slate-400 uppercase tracking-widest font-mono'>
            <span>System Generated Voucher</span>
            <span>Authentic Signature Required</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** @deprecated use DebitCreditVoucherView */
export default DebitCreditVoucherView;
