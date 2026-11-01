const MAGIC: [number[], string][] = [
  [[0xff, 0xd8, 0xff], 'jpeg'],
  [[0x89, 0x50, 0x4e, 0x47], 'png'],
  [[0x52, 0x49, 0x46, 0x46], 'webp'], // RIFF....WEBP checked below
];

export function sniffImageType(bytes: Uint8Array): 'jpeg' | 'png' | 'webp' | null {
  for (const [sig, type] of MAGIC) {
    if (sig.every((b, i) => bytes[i] === b)) {
      if (type === 'webp') {
        // verify WEBP marker at bytes 8-11
        if (
          bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
        )
          return 'webp';
        continue;
      }
      return type as 'jpeg' | 'png';
    }
  }
  return null;
}

/**
 * Resize an image file to max 1280px on the longest side, JPEG output.
 * Rejects non-image files (magic bytes) and files > 8 MB before resize.
 */
export async function prepareVehiclePhoto(file: File): Promise<{
  base64: string;
  previewUrl: string;
}> {
  if (file.size > 8 * 1024 * 1024) {
    throw new Error('That photo is larger than 8 MB — try a smaller one.');
  }
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (!sniffImageType(head)) {
    throw new Error('That file does not look like a photo — use a JPEG, PNG or WebP.');
  }
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  return { base64: dataUrl.split(',')[1], previewUrl: dataUrl };
}
