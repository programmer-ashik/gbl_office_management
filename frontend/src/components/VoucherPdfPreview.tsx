import { Modal } from './ui'

export function VoucherPdfPreview({
  url,
  title,
  onClose,
}: {
  url: string | null
  title: string
  onClose: () => void
}) {
  return (
    <Modal open={url != null} title={title} onClose={onClose} wide>
      {url ? (
        <embed
          title={title}
          src={url}
          type="application/pdf"
          style={{
            width: '100%',
            height: '72vh',
            border: '1px solid #d4d4d8',
            background: '#525659',
          }}
        />
      ) : null}
    </Modal>
  )
}
