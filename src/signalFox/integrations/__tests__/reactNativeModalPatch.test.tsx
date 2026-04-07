import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { getActiveModalId, resetModalStack } from '../../core/modalStack';
import {
  applyModalPatch,
  reactNativeModalPatchIntegration,
} from '../reactNativeModalPatch';

jest.mock('react-native', () => {
  const React = require('react');
  return {
    Modal: jest.fn((props: Record<string, unknown>) =>
      React.createElement('mock-modal', props)
    ),
  };
});

type TrackableCore = {
  trackEvent: jest.Mock;
};

function getRenderedModalNode(
  tree: ReactTestRenderer,
  signalFoxId: string
): { props: { onShow?: () => void } } {
  return tree.root
    .findAllByProps({ signalFoxId })
    .find((node) => typeof node.props.onShow === 'function') as {
    props: { onShow?: () => void };
  };
}

function setupPatchedModal() {
  const reactNative = require('react-native') as {
    Modal: jest.Mock;
    [key: symbol]: unknown;
  };
  const patchMarker = Symbol.for('signalFox.rnModalPatchApplied');

  delete reactNative[patchMarker];
  Object.defineProperty(reactNative, 'Modal', {
    configurable: true,
    enumerable: true,
    value: jest.fn((props: Record<string, unknown>) =>
      React.createElement('mock-modal', props)
    ),
  });
  resetModalStack();

  const core: TrackableCore = {
    trackEvent: jest.fn(),
  };
  const cleanup = reactNativeModalPatchIntegration().setup(core as any);
  applyModalPatch();

  return {
    Modal: reactNative.Modal as React.ComponentType<any>,
    cleanup,
    trackEvent: core.trackEvent,
  };
}

describe('reactNativeModalPatch', () => {
  afterEach(() => {
    resetModalStack();
  });

  it('emite modal_open al montar con visible=true (no solo onShow); onShow no duplica', () => {
    const { Modal, cleanup, trackEvent } = setupPatchedModal();
    let tree!: ReactTestRenderer;

    act(() => {
      tree = create(<Modal visible signalFoxId="rating-modal" />);
    });

    expect(trackEvent).toHaveBeenCalledTimes(1);
    expect(trackEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'modal_open',
        signalFoxId: 'rating-modal',
      })
    );
    expect(getActiveModalId()).toBe('rating-modal');

    act(() => {
      getRenderedModalNode(tree, 'rating-modal').props.onShow?.();
    });

    expect(trackEvent).toHaveBeenCalledTimes(1);

    cleanup();
  });

  it('no emite eventos si el modal nunca estuvo visible', () => {
    const { Modal, cleanup, trackEvent } = setupPatchedModal();
    let tree!: ReactTestRenderer;

    act(() => {
      tree = create(<Modal visible={false} signalFoxId="ghost-modal" />);
    });

    act(() => {
      tree.update(<Modal visible={false} signalFoxId="ghost-modal" />);
    });

    expect(trackEvent).not.toHaveBeenCalled();
    expect(getActiveModalId()).toBeNull();

    cleanup();
  });

  it('emite modal_open al pasar visible a true sin depender de onShow', () => {
    const { Modal, cleanup, trackEvent } = setupPatchedModal();
    let tree!: ReactTestRenderer;

    act(() => {
      tree = create(<Modal visible={false} signalFoxId="slide-modal" />);
    });

    expect(trackEvent).not.toHaveBeenCalled();

    act(() => {
      tree.update(<Modal visible signalFoxId="slide-modal" />);
    });

    expect(trackEvent).toHaveBeenCalledTimes(1);
    expect(trackEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'modal_open',
        signalFoxId: 'slide-modal',
      })
    );
    expect(getActiveModalId()).toBe('slide-modal');

    cleanup();
  });

  it('emite modal_close y limpia el stack tras ocultar el modal', () => {
    const { Modal, cleanup, trackEvent } = setupPatchedModal();
    let tree!: ReactTestRenderer;

    act(() => {
      tree = create(<Modal visible signalFoxId="result-modal" />);
    });

    act(() => {
      tree.update(<Modal visible={false} signalFoxId="result-modal" />);
    });

    expect(trackEvent).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        type: 'modal_open',
        signalFoxId: 'result-modal',
      })
    );
    expect(trackEvent).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        type: 'modal_close',
        signalFoxId: 'result-modal',
      })
    );
    expect(getActiveModalId()).toBeNull();

    cleanup();
  });

  it('envia signalFoxDisplayName cuando el modal lo define', () => {
    const { Modal, cleanup, trackEvent } = setupPatchedModal();
    let tree!: ReactTestRenderer;

    act(() => {
      tree = create(
        <Modal
          visible
          signalFoxId="paywall-modal"
          signalFoxDisplayName="Paywall principal"
        />
      );
    });

    expect(trackEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'modal_open',
        signalFoxId: 'paywall-modal',
        signalFoxDisplayName: 'Paywall principal',
      })
    );

    act(() => {
      getRenderedModalNode(tree, 'paywall-modal').props.onShow?.();
    });

    expect(trackEvent).toHaveBeenCalledTimes(1);

    cleanup();
  });
});
