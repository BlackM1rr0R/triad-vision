import type { LucideIcon } from 'lucide-react';
import { CheckCircle2, ClipboardPen, Hand, PenLine, Undo2 } from 'lucide-react';
import { flowActions, type FlowAction } from '@/components/caseProcessing/flow';
import type { ProcessingStage } from '@/components/caseProcessing/api';

/** Icons of the team workflow actions and stages in the documents section. */
export const ACTION_ICON: Record<FlowAction, LucideIcon> = { send: PenLine, work: ClipboardPen, claim: Hand, finish: CheckCircle2, back: Undo2, return: Undo2 };
/** The buttons of a client folder in the documents section: the stage's actions without "Götür" (not offered here). */
export const driveFlowActions = (...args: Parameters<typeof flowActions>): FlowAction[] => flowActions(...args).filter((a) => a !== 'claim');
export const STAGE_ICON: Record<ProcessingStage, LucideIcon> = { IN_PROGRESS: ClipboardPen, WRITTEN: PenLine, DONE: CheckCircle2 };
