declare const __APP_BUILD__: string;

declare module "virtual:pwa-register" {
  interface RegisterSWOptions {
    immediate?: boolean;
    onRegisteredSW?: (
      swUrl: string,
      registration: ServiceWorkerRegistration | undefined,
    ) => void;
  }

  export function registerSW(
    options?: RegisterSWOptions,
  ): (reloadPage?: boolean) => Promise<void>;
}
