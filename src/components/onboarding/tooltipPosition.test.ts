import { describe, expect, it } from 'vitest';
import {
  calculateTooltipStyle,
  expandRectWithinBounds,
  intersectRect,
  type TourBounds,
  type TourRect,
} from './tooltipPosition';

describe('calculateTooltipStyle', () => {
  const bounds: TourBounds = {
    top: 0,
    left: 0,
    right: 430,
    bottom: 880,
    width: 430,
    height: 880,
  };

  it('uses the measured tooltip height when clamping near the bottom of the app frame', () => {
    const oversizedTarget: TourRect = {
      top: -120,
      left: 40,
      width: 350,
      height: 960,
    };

    const style = calculateTooltipStyle({
      rect: oversizedTarget,
      placement: 'top',
      measuredHeight: 328,
      bounds,
      viewportHeight: 880,
    });

    expect(style.top).toBe(536);
    expect(style.maxHeight).toBe(328);
  });

  it('clips target geometry to the visible app frame before drawing the spotlight', () => {
    const modalTarget: TourRect = {
      top: 510,
      left: -8,
      width: 446,
      height: 640,
    };

    const visibleRect = intersectRect(modalTarget, bounds);
    const spotlightRect = expandRectWithinBounds(visibleRect, 8, bounds);

    expect(visibleRect).toEqual({
      top: 510,
      left: 0,
      width: 430,
      height: 370,
    });
    expect(spotlightRect).toEqual({
      top: 502,
      left: 0,
      width: 430,
      height: 378,
    });
  });

  it('keeps the tooltip fully inside the app frame when the target is already clipped by a modal viewport', () => {
    const visibleReviewRect: TourRect = {
      top: 360,
      left: 24,
      width: 382,
      height: 520,
    };

    const style = calculateTooltipStyle({
      rect: visibleReviewRect,
      placement: 'top',
      measuredHeight: 312,
      bounds,
      viewportHeight: 900,
    });

    expect(style.top).toBeGreaterThanOrEqual(bounds.top + 16);
    expect(Number(style.top) + Number(style.maxHeight)).toBeLessThanOrEqual(bounds.bottom - 16);
  });
});
