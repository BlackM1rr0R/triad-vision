import { forwardRef, memo, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Svg, { Path } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';
import { appendPoint, isSignatureEmpty, strokeToPath, type Stroke } from '@/lib/signature';
import { colors, fonts, radius } from '@/theme';
import { Text } from '@/components/ui';

export interface SignaturePadHandle {
  clear: () => void;
  isEmpty: () => boolean;
  /** PNG of the signature as a data URL (what the API expects). */
  toDataUrl: () => Promise<string>;
}

const INK = colors.navy;
const WIDTH = 2.8;

const Finished = memo(({ strokes }: { strokes: Stroke[] }) => (
  <>
    {strokes.map((s, i) => (
      <Path key={i} d={strokeToPath(s)} stroke={INK} strokeWidth={WIDTH} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    ))}
  </>
));
Finished.displayName = 'FinishedStrokes';

/** Finger signature pad: gesture-handler pan → smoothed SVG paths → PNG via view-shot. */
export const SignaturePad = forwardRef<
  SignaturePadHandle,
  { placeholder: string; onDrawingChange?: (drawing: boolean) => void; onChange?: (empty: boolean) => void; height?: number }
>(({ placeholder, onDrawingChange, onChange, height = 200 }, ref) => {
  const canvas = useRef<View>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [current, setCurrent] = useState<Stroke>([]);
  const all = useRef<Stroke[]>([]);
  const live = useRef<Stroke>([]);

  useImperativeHandle(ref, () => ({
    clear: () => {
      all.current = [];
      live.current = [];
      setStrokes([]);
      setCurrent([]);
      onChange?.(true);
    },
    isEmpty: () => isSignatureEmpty(all.current),
    toDataUrl: async () => {
      const base64 = await captureRef(canvas, { format: 'png', quality: 1, result: 'base64' });
      return `data:image/png;base64,${base64.replace(/\s/g, '')}`;
    },
  }));

  const pan = Gesture.Pan()
    .runOnJS(true)
    .minDistance(0)
    .shouldCancelWhenOutside(false)
    .onBegin((e) => {
      onDrawingChange?.(true);
      live.current = [{ x: e.x, y: e.y }];
      setCurrent(live.current);
    })
    .onUpdate((e) => {
      const next = appendPoint(live.current, { x: e.x, y: e.y });
      if (next !== live.current) {
        live.current = next;
        setCurrent(next);
      }
    })
    .onFinalize(() => {
      onDrawingChange?.(false);
      if (live.current.length) {
        all.current = [...all.current, live.current];
        setStrokes(all.current);
        onChange?.(isSignatureEmpty(all.current));
      }
      live.current = [];
      setCurrent([]);
    });

  const empty = strokes.length === 0 && current.length === 0;

  return (
    <GestureDetector gesture={pan}>
      <View style={[styles.pad, { height }]} accessible accessibilityLabel={placeholder} accessibilityHint={placeholder}>
        {/* Only this inner view is captured: no border, guide line or placeholder in the PNG. */}
        <View ref={canvas} collapsable={false} style={styles.canvas} pointerEvents="none">
          <Svg style={StyleSheet.absoluteFill}>
            <Finished strokes={strokes} />
            {current.length ? (
              <Path d={strokeToPath(current)} stroke={INK} strokeWidth={WIDTH} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            ) : null}
          </Svg>
        </View>
        <View style={styles.baseline} pointerEvents="none" />
        {empty ? (
          <View style={styles.placeholder} pointerEvents="none">
            <Text style={{ fontFamily: fonts.medium, color: '#a3b0c6', fontSize: 14 }}>{placeholder}</Text>
          </View>
        ) : null}
      </View>
    </GestureDetector>
  );
});
SignaturePad.displayName = 'SignaturePad';

const styles = StyleSheet.create({
  pad: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderStyle: 'dashed',
    overflow: 'hidden',
  },
  canvas: { ...StyleSheet.absoluteFill, backgroundColor: colors.white },
  placeholder: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  baseline: { position: 'absolute', left: 24, right: 24, bottom: 42, height: 1, backgroundColor: colors.line },
});
