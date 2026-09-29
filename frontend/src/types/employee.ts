import type { Role } from './auth'

export type EmployeeAccount = {
  id: string
  email: string
  role: Role
  isActive: boolean
}

/** HR record. Software access is optional and lives on the linked user. */
export type Employee = {
  id: string
  firstName: string
  lastName: string
  name: string
  email: string | null
  phone: string | null
  designation: string | null
  salary: number | null
  joinDate: string | null
  isActive: boolean
  userId: string | null
  hasAccount: boolean
  account: EmployeeAccount | null
  /** Login role when the employee has an account. */
  role: Role | null
  createdAt?: string
  updatedAt?: string
}

export type EmployeeProfileBody = {
  firstName: string
  lastName: string
  email?: string
  phone?: string
  designation?: string
  salary?: number
  joinDate?: string
}

export type CreateEmployeeBody = EmployeeProfileBody & {
  createAccount?: boolean
  password?: string
  role?: Role
}

export type GrantEmployeeAccessBody = {
  email: string
  password: string
  role?: Role
}
