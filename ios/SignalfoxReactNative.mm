#import "SignalfoxReactNative.h"

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
