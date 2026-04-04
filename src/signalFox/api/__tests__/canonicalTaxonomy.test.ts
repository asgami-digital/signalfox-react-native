import { getCanonicalTriple } from '../canonicalTaxonomy';

describe('canonicalTaxonomy', () => {
  it('does not reuse the same (event_family, event_action) for different internal types', () => {
    const types = [
      'app_open',
      'app_foreground',
      'app_background',
      'session_start',
      'session_end',
      'screen_view',
      'subview_view',
      'modal_open',
      'modal_close',
      'component_press',
      'flow_step_view',
      'custom',
      'purchase_started',
      'purchase_completed',
      'purchase_failed',
      'purchase_cancelled',
      'subscription_started',
      'trial_started',
      'restore_completed',
    ] as const;

    const seen = new Map<string, string>();
    for (const t of types) {
      const triple = getCanonicalTriple(t);
      const pair = `${triple.event_family}::${triple.event_action}`;
      const existing = seen.get(pair);
      if (existing && existing !== t) {
        throw new Error(
          `Duplicate canonical pair "${pair}" for "${t}" and "${existing}"`
        );
      }
      seen.set(pair, t);
    }
  });

  it('maps restore_completed to purchase/restored (not completed)', () => {
    const t = getCanonicalTriple('restore_completed');
    expect(t.event_family).toBe('purchase');
    expect(t.event_action).toBe('restored');
  });

  it('maps subscription_started and trial_started to distinct actions', () => {
    expect(getCanonicalTriple('subscription_started').event_action).toBe(
      'subscription'
    );
    expect(getCanonicalTriple('trial_started').event_action).toBe('trial');
  });
});
