import {
  getModalStackSnapshot,
  modalStackPush,
  resetModalStack,
} from '../../core/modalStack';
import {
  notifyModalOpened,
  notifyModalClosed,
  notifyPurchaseStarted,
  registerPurchaseAnalyticsCore,
  trackModalShown,
  unregisterPurchaseAnalyticsCore,
} from '../purchaseAnalyticsBridge';

describe('trackModalShown', () => {
  const trackEvent = jest.fn();

  beforeEach(() => {
    resetModalStack();
    trackEvent.mockReset();
    registerPurchaseAnalyticsCore({
      trackEvent,
    } as any);
  });

  afterEach(() => {
    unregisterPurchaseAnalyticsCore();
    resetModalStack();
  });

  it('emite modal_open con el mismo payload base que un modal nativo', () => {
    modalStackPush({
      id: 'navigation-modal',
      stackKey: 'navigation-modal-key',
      source: 'react_navigation',
    });

    trackModalShown({
      signalFoxNodeId: 'export-sheet',
      signalFoxNodeDisplayName: 'Export Sheet',
      visible: true,
    });

    expect(trackEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'modal_open',
        signalFoxNodeId: 'export-sheet',
        signalFoxNodeDisplayName: 'Export Sheet',
        target_type: 'modal',
        payload: expect.objectContaining({
          modalName: 'export-sheet',
          source: 'react_native_modal',
          kind: 'component_modal',
          parent_modal: 'navigation-modal',
        }),
      })
    );
    expect(getModalStackSnapshot()).toEqual([
      expect.objectContaining({
        id: 'navigation-modal',
        source: 'react_navigation',
      }),
      expect.objectContaining({
        id: 'export-sheet',
        source: 'react_native_modal',
      }),
    ]);
  });

  it('emite modal_close y limpia el stack cuando el modal existe', () => {
    trackModalShown({
      signalFoxNodeId: 'export-sheet',
      signalFoxNodeDisplayName: 'Export Sheet',
      visible: true,
    });
    trackEvent.mockClear();

    trackModalShown({
      signalFoxNodeId: 'export-sheet',
      signalFoxNodeDisplayName: 'Export Sheet',
      visible: false,
    });

    expect(trackEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'modal_close',
        signalFoxNodeId: 'export-sheet',
        signalFoxNodeDisplayName: 'Export Sheet',
        payload: expect.objectContaining({
          modalName: 'export-sheet',
          parent_modal: null,
        }),
      })
    );
    expect(getModalStackSnapshot()).toEqual([]);
  });

  it('no duplica modal_open si trackModalShown se llama dos veces con visible=true para el mismo modal', () => {
    trackModalShown({
      signalFoxNodeId: 'export-sheet',
      signalFoxNodeDisplayName: 'Export Sheet',
      visible: true,
    });

    trackModalShown({
      signalFoxNodeId: 'export-sheet',
      signalFoxNodeDisplayName: 'Export Sheet',
      visible: true,
    });

    expect(trackEvent).toHaveBeenCalledTimes(1);
    expect(getModalStackSnapshot()).toEqual([
      expect.objectContaining({
        id: 'export-sheet',
        source: 'react_native_modal',
      }),
    ]);
  });

  it('no hace nada al cerrar manualmente un modal que no esta en el stack', () => {
    modalStackPush({
      id: 'another-modal',
      source: 'react_navigation',
    });

    trackModalShown({
      signalFoxNodeId: 'export-sheet',
      signalFoxNodeDisplayName: 'Export Sheet',
      visible: false,
    });

    expect(trackEvent).not.toHaveBeenCalled();
    expect(getModalStackSnapshot()).toEqual([
      expect.objectContaining({
        id: 'another-modal',
        source: 'react_navigation',
      }),
    ]);
  });

  it('notifyModalOpened emite el mismo payload base que la integracion de modales', () => {
    modalStackPush({
      id: 'navigation-modal',
      stackKey: 'navigation-modal-key',
      source: 'react_navigation',
    });

    notifyModalOpened('export-sheet');

    expect(trackEvent).toHaveBeenCalledTimes(1);
    expect(trackEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'modal_open',
        signalFoxNodeId: 'export-sheet',
        target_type: 'modal',
        payload: {
          modalName: 'export-sheet',
          source: 'react_native_modal',
          kind: 'component_modal',
          parent_modal: 'navigation-modal',
        },
      })
    );
    expect(getModalStackSnapshot()).toEqual([
      expect.objectContaining({
        id: 'navigation-modal',
        source: 'react_navigation',
      }),
      expect.objectContaining({
        id: 'export-sheet',
        source: 'react_native_modal',
      }),
    ]);
  });

  it('notifyModalClosed emite el mismo payload base que la integracion de modales', () => {
    notifyModalOpened('export-sheet');
    trackEvent.mockClear();

    notifyModalClosed('export-sheet');

    expect(trackEvent).toHaveBeenCalledTimes(1);
    expect(trackEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'modal_close',
        signalFoxNodeId: 'export-sheet',
        target_type: 'modal',
        payload: {
          modalName: 'export-sheet',
          source: 'react_native_modal',
          kind: 'component_modal',
          parent_modal: null,
        },
      })
    );
    expect(getModalStackSnapshot()).toEqual([]);
  });

  it('acepta solo signalFoxNodeId', () => {
    trackModalShown({
      signalFoxNodeId: 'export-sheet',
      visible: true,
    });

    expect(trackEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'modal_open',
        signalFoxNodeId: 'export-sheet',
      })
    );
  });
});

describe('notifyPurchaseStarted', () => {
  const trackEvent = jest.fn();

  beforeEach(() => {
    trackEvent.mockReset();
    registerPurchaseAnalyticsCore({
      trackEvent,
    } as any);
  });

  afterEach(() => {
    unregisterPurchaseAnalyticsCore();
  });

  it('permite emitir purchase_started sin payload y usa defaults del sdk', () => {
    notifyPurchaseStarted();

    expect(trackEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'purchase_started',
        payload: expect.objectContaining({
          family: 'purchase',
          analyticsDisplayName: 'Purchase started',
          sourcePlatform: 'ios',
          store: 'app_store',
          productType: 'unknown',
          environment: 'unknown',
        }),
      })
    );
  });
});
