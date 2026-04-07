import { toBackendEventDto } from '../eventMapper';
import type { AnalyticsEvent } from '../../types/events';

describe('toBackendEventDto signalFoxId', () => {
  it('maps whitespace-only signalFoxId to null before send', () => {
    const event = {
      type: 'custom',
      timestamp: 1,
      session_id: 's',
      anonymous_id: 'a',
      platform: 'ios' as const,
      custom_event_name: 'e',
      signalFoxId: '   ',
      payload: {},
    } as unknown as AnalyticsEvent;

    const dto = toBackendEventDto(event);
    expect(dto.signalFoxId).toBeNull();
    expect(dto.target_id).toBeNull();
  });

  it('maps empty target_id override to null', () => {
    const event = {
      type: 'component_press',
      timestamp: 1,
      session_id: 's',
      anonymous_id: 'a',
      platform: 'ios' as const,
      signalFoxId: '',
      target_id: '',
      target_type: 'touchable',
      payload: { source: 'react_native_touchable', rnComponent: 'Pressable' },
    } as unknown as AnalyticsEvent;

    const dto = toBackendEventDto(event);
    expect(dto.signalFoxId).toBeNull();
    expect(dto.target_id).toBeNull();
  });
});
