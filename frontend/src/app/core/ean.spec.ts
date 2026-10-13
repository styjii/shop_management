import { checkDigit, eanModules, isValidGtin, toBars } from './ean';

describe('ean', () => {
  it('computes the check digit', () => {
    expect(checkDigit('400638133393')).toBe(1);
    expect(checkDigit('5901234123457'.slice(0, 12))).toBe(7);
    expect(checkDigit('7351353')).toBe(7);
  });

  it('accepts valid EAN-13, UPC-A and EAN-8 codes', () => {
    for (const code of ['4006381333931', '5901234123457', '036000291452', '73513537']) {
      expect(isValidGtin(code), code).toBe(true);
    }
  });

  it('refuses a wrong check digit, a wrong length and non-digits', () => {
    for (const code of [
      '4006381333932',
      '123',
      '40063813339312',
      'abcdefgh',
      '',
      '٤٠٠٦٣٨١٣٣٣٩٣١',
    ]) {
      expect(isValidGtin(code), code).toBe(false);
    }
  });

  it('encodes an EAN-13 exactly (5901234123457)', () => {
    const expected =
      '101' +
      '0001011' + // 9  (L)  the first digit 5 selects the parity LGGLLG
      '0100111' + // 0  (G)
      '0110011' + // 1  (G)
      '0010011' + // 2  (L)
      '0111101' + // 3  (L)
      '0011101' + // 4  (G)
      '01010' +
      '1100110' + // 1  (R)
      '1101100' + // 2
      '1000010' + // 3
      '1011100' + // 4
      '1001110' + // 5
      '1000100' + // 7
      '101';
    expect(eanModules('5901234123457')).toBe(expected);
  });

  it('has 95 modules for EAN-13 and UPC-A, 67 for EAN-8', () => {
    expect(eanModules('4006381333931')).toHaveLength(95);
    expect(eanModules('036000291452')).toHaveLength(95);
    expect(eanModules('73513537')).toHaveLength(67);
  });

  it('encodes a UPC-A as the EAN-13 starting with 0', () => {
    expect(eanModules('036000291452')).toBe(eanModules('0036000291452'));
  });

  it('starts and ends with the guard bars and has the centre guard', () => {
    const modules = eanModules('4006381333931')!;
    expect(modules.startsWith('101')).toBe(true);
    expect(modules.endsWith('101')).toBe(true);
    expect(modules.slice(45, 50)).toBe('01010');
  });

  it('gives no pattern for an invalid code', () => {
    expect(eanModules('4006381333932')).toBeNull();
    expect(eanModules('')).toBeNull();
  });

  it('merges consecutive bars into rectangles', () => {
    expect(toBars('1101001')).toEqual([
      { x: 0, width: 2 },
      { x: 3, width: 1 },
      { x: 6, width: 1 },
    ]);
    expect(toBars('')).toEqual([]);
  });
});
