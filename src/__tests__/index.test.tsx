function mockReactNativeWithoutSignalfoxNativeModule() {
  jest.doMock('react-native', () => ({
    AppState: {
      currentState: 'active',
      addEventListener: jest.fn(() => ({ remove: jest.fn() })),
    },
    NativeModules: {},
    Platform: {
      OS: 'ios',
      Version: '17.5',
      constants: {
        Model: 'iPhone16,1',
      },
    },
    TurboModuleRegistry: {
      get: jest.fn(() => null),
    },
  }));
}

describe('legacy native module fallback', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('imports the public API without a TurboModule or legacy NativeModule', async () => {
    mockReactNativeWithoutSignalfoxNativeModule();
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    await jest.isolateModulesAsync(async () => {
      const entrypoint = await import('../index');
      const nativeModule = await import('../NativeSignalfoxReactNative');
      const runtime = await import('../signalFox/runtime');
      const integrations = await import('../signalFox/integrations');

      await expect(nativeModule.default.getAppVersion()).resolves.toBe('');
      await expect(nativeModule.default.getAnonymousId()).resolves.toMatch(
        /^signalfox-js-/
      );
      await expect(nativeModule.default.getDeviceModel()).resolves.toBe(
        'iPhone16,1'
      );
      await expect(nativeModule.default.getOsVersion()).resolves.toBe('17.5');
      await expect(
        nativeModule.default.startNativePurchaseAnalytics()
      ).resolves.toBeUndefined();
      await expect(
        nativeModule.default.endHeuristicPaywallSession()
      ).resolves.toBeNull();

      expect(runtime.SignalFox.init).toEqual(expect.any(Function));
      expect(runtime.destroy).toEqual(expect.any(Function));
      expect(runtime.trackFunnelStep).toEqual(expect.any(Function));
      expect(integrations.applyModalPatch).toBeDefined();
      expect(integrations.applyTouchablePatch).toBeDefined();
      expect(integrations.reactNavigationIntegration).toBeDefined();
      expect(integrations.reactNativeIapIntegration).toBeDefined();
      expect((entrypoint as Record<string, unknown>).trackModalShown).toEqual(
        expect.any(Function)
      );
    });
  });
});
