/**
 * Images for jsPDF. Logos are uploaded at full resolution (often >1000px,
 * ~1 MB); embedding them as-is makes every PDF several MB. These helpers
 * downscale to print size (~300 dpi at the drawn size) before embedding.
 */

export type PdfImageFormat = 'PNG' | 'JPEG' | 'WEBP'

/** Longest side, in pixels, for logos drawn up to ~25 mm. */
export const PDF_LOGO_MAX_PX = 320
/** Longest side for signatures drawn up to ~60 mm wide. */
export const PDF_SIGNATURE_MAX_PX = 720

export function imageFormatFromDataUrl(dataUrl: string): PdfImageFormat | null {
  if (dataUrl.startsWith('data:image/jpeg') || dataUrl.startsWith('data:image/jpg')) {
    return 'JPEG'
  }
  if (dataUrl.startsWith('data:image/png')) return 'PNG'
  if (dataUrl.startsWith('data:image/webp')) return 'WEBP'
  return null
}

/** Largest size that fits in maxW × maxH mm while keeping the image's aspect ratio. */
export function fitImageSize(
  doc: { getImageProperties: (data: string) => { width: number; height: number } },
  dataUrl: string,
  maxW: number,
  maxH: number,
): { w: number; h: number } {
  try {
    const { width, height } = doc.getImageProperties(dataUrl)
    if (width > 0 && height > 0) {
      const scale = Math.min(maxW / width, maxH / height)
      return { w: width * scale, h: height * scale }
    }
  } catch {
    /* fall through to the box size */
  }
  return { w: maxW, h: maxH }
}

function blobToDataUrl(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => resolve(null)
    reader.readAsDataURL(blob)
  })
}

function decodeImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

/**
 * Downscale a data URL so its longest side is at most `maxPx`. PNG/WebP stay
 * PNG (keeps transparency); JPEG stays JPEG. Returns the input unchanged when
 * it is already small enough or cannot be decoded.
 */
export async function shrinkImageDataUrl(
  dataUrl: string,
  maxPx: number = PDF_LOGO_MAX_PX,
): Promise<string> {
  const format = imageFormatFromDataUrl(dataUrl)
  if (!format || typeof document === 'undefined') return dataUrl
  const img = await decodeImage(dataUrl)
  if (!img || !img.naturalWidth || !img.naturalHeight) return dataUrl
  const scale = Math.min(1, maxPx / Math.max(img.naturalWidth, img.naturalHeight))
  if (scale === 1 && format !== 'WEBP') return dataUrl

  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) return dataUrl
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  const shrunk =
    format === 'JPEG'
      ? canvas.toDataURL('image/jpeg', 0.9)
      : canvas.toDataURL('image/png')
  return shrunk.length < dataUrl.length || format === 'WEBP' ? shrunk : dataUrl
}

/** Fetch an image URL and return a PDF-sized data URL, or null on failure. */
export async function loadPdfImage(
  url: string,
  maxPx: number = PDF_LOGO_MAX_PX,
): Promise<string | null> {
  try {
    const res = await fetch(url, { credentials: 'include' })
    if (!res.ok) return null
    const dataUrl = await blobToDataUrl(await res.blob())
    return dataUrl ? await shrinkImageDataUrl(dataUrl, maxPx) : null
  } catch {
    return null
  }
}
