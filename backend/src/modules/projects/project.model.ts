import { HydratedDocument, Model, Schema, Types, model, models } from 'mongoose';
import { ProjectStatus } from '../../common/enums/project-status.enum';

export interface IProjectClient {
  name: string;
  contactName?: string;
  email?: string;
  phone?: string;
  address?: string;
}

export interface IProject {
  code: string;
  name: string;
  client: IProjectClient;
  startDate: Date;
  endDate?: Date;
  contractValueMinor: number;
  totalBudgetMinor: number;
  status: ProjectStatus;
  managerId?: Types.ObjectId;
  description?: string;
  createdBy: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

export type ProjectDocument = HydratedDocument<IProject>;

const clientSchema = new Schema<IProjectClient>(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    contactName: { type: String, trim: true, maxlength: 120 },
    email: { type: String, trim: true, lowercase: true, maxlength: 160 },
    phone: { type: String, trim: true, maxlength: 40 },
    address: { type: String, trim: true, maxlength: 240 },
  },
  { _id: false },
);

const projectSchema = new Schema<IProject>(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    client: { type: clientSchema, required: true },
    startDate: { type: Date, required: true, index: true },
    endDate: { type: Date },
    contractValueMinor: { type: Number, required: true, min: 0 },
    totalBudgetMinor: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      required: true,
      enum: Object.values(ProjectStatus),
      default: ProjectStatus.PLANNING,
      index: true,
    },
    managerId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    description: { type: String, trim: true, maxlength: 1000 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, collection: 'projects' },
);

projectSchema.index({ status: 1, startDate: -1 });
projectSchema.index({ name: 1 });
projectSchema.index({ 'client.name': 1 });

export const ProjectModel =
  (models.Project as Model<IProject> | undefined) ??
  model<IProject>('Project', projectSchema);
