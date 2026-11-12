import { describe, expect, it } from 'vitest';
import { clampSidebar, SIDEBAR_DEFAULTS, SIDEBAR_LIMITS, SIDEBAR_MAX_SHARE, sanitizeSidebarWidths } from './sidebar';

describe('clampSidebar', () => {
  it('keeps a width inside the limits', () => {
    expect(clampSidebar('left', 300, 1920)).toBe(300);
    expect(clampSidebar('left', 10, 1920)).toBe(SIDEBAR_LIMITS.left.min);
    expect(clampSidebar('left', 5000, 1920)).toBe(SIDEBAR_LIMITS.left.max);
    expect(clampSidebar('right', 10, 1920)).toBe(SIDEBAR_LIMITS.right.min);
    expect(clampSidebar('right', 5000, 1920)).toBe(SIDEBAR_LIMITS.right.max);
  });

  it('never takes more than its share of a small window', () => {
    expect(clampSidebar('right', 500, 1000)).toBe(Math.floor(1000 * SIDEBAR_MAX_SHARE));
    expect(clampSidebar('left', 500, 1000)).toBe(Math.floor(1000 * SIDEBAR_MAX_SHARE));
  });

  it('never goes under the minimum, even in a tiny window', () => {
    expect(clampSidebar('left', 300, 400)).toBe(SIDEBAR_LIMITS.left.min);
    expect(clampSidebar('right', 300, 400)).toBe(SIDEBAR_LIMITS.right.min);
  });

  it('rounds to whole pixels', () => {
    expect(clampSidebar('left', 300.6, 1920)).toBe(301);
  });
});

describe('sanitizeSidebarWidths', () => {
  it('falls back to the defaults', () => {
    expect(sanitizeSidebarWidths(null)).toEqual(SIDEBAR_DEFAULTS);
    expect(sanitizeSidebarWidths('wide')).toEqual(SIDEBAR_DEFAULTS);
    expect(sanitizeSidebarWidths({})).toEqual(SIDEBAR_DEFAULTS);
    expect(sanitizeSidebarWidths({ left: '300', right: NaN })).toEqual(SIDEBAR_DEFAULTS);
  });

  it('keeps valid widths and clamps the rest', () => {
    expect(sanitizeSidebarWidths({ left: 320, right: 400 })).toEqual({ left: 320, right: 400 });
    expect(sanitizeSidebarWidths({ left: 1, right: 9999 })).toEqual({ left: SIDEBAR_LIMITS.left.min, right: SIDEBAR_LIMITS.right.max });
  });

  it('takes one side from storage and defaults the other', () => {
    expect(sanitizeSidebarWidths({ right: 350 })).toEqual({ left: SIDEBAR_DEFAULTS.left, right: 350 });
  });
});
