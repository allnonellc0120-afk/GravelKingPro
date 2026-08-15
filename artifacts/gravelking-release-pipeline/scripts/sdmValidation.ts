import {
  parseSlideDocument,
  type Color,
  type Element,
  type Font,
  type Paint,
  type RunStyle,
  type SlideDocument,
  type TextBody,
  type Theme,
} from '../src/.sdm/core/schema';
import { analyzeSlideLayout } from '../src/.sdm/core/layoutValidation';
import type { SlideManifestEntry as SlideEntry } from '../src/.sdm/core/slidesManifest';

export interface SdmValidationIo {
  readFile: (projectRelativePath: string) => string | null;
  listFiles: (projectRelativeDir: string) => Array<string>;
}

const SDM_SLIDES_DIR = 'src/data/slides';
const WIDGETS_DIR = 'src/widgets';
const SDM_SLIDE_ID = /^[A-Za-z0-9_-]+$/;
const EXTERNAL_ASSET_SRC = /^(?:https?:|data:|blob:)/i;

function formatMessage(
  filepath: string,
  code: string,
  elementIds: Array<string>,
  message: string,
): string {
  const ids = elementIds.length > 0 ? ` (${elementIds.join(', ')})` : '';

  return `${filepath} [${code}]${ids}: ${message}`;
}

function collectWidgetModules(
  elements: Array<Element>,
  into: Map<string, string>,
): void {
  for (const element of elements) {
    if (element.type === 'widget') {
      into.set(element.id, element.widget.module);
    } else if (element.type === 'group') {
      collectWidgetModules(element.children, into);
    }
  }
}

function widgetModuleMessages(
  filepath: string,
  document: SlideDocument,
  io: SdmValidationIo,
): Array<string> {
  const modules = new Map<string, string>();
  collectWidgetModules(document.elements, modules);
  if (modules.size === 0) {
    return [];
  }
  const widgetFiles = new Set(
    io.listFiles(WIDGETS_DIR).map((file) => file.replaceAll('\\', '/')),
  );
  const messages: Array<string> = [];
  for (const [elementId, module] of modules) {
    const relative = module.replace(/^\.\/widgets\//, '');
    if (!widgetFiles.has(relative)) {
      messages.push(
        formatMessage(
          filepath,
          'widget-module',
          [elementId],
          `widget module ${module} does not exist under ${WIDGETS_DIR}/. Add the file or fix the module path.`,
        ),
      );
    }
  }

  return messages;
}

function assetFileMessages(
  filepath: string,
  document: SlideDocument,
  io: SdmValidationIo,
): Array<string> {
  const messages: Array<string> = [];
  for (const [assetId, asset] of Object.entries(document.assets ?? {})) {
    if (EXTERNAL_ASSET_SRC.test(asset.src)) {
      continue;
    }
    if (asset.src.startsWith('/')) {
      messages.push(
        formatMessage(
          filepath,
          'asset-file',
          [],
          `asset "${assetId}" references "${asset.src}", but root-relative asset sources bypass the artifact base path. Remove the leading "/" and keep the file under public/.`,
        ),
      );
      continue;
    }
    const sourcePath = asset.src.split(/[?#]/, 1)[0];
    if (sourcePath.split(/[\\/]/).includes('..')) {
      messages.push(
        formatMessage(
          filepath,
          'asset-file',
          [],
          `asset "${assetId}" references "${asset.src}", but relative asset sources cannot contain ".." segments. Copy the file under public/ and reference it directly.`,
        ),
      );
      continue;
    }
    const publicPath = `public/${sourcePath.replace(/^\//, '')}`;
    if (io.readFile(publicPath) === null) {
      messages.push(
        formatMessage(
          filepath,
          'asset-file',
          [],
          `asset "${assetId}" references "${asset.src}", but ${publicPath} does not exist. Add the file under public/ or fix the asset src.`,
        ),
      );
    }
  }

  return messages;
}

function colorTokenMessage(
  filepath: string,
  color: Color | undefined,
  theme: Theme | undefined,
  elementIds: Array<string>,
  location: string,
): string | undefined {
  if (
    color?.kind !== 'token' ||
    (theme !== undefined && Object.hasOwn(theme.colors, color.token))
  ) {
    return undefined;
  }

  return formatMessage(
    filepath,
    'theme-token',
    elementIds,
    `${location} references color token "${color.token}", but it is not defined in theme.colors. Define the token or use an rgb color.`,
  );
}

function fontTokenMessage(
  filepath: string,
  font: Font | undefined,
  theme: Theme | undefined,
  elementIds: Array<string>,
  location: string,
): string | undefined {
  if (
    font?.kind !== 'token' ||
    (theme !== undefined && Object.hasOwn(theme.fonts, font.token))
  ) {
    return undefined;
  }

  return formatMessage(
    filepath,
    'theme-token',
    elementIds,
    `${location} references font token "${font.token}", but it is not defined in theme.fonts. Define the token or use a family font.`,
  );
}

function collectPaintTokenMessages(
  filepath: string,
  paint: Paint | undefined,
  theme: Theme | undefined,
  elementIds: Array<string>,
  location: string,
  messages: Array<string>,
): void {
  if (paint?.kind === 'solid') {
    const message = colorTokenMessage(
      filepath,
      paint.color,
      theme,
      elementIds,
      location,
    );
    if (message) {
      messages.push(message);
    }
  } else if (paint?.kind === 'linearGradient') {
    paint.stops.forEach((stop, index) => {
      const message = colorTokenMessage(
        filepath,
        stop.color,
        theme,
        elementIds,
        `${location}.stops[${index}]`,
      );
      if (message) {
        messages.push(message);
      }
    });
  }
}

function collectTextTokenMessages(
  filepath: string,
  body: TextBody | undefined,
  theme: Theme | undefined,
  elementIds: Array<string>,
  location: string,
  messages: Array<string>,
): void {
  const collectStyle = (style: RunStyle, styleLocation: string) => {
    const colorMessage = colorTokenMessage(
      filepath,
      style.color,
      theme,
      elementIds,
      `${styleLocation}.color`,
    );
    const highlightMessage = colorTokenMessage(
      filepath,
      style.highlight,
      theme,
      elementIds,
      `${styleLocation}.highlight`,
    );
    const fontMessage = fontTokenMessage(
      filepath,
      style.font,
      theme,
      elementIds,
      `${styleLocation}.font`,
    );
    if (colorMessage) {
      messages.push(colorMessage);
    }
    if (highlightMessage) {
      messages.push(highlightMessage);
    }
    if (fontMessage) {
      messages.push(fontMessage);
    }
  };
  for (const [level, style] of Object.entries(body?.listStyle ?? {})) {
    if (style.defaultRunStyle !== undefined) {
      collectStyle(
        style.defaultRunStyle,
        `${location}.listStyle.${level}.defaultRunStyle`,
      );
    }
    if (style.markerStyle !== undefined) {
      collectStyle(
        style.markerStyle,
        `${location}.listStyle.${level}.markerStyle`,
      );
    }
  }
  body?.paragraphs.forEach((paragraph, paragraphIndex) => {
    const paragraphLocation = `${location}.paragraphs[${paragraphIndex}]`;
    const styles: Array<{ location: string; style: RunStyle }> = [
      ...(paragraph.defaultRunStyle === undefined
        ? []
        : [
            {
              location: `${paragraphLocation}.defaultRunStyle`,
              style: paragraph.defaultRunStyle,
            },
          ]),
      ...paragraph.runs.map((run, runIndex) => ({
        location: `${paragraphLocation}.runs[${runIndex}]`,
        style: run,
      })),
    ];
    styles.forEach(({ location: styleLocation, style }) => {
      collectStyle(style, styleLocation);
    });
  });
}

function collectElementTokenMessages(
  filepath: string,
  elements: Array<Element>,
  theme: Theme | undefined,
  baseLocation: string,
  messages: Array<string>,
): void {
  elements.forEach((element, index) => {
    const location = `${baseLocation}[${index}]`;
    const elementIds = [element.id];
    if ('fill' in element) {
      collectPaintTokenMessages(
        filepath,
        element.fill,
        theme,
        elementIds,
        `${location}.fill`,
        messages,
      );
    }
    if ('stroke' in element && element.stroke) {
      const message = colorTokenMessage(
        filepath,
        element.stroke.color,
        theme,
        elementIds,
        `${location}.stroke.color`,
      );
      if (message) {
        messages.push(message);
      }
    }
    if ('body' in element) {
      collectTextTokenMessages(
        filepath,
        element.body,
        theme,
        elementIds,
        `${location}.body`,
        messages,
      );
    }
    if (element.type === 'table') {
      element.rows.forEach((row, rowIndex) => {
        row.cells.forEach((cell, cellIndex) => {
          const cellLocation = `${location}.rows[${rowIndex}].cells[${cellIndex}]`;
          collectPaintTokenMessages(
            filepath,
            cell.fill,
            theme,
            elementIds,
            `${cellLocation}.fill`,
            messages,
          );
          collectTextTokenMessages(
            filepath,
            cell.body,
            theme,
            elementIds,
            `${cellLocation}.body`,
            messages,
          );
        });
      });
    } else if (element.type === 'group') {
      collectElementTokenMessages(
        filepath,
        element.children,
        theme,
        `${location}.children`,
        messages,
      );
    }
  });
}

function themeTokenMessages(
  filepath: string,
  document: SlideDocument,
): Array<string> {
  const messages: Array<string> = [];
  collectPaintTokenMessages(
    filepath,
    document.background,
    document.theme,
    [],
    'background',
    messages,
  );
  collectElementTokenMessages(
    filepath,
    document.elements,
    document.theme,
    'elements',
    messages,
  );

  return messages;
}

export function validateSdmEntries(
  entries: Array<SlideEntry>,
  io: SdmValidationIo,
): Array<string> {
  const messages: Array<string> = [];
  for (const entry of entries) {
    if (!SDM_SLIDE_ID.test(entry.id)) {
      messages.push(
        formatMessage(
          entry.filepath,
          'invalid-id',
          [],
          `slide id "${entry.id}" must contain only letters, numbers, underscores, and hyphens.`,
        ),
      );
      continue;
    }
    const expectedPath = `${SDM_SLIDES_DIR}/${entry.id}.sdm.json`;
    if (entry.filepath !== expectedPath) {
      messages.push(
        formatMessage(
          entry.filepath,
          'manifest-path',
          [],
          `slide "${entry.id}" must use ${expectedPath} so the loader and HMR resolve it.`,
        ),
      );
      continue;
    }
    const raw = io.readFile(entry.filepath);
    if (raw === null) {
      messages.push(
        formatMessage(
          entry.filepath,
          'missing-file',
          [],
          `file not found (referenced by slide "${entry.id}").`,
        ),
      );
      continue;
    }
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      messages.push(
        formatMessage(entry.filepath, 'parse-json', [], reason),
      );
      continue;
    }
    const result = parseSlideDocument(json);
    if (!result.ok) {
      if (result.reason === 'unsupportedVersion') {
        messages.push(
          formatMessage(
            entry.filepath,
            'unsupported-version',
            [],
            `document version ${result.version} is newer than this tooling supports; do not edit this file by hand.`,
          ),
        );
      } else {
        for (const issue of result.issues) {
          messages.push(
            formatMessage(
              entry.filepath,
              'schema-invalid',
              [],
              `${issue.path}: ${issue.message}`,
            ),
          );
        }
      }
      continue;
    }
    for (const issue of analyzeSlideLayout(result.document)) {
      messages.push(
        formatMessage(entry.filepath, issue.code, issue.elementIds, issue.message),
      );
    }
    messages.push(...assetFileMessages(entry.filepath, result.document, io));
    messages.push(...themeTokenMessages(entry.filepath, result.document));
    messages.push(...widgetModuleMessages(entry.filepath, result.document, io));
  }

  return messages;
}

export function findOrphanSdmFiles(
  entries: Array<SlideEntry>,
  io: SdmValidationIo,
): Array<string> {
  const referenced = new Set(
    entries
      .filter((entry) => entry.kind === 'sdm')
      .map((entry) => entry.filepath),
  );
  const messages: Array<string> = [];
  for (const file of io.listFiles(SDM_SLIDES_DIR)) {
    const normalized = file.replaceAll('\\', '/');
    if (!normalized.endsWith('.sdm.json')) {
      continue;
    }
    const filepath = `${SDM_SLIDES_DIR}/${normalized}`;
    if (!referenced.has(filepath)) {
      messages.push(
        formatMessage(
          filepath,
          'orphan-file',
          [],
          'not referenced by any manifest entry with kind "sdm". Add a manifest entry or delete the file.',
        ),
      );
    }
  }

  return messages;
}
