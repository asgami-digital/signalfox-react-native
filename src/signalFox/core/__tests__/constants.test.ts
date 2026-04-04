import { shouldDelayScreenResolution } from '../constants';

describe('shouldDelayScreenResolution', () => {
  it('only screen_view is immediate', () => {
    expect(shouldDelayScreenResolution('screen_view')).toBe(false);
    expect(shouldDelayScreenResolution('purchase_started')).toBe(true);
    expect(shouldDelayScreenResolution('purchase_completed')).toBe(true);
    expect(shouldDelayScreenResolution('restore_completed')).toBe(true);
  });

  it('delays UI-related events', () => {
    expect(shouldDelayScreenResolution('component_press')).toBe(true);
    expect(shouldDelayScreenResolution('modal_open')).toBe(true);
    expect(shouldDelayScreenResolution('custom')).toBe(true);
  });
});
