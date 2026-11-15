/** Shapes of /api/company/pipeline (server lib/employerPipeline/service.ts). */

export const PIPELINE_STAGES = ['CONTRACT', 'RECOGNITION', 'EMBASSY', 'DECISION', 'FLIGHT', 'ARRIVED', 'FIRST_DAY'] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];
export type DateSource = 'ACTUAL' | 'FLIGHT' | 'PLANNED' | 'ESTIMATE';

export interface Blocker {
  code: 'CONTRACT_UNSIGNED' | 'SIGN_DOCUMENT' | 'COMPLETE_FORM' | 'ACCELERATED_STEP' | 'ANSWER_CHECKIN' | 'ARRIVAL_CHECKLIST';
  title: string;
  link: string | null;
  since: string | null;
  params?: Record<string, string | number>;
}

export interface PipelineCard {
  id: string;
  name: string;
  position: string;
  profession: string;
  visaType: string;
  visaLabel: string | null;
  stage: PipelineStage;
  stageSince: string;
  daysInStage: number;
  typicalDays: number | null;
  slow: boolean;
  hasRecognition: boolean;
  expectedArrival: { at: string; source: DateSource } | null;
  firstWorkDay: { at: string; source: DateSource } | null;
  blockers: Blocker[];
  nextAction: string;
  manager: { name: string; email: string } | null;
}

export interface PipelineResponse {
  stages: PipelineStage[];
  typicalDays: Record<string, number>;
  cards: PipelineCard[];
  strip: { month: string; confirmed: number; estimated: number; ids: string[] }[];
  summary: { total: number; byStage: Record<PipelineStage, number>; withBlockers: number; blockers: number; arrivingNext30: number; slow: number };
  generatedAt: string;
}
