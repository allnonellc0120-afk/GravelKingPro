import { Value } from '@sinclair/typebox/value';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { Plugin } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';

import {
  BulletSchema,
  RunStyleSchema,
  type ListStyle,
  type Paragraph,
  type Theme,
} from '../schema';
import { paragraphMarkerCss } from './inlineStyles';
import {
  effectiveParagraphWithListStyle,
  type EffectiveParagraph,
} from './listStyles';
import { listStyleFromPmAttrs, runStyleFromMarks } from './pmDoc';
import { sdmTextSchema } from './pmSchema';

function alphaNumber(value: number, uppercase: boolean): string {
  let remaining = value;
  let result = '';
  while (remaining > 0) {
    remaining -= 1;
    result =
      String.fromCharCode((uppercase ? 65 : 97) + (remaining % 26)) + result;
    remaining = Math.floor(remaining / 26);
  }

  return result || String(value);
}

function romanNumber(value: number, uppercase: boolean): string {
  const numerals: Array<[number, string]> = [
    [1000, 'm'],
    [900, 'cm'],
    [500, 'd'],
    [400, 'cd'],
    [100, 'c'],
    [90, 'xc'],
    [50, 'l'],
    [40, 'xl'],
    [10, 'x'],
    [9, 'ix'],
    [5, 'v'],
    [4, 'iv'],
    [1, 'i'],
  ];
  let remaining = value;
  let result = '';
  for (const [amount, numeral] of numerals) {
    while (remaining >= amount) {
      result += numeral;
      remaining -= amount;
    }
  }

  return uppercase ? result.toUpperCase() : result;
}

export function formatBulletNumber(style: string | undefined, value: number) {
  const scheme = style ?? 'arabicPeriod';
  let body: string;
  if (scheme.startsWith('alphaUc')) {
    body = alphaNumber(value, true);
  } else if (scheme.startsWith('alphaLc')) {
    body = alphaNumber(value, false);
  } else if (scheme.startsWith('romanUc')) {
    body = romanNumber(value, true);
  } else if (scheme.startsWith('romanLc')) {
    body = romanNumber(value, false);
  } else {
    body = String(value);
  }
  if (scheme.endsWith('ParenBoth')) {
    return `(${body})`;
  }
  if (scheme.endsWith('ParenR')) {
    return `${body})`;
  }
  if (scheme.endsWith('Plain')) {
    return body;
  }

  return `${body}.`;
}

export function paragraphMarkers(
  paragraphs: ReadonlyArray<
    Pick<Paragraph, 'bullet' | 'level'> & { bulletInherited?: boolean }
  >,
): Array<string> {
  const counters = new Map<number, number>();

  return paragraphs.map((paragraph) => {
    const level = paragraph.level ?? 0;
    if (paragraph.bullet?.kind === 'number') {
      const startAt = paragraph.bullet.startAt ?? 1;
      const restart =
        paragraph.bullet.startAt !== undefined &&
        (!paragraph.bulletInherited || !counters.has(level));
      const count = restart
        ? startAt
        : (counters.get(level) ?? startAt - 1) + 1;
      counters.set(level, count);
      for (const counterLevel of counters.keys()) {
        if (counterLevel > level) {
          counters.delete(counterLevel);
        }
      }

      return `${formatBulletNumber(paragraph.bullet.style, count)} `;
    }
    for (const counterLevel of counters.keys()) {
      if (counterLevel >= level) {
        counters.delete(counterLevel);
      }
    }

    return paragraph.bullet?.kind === 'character'
      ? `${paragraph.bullet.character} `
      : '';
  });
}

function paragraphMetadataFromNode(
  node: ProseMirrorNode,
): Pick<Paragraph, 'bullet' | 'level'> {
  const bulletValue: unknown = node.attrs.bullet;
  const levelValue: unknown = node.attrs.level;
  const bullet = Value.Check(BulletSchema, bulletValue)
    ? bulletValue
    : undefined;
  const level =
    typeof levelValue === 'number' &&
    Number.isInteger(levelValue) &&
    levelValue >= 0 &&
    levelValue <= 8
      ? levelValue
      : undefined;

  return {
    ...(bullet === undefined ? {} : { bullet }),
    ...(level === undefined ? {} : { level }),
  };
}

function paragraphMetadata(
  doc: ProseMirrorNode,
  listStyle: ListStyle | undefined,
): Array<EffectiveParagraph> {
  const paragraphs: Array<EffectiveParagraph> = [];
  doc.forEach((node) => {
    paragraphs.push(
      effectiveParagraphWithListStyle(listStyle, paragraphForMarker(node)),
    );
  });

  return paragraphs;
}

function paragraphForMarker(node: ProseMirrorNode): Paragraph {
  const defaultRunStyleValue: unknown = node.attrs.defaultRunStyle;
  const defaultRunStyle = Value.Check(RunStyleSchema, defaultRunStyleValue)
    ? defaultRunStyleValue
    : undefined;

  return {
    ...paragraphMetadataFromNode(node),
    ...(defaultRunStyle === undefined ? {} : { defaultRunStyle }),
    runs: [
      {
        text: '',
        ...(node.firstChild === null
          ? {}
          : runStyleFromMarks(node.firstChild.marks)),
      },
    ],
  };
}

export function createParagraphMarkerPlugin(theme?: Theme): Plugin {
  return new Plugin({
    props: {
      decorations(state) {
        const listStyle = listStyleFromPmAttrs(state.doc.attrs);
        const paragraphs = paragraphMetadata(state.doc, listStyle);
        const markers = paragraphMarkers(paragraphs);
        const decorations: Array<Decoration> = [];
        state.doc.forEach((node, position, index) => {
          const marker = markers[index];
          const paragraph = paragraphs[index];
          if (
            node.type !== sdmTextSchema.nodes.paragraph ||
            marker === undefined ||
            marker === '' ||
            paragraph === undefined
          ) {
            return;
          }
          decorations.push(
            Decoration.widget(
              position + 1,
              () => {
                const span = document.createElement('span');
                span.contentEditable = 'false';
                span.dataset.sdmTextMarker = '';
                span.textContent = marker;
                Object.assign(span.style, paragraphMarkerCss(paragraph, theme));

                return span;
              },
              { side: -1 },
            ),
          );
        });

        return DecorationSet.create(state.doc, decorations);
      },
    },
  });
}
