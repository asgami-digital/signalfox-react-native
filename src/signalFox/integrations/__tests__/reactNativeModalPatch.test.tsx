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

  it('emite modal_open solo cuando el modal realmente hace onShow', () => {
    const { Modal, cleanup, trackEvent } = setupPatchedModal();
    let tree!: ReactTestRenderer;

    act(() => {
      tree = create(<Modal visible signalFoxId="rating-modal" />);
    });

    expect(trackEvent).not.toHaveBeenCalled();
    expect(getActiveModalId()).toBeNull();

    act(() => {
      getRenderedModalNode(tree, 'rating-modal').props.onShow?.();
    });

    expect(trackEvent).toHaveBeenCalledTimes(1);
    expect(trackEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'modal_open',
        target_id: 'rating-modal',
      })
    );
    expect(getActiveModalId()).toBe('rating-modal');

    cleanup();
  });

  it('no emite modal_close si visible pasa a false sin haberse mostrado', () => {
    const { Modal, cleanup, trackEvent } = setupPatchedModal();
    let tree!: ReactTestRenderer;

    act(() => {
      tree = create(<Modal visible signalFoxId="ghost-modal" />);
    });

    act(() => {
      tree.update(<Modal visible={false} signalFoxId="ghost-modal" />);
    });

    expect(trackEvent).not.toHaveBeenCalled();
    expect(getActiveModalId()).toBeNull();

    cleanup();
  });

  it('emite modal_close y limpia el stack tras un modal que si se mostro', () => {
    const { Modal, cleanup, trackEvent } = setupPatchedModal();
    let tree!: ReactTestRenderer;

    act(() => {
      tree = create(<Modal visible signalFoxId="result-modal" />);
    });

    act(() => {
      getRenderedModalNode(tree, 'result-modal').props.onShow?.();
    });

    act(() => {
      tree.update(<Modal visible={false} signalFoxId="result-modal" />);
    });

    expect(trackEvent).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        type: 'modal_open',
        target_id: 'result-modal',
      })
    );
    expect(trackEvent).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        type: 'modal_close',
        target_id: 'result-modal',
      })
    );
    expect(getActiveModalId()).toBeNull();

    cleanup();
  });
});
