import type { ComponentType } from 'react';
import {
  Ban,
  CalendarClock,
  CheckCircle2,
  FileSignature,
  Gavel,
  Landmark,
  MessageSquareWarning,
  RotateCcw,
  Undo2,
  type LucideProps,
} from '@/components/icons';
import type { StaffActionKey } from '@/lib/caseStatus';

export const ACTION_ICON: Record<StaffActionKey, ComponentType<LucideProps>> = {
  SEND_CONTRACT: FileSignature,
  REQUEST_CHANGES: MessageSquareWarning,
  CONFIRM_CONTRACT: CheckCircle2,
  REJECT_SIGNATURE: Undo2,
  SCHEDULE: CalendarClock,
  MARK_LODGED: Landmark,
  DECIDE: Gavel,
  REOPEN: RotateCcw,
  CANCEL: Ban,
};
