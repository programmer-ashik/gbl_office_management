import { Navigate } from 'react-router-dom'

/** Legacy `/payroll` hub → monthly process workflow. */
export function PayrollPage() {
  return <Navigate to="/payroll/process" replace />
}
