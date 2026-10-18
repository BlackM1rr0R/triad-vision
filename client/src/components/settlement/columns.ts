import type { TFunction } from 'i18next';
import type { Beneficiary } from './types';

export type ColKind =
  | 'check'
  | 'partner'
  | 'text'
  | 'date'
  | 'stage'
  | 'money'
  | 'currency'
  | 'bool'
  | 'share'
  | 'partnerShare'
  | 'actions';

export interface Column {
  /** Field sent to the server (or `share:<beneficiaryId>`). */
  key: string;
  kind: ColKind;
  label: string;
  group?: string;
  width: number;
  editable: boolean;
  /** Sticky on the left while scrolling sideways. */
  stickyLeft?: number;
  align?: 'left' | 'right' | 'center';
  /** For `money`: the currency field that goes with the amount. */
  currencyField?: 'currency' | 'partnerShareCurrency';
  beneficiaryId?: string;
}

export const buildColumns = (t: TFunction, beneficiaries: Beneficiary[]): Column[] => {
  const c = (k: string) => t(`settlement.cols.${k}`);
  const cols: Column[] = [
    { key: '_select', kind: 'check', label: '', width: 36, editable: false, stickyLeft: 0, align: 'center' },
    { key: 'clientName', kind: 'text', label: c('client'), width: 210, editable: true, stickyLeft: 36 },
    { key: 'partnerId', kind: 'partner', label: c('partner'), width: 130, editable: true },
    { key: 'licence', kind: 'text', label: c('licence'), width: 64, editable: true, align: 'center' },
    { key: 'employer', kind: 'text', label: c('employer'), width: 150, editable: true },
    { key: 'tlsDate', kind: 'date', label: c('tls'), group: c('status'), width: 112, editable: true, align: 'center' },
    { key: 'visaDate', kind: 'date', label: c('visa'), group: c('status'), width: 112, editable: true, align: 'center' },
    { key: 'stage', kind: 'stage', label: c('stage'), group: c('status'), width: 138, editable: true },
    { key: 'amountCents', kind: 'money', label: c('amount'), group: c('payment'), width: 104, editable: true, align: 'right', currencyField: 'currency' },
    { key: 'currency', kind: 'currency', label: c('currency'), group: c('payment'), width: 62, editable: true, align: 'center' },
    { key: 'payAfterVisa', kind: 'bool', label: c('afterVisa'), group: c('payment'), width: 74, editable: true, align: 'center' },
    { key: 'paidCents', kind: 'money', label: c('paid'), group: c('payment'), width: 100, editable: true, align: 'right', currencyField: 'currency' },
    { key: 'partnerShareCents', kind: 'partnerShare', label: c('partnerShare'), width: 124, editable: true, align: 'right', currencyField: 'partnerShareCurrency' },
    { key: 'partnerShareCurrency', kind: 'currency', label: c('currency'), group: c('partnerShare'), width: 62, editable: true, align: 'center' },
  ];
  for (const b of beneficiaries.filter((x) => x.active)) {
    cols.push({ key: `share:${b.id}`, kind: 'share', label: b.name, width: 118, editable: true, align: 'right', beneficiaryId: b.id });
  }
  cols.push(
    { key: 'expensesCents', kind: 'money', label: c('expenses'), width: 100, editable: true, align: 'right', currencyField: 'currency' },
    { key: 'note', kind: 'text', label: c('note'), width: 240, editable: true },
    { key: '_actions', kind: 'actions', label: '', width: 66, editable: false, align: 'center' },
  );
  return cols;
};
