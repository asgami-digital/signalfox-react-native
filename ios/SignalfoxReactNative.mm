#import "SignalfoxReactNative.h"
// Necesario para exponer clases Swift a Objective-C.
#import "SignalfoxReactNative-Swift.h"

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
    [[SignalfoxPurchaseAnalyticsTracker shared] startNativePurchaseAnalytics];
    resolve(nil);
  } @catch (NSException *exception) {
    reject(@"START_NATIVE_PURCHASE_ANALYTICS_ERROR", exception.reason, nil);
  }
}

- (void)stopNativePurchaseAnalytics:(RCTPromiseResolveBlock)resolve
                              reject:(RCTPromiseRejectBlock)reject
{
  @try {
    [[SignalfoxPurchaseAnalyticsTracker shared] stopNativePurchaseAnalytics];
    resolve(nil);
  } @catch (NSException *exception) {
    reject(@"STOP_NATIVE_PURCHASE_ANALYTICS_ERROR", exception.reason, nil);
  }
}

- (void)reconcileNativePurchases:(RCTPromiseResolveBlock)resolve
                            reject:(RCTPromiseRejectBlock)reject
{
  @try {
    [[SignalfoxPurchaseAnalyticsTracker shared] reconcileNativePurchases:resolve reject:reject];
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
