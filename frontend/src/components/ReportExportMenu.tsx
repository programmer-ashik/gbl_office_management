import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { ActionMenu } from './ui'
import { resolveAssetUrl } from '../types/report-template'
import {
  downloadReportCsv,
  downloadReportPdf,
  previewReportPdf,
  type ReportBranding,
  type ReportExport,
} from '../utils/reportExport'

type Props = {
  payload: () => ReportExport
  disabled?: boolean
}

export function ReportExportMenu({ payload, disabled }: Props) {
  const [branding, setBranding] = useState<ReportBranding>({
    companyName: 'GBL Enterprise',
    address: '',
    logoDataUrl: null,
  })

  useEffect(() => {
    let active = true
    api
      .journalVoucherTemplate()
      .then(async (template) => {
        const logoUrl = resolveAssetUrl(template.companyLogoUrl)
        const logoDataUrl = logoUrl ? await loadImageDataUrl(logoUrl) : null
        if (!active) return
        setBranding({
          companyName: template.headerConfig?.companyName || 'GBL Enterprise',
          address: template.headerConfig?.address || '',
          logoDataUrl,
        })
      })
      .catch(() => {
        /* keep defaults */
      })
    return () => {
      active = false
    }
  }, [])

  function withBranding(): ReportExport {
    return { ...payload(), branding }
  }

  return (
    <ActionMenu
      label="Export"
      disabled={disabled}
      items={[
        {
          label: 'Preview PDF',
          onSelect: () => previewReportPdf(withBranding()),
        },
        {
          label: 'Download PDF',
          onSelect: () => downloadReportPdf(withBranding()),
        },
        {
          label: 'Export CSV',
          onSelect: () => downloadReportCsv(withBranding()),
        },
      ]}
    />
  )
}

async function loadImageDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { credentials: 'include' })
    if (!res.ok) return null
    const blob = await res.blob()
    return await new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}
