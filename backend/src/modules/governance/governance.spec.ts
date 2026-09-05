import { APPROVAL_THRESHOLD } from '../../common/enums/governance.enum';
import { OcrService } from './ocr.service';

describe('OCR mock', () => {
  const ocr = new OcrService();

  it('maps travel keywords to conveyance expense', () => {
    const result = ocr.scanReceipt({
      textHint: 'Taxi receipt from City Cab 850.50',
    });
    expect(result.mock).toBe(true);
    expect(result.lines[0]?.accountCode).toBe('5300');
    expect(result.lines[0]?.amount).toBe(850.5);
  });

  it('maps materials keywords to project materials', () => {
    const result = ocr.scanReceipt({ textHint: 'Cement bag supply 4200' });
    expect(result.lines[0]?.accountCode).toBe('5110');
    expect(result.total).toBe(4200);
  });
});

describe('approval threshold', () => {
  it('uses 100000 as the multi-level approval floor', () => {
    expect(APPROVAL_THRESHOLD).toBe(100_000);
  });
});
