import type { RunStyle } from '../schema';

export const RUN_STYLE_KEYS: ReadonlyArray<keyof RunStyle> = [
  'font',
  'sizePt',
  'weight',
  'italic',
  'underline',
  'strike',
  'color',
  'highlight',
  'letterSpacingPt',
];

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function deepEqual(left: unknown, right: unknown): boolean {
  if (left === right) {
    return true;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((item, index) => deepEqual(item, right[index]))
    );
  }
  if (!isRecord(left) || !isRecord(right)) {
    return false;
  }
  const leftKeys = Object.keys(left).filter((key) => left[key] !== undefined);
  const rightKeys = Object.keys(right).filter(
    (key) => right[key] !== undefined,
  );

  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key) => Object.hasOwn(right, key) && deepEqual(left[key], right[key]),
    )
  );
}

export function runStyleOverrides(
  style: RunStyle,
  inherited: RunStyle | undefined,
): RunStyle {
  const overrides: RunStyle = {};
  for (const key of RUN_STYLE_KEYS) {
    if (style[key] !== undefined && !deepEqual(style[key], inherited?.[key])) {
      Object.assign(overrides, { [key]: style[key] });
    }
  }

  return overrides;
}
