import {
  computePurchaseTerminalAdjustedTimestamp,
  isPurchaseFlowTerminalEventType,
  PURCHASE_TERMINAL_TIMESTAMP_OFFSET_MS,
  shouldDelayScreenResolution,
} from '../constants';

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

describe('isPurchaseFlowTerminalEventType', () => {
  it('solo completed, cancelled y failed', () => {
    expect(isPurchaseFlowTerminalEventType('purchase_completed')).toBe(true);
    expect(isPurchaseFlowTerminalEventType('purchase_cancelled')).toBe(true);
    expect(isPurchaseFlowTerminalEventType('purchase_failed')).toBe(true);
    expect(isPurchaseFlowTerminalEventType('purchase_started')).toBe(false);
    expect(isPurchaseFlowTerminalEventType('restore_completed')).toBe(false);
  });
});

describe('computePurchaseTerminalAdjustedTimestamp', () => {
  it('resta el offset cuando hay hueco', () => {
    expect(computePurchaseTerminalAdjustedTimestamp(1000, 2000)).toBe(
      2000 - PURCHASE_TERMINAL_TIMESTAMP_OFFSET_MS
    );
  });

  it('uses the midpoint when the candidate falls on or before started', () => {
    expect(computePurchaseTerminalAdjustedTimestamp(1000, 1008)).toBe(1004);
  });
});
