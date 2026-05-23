import { describe, expect, it } from 'vitest';
import { calculateTooltipStyle, type TourBounds, type TourRect } from './tooltipPosition';

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
});
