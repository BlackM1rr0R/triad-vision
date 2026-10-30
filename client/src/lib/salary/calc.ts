/**
 * German net-salary estimate. One implementation for the whole site: server/src/lib/budget/payroll.ts
 * (Lohnsteuer per the BMF Programmablaufplan, social insurance, Mini-/Midijob) wrapped by ./salary.ts there.
 * Bundled into the client as plain TypeScript (deploy/web.Dockerfile copies those files); the unit tests are in
 * server/tests/unit/salaryCalculator.test.ts and budgetPayroll.test.ts.
 */
export {
  calculateSalary,
  DEFAULT_INPUT,
  quickNetMonthly,
  sanitizeInput,
  type SalaryAmounts,
  type SalaryInput,
  type SalaryResult,
} from '../../../../server/src/lib/budget/salary';
export type { Steuerklasse as TaxClass } from '../../../../server/src/lib/budget/payroll';
