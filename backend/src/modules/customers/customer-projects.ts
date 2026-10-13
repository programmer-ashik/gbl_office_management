import { Types } from 'mongoose';
import { ProjectModel } from '../projects/project.model';
import { CustomerModel } from './customer.model';

export type CustomerRef = { id: string; name: string };

function exactName(name: string): RegExp {
  return new RegExp(`^${name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
}

/**
 * Projects owned by a customer: linked by `customerId`, or older projects that
 * only carry the same client name.
 */
export async function projectIdsForCustomer(customerId: string): Promise<Types.ObjectId[]> {
  if (!Types.ObjectId.isValid(customerId)) return [];
  const customer = await CustomerModel.findById(customerId).select({ name: 1 }).lean().exec();
  if (!customer) return [];
  const rows = await ProjectModel.find({
    $or: [
      { customerId: customer._id },
      { customerId: { $exists: false }, 'client.name': exactName(customer.name) },
      { customerId: null, 'client.name': exactName(customer.name) },
    ],
  })
    .select({ _id: 1 })
    .lean()
    .exec();
  return rows.map((row) => row._id);
}

/** Customer behind each project (by link, else a unique client-name match). */
export async function customersByProjectIds(
  projectIds: Array<Types.ObjectId | string>,
): Promise<Map<string, CustomerRef>> {
  const result = new Map<string, CustomerRef>();
  const ids = [...new Set(projectIds.map(String))].filter((id) => Types.ObjectId.isValid(id));
  if (ids.length === 0) return result;

  const projects = await ProjectModel.find({ _id: { $in: ids.map((id) => new Types.ObjectId(id)) } })
    .select({ customerId: 1, 'client.name': 1 })
    .lean()
    .exec();
  if (projects.length === 0) return result;

  const linkedIds = projects.flatMap((row) => (row.customerId ? [row.customerId] : []));
  const legacyNames = [
    ...new Set(projects.filter((row) => !row.customerId).map((row) => row.client.name.trim().toLowerCase())),
  ];
  const customers = await CustomerModel.find({
    $or: [
      ...(linkedIds.length ? [{ _id: { $in: linkedIds } }] : []),
      ...legacyNames.map((name) => ({ name: exactName(name) })),
    ],
  })
    .select({ name: 1 })
    .lean()
    .exec();

  const byId = new Map(customers.map((row) => [row._id.toString(), row]));
  const byName = new Map<string, typeof customers>();
  for (const row of customers) {
    const key = row.name.trim().toLowerCase();
    byName.set(key, [...(byName.get(key) ?? []), row]);
  }

  for (const project of projects) {
    const match = project.customerId
      ? byId.get(project.customerId.toString())
      : (() => {
          const same = byName.get(project.client.name.trim().toLowerCase()) ?? [];
          return same.length === 1 ? same[0] : undefined;
        })();
    if (match) {
      result.set(project._id.toString(), { id: match._id.toString(), name: match.name });
    }
  }
  return result;
}

export async function customerForProject(projectId: string): Promise<CustomerRef | null> {
  return (await customersByProjectIds([projectId])).get(projectId) ?? null;
}
