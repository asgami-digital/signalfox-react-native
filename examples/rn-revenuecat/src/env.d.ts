declare module '@env' {
  /** Missing if the `.env` entry is absent or Metro has not reloaded after creating the file. */
  export const SIGNALFOX_EXAMPLE_API_KEY: string | undefined;
  /** Public RevenueCat API key for the RN example project. */
  export const RN_REVENUECAT_API_KEY: string | undefined;

  export const REVENUECAT_PRODUCT_ID: string | undefined;

  export const REVENUECAT_ENTITLEMENT_ID: string | undefined;
}
