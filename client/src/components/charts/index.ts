/**
 * Data-viz kit for the admin panel (hand-made SVG / HTML, no chart library). One mark spec everywhere: 2px lines,
 * hairline solid grid, ≤ 24px bars or 8px meters with rounded data ends, a 2px surface gap / ring between marks,
 * text in ink / muted tokens (never the series colour), a legend for ≥ 2 series, hover + keyboard readouts and a
 * table view. Colours come from the validated --viz-* tokens (index.css), light and dark. Motion only under
 * `motion-safe`. Copy: i18n/charts.ts (registered by ./parts).
 */
export { AreaChart, useSeriesToggle, type ChartPoint, type ChartSeries } from './AreaChart';
export { DeltaPill, pctDelta } from './DeltaPill';
export { FunnelBars, type FunnelStep } from './FunnelBars';
export { HBarList, type HBarRow } from './HBarList';
export { HealthBar, healthTone } from './HealthBar';
export { RingGauge } from './RingGauge';
export { SegmentBar, type Segment } from './SegmentBar';
export { Sparkline } from './Sparkline';
export { StatCard } from './StatCard';
export { Segmented, TableToggle, DataTable } from './parts';
export { VIZ, VIZ_GHOST, VIZ_TRACK, niceStep, useVizFormat, type VizFormat } from './format';
