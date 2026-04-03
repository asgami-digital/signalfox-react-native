import { isPermanentHttpSendFailure } from '../signalFoxApi';

describe('isPermanentHttpSendFailure', () => {
  it('treats typical client errors as permanent', () => {
    expect(isPermanentHttpSendFailure(400)).toBe(true);
    expect(isPermanentHttpSendFailure(401)).toBe(true);
    expect(isPermanentHttpSendFailure(403)).toBe(true);
    expect(isPermanentHttpSendFailure(404)).toBe(true);
  });

  it('allows retry for 408, 429 and 5xx', () => {
    expect(isPermanentHttpSendFailure(408)).toBe(false);
    expect(isPermanentHttpSendFailure(429)).toBe(false);
    expect(isPermanentHttpSendFailure(500)).toBe(false);
    expect(isPermanentHttpSendFailure(503)).toBe(false);
  });
});
