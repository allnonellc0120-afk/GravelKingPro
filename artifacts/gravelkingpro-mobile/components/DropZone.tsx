import { requireOptionalNativeModule } from "expo";
import {
  DragDropContentView,
  type DropAsset,
} from "expo-drag-drop-content-view";
import React from "react";
import { Platform, View, type StyleProp, type ViewStyle } from "react-native";

/**
 * Whether interactive drag-and-drop file import is usable in the current runtime.
 *
 * - Web: the package ships a pure-DOM implementation that needs no native module.
 * - Native dev/standalone builds: the `ExpoDragDropContentView` native module is
 *   bundled, so the view manager is registered and the component renders.
 * - Expo Go: the native module is absent. Rendering `DragDropContentView` there
 *   produces React Native's "Unimplemented component" placeholder instead of the
 *   drop zone. We detect that here and fall back to a plain View so the upload
 *   buttons (Files / Photos) and the rest of the screen keep working.
 */
export const DRAG_DROP_AVAILABLE =
  Platform.OS === "web" ||
  requireOptionalNativeModule("ExpoDragDropContentView") != null;

export type { DropAsset };

interface DropZoneProps {
  style?: StyleProp<ViewStyle>;
  onDrop?: (event: { assets: DropAsset[] }) => void;
  onEnter?: () => void;
  onExit?: () => void;
  children?: React.ReactNode;
}

/**
 * Drop target that gracefully degrades to a static container when the native
 * drag-drop module is unavailable. Same prop surface as the underlying view for
 * the subset the studio screen uses.
 */
export function DropZone({
  style,
  onDrop,
  onEnter,
  onExit,
  children,
}: DropZoneProps) {
  if (DRAG_DROP_AVAILABLE) {
    return (
      <DragDropContentView
        onDrop={onDrop}
        onEnter={onEnter}
        onExit={onExit}
        style={style}
      >
        {children}
      </DragDropContentView>
    );
  }
  return <View style={style}>{children}</View>;
}
