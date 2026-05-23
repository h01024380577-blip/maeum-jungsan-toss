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

export function intersectRect(rect: TourRect, bounds: TourBounds): TourRect {
  const top = Math.max(rect.top, bounds.top);
  const left = Math.max(rect.left, bounds.left);
  const right = Math.min(rect.left + rect.width, bounds.right);
  const bottom = Math.min(rect.top + rect.height, bounds.bottom);

  return {
    top,
    left,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

export function expandRectWithinBounds(rect: TourRect, padding: number, bounds: TourBounds): TourRect {
  const top = Math.max(bounds.top, rect.top - padding);
  const left = Math.max(bounds.left, rect.left - padding);
  const right = Math.min(bounds.right, rect.left + rect.width + padding);
  const bottom = Math.min(bounds.bottom, rect.top + rect.height + padding);

  return {
    top,
    left,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
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
  const minTop = bounds.top + margin;

  if (placement === 'center' || !rect) {
    const left = clamp(bounds.left + bounds.width / 2 - width / 2, minLeft, maxLeft);
    const maxTop = Math.max(minTop, bounds.bottom - centerHeight - margin);
    const top = clamp(bounds.top + bounds.height / 2 - centerHeight / 2, minTop, maxTop);
    return {
      left,
      top,
      width,
      maxHeight: Math.max(96, bounds.bottom - top - margin),
      overflowY: 'auto',
    };
  }

  const left = clamp(rect.left + rect.width / 2 - width / 2, minLeft, maxLeft);
  const placeAbove = (): CSSProperties => {
    const targetTop = clamp(rect.top, bounds.top + margin + gap, bounds.bottom - margin);
    const availableHeight = Math.max(96, targetTop - bounds.top - margin - gap);
    const maxHeight = Math.min(tooltipHeight, availableHeight, frameMaxHeight);
    const maxTop = Math.max(minTop, bounds.bottom - maxHeight - margin);
    const top = clamp(targetTop - gap - maxHeight, minTop, maxTop);

    return {
      left,
      width,
      top,
      maxHeight: Math.max(96, bounds.bottom - top - margin),
      overflowY: 'auto',
    };
  };
  const placeBelow = (): CSSProperties => {
    const top = rect.top + rect.height + gap;
    const maxTop = Math.max(minTop, bounds.bottom - tooltipHeight - margin);
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
    const availableBelow = bounds.bottom - (rect.top + rect.height + gap) - margin;
    return availableAbove >= minTooltipHeight || availableAbove >= availableBelow ? placeAbove() : placeBelow();
  }

  const availableBelow = bounds.bottom - (rect.top + rect.height + gap) - margin;
  const availableAbove = rect.top - bounds.top - margin - gap;
  return availableBelow >= minTooltipHeight || availableBelow >= availableAbove ? placeBelow() : placeAbove();
}
