import { useEffect } from 'react'
import { ActionMenu } from './ui'
import {
  downloadReportCsv,
  downloadReportPdf,
  previewReportPdf,
  type ReportExport,
} from '../utils/reportExport'
import { loadCompanyBranding } from '../utils/companyBranding'

type Props = {
  payload: () => ReportExport
  disabled?: boolean
}

export function ReportExportMenu({ payload, disabled }: Props) {
  useEffect(() => {
    void loadCompanyBranding()
  }, [])

  async function withBranding(): Promise<ReportExport> {
    return { ...payload(), branding: await loadCompanyBranding() }
  }

  return (
    <ActionMenu
      label="Export"
      disabled={disabled}
      items={[
        {
          label: 'Preview PDF',
          onSelect: () => void withBranding().then(previewReportPdf),
        },
        {
          label: 'Download PDF',
          onSelect: () => void withBranding().then(downloadReportPdf),
        },
        {
          label: 'Export CSV',
          onSelect: () => void withBranding().then(downloadReportCsv),
        },
      ]}
    />
  )
}
