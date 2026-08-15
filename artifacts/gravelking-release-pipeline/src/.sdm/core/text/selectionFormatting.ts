import type { EditorState } from 'prosemirror-state';

import type { Bullet, Paragraph, RunStyle } from '../schema';
import { effectiveParagraphWithListStyle } from './listStyles';
import {
  canonicalizeRunStyle,
  listStyleFromPmAttrs,
  paragraphFromPmAttrs,
  runStyleFromMarks,
} from './pmDoc';
import { sdmTextSchema } from './pmSchema';

export interface SdmSelectionFormatting {
  align: NonNullable<Paragraph['align']>;
  bullet: Bullet | null;
  level: number;
  lineHeight: number;
  runStyle: RunStyle;
  spaceAfterPt: number;
  spaceBeforePt: number;
}

/**
 * Effective formatting at the selection head: the paragraph's default run
 * style overlaid with the marks at the caret (stored marks win while typing),
 * plus the paragraph attributes formatting controls reflect.
 */
export function selectionFormatting(
  state: EditorState,
): SdmSelectionFormatting {
  const parent = state.selection.$head.parent;
  const paragraph: Paragraph =
    parent.type === sdmTextSchema.nodes.paragraph
      ? paragraphFromPmAttrs(parent.attrs)
      : { runs: [] };
  const effective = effectiveParagraphWithListStyle(
    listStyleFromPmAttrs(state.doc.attrs),
    paragraph,
  );
  const markStyle = runStyleFromMarks(
    state.storedMarks ?? state.selection.$head.marks(),
  );

  return {
    align: effective.align,
    bullet: effective.bullet ?? null,
    level: effective.level,
    lineHeight: effective.lineHeight,
    runStyle: canonicalizeRunStyle({
      ...effective.defaultRunStyle,
      ...markStyle,
    }),
    spaceAfterPt: effective.spaceAfterPt,
    spaceBeforePt: effective.spaceBeforePt,
  };
}
