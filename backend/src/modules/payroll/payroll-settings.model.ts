import { HydratedDocument, Model, Schema, model, models } from 'mongoose';
import {
  ConveyanceType,
  MedicalAllowanceType,
} from '../../common/enums/payroll.enum';
import {
  DEFAULT_PAYROLL_RULE_CONFIG,
  type PayrollRuleConfig,
} from './salary-breakdown';

export const PAYROLL_SETTINGS_KEY = 'default';

export interface IPayrollSettings extends PayrollRuleConfig {
  key: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export type PayrollSettingsDocument = HydratedDocument<IPayrollSettings>;

const payrollSettingsSchema = new Schema<IPayrollSettings>(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: PAYROLL_SETTINGS_KEY,
    },
    basicPercentOfGross: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
      default: DEFAULT_PAYROLL_RULE_CONFIG.basicPercentOfGross,
    },
    houseRentPercentOfBasic: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
      default: DEFAULT_PAYROLL_RULE_CONFIG.houseRentPercentOfBasic,
    },
    medicalType: {
      type: String,
      required: true,
      enum: Object.values(MedicalAllowanceType),
      default: DEFAULT_PAYROLL_RULE_CONFIG.medicalType,
    },
    medicalValue: {
      type: Number,
      required: true,
      min: 0,
      default: DEFAULT_PAYROLL_RULE_CONFIG.medicalValue,
    },
    conveyanceType: {
      type: String,
      required: true,
      enum: Object.values(ConveyanceType),
      default: DEFAULT_PAYROLL_RULE_CONFIG.conveyanceType,
    },
    conveyanceValue: {
      type: Number,
      required: true,
      min: 0,
      default: DEFAULT_PAYROLL_RULE_CONFIG.conveyanceValue,
    },
  },
  { timestamps: true, collection: 'payroll_settings' },
);

export const PayrollSettingsModel =
  (models.PayrollSettings as Model<IPayrollSettings> | undefined) ??
  model<IPayrollSettings>('PayrollSettings', payrollSettingsSchema);
