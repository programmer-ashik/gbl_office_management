import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { AppLayout } from './components/AppLayout'
import { GuestRoute, ProtectedRoute } from './components/ProtectedRoute'
import { ApprovalsPage } from './pages/ApprovalsPage'
import { AuditPage } from './pages/AuditPage'
import { AgingPage } from './pages/AgingPage'
import { AdvanceDetailPage } from './pages/AdvanceDetailPage'
import { AdvancesPage } from './pages/AdvancesPage'
import { BankingPage } from './pages/BankingPage'
import { ChartOfAccountsPage } from './pages/ChartOfAccountsPage'
import { DashboardPage } from './pages/DashboardPage'
import { EmployeesPage } from './pages/EmployeesPage'
import { InvoiceDetailPage } from './pages/InvoiceDetailPage'
import { InventoryPage } from './pages/InventoryPage'
import { JournalsPage } from './pages/JournalsPage'
import { LoginPage } from './pages/LoginPage'
import { PayablesPage } from './pages/PayablesPage'
import { PayrollDetailPage } from './pages/PayrollDetailPage'
import { PayrollPage } from './pages/PayrollPage'
import { ProcurementPage } from './pages/ProcurementPage'
import { ProjectDetailPage } from './pages/ProjectDetailPage'
import { ProjectsPage } from './pages/ProjectsPage'
import { PurchaseOrderDetailPage } from './pages/PurchaseOrderDetailPage'
import { ReceivablesPage } from './pages/ReceivablesPage'
import { SignupPage } from './pages/SignupPage'
import { SupplierDetailPage } from './pages/SupplierDetailPage'
import { TreasuryDetailPage } from './pages/TreasuryDetailPage'
import { TrialBalancePage } from './pages/TrialBalancePage'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route
            path="/login"
            element={
              <GuestRoute>
                <LoginPage />
              </GuestRoute>
            }
          />
          <Route
            path="/signup"
            element={
              <GuestRoute>
                <SignupPage />
              </GuestRoute>
            }
          />
          <Route
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<DashboardPage />} />
            <Route path="/accounts" element={<ChartOfAccountsPage />} />
            <Route path="/journals" element={<JournalsPage />} />
            <Route path="/trial-balance" element={<TrialBalancePage />} />
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/projects/:id" element={<ProjectDetailPage />} />
            <Route path="/banking" element={<BankingPage />} />
            <Route path="/banking/:id" element={<TreasuryDetailPage />} />
            <Route path="/advances" element={<AdvancesPage />} />
            <Route path="/advances/:id" element={<AdvanceDetailPage />} />
            <Route path="/procurement" element={<ProcurementPage />} />
            <Route path="/procurement/:id" element={<PurchaseOrderDetailPage />} />
            <Route path="/inventory" element={<InventoryPage />} />
            <Route path="/receivables" element={<ReceivablesPage />} />
            <Route path="/receivables/:id" element={<InvoiceDetailPage />} />
            <Route path="/payables" element={<PayablesPage />} />
            <Route path="/aging" element={<AgingPage />} />
            <Route path="/payroll" element={<PayrollPage />} />
            <Route path="/payroll/:id" element={<PayrollDetailPage />} />
            <Route path="/employees" element={<EmployeesPage />} />
            <Route path="/approvals" element={<ApprovalsPage />} />
            <Route path="/audit" element={<AuditPage />} />
            <Route path="/suppliers/:id" element={<SupplierDetailPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
