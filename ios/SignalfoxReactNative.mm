#import "SignalfoxReactNative.h"
#import <objc/message.h>

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

// MARK: - Native purchase analytics bridge

- (void)startNativePurchaseAnalytics:(RCTPromiseResolveBlock)resolve
                               reject:(RCTPromiseRejectBlock)reject
{
  @try {
    Class trackerClass = NSClassFromString(@"SignalfoxPurchaseAnalyticsTracker");
    if (!trackerClass) {
      reject(@"START_NATIVE_PURCHASE_ANALYTICS_ERROR", @"SignalfoxPurchaseAnalyticsTracker not found", nil);
      return;
    }

    id tracker = ((id (*)(id, SEL))objc_msgSend)(trackerClass, @selector(shared));
    if (!tracker) {
      reject(@"START_NATIVE_PURCHASE_ANALYTICS_ERROR", @"SignalfoxPurchaseAnalyticsTracker.shared is nil", nil);
      return;
    }

    ((void (*)(id, SEL))objc_msgSend)(tracker, @selector(startNativePurchaseAnalytics));
    resolve(nil);
  } @catch (NSException *exception) {
    reject(@"START_NATIVE_PURCHASE_ANALYTICS_ERROR", exception.reason, nil);
  }
}

- (void)stopNativePurchaseAnalytics:(RCTPromiseResolveBlock)resolve
                              reject:(RCTPromiseRejectBlock)reject
{
  @try {
    Class trackerClass = NSClassFromString(@"SignalfoxPurchaseAnalyticsTracker");
    if (!trackerClass) {
      reject(@"STOP_NATIVE_PURCHASE_ANALYTICS_ERROR", @"SignalfoxPurchaseAnalyticsTracker not found", nil);
      return;
    }

    id tracker = ((id (*)(id, SEL))objc_msgSend)(trackerClass, @selector(shared));
    if (!tracker) {
      reject(@"STOP_NATIVE_PURCHASE_ANALYTICS_ERROR", @"SignalfoxPurchaseAnalyticsTracker.shared is nil", nil);
      return;
    }

    ((void (*)(id, SEL))objc_msgSend)(tracker, @selector(stopNativePurchaseAnalytics));
    resolve(nil);
  } @catch (NSException *exception) {
    reject(@"STOP_NATIVE_PURCHASE_ANALYTICS_ERROR", exception.reason, nil);
  }
}

- (void)reconcileNativePurchases:(RCTPromiseResolveBlock)resolve
                            reject:(RCTPromiseRejectBlock)reject
{
  @try {
    Class trackerClass = NSClassFromString(@"SignalfoxPurchaseAnalyticsTracker");
    if (!trackerClass) {
      reject(@"RECONCILE_NATIVE_PURCHASES_ERROR", @"SignalfoxPurchaseAnalyticsTracker not found", nil);
      return;
    }

    id tracker = ((id (*)(id, SEL))objc_msgSend)(trackerClass, @selector(shared));
    if (!tracker) {
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
