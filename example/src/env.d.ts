declare module '@env' {
  /** Ausente si falta la entrada en `.env` o Metro no ha recargado tras crear el archivo. */
  export const SIGNALFOX_EXAMPLE_API_KEY: string | undefined;
}
