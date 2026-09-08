import { APPROVAL_THRESHOLD } from '../../common/enums/governance.enum';
import { ApprovalStepRole } from '../../common/enums/governance.enum';
import { OcrService } from './ocr.service';
import { buildApprovalSteps } from './approval.service';

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

describe('/approvals step routing (project sync)', () => {
  it('includes Project Manager when a projectId is present', () => {
    const steps = buildApprovalSteps(true);
    expect(steps.map((s) => s.role)).toEqual([
      ApprovalStepRole.PROJECT_MANAGER,
      ApprovalStepRole.ACCOUNTANT,
      ApprovalStepRole.ADMIN,
    ]);
  });

  it('skips Project Manager when no project is linked', () => {
    const steps = buildApprovalSteps(false);
    expect(steps.map((s) => s.role)).toEqual([
      ApprovalStepRole.ACCOUNTANT,
      ApprovalStepRole.ADMIN,
    ]);
  });

  it('documents that PM step is not scoped to assigned projects', () => {
    // Any user with role project_manager can decide a PM step today —
    // ApprovalService.assertCanDecideStep only checks Role, not managerId.
    const steps = buildApprovalSteps(true);
    expect(steps[0]?.role).toBe(ApprovalStepRole.PROJECT_MANAGER);
  });
});
