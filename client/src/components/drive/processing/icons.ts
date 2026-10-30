import type { LucideIcon } from 'lucide-react';
import { Ban, CheckCircle2, ClipboardPen, Hand, PenLine, Undo2 } from 'lucide-react';
import type { FlowAction } from '@/components/caseProcessing/flow';
import type { ProcessingStage } from '@/components/caseProcessing/api';

/** Icons of the team workflow actions and stages in the documents section. */
export const ACTION_ICON: Record<FlowAction, LucideIcon> = { send: PenLine, claim: Hand, finish: CheckCircle2, back: Undo2, refuse: Ban };
export const STAGE_ICON: Record<ProcessingStage, LucideIcon> = { IN_PROGRESS: ClipboardPen, WRITTEN: PenLine, DONE: CheckCircle2, REFUSED: Ban };
