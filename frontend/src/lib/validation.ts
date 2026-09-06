/** File metadata is only a hint: check bytes before invoking a parser. */
export const MAX_PDF_BYTES = 50 * 1024 * 1024
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024
export const MAX_PAGES = 500

export function validatePdf(bytes: Uint8Array) {
  if (!bytes.length || bytes.length > MAX_PDF_BYTES) throw new Error('PDFs must be between 1 byte and 50 MB.')
  if (!/^%PDF-[12]\.[0-9]/.test(new TextDecoder().decode(bytes.subarray(0, 8)))) {
    throw new Error('The file does not have a valid PDF header.')
  }
}

export function validateImage(bytes: Uint8Array, mime: string) {
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new Error('Images must be between 1 byte and 10 MB.')
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v)
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
  if (!(mime === 'image/png' && png) && !(mime === 'image/jpeg' && jpeg)) {
    throw new Error('The image contents must match PNG or JPEG format.')
  }
}
