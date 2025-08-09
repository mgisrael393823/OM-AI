import Tesseract from 'tesseract.js';
import { renderPageToImage } from '@/lib/agents/pdf-parser/PDFParserAgent';

export async function extractPageText(page: any): Promise<string> {
  const tc = await page.getTextContent();
  const raw = tc.items.map((i: any) => i.str).join(' ').trim();

  const alpha = raw.replace(/[^A-Za-z0-9$€£.,:%&()/+\- \n]/g, '');
  const digitRatio = alpha ? (alpha.replace(/[^0-9]/g, '').length / alpha.length) : 0;
  const needsOCR = alpha.length < 400 || digitRatio >= 0.35;
  if (!needsOCR) return raw;

  let png: Buffer | undefined;
  try {
    png = await renderPageToImage(page);
  } catch (e) {
    console.warn('[OM-AI] Canvas not available, skipping OCR');
    return raw;
  }

  const { data } = await Tesseract.recognize(png, 'eng', {
    psm: 6,
    oem: 1,
    tessedit_char_whitelist: '0123456789$€£.,:%&()/+\\- A-Za-z'
  });
  console.log('[OM-AI] OCR used for page');
  return (raw + '\n' + (data?.text ?? '')).trim();
}
