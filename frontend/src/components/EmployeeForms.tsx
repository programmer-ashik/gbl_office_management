import { Select } from './ui'
import { ROLE_LABEL, Role } from '../types/auth'
import type { Employee, EmployeeProfileBody } from '../types/employee'

export const STAFF_ROLE_OPTIONS = [
  { value: Role.EMPLOYEE, label: ROLE_LABEL[Role.EMPLOYEE] },
  { value: Role.PROJECT_MANAGER, label: ROLE_LABEL[Role.PROJECT_MANAGER] },
  { value: Role.ACCOUNTANT, label: ROLE_LABEL[Role.ACCOUNTANT] },
]

export type EmployeeProfileValues = {
  firstName: string
  lastName: string
  email: string
  phone: string
  designation: string
  salary: string
  joinDate: string
}

export type LoginAccountValues = {
  email: string
  password: string
  role: string
}

export function emptyProfile(): EmployeeProfileValues {
  return {
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    designation: '',
    salary: '',
    joinDate: '',
  }
}

export function emptyLogin(email = ''): LoginAccountValues {
  return { email, password: '', role: Role.EMPLOYEE }
}

export function profileFromEmployee(row: Employee): EmployeeProfileValues {
  return {
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email ?? '',
    phone: row.phone ?? '',
    designation: row.designation ?? '',
    salary: row.salary != null ? String(row.salary) : '',
    joinDate: row.joinDate ?? '',
  }
}

/** Blank optional fields are left out so they are not sent as empty strings. */
export function profileBody(values: EmployeeProfileValues): EmployeeProfileBody {
  const salary = values.salary.trim()
  return {
    firstName: values.firstName.trim(),
    lastName: values.lastName.trim(),
    ...(values.email.trim() ? { email: values.email.trim() } : {}),
    ...(values.phone.trim() ? { phone: values.phone.trim() } : {}),
    ...(values.designation.trim() ? { designation: values.designation.trim() } : {}),
    ...(salary ? { salary: Number(salary) } : {}),
    ...(values.joinDate ? { joinDate: values.joinDate } : {}),
  }
}

export function EmployeeProfileFields(props: {
  values: EmployeeProfileValues
  onChange: (patch: Partial<EmployeeProfileValues>) => void
  /** Hide the contact email when the login email is used instead. */
  hideEmail?: boolean
  disabled?: boolean
}) {
  const { values, onChange, hideEmail, disabled } = props
  return (
    <>
      <div className="name-row">
        <label>
          First name
          <input
            value={values.firstName}
            onChange={(e) => onChange({ firstName: e.target.value })}
            required
            disabled={disabled}
          />
        </label>
        <label>
          Last name
          <input
            value={values.lastName}
            onChange={(e) => onChange({ lastName: e.target.value })}
            required
            disabled={disabled}
          />
        </label>
      </div>
      <div className="name-row">
        <label>
          Designation
          <input
            value={values.designation}
            onChange={(e) => onChange({ designation: e.target.value })}
            placeholder="e.g. Site engineer"
            disabled={disabled}
          />
        </label>
        <label>
          Phone
          <input
            type="tel"
            value={values.phone}
            onChange={(e) => onChange({ phone: e.target.value })}
            disabled={disabled}
          />
        </label>
      </div>
      <div className="name-row">
        <label>
          Monthly salary
          <input
            inputMode="decimal"
            value={values.salary}
            onChange={(e) => onChange({ salary: e.target.value })}
            placeholder="0.00"
            disabled={disabled}
          />
        </label>
        <label>
          Join date
          <input
            type="date"
            value={values.joinDate}
            onChange={(e) => onChange({ joinDate: e.target.value })}
            disabled={disabled}
          />
        </label>
      </div>
      {hideEmail ? null : (
        <label>
          Contact email
          <input
            type="email"
            value={values.email}
            onChange={(e) => onChange({ email: e.target.value })}
            placeholder="Optional"
            disabled={disabled}
          />
        </label>
      )}
    </>
  )
}

export function LoginAccountFields(props: {
  values: LoginAccountValues
  onChange: (patch: Partial<LoginAccountValues>) => void
}) {
  const { values, onChange } = props
  return (
    <>
      <label>
        Email
        <input
          type="email"
          value={values.email}
          onChange={(e) => onChange({ email: e.target.value })}
          required
          autoComplete="off"
        />
      </label>
      <div className="name-row">
        <label>
          Password
          <input
            type="password"
            value={values.password}
            onChange={(e) => onChange({ password: e.target.value })}
            required
            minLength={8}
            autoComplete="new-password"
          />
          <span className="field-hint">At least 8 characters with a letter and a number.</span>
        </label>
        <label>
          Role
          <Select
            value={values.role}
            onChange={(role) => onChange({ role })}
            options={STAFF_ROLE_OPTIONS}
            placeholder="Select role"
            portal={false}
          />
        </label>
      </div>
    </>
  )
}
