/**
 * EAN-13, UPC-A and EAN-8 barcodes: validation and bar pattern ("1" = bar, "0" = space).
 * Written here rather than imported from a library: it is short, has no dependency to audit,
 * and the pattern is rendered as plain SVG rectangles (no HTML injection).
 */

const L = [
  '0001101',
  '0011001',
  '0010011',
  '0111101',
  '0100011',
  '0110001',
  '0101111',
  '0111011',
  '0110111',
  '0001011',
];
const R = [
  '1110010',
  '1100110',
  '1101100',
  '1000010',
  '1011100',
  '1001110',
  '1010000',
  '1000100',
  '1001000',
  '1110100',
];
const G = R.map((code) => [...code].reverse().join(''));
// Parity of the six left digits of an EAN-13, chosen by its first digit.
const PARITY = [
  'LLLLLL',
  'LLGLGG',
  'LLGGLG',
  'LLGGGL',
  'LGLLGG',
  'LGGLLG',
  'LGGGLL',
  'LGLGLG',
  'LGLGGL',
  'LGGLGL',
];

const START_END = '101';
const MIDDLE = '01010';

export function checkDigit(body: string): number {
  const total = [...body]
    .reverse()
    .reduce((sum, digit, index) => sum + Number(digit) * (index % 2 === 0 ? 3 : 1), 0);
  return (10 - (total % 10)) % 10;
}

export function isValidGtin(code: string): boolean {
  return (
    /^\d+$/.test(code) &&
    [8, 12, 13].includes(code.length) &&
    checkDigit(code.slice(0, -1)) === Number(code.at(-1))
  );
}

/** Bar pattern of a valid code, or null when the code is not a valid GTIN. */
export function eanModules(code: string): string | null {
  if (!isValidGtin(code)) return null;
  if (code.length === 8) {
    const left = [...code.slice(0, 4)].map((d) => L[Number(d)]).join('');
    const right = [...code.slice(4)].map((d) => R[Number(d)]).join('');
    return START_END + left + MIDDLE + right + START_END;
  }
  const ean13 = code.length === 12 ? `0${code}` : code; // UPC-A is an EAN-13 starting with 0
  const parity = PARITY[Number(ean13[0])];
  const left = [...ean13.slice(1, 7)]
    .map((d, i) => (parity[i] === 'L' ? L : G)[Number(d)])
    .join('');
  const right = [...ean13.slice(7)].map((d) => R[Number(d)]).join('');
  return START_END + left + MIDDLE + right + START_END;
}

/** Consecutive bars merged into rectangles, in module units. */
export function toBars(modules: string): { x: number; width: number }[] {
  const bars: { x: number; width: number }[] = [];
  let start = -1;
  for (let i = 0; i <= modules.length; i++) {
    const isBar = modules[i] === '1';
    if (isBar && start < 0) start = i;
    if (!isBar && start >= 0) {
      bars.push({ x: start, width: i - start });
      start = -1;
    }
  }
  return bars;
}
