import type { CSSProperties } from 'react';

export interface TourRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface TourBounds {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export type TourPlacement = 'top' | 'bottom' | 'center';

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function calculateTooltipStyle({
  rect,
  placement = 'bottom',
  measuredHeight = 0,
  bounds,
  viewportHeight,
}: {
  rect: TourRect | null;
  placement?: TourPlacement;
  measuredHeight?: number;
  bounds: TourBounds;
  viewportHeight: number;
}): CSSProperties {
  const margin = 16;
  const gap = 14;
  const minTooltipHeight = 160;
  const estimatedCenterHeight = 224;
  const estimatedTooltipHeight = 260;
  const frameMaxHeight = Math.max(96, bounds.height - margin * 2);
  const centerHeight = Math.min(
    measuredHeight > 0 ? measuredHeight : estimatedCenterHeight,
    frameMaxHeight,
  );
  const tooltipHeight = Math.min(
    Math.max(minTooltipHeight, measuredHeight > 0 ? measuredHeight : estimatedTooltipHeight),
    frameMaxHeight,
  );
  const width = Math.max(240, Math.min(316, bounds.width - margin * 2));
  const minLeft = bounds.left + margin;
  const maxLeft = Math.max(minLeft, bounds.right - width - margin);

  if (placement === 'center' || !rect) {
    const left = clamp(bounds.left + bounds.width / 2 - width / 2, minLeft, maxLeft);
    const minTop = bounds.top + margin;
    const maxTop = Math.max(minTop, bounds.bottom - centerHeight - margin);
    const top = clamp(bounds.top + bounds.height / 2 - centerHeight / 2, minTop, maxTop);
    return { left, top, width };
  }

  const left = clamp(rect.left + rect.width / 2 - width / 2, minLeft, maxLeft);
  const placeAbove = (): CSSProperties => {
    const targetTop = clamp(rect.top, bounds.top + margin + gap, bounds.bottom - margin);
    const availableHeight = Math.max(96, targetTop - bounds.top - margin - gap);
    return {
      left,
      bottom: Math.max(0, viewportHeight - targetTop + gap),
      width,
      maxHeight: Math.min(tooltipHeight, availableHeight),
      overflowY: 'auto',
    };
  };
  const placeBelow = (): CSSProperties => {
    const top = rect.top + rect.height + gap;
    const maxTop = Math.max(bounds.top + margin, bounds.bottom - tooltipHeight - margin);
    const safeTop = clamp(top, bounds.top + margin, maxTop);
    return {
      left,
      top: safeTop,
      width,
      maxHeight: Math.max(96, bounds.bottom - safeTop - margin),
      overflowY: 'auto',
    };
  };

  if (placement === 'top') {
    const availableAbove = rect.top - bounds.top - margin - gap;
    return availableAbove >= minTooltipHeight ? placeAbove() : placeBelow();
  }

  const availableBelow = bounds.bottom - (rect.top + rect.height + gap) - margin;
  return availableBelow >= minTooltipHeight ? placeBelow() : placeAbove();
}
