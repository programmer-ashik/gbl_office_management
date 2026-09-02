# Project Prompt & Execution Plan: Project-Based Accounting & Office Management System

**Prepared for:** GBL Enterprise  
**Prepared by:** Ashik Hasan  
**Version:** 1.0  
**Target Execution Environment:** Cursor AI / Windsurf / Automated Code Generator

---

## IMPORTANT INSTRUCTIONS FOR AI (CURSOR):

1. **Strict Sequential Execution:** You MUST execute this project phase by phase. DO NOT start a new phase until the current phase is completely finished, tested, and verified.
2. **Phase Completion Confirmation:** After completing every phase, pause, generate a clear summary of what was accomplished, list the files created/updated, and explicitly ask the user for confirmation to proceed to the next phase.
3. **Data & Ledger Integrity:** All financial logic must rigidly adhere to **Double-Entry Accounting principles** (Debit/Credit balance).
4. **Architecture Standard:** Strictly follow the Modular Monolith pattern, TypeScript typing (for Node.js/NestJS), and proper MongoDB Schema definitions with indexing.

---

## 1. System Architecture & Context

### System Overview

A comprehensive project-based accounting, inventory, payroll, and smart office management platform for **GBL Enterprise**.

### Core Architecture & Tech Stack:

- **Architecture Style:** Modular Monolith (Scalable to Microservices later)
- **Frontend:** React.js (TypeScript, Web Admin Dashboard)
- **Backend:** Node.js (ExpressJS / TypeScript)
- **Database:** MongoDB (with Mongoose, strictly typed transactions)
- **Accounting Engine:** Double-Entry Accounting Core with dynamic Chart of Accounts (CoA)

---

## 2. Execution Phases & Steps

```text
[ Phase 1: Core Setup & Shared Utilities ]
               │
               ▼
[ Phase 2: Double-Entry Engine & Chart of Accounts ]
               │
               ▼
[ Phase 3: Project Management & Budgeting ]
               │
               ▼
[ Phase 4: Banking, Cash & Petty Cash Management ]
               │
               ▼
[ Phase 5: Advance & Expense Settlement System (3-Step Flow) ]
               │
               ▼
[ Phase 6: Procurement, Supplier & Inventory Management ]
               │
               ▼
[ Phase 7: Accounts Payable (AP) & Accounts Receivable (AR) ]
               │
               ▼
[ Phase 8: Payroll & Project Cost Allocation ]
               │
               ▼
[ Phase 9: Advanced Features, RBAC, OCR & Audit Trail ]
               │
               ▼
[ Phase 10: Dashboards, Analytics & Final Integration ]
PHASE 1: System Foundation, Database Models & Authentication SetupGoal: Initialize project structure, shared libraries, database connectors, and base Security/Authentication architecture.Tasks:Initialize repository with Modular structure (/src/modules/...).Setup MongoDB connection with transaction support.Implement Authentication Module (JWT, Refresh Tokens, Password Hashing).Implement Base User Schema & Role-Based Access Control (RBAC middleware for Admin, Accountant, Project Manager, Employee).Setup unified API Response and Global Error Handling Middleware.Phase Completion Criteria: User signup/login functional, Auth Middleware active, database connected.
PHASE 2: Double-Entry Accounting Engine & Chart of Accounts (CoA)Goal: Build the core financial backbone to ensure zero ledger imbalance.Tasks:Design Chart of Accounts Schema (Assets, Liabilities, Equity, Revenue, Expenses).Design Journal Entry & Ledger Schemas (Debit/Credit line items).Create Journal Posting Service with transaction validation (Sum(Debits) === Sum(Credits)).Build API endpoints to fetch Ledger Balances and Trial Balance.Phase Completion Criteria: Automated posting of balanced Journal Entries tested and verified.
PHASE 3: Project Management & Budgeting ModuleGoal: Centralize income and expense tracking per project.Tasks:Create Project Schema (Client Info, Start/End Dates, Contract Value, Total Budget).Implement Project CRUD APIs and status management (Planning, Active, Completed, On-Hold).Build Real-time Project Cost Aggregation logic.Create Real-Time Profitability Report API (Calculating Gross Profit and Net Profit per project).Phase Completion Criteria: Projects created with budget thresholds; financial metrics dynamically calculated per project.
PHASE 4: Banking, Cash & Petty Cash Management ModuleGoal: Handle multi-channel financial accounts and internal transfers.Tasks:Create Bank/Cash Account Schemas (Commercial Banks, Hand Cash, Mobile Banking like bKash/Nagad).Build Fund Transfer Service (Bank to Cash Withdrawal, Cash to Bank Deposit, Account to Account).Automatically generate corresponding Journal Entries for transfers.Create Bank Reconciliation tool (Matching software records against uploaded CSV/Statement data).Phase Completion Criteria: Multi-account balances accurately reflect transfers and reconciled balances.
PHASE 5: Advance & Expense Settlement System (3-Step Flow)Goal: Implement the strict 3-step workflow for handling employee advance payments and expense reconciliations.Tasks:Step 1 (Requisition): Employee requests advance for a project $\rightarrow$ Status: Pending.Step 2 (Disbursement): Accountant approves/pays money $\rightarrow$ Record as "Employee Advance Asset", NOT an expense yet.Step 3 (Settlement): Employee submits final vouchers/bills.Case A (Equal Spend): Advance closed, Expense debited to Project.Case B (Less Spend): Remaining money returned to Bank/Cash, Advance closed.Case C (More Spend): Excess amount credited to Employee Payable, Expense debited to Project.Auto-posting of Journal Entries upon final settlement confirmation.Phase Completion Criteria: Complete 3-step workflow end-to-end tested for all 3 cases (Equal, Less, and More spend).
PHASE 6: Supplier & Procurement Management ModuleGoal: Manage inventory, Purchase Orders, and site-level material allocation.Tasks:Create Supplier/Vendor Profile and Purchase Order (PO) Schemas.Implement Material Allocation logic:Option 1: Direct Delivery to Project Site (Immediate Project Costing).Option 2: Central Warehouse Inventory Entry $\rightarrow$ Issued to Project later.Build Vendor Ledger (Tracking Purchases, Goods Received, Returns, and Outstanding Payments).Phase Completion Criteria: Purchase Orders created, stock movement accurately mapped to project costs or warehouse inventory.
PHASE 7: Accounts Payable (AP) & Accounts Receivable (AR)Goal: Track money owed by clients (Receivables) and money owed to suppliers (Payables).Tasks:Accounts Receivable (AR):Milestone-based and lump-sum Client Invoicing.Payment collection tracking against invoices.Overdue notification triggers.Accounts Payable (AP):Supplier Bill entry (Cash/Credit).Payment scheduling and execution.Aging Report Generator: Generate dynamic 30/60/90+ days aging reports for both AP and AR.Phase Completion Criteria: Invoices generated, aging reports accurately grouping receivables and payables by time buckets.
PHASE 8: Payroll & Project Cost Allocation ModuleGoal: Manage employee salaries and attribute labor costs to specific projects.Tasks:Create Salary Structure Schemas (Basic, Allowances, Deductions).Implement Labor Cost Allocation: Distribute employee salary cost to projects based on logged hours/days.Implement Advance Auto-Deduction: Automatically check and propose deducting active Employee Advances from monthly salary.Generate Salary Sheet & Execute Disbursement (Single-click payout via Bank/Cash).Phase Completion Criteria: Monthly payroll generated with automatic advance deduction and proper project-wise cost attribution.
PHASE 9: Advanced Features, RBAC Enforcement, OCR & Audit TrailGoal: Enhance security, automation, and office management operations.Tasks:Strict RBAC Middleware: Restrict Project Managers to their assigned project scope only; expose full financials to Admin/Accountant only.Multi-Level Approval Engine: Dynamic approval routing (e.g., Project Manager $\rightarrow$ Accounts $\rightarrow$ MD) for large transactions.OCR Integration Mock/API: Interface for scanning receipt images to auto-fill Expense Settlement fields.Audit Log System: Immutable database logging of all CREATE, UPDATE, DELETE actions on financial records (storing User, Timestamp, Before-State, After-State).Phase Completion Criteria: Non-admin users restricted correctly; approval flow working; audit logs capturing all ledger updates.
PHASE 10: Executive Analytics Dashboard & Final Integration TestingGoal: Provide high-level business intelligence and ensure end-to-end system reliability.Tasks:Cash Flow Forecast Dashboard: Visual analytics predicting inflows (Client AR) vs outflows (Supplier AP, Payroll, Expenses).Project Burn Rate Calculator: Real-time tracking of daily/weekly spending rate vs estimated completion dates.End-to-End System Integration Testing: Run full simulation from Project Creation $\rightarrow$ PO $\rightarrow$ Advance $\rightarrow$ Expense $\rightarrow$ Client Invoice $\rightarrow$ Settlement $\rightarrow$ Financial Statements (P&L, Balance Sheet).Phase Completion Criteria: Dashboards reporting accurate real-time data; overall project builds without errors.
```
