import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { ApiError } from '@/lib/errors';
import { SCAN_JPEG_QUALITY, fitLongEdge, normaliseRotation, rotatedSize } from '@/lib/scan';

/** One captured page. `rotation` is applied when the page is rendered for upload (preview rotates via a style transform). */
export interface ScanPage {
  id: string;
  uri: string;
  width: number;
  height: number;
  rotation: number;
}

export interface RenderedPage {
  uri: string;
  width: number;
  height: number;
}

let seq = 0;

/**
 * Opens the camera with the system crop editor. Returns null when the user cancels.
 * Full quality here — the page is compressed once, after rotation, in `renderPage`.
 */
export const capturePage = async (): Promise<ScanPage | null> => {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new ApiError(0, 'CAMERA_DENIED');
  const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 1, exif: false });
  if (res.canceled || !res.assets[0]) return null;
  const a = res.assets[0];
  seq += 1;
  return { id: `${Date.now()}-${seq}`, uri: a.uri, width: a.width, height: a.height, rotation: 0 };
};

/** Rotates, shrinks to the scanner's long edge and re-encodes as JPEG (quality 0.8) in the cache directory. */
export const renderPage = async (page: ScanPage): Promise<RenderedPage> => {
  const rotation = normaliseRotation(page.rotation);
  const ctx = ImageManipulator.manipulate(page.uri);
  if (rotation !== 0) ctx.rotate(rotation);
  const resize = fitLongEdge(rotatedSize({ width: page.width, height: page.height }, rotation));
  if (resize) ctx.resize(resize);
  const image = await ctx.renderAsync();
  try {
    const out = await image.saveAsync({ compress: SCAN_JPEG_QUALITY, format: SaveFormat.JPEG });
    return { uri: out.uri, width: out.width, height: out.height };
  } finally {
    try {
      image.release();
    } catch {
      /* already released */
    }
    try {
      ctx.release();
    } catch {
      /* already released */
    }
  }
};
