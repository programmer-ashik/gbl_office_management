import { HydratedDocument, Model, Schema, model, models } from 'mongoose';

export interface ICounter {
  key: string;
  seq: number;
}

export type CounterDocument = HydratedDocument<ICounter>;

const counterSchema = new Schema<ICounter>(
  {
    key: { type: String, required: true, unique: true },
    seq: { type: Number, required: true, default: 0 },
  },
  { collection: 'counters' },
);

export const CounterModel =
  (models.Counter as Model<ICounter> | undefined) ??
  model<ICounter>('Counter', counterSchema);
