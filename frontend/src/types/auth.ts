export const Role = {
  ADMIN: 'admin',
  ACCOUNTANT: 'accountant',
  PROJECT_MANAGER: 'project_manager',
  EMPLOYEE: 'employee',
} as const

export type Role = (typeof Role)[keyof typeof Role]

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Admin',
  accountant: 'Accountant',
  project_manager: 'Project Manager',
  employee: 'Employee',
}

export type PublicUser = {
  id: string
  email: string
  firstName: string
  lastName: string
  role: Role
  isActive: boolean
  lastLoginAt: string | null
  createdAt?: string
  updatedAt?: string
}

export type AuthTokens = {
  accessToken: string
  refreshToken: string
  expiresIn: string
}

export type AuthResult = {
  user: PublicUser
  tokens: AuthTokens
}

export type ApiSuccess<T> = {
  success: true
  message: string
  data: T
  timestamp: string
}

export type ApiError = {
  success: false
  message: string
  error: string
  statusCode: number
  timestamp: string
  path: string
}

export type HealthStatus = {
  status: 'ok' | 'degraded'
  database: {
    connected: boolean
    ping: boolean
    readyState: number
  }
  service: string
  timestamp: string
}
