import type {
  Bullet,
  ListLevelStyle,
  ListStyle,
  Paragraph,
  RunStyle,
  TextBody,
} from '../schema';

const LIST_LEVEL_KEYS = ['0', '1', '2', '3', '4', '5', '6', '7', '8'] as const;

export const SDM_DEFAULT_LIST_INDENT_PT = 36;
export const SDM_DEFAULT_MARKER_HANG_PT = 24;

export interface EffectiveParagraph
  extends Omit<
    Paragraph,
    | 'align'
    | 'bullet'
    | 'defaultRunStyle'
    | 'level'
    | 'lineHeight'
    | 'spaceAfterPt'
    | 'spaceBeforePt'
  > {
  align: NonNullable<Paragraph['align']>;
  bullet: Bullet | undefined;
  bulletInherited: boolean;
  defaultRunStyle: RunStyle;
  hangingIndentPt: number;
  indentPt: number;
  level: number;
  lineHeight: number;
  markerStyle: RunStyle;
  spaceAfterPt: number;
  spaceBeforePt: number;
}

export function listLevelStyle(
  listStyle: ListStyle | undefined,
  level: number,
): ListLevelStyle | undefined {
  const key = LIST_LEVEL_KEYS[Math.max(0, Math.min(8, level))];

  return listStyle?.[key];
}

export function effectiveParagraphWithListStyle(
  listStyle: ListStyle | undefined,
  paragraph: Paragraph,
): EffectiveParagraph {
  const level = paragraph.level ?? 0;
  const levelStyle = listLevelStyle(listStyle, level);
  const bullet = paragraph.bullet ?? levelStyle?.bullet;
  const hasMarker =
    bullet !== undefined &&
    (bullet.kind === 'character' || bullet.kind === 'number');
  const hangingIndentPt = hasMarker
    ? (levelStyle?.hangingIndentPt ?? SDM_DEFAULT_MARKER_HANG_PT)
    : 0;
  const indentPt =
    levelStyle?.indentPt ??
    level * SDM_DEFAULT_LIST_INDENT_PT + hangingIndentPt;

  return {
    ...paragraph,
    align: paragraph.align ?? 'left',
    bullet,
    bulletInherited:
      paragraph.bullet === undefined && levelStyle?.bullet !== undefined,
    defaultRunStyle: {
      ...levelStyle?.defaultRunStyle,
      ...paragraph.defaultRunStyle,
    },
    hangingIndentPt,
    indentPt,
    level,
    lineHeight: paragraph.lineHeight ?? levelStyle?.lineHeight ?? 1.2,
    markerStyle: levelStyle?.markerStyle ?? {},
    spaceAfterPt: paragraph.spaceAfterPt ?? levelStyle?.spaceAfterPt ?? 0,
    spaceBeforePt: paragraph.spaceBeforePt ?? levelStyle?.spaceBeforePt ?? 0,
  };
}

export function effectiveParagraph(
  body: Pick<TextBody, 'listStyle'>,
  paragraph: Paragraph,
): EffectiveParagraph {
  return effectiveParagraphWithListStyle(body.listStyle, paragraph);
}
