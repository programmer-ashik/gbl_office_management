# 🏢 Project-Based Accounting & Office Management System

![Build Status](https://img.shields.io/badge/build-passing-brightgreen)
![Version](https://img.shields.io/badge/version-1.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)

A modular, enterprise-grade financial and operational management system designed specifically for project-based businesses. Built around a **Double-Entry Accounting Core**, this software seamlessly tracks real-time project profitability, multi-channel bank/cash flows, employee advance settlements, client receivables, vendor payables, procurement, and project-allocated payroll.

---

## 🌟 Key Features

### 📊 1. Project Management & Budgeting
* **Real-time Profitability:** Automatic Profit & Loss (P&L) calculations displaying Gross and Net Profit per project before completion.
* **Budget Variance Tracking:** Tracks actual project expenses against initial estimations to prevent budget overruns.

### 💸 2. Advance & Expense Settlement (3-Step Workflow)
* **Step 1 (Requisition):** Employees submit advance requests tied to specific projects.
* **Step 2 (Disbursement):** Accounts disburse funds recorded under "Employee Advance Assets" (zero ledger imbalance).
* **Step 3 (Settlement):** Vouchers/bills are submitted. Automatically handles:
  * **Case A (Equal Spend):** Advance closes; Expense hits the project ledger.
  * **Case B (Under Spend):** Remaining balance returned to Cash/Bank ledger.
  * **Case C (Over Spend):** Excess amount converted to Employee Payable.

### 💳 3. Banking & Cash Management
* **Multi-Account Tracking:** Manage BRAC Bank, DBBL, Hand/Petty Cash, and Mobile Financial Services (bKash/Nagad) simultaneously.
* **Internal Transfers:** Log transfers across accounts with automatic dual journal entry posting.
* **Bank Reconciliation:** Match internal software entries with bank statements.

### 📑 4. Accounts Payable (AP) & Accounts Receivable (AR)
* **Client Invoicing:** Supports milestone-based and lump-sum billing.
* **Vendor Payables:** Track purchases, partial payments, and supplier credit balances.
* **Aging Reports:** Automated 30/60/90+ day overdue aging analysis for clients and suppliers.

### 📦 5. Procurement & Material Allocation
* **Purchase Orders (PO):** Issue POs directly to suppliers.
* **Material Direct Delivery:** Direct allocation of goods to site project ledgers or warehouse inventory.

### 👥 6. Payroll & Labor Cost Allocation
* **Project Labor Costing:** Distribute employee salary costs to projects based on logged hours.
* **Auto-Deduction:** Automatic detection and proposition of active advances during monthly salary generation.

---

## 🏗️ Architecture & Technology Stack

* **Architecture Style:** Modular Monolith (Scalable to Microservices)
* **Frontend:** React.js (TypeScript) / Tailwind CSS / Lucide Icons
* **Backend:** Node.js (NestJS / TypeScript)
* **Database:** MongoDB with Mongoose / Prisma ORM
* **Accounting Engine:** Double-Entry Ledger Core (Strict Debit/Credit balance verification)

---

## 🛠️ Getting Started

### Prerequisites
* Node.js >= 18.x
* MongoDB >= 6.0
* npm or yarn

### Installation

1. **Clone the repository:**
   ```bash
   git clone [https://github.com/your-username/project-accounting-system.git](https://github.com/your-username/project-accounting-system.git)
   cd project-accounting-system
