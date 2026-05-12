export type ImageDataInput =
  | string
  | {
      dataUri?: string | null;
      base64?: string | null;
    }
  | null
  | undefined;

const IMAGE_DATA_URI_PATTERN = /^data:image\/[a-z0-9.+-]+;base64,/i;

function toImageDataUri(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!trimmed) return null;
  if (IMAGE_DATA_URI_PATTERN.test(trimmed)) return trimmed;

  return `data:image/jpeg;base64,${trimmed.replace(/\s+/g, '')}`;
}

export function normalizeImageDataUri(input: ImageDataInput): string | null {
  if (typeof input === 'string') return toImageDataUri(input);

  return toImageDataUri(input?.dataUri) ?? toImageDataUri(input?.base64);
}
