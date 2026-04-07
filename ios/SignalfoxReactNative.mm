#import "SignalfoxReactNative.h"
#import <objc/message.h>
#import <sys/sysctl.h>
#import <UIKit/UIKit.h>

static NSString *SignalfoxHardwareMachineString(void) {
  size_t size = 0;
  if (sysctlbyname("hw.machine", NULL, &size, NULL, 0) != 0 || size == 0) {
    return nil;
  }
  char *buf = (char *)malloc(size);
  if (buf == NULL) {
    return nil;
  }
  if (sysctlbyname("hw.machine", buf, &size, NULL, 0) != 0) {
    free(buf);
    return nil;
  }
  NSString *machine = [NSString stringWithUTF8String:buf];
  free(buf);
  return machine.length > 0 ? machine : nil;
}

static NSString *const kSignalfoxAnonymousIdKey = @"signalfox_anonymous_id";

@implementation SignalfoxReactNative
- (NSNumber *)multiply:(double)a b:(double)b {
    NSNumber *result = @(a * b);

    return result;
}

- (void)getAppVersion:(RCTPromiseResolveBlock)resolve
              reject:(RCTPromiseRejectBlock)reject
{
  NSString *appVersion = [[[NSBundle mainBundle] infoDictionary]
    objectForKey:@"CFBundleShortVersionString"];
  if (appVersion == nil || appVersion.length == 0) {
    appVersion = [[[NSBundle mainBundle] infoDictionary]
      objectForKey:@"CFBundleVersion"];
  }
  resolve(appVersion ?: @"");
}

- (void)getAnonymousId:(RCTPromiseResolveBlock)resolve
               reject:(RCTPromiseRejectBlock)reject
{
  NSUserDefaults *defaults = [NSUserDefaults standardUserDefaults];
  NSString *anonymousId = [defaults stringForKey:kSignalfoxAnonymousIdKey];
  if (anonymousId == nil || anonymousId.length == 0) {
    anonymousId = [[NSUUID UUID] UUIDString];
    [defaults setObject:anonymousId forKey:kSignalfoxAnonymousIdKey];
    [defaults synchronize];
  }
  resolve(anonymousId);
}

- (void)getDeviceModel:(RCTPromiseResolveBlock)resolve
                reject:(RCTPromiseRejectBlock)reject
{
  // hw.machine → identificador Apple (p. ej. iPhone16,1), no el genérico "iPhone" de UIDevice.model.
  NSString *machine = SignalfoxHardwareMachineString();
  resolve(machine ?: ([UIDevice currentDevice].model ?: @""));
}

- (void)getOsVersion:(RCTPromiseResolveBlock)resolve
             reject:(RCTPromiseRejectBlock)reject
{
  NSString *version = [UIDevice currentDevice].systemVersion;
  resolve(version ?: @"");
}

// MARK: - Native purchase analytics bridge

- (void)startNativePurchaseAnalytics:(RCTPromiseResolveBlock)resolve
                               reject:(RCTPromiseRejectBlock)reject
{
  @try {
    NSLog(@"[SignalfoxPurchaseAnalyticsBridge][iOS-mm] startNativePurchaseAnalytics called");
    Class trackerClass = NSClassFromString(@"SignalfoxPurchaseAnalyticsTracker");
    if (!trackerClass) {
      NSLog(@"[SignalfoxPurchaseAnalyticsBridge][iOS-mm] SignalfoxPurchaseAnalyticsTracker not found");
      reject(@"START_NATIVE_PURCHASE_ANALYTICS_ERROR", @"SignalfoxPurchaseAnalyticsTracker not found", nil);
      return;
    }

    id tracker = ((id (*)(id, SEL))objc_msgSend)(trackerClass, @selector(shared));
    if (!tracker) {
      NSLog(@"[SignalfoxPurchaseAnalyticsBridge][iOS-mm] SignalfoxPurchaseAnalyticsTracker.shared is nil");
      reject(@"START_NATIVE_PURCHASE_ANALYTICS_ERROR", @"SignalfoxPurchaseAnalyticsTracker.shared is nil", nil);
      return;
    }

    ((void (*)(id, SEL))objc_msgSend)(tracker, @selector(startNativePurchaseAnalytics));
    resolve(nil);
  } @catch (NSException *exception) {
    NSLog(@"[SignalfoxPurchaseAnalyticsBridge][iOS-mm] startNativePurchaseAnalytics exception=%@", exception.reason);
    reject(@"START_NATIVE_PURCHASE_ANALYTICS_ERROR", exception.reason, nil);
  }
}

- (void)stopNativePurchaseAnalytics:(RCTPromiseResolveBlock)resolve
                              reject:(RCTPromiseRejectBlock)reject
{
  @try {
    NSLog(@"[SignalfoxPurchaseAnalyticsBridge][iOS-mm] stopNativePurchaseAnalytics called");
    Class trackerClass = NSClassFromString(@"SignalfoxPurchaseAnalyticsTracker");
    if (!trackerClass) {
      NSLog(@"[SignalfoxPurchaseAnalyticsBridge][iOS-mm] SignalfoxPurchaseAnalyticsTracker not found");
      reject(@"STOP_NATIVE_PURCHASE_ANALYTICS_ERROR", @"SignalfoxPurchaseAnalyticsTracker not found", nil);
      return;
    }

    id tracker = ((id (*)(id, SEL))objc_msgSend)(trackerClass, @selector(shared));
    if (!tracker) {
      NSLog(@"[SignalfoxPurchaseAnalyticsBridge][iOS-mm] SignalfoxPurchaseAnalyticsTracker.shared is nil");
      reject(@"STOP_NATIVE_PURCHASE_ANALYTICS_ERROR", @"SignalfoxPurchaseAnalyticsTracker.shared is nil", nil);
      return;
    }

    ((void (*)(id, SEL))objc_msgSend)(tracker, @selector(stopNativePurchaseAnalytics));
    resolve(nil);
  } @catch (NSException *exception) {
    NSLog(@"[SignalfoxPurchaseAnalyticsBridge][iOS-mm] stopNativePurchaseAnalytics exception=%@", exception.reason);
    reject(@"STOP_NATIVE_PURCHASE_ANALYTICS_ERROR", exception.reason, nil);
  }
}

- (void)reconcileNativePurchases:(RCTPromiseResolveBlock)resolve
                            reject:(RCTPromiseRejectBlock)reject
{
  @try {
    NSLog(@"[SignalfoxPurchaseAnalyticsBridge][iOS-mm] reconcileNativePurchases called");
    Class trackerClass = NSClassFromString(@"SignalfoxPurchaseAnalyticsTracker");
    if (!trackerClass) {
      NSLog(@"[SignalfoxPurchaseAnalyticsBridge][iOS-mm] SignalfoxPurchaseAnalyticsTracker not found");
      reject(@"RECONCILE_NATIVE_PURCHASES_ERROR", @"SignalfoxPurchaseAnalyticsTracker not found", nil);
      return;
    }

    id tracker = ((id (*)(id, SEL))objc_msgSend)(trackerClass, @selector(shared));
    if (!tracker) {
      NSLog(@"[SignalfoxPurchaseAnalyticsBridge][iOS-mm] SignalfoxPurchaseAnalyticsTracker.shared is nil");
      reject(@"RECONCILE_NATIVE_PURCHASES_ERROR", @"SignalfoxPurchaseAnalyticsTracker.shared is nil", nil);
      return;
    }

    // Llamada a: reconcileNativePurchases(_ resolve, reject)
    SEL reconcileSel = @selector(reconcileNativePurchases:reject:);
    ((void (*)(id, SEL, id, id))objc_msgSend)(
      tracker,
      reconcileSel,
      (id)resolve,
      (id)reject
    );
  } @catch (NSException *exception) {
    NSLog(@"[SignalfoxPurchaseAnalyticsBridge][iOS-mm] reconcileNativePurchases exception=%@", exception.reason);
    reject(@"RECONCILE_NATIVE_PURCHASES_ERROR", exception.reason, nil);
  }
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
    return std::make_shared<facebook::react::NativeSignalfoxReactNativeSpecJSI>(params);
}

+ (NSString *)moduleName
{
  return @"SignalfoxReactNative";
}

@end
