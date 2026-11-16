/**
 * Light metadata of the work scenes (no hotspot texts): URL, the profession it belongs to and where it is
 * linked from (profession guides, job pages, the portal's vocabulary fields). Plain data, no React.
 */
import type { SceneId } from './types';

export interface SceneMeta {
  id: SceneId;
  path: string;
  /** Field of the portal vocabulary trainer / quiz (components/german/types VOCAB_FIELDS). */
  vocabField: 'HOSPITALITY' | 'DRIVING' | 'CARE' | 'CONSTRUCTION' | 'ELECTRICAL';
  /** Canonical job professions (server lib/jobLandings PROFESSION_SLUGS keys) whose pages link this scene. */
  professions: string[];
  /** Guide keys whose page links this scene (anerkennung-koch, pflege …). */
  guides: string[];
  /** German job title used for the job search link (/jobs?search=). */
  jobSearch: string;
}

export const WORK_SCENES_PATH = '/work-scenes';

export const SCENE_META: SceneMeta[] = [
  { id: 'restaurant-kitchen', path: '/work-scenes/restaurant-kitchen', vocabField: 'HOSPITALITY', professions: ['cook', 'baker', 'butcher', 'waiter'], guides: ['anerkennung-koch'], jobSearch: 'Koch' },
  { id: 'truck-cab', path: '/work-scenes/truck-cab', vocabField: 'DRIVING', professions: ['truck_driver', 'bus_driver', 'courier'], guides: ['driver-jobs'], jobSearch: 'Fahrer' },
  { id: 'hospital-ward', path: '/work-scenes/hospital-ward', vocabField: 'CARE', professions: ['nurse'], guides: ['pflege', 'anerkennung-arzt'], jobSearch: 'Pflege' },
  { id: 'construction-site', path: '/work-scenes/construction-site', vocabField: 'CONSTRUCTION', professions: ['construction_worker', 'welder', 'carpenter', 'painter', 'plumber'], guides: ['anerkennung-bau', 'ausbildung'], jobSearch: 'Bau' },
  { id: 'electrical-panel', path: '/work-scenes/electrical-panel', vocabField: 'ELECTRICAL', professions: ['electrician'], guides: ['anerkennung-elektroniker'], jobSearch: 'Elektriker' },
];

export const sceneMeta = (id: SceneId) => SCENE_META.find((s) => s.id === id)!;
export const sceneForProfession = (profession: string | null | undefined) => (profession ? (SCENE_META.find((s) => s.professions.includes(profession)) ?? null) : null);
export const sceneForGuide = (guideKey: string | null | undefined) => (guideKey ? (SCENE_META.find((s) => s.guides.includes(guideKey)) ?? null) : null);
