import { HydratedDocument, Model, Schema, Types, model, models } from 'mongoose';
import { TimeUnit } from '../../common/enums/payroll.enum';

export interface ITimeLog {
  employeeId: Types.ObjectId;
  employeeName: string;
  projectId: Types.ObjectId;
  projectCode: string;
  projectName: string;
  periodYear: number;
  periodMonth: number;
  unit: TimeUnit;
  quantityMilli: number;
  notes?: string;
  createdBy: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

export type TimeLogDocument = HydratedDocument<ITimeLog>;

const timeLogSchema = new Schema<ITimeLog>(
  {
    employeeId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    employeeName: { type: String, required: true },
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    projectCode: { type: String, required: true },
    projectName: { type: String, required: true },
    periodYear: { type: Number, required: true, min: 2000, index: true },
    periodMonth: { type: Number, required: true, min: 1, max: 12, index: true },
    unit: {
      type: String,
      required: true,
      enum: Object.values(TimeUnit),
    },
    quantityMilli: { type: Number, required: true, min: 1 },
    notes: { type: String, trim: true, maxlength: 240 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, collection: 'time_logs' },
);

timeLogSchema.index(
  { employeeId: 1, projectId: 1, periodYear: 1, periodMonth: 1 },
  { unique: true },
);

export const TimeLogModel =
  (models.TimeLog as Model<ITimeLog> | undefined) ??
  model<ITimeLog>('TimeLog', timeLogSchema);
