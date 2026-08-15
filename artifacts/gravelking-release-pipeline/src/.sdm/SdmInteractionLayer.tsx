import {
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import {
  planRootPointerSelection,
  setElementFrame,
  translateRootElements,
} from './core/operations';
import type {
  Element as SdmElement,
  Frame,
  SlideDocument,
} from './core/schema';
import type { SdmTextCaretPoint } from './SdmTextEditor';
import {
  HANDLE_CURSORS,
  HANDLE_POS,
  HANDLES,
  resizeFrame,
  type Handle,
} from './geometry';

const DRAG_THRESHOLD_PX = 3;

interface Props {
  document: SlideDocument;
  selectedIds: Array<string>;
  scale: number;
  stageRef: RefObject<HTMLDivElement | null>;
  onSelect: (ids: Array<string>) => void;
  textCaretElementId: string | null;
  onActivateTextCaret: (
    elementId: string,
    point: SdmTextCaretPoint,
  ) => boolean;
  onExitTextCaret: () => SlideDocument | null;
  onPlaceTextCaret: (point: SdmTextCaretPoint) => boolean;
  onCommit: (document: SlideDocument, selectedIds: Array<string>) => void;
  onHistory: (direction: 'undo' | 'redo') => void;
  onForwardKey: (event: KeyboardEvent) => boolean;
}

const KEYBOARD_OWNER_SELECTOR = [
  'input',
  'textarea',
  'select',
  '[contenteditable]:not([contenteditable="false"])',
  '[role="textbox"]',
  '[role="menu"]',
  '[role="menuitem"]',
  '[role="listbox"]',
  '[role="tree"]',
  '[role="treeitem"]',
  '[role="dialog"]',
  '[role="combobox"]',
].join(',');

const ENTER_OWNER_SELECTOR = [
  'button',
  'a[href]',
  '[role="button"]',
  '[role="link"]',
  'summary',
].join(',');

function topLevelIdAt(
  target: EventTarget | null,
  stage: HTMLElement,
): string | null {
  if (!(target instanceof Element)) {
    return null;
  }
  let found: string | null = null;
  let node: Element | null = target.closest('[data-sdm-id]');
  while (node !== null && stage.contains(node)) {
    const id = node.getAttribute('data-sdm-id');
    if (id !== null) {
      found = id;
    }
    node = node.parentElement?.closest('[data-sdm-id]') ?? null;
  }

  return found;
}

function isKeyOwnedByTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest(KEYBOARD_OWNER_SELECTOR) !== null
  );
}

function isEnterOwnedByTarget(event: KeyboardEvent): boolean {
  return (
    event.key === 'Enter' &&
    event.target instanceof Element &&
    event.target.closest(ENTER_OWNER_SELECTOR) !== null
  );
}

function hasNoModifiers(event: KeyboardEvent): boolean {
  return !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
}

function shouldSuppressForwardedDefault(event: KeyboardEvent): boolean {
  const isPlainDelete =
    (event.key === 'Delete' || event.key === 'Backspace') &&
    hasNoModifiers(event);
  const isArrow =
    event.key === 'ArrowLeft' ||
    event.key === 'ArrowRight' ||
    event.key === 'ArrowUp' ||
    event.key === 'ArrowDown';
  const isNudge =
    isArrow && !event.altKey && !event.ctrlKey && !event.metaKey;
  const isSelectAll =
    event.key.toLowerCase() === 'a' &&
    (event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    !event.shiftKey;
  const hasPrimaryModifier = event.ctrlKey || event.metaKey;
  const isDuplicate =
    event.key.toLowerCase() === 'd' &&
    hasPrimaryModifier &&
    !event.altKey &&
    !event.shiftKey;
  const isArrange =
    hasPrimaryModifier &&
    !event.altKey &&
    (event.code === 'BracketRight' ||
      event.key === ']' ||
      event.key === '}' ||
      event.code === 'BracketLeft' ||
      event.key === '[' ||
      event.key === '{');

  return isPlainDelete || isNudge || isSelectAll || isDuplicate || isArrange;
}

function isOverlayChrome(target: EventTarget | null): boolean {
  return (
    target instanceof Element && target.closest('[data-sdm-handle]') !== null
  );
}

function isTextCaretTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest('[data-sdm-text-caret-active="true"]') !== null
  );
}

function isRenderedTextTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest('[data-sdm-text-run], [data-sdm-text-marker]') !== null
  );
}

function isEditableTextElement(element: SdmElement): boolean {
  return (
    element.type === 'text' ||
    (element.type === 'shape' && element.body !== undefined)
  );
}

function sameFrame(left: Frame, right: Frame): boolean {
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height
  );
}

function applyDraft(nodes: Array<HTMLElement>, frame: Frame) {
  for (const node of nodes) {
    node.style.left = `${frame.x}px`;
    node.style.top = `${frame.y}px`;
    node.style.width = `${frame.width}px`;
    node.style.height = `${frame.height}px`;
  }
}

export function SdmInteractionLayer({
  document,
  selectedIds,
  scale,
  stageRef,
  onSelect,
  textCaretElementId,
  onActivateTextCaret,
  onExitTextCaret,
  onPlaceTextCaret,
  onCommit,
  onHistory,
  onForwardKey,
}: Props) {
  const documentRef = useRef(document);
  documentRef.current = document;
  const lastDocumentRef = useRef(document);
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const textCaretElementIdRef = useRef(textCaretElementId);
  textCaretElementIdRef.current = textCaretElementId;
  const onActivateTextCaretRef = useRef(onActivateTextCaret);
  onActivateTextCaretRef.current = onActivateTextCaret;
  const onExitTextCaretRef = useRef(onExitTextCaret);
  onExitTextCaretRef.current = onExitTextCaret;
  const onPlaceTextCaretRef = useRef(onPlaceTextCaret);
  onPlaceTextCaretRef.current = onPlaceTextCaret;
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;
  const onHistoryRef = useRef(onHistory);
  onHistoryRef.current = onHistory;
  const onForwardKeyRef = useRef(onForwardKey);
  onForwardKeyRef.current = onForwardKey;
  const overlayRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<{
    captureTarget: HTMLElement;
    controller: AbortController;
    elementIds: Array<string>;
    pointerId: number;
  } | null>(null);

  const draftNodes = (elementId: string): Array<HTMLElement> => {
    const nodes: Array<HTMLElement> = [];
    const stageNode = stageRef.current?.querySelector(
      `[data-sdm-id="${CSS.escape(elementId)}"]`,
    );
    if (stageNode instanceof HTMLElement) {
      nodes.push(stageNode);
    }
    const outlineNode = overlayRef.current?.querySelector(
      `[data-sdm-selection-id="${CSS.escape(elementId)}"]`,
    );
    if (outlineNode instanceof HTMLElement) {
      nodes.push(outlineNode);
    }

    return nodes;
  };

  const endGesture = () => {
    const gesture = gestureRef.current;
    if (gesture === null) {
      return;
    }
    gestureRef.current = null;
    for (const elementId of gesture.elementIds) {
      const element = documentRef.current.elements.find(
        (candidate) => candidate.id === elementId,
      );
      if (element !== undefined) {
        applyDraft(draftNodes(elementId), element.frame);
      }
    }
    gesture.controller.abort();
    try {
      gesture.captureTarget.releasePointerCapture(gesture.pointerId);
    } catch {}
  };

  const trackGesture = ({
    elementId,
    elementIds,
    startEvent,
    startFrame,
    frameAt,
    applyFrame,
    commitFrame,
    onClick,
  }: {
    elementId: string;
    elementIds?: Array<string>;
    startEvent: PointerEvent;
    startFrame: Frame;
    frameAt: (dxStage: number, dyStage: number, shiftKey: boolean) => Frame;
    applyFrame?: (frame: Frame) => void;
    commitFrame: (frame: Frame) => void;
    onClick?: () => void;
  }) => {
    endGesture();
    const captureTarget = stageRef.current;
    if (captureTarget === null) {
      return;
    }
    const controller = new AbortController();
    gestureRef.current = {
      captureTarget,
      controller,
      elementIds: elementIds ?? [elementId],
      pointerId: startEvent.pointerId,
    };
    const applyTo =
      applyFrame ??
      ((frame: Frame) => applyDraft(draftNodes(elementId), frame));
    let moved = false;
    let lastFrame = startFrame;

    const onMove = (event: PointerEvent) => {
      if (event.pointerId !== startEvent.pointerId) {
        return;
      }
      const dxClient = event.clientX - startEvent.clientX;
      const dyClient = event.clientY - startEvent.clientY;
      if (!moved && Math.hypot(dxClient, dyClient) < DRAG_THRESHOLD_PX) {
        return;
      }
      moved = true;
      const stageScale = scaleRef.current || 1;
      lastFrame = frameAt(
        dxClient / stageScale,
        dyClient / stageScale,
        event.shiftKey,
      );
      applyTo(lastFrame);
    };

    const finish = (event: PointerEvent) => {
      if (event.pointerId !== startEvent.pointerId) {
        return;
      }
      const shouldCommit = moved && !sameFrame(lastFrame, startFrame);
      endGesture();
      if (!shouldCommit) {
        if (!moved) {
          onClick?.();
        }

        return;
      }
      commitFrame(lastFrame);
    };

    const cancel = (event: PointerEvent) => {
      if (event.pointerId !== startEvent.pointerId) {
        return;
      }
      endGesture();
    };

    window.addEventListener('pointermove', onMove, {
      signal: controller.signal,
    });
    window.addEventListener('pointerup', finish, { signal: controller.signal });
    window.addEventListener('pointercancel', cancel, {
      signal: controller.signal,
    });
    captureTarget.addEventListener('lostpointercapture', cancel, {
      signal: controller.signal,
    });
    try {
      captureTarget.setPointerCapture(startEvent.pointerId);
    } catch {}
  };

  const beginDragRef = useRef<
    (
      event: PointerEvent,
      element: SdmElement,
      elementIds: Array<string>,
      collapseTo?: string,
      onClick?: () => void,
    ) => void
  >(() => {});
  beginDragRef.current = (
    event,
    element,
    elementIds,
    collapseTo,
    onClick,
  ) => {
    const dragElements = documentRef.current.elements.filter((candidate) =>
      elementIds.includes(candidate.id),
    );
    const dragBlocked = dragElements.some((dragElement) => dragElement.locked);
    trackGesture({
      elementId: element.id,
      elementIds,
      startEvent: event,
      startFrame: element.frame,
      frameAt: (dx, dy) => {
        if (dragBlocked) {
          return element.frame;
        }
        const logicalDx = Math.round(dx);
        const logicalDy = Math.round(dy);

        return {
          ...element.frame,
          x: element.frame.x + logicalDx,
          y: element.frame.y + logicalDy,
        };
      },
      applyFrame: (frame) => {
        if (dragBlocked) {
          return;
        }
        const dx = frame.x - element.frame.x;
        const dy = frame.y - element.frame.y;
        for (const dragElement of dragElements) {
          applyDraft(draftNodes(dragElement.id), {
            ...dragElement.frame,
            x: dragElement.frame.x + dx,
            y: dragElement.frame.y + dy,
          });
        }
      },
      commitFrame: (frame) => {
        if (dragBlocked) {
          return;
        }
        const currentDocument = documentRef.current;
        const nextDocument = translateRootElements(
          currentDocument,
          elementIds,
          frame.x - element.frame.x,
          frame.y - element.frame.y,
        );
        if (nextDocument !== currentDocument) {
          onCommitRef.current(nextDocument, elementIds);
        }
      },
      onClick:
        collapseTo === undefined
          ? onClick
          : () => onSelectRef.current([collapseTo]),
    });
  };

  const beginResize = (
    event: ReactPointerEvent<HTMLDivElement>,
    element: SdmElement,
    handle: Handle,
  ) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (textCaretElementIdRef.current !== null) {
      const committedDocument = onExitTextCaretRef.current();
      if (committedDocument !== null) {
        documentRef.current = committedDocument;
        lastDocumentRef.current = committedDocument;
      }
    }
    trackGesture({
      elementId: element.id,
      startEvent: event.nativeEvent,
      startFrame: element.frame,
      frameAt: (dx, dy, shiftKey) =>
        resizeFrame(element.frame, handle, dx, dy, shiftKey),
      commitFrame: (frame) => {
        onCommitRef.current(
          setElementFrame(documentRef.current, element.id, frame),
          [element.id],
        );
      },
    });
  };

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || isOverlayChrome(event.target)) {
        return;
      }
      const id = topLevelIdAt(event.target, stage);
      const activeCaretId = textCaretElementIdRef.current;
      if (activeCaretId !== null) {
        if (isTextCaretTarget(event.target)) {
          return;
        }
        if (id === activeCaretId) {
          event.preventDefault();
          onPlaceTextCaretRef.current({
            clientX: event.clientX,
            clientY: event.clientY,
          });

          return;
        }
        const committedDocument = onExitTextCaretRef.current();
        if (committedDocument !== null) {
          documentRef.current = committedDocument;
          lastDocumentRef.current = committedDocument;
        }
      }
      const currentIds = selectedIdsRef.current;
      const hasSelectionModifier =
        event.ctrlKey || event.metaKey || event.shiftKey;
      const selectionPlan = planRootPointerSelection(
        documentRef.current,
        currentIds,
        id,
        hasSelectionModifier,
      );
      if (id === null) {
        if (currentIds.length > 0) {
          onSelectRef.current(selectionPlan.selectedIds);
        }

        return;
      }
      const element = documentRef.current.elements.find(
        (candidate) => candidate.id === id,
      );
      if (element === undefined) {
        return;
      }
      event.preventDefault();
      const selectionChanged =
        currentIds.length !== selectionPlan.selectedIds.length ||
        currentIds.some(
          (selectedId, index) =>
            selectedId !== selectionPlan.selectedIds[index],
        );
      if (selectionChanged) {
        onSelectRef.current(selectionPlan.selectedIds);
      }
      if (!selectionPlan.selectedIds.includes(id)) {
        return;
      }
      const activateTextCaret =
        !hasSelectionModifier &&
        !element.locked &&
        isEditableTextElement(element) &&
        selectionPlan.selectedIds.length === 1 &&
        selectionPlan.selectedIds[0] === id &&
        ((currentIds.length === 1 && currentIds[0] === id) ||
          isRenderedTextTarget(event.target))
          ? () =>
              onActivateTextCaretRef.current(id, {
                clientX: event.clientX,
                clientY: event.clientY,
              })
          : undefined;
      beginDragRef.current(
        event,
        element,
        selectionPlan.selectedIds,
        selectionPlan.collapseTo,
        selectionPlan.collapseTo === undefined
          ? activateTextCaret
          : undefined,
      );
    };

    const suppressActions = (event: MouseEvent) => {
      if (event.button !== 0 || isTextCaretTarget(event.target)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
    };

    const onDoubleClick = (event: MouseEvent) => {
      if (isTextCaretTarget(event.target)) {
        return;
      }
      const id = topLevelIdAt(event.target, stage);
      if (id === null) {
        return;
      }
      const element = documentRef.current.elements.find(
        (candidate) => candidate.id === id,
      );
      if (
        element === undefined ||
        !isEditableTextElement(element) ||
        element.locked
      ) {
        return;
      }
      onActivateTextCaretRef.current(id, {
        clientX: event.clientX,
        clientY: event.clientY,
      });
    };

    stage.addEventListener('pointerdown', onPointerDown);
    stage.addEventListener('click', suppressActions, true);
    stage.addEventListener('dblclick', onDoubleClick);

    return () => {
      stage.removeEventListener('pointerdown', onPointerDown);
      stage.removeEventListener('click', suppressActions, true);
      stage.removeEventListener('dblclick', onDoubleClick);
    };
  }, [stageRef]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        textCaretElementIdRef.current !== null ||
        isEnterOwnedByTarget(event) ||
        isKeyOwnedByTarget(event.target)
      ) {
        return;
      }
      if ((event.metaKey || event.ctrlKey) && !event.altKey) {
        const key = event.key.toLowerCase();
        if (key === 'z') {
          event.preventDefault();
          onHistoryRef.current(event.shiftKey ? 'redo' : 'undo');

          return;
        }
        if (key === 'y') {
          event.preventDefault();
          onHistoryRef.current('redo');

          return;
        }
      }
      if (event.key === 'Escape') {
        if (selectedIdsRef.current.length > 0) {
          onSelectRef.current([]);
        }

        return;
      }
      if (
        onForwardKeyRef.current(event) &&
        shouldSuppressForwardedDefault(event)
      ) {
        event.preventDefault();
      }
    };
    window.addEventListener('keydown', onKeyDown);

    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => () => endGesture(), []);

  useEffect(() => {
    if (lastDocumentRef.current === document) {
      return;
    }
    lastDocumentRef.current = document;
    endGesture();
  });

  const selectedElements = document.elements.filter((element) =>
    selectedIds.includes(element.id),
  );
  const resizeTarget =
    selectedElements.length === 1 &&
    selectedElements[0] !== undefined &&
    !selectedElements[0].locked &&
    selectedElements[0].type !== 'group' &&
    selectedElements[0].type !== 'line' &&
    !selectedElements[0].rotationDeg
      ? selectedElements[0]
      : null;
  const outlineWidth = Math.max(1.5 / (scale || 1), 1);
  const handleSize = 11 / (scale || 1);

  return (
    <div
      ref={overlayRef}
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 1000000,
      }}
    >
      {selectedElements.map((element) => (
        <div
          key={element.id}
          data-sdm-selection-id={element.id}
          style={{
            position: 'absolute',
            left: element.frame.x,
            top: element.frame.y,
            width: element.frame.width,
            height: element.frame.height,
            transform: element.rotationDeg
              ? `rotate(${element.rotationDeg}deg)`
              : undefined,
            transformOrigin: 'center center',
            border: `${outlineWidth}px solid #2563eb`,
            boxSizing: 'border-box',
            pointerEvents: 'none',
          }}
        >
          {resizeTarget === element
            ? HANDLES.map((handle) => (
                <div
                  key={handle}
                  data-sdm-handle={handle}
                  onPointerDown={(handleEvent) =>
                    beginResize(handleEvent, element, handle)
                  }
                  style={{
                    position: 'absolute',
                    left: HANDLE_POS[handle].left,
                    top: HANDLE_POS[handle].top,
                    width: handleSize,
                    height: handleSize,
                    marginLeft: -handleSize / 2,
                    marginTop: -handleSize / 2,
                    background: '#ffffff',
                    border: `${outlineWidth}px solid #2563eb`,
                    borderRadius: 2 / (scale || 1),
                    cursor: HANDLE_CURSORS[handle],
                    pointerEvents: 'auto',
                  }}
                />
              ))
            : null}
        </div>
      ))}
    </div>
  );
}
