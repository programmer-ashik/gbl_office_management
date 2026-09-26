import { HydratedDocument, Model, Schema, model, models } from 'mongoose';
import { Role } from '../../common/enums/role.enum';

export interface IUser {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: Role;
  isActive: boolean;
  /** Explicit allowlist of nav section ids. Empty array = no menu areas. */
  allowedPermissions?: string[];
  /** Legacy denylist — used only when allowedPermissions is unset. */
  deniedPermissions: string[];
  lastLoginAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export type UserDocument = HydratedDocument<IUser>;

const userSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: { type: String, required: true, select: false },
    firstName: { type: String, required: true, trim: true, maxlength: 80 },
    lastName: { type: String, required: true, trim: true, maxlength: 80 },
    role: {
      type: String,
      required: true,
      enum: Object.values(Role),
      default: Role.EMPLOYEE,
      index: true,
    },
    isActive: { type: Boolean, required: true, default: true, index: true },
    allowedPermissions: {
      type: [String],
      default: undefined,
    },
    deniedPermissions: {
      type: [String],
      default: [],
    },
    lastLoginAt: { type: Date },
  },
  { timestamps: true, collection: 'users' },
);

userSchema.index({ role: 1, isActive: 1 });

userSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (_doc, ret) => {
    const value = ret as unknown as Record<string, unknown>;
    value.id = String(value._id);
    delete value._id;
    delete value.password;
    return value;
  },
});

export const UserModel =
  (models.User as Model<IUser> | undefined) ?? model<IUser>('User', userSchema);
