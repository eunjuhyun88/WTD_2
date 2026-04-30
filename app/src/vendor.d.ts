/**
 * Type stubs for browser-only runtime dependencies that are not installed as devDependencies.
 * These modules are loaded dynamically (via dynamic import inside onMount) and
 * must never be bundled at build time.
 *
 * Adding minimal declarations here prevents svelte-check / tsc errors while keeping
 * the imports untyped (any) — which is appropriate for optional wallet SDKs.
 */

// DogeOS wallet SDK — loaded at runtime from CDN / browser bundle
declare module '@dogeos/dogeos-sdk' {
  const sdk: any;
  export default sdk;
  export const WalletConnectProvider: any;
  export function useWalletConnect(): any;
  export function useAccount(): any;
}

declare module '@dogeos/dogeos-sdk/style.css' {
  const styles: any;
  export default styles;
}

// react-dom/client — present in browser via react-dom but @types/react-dom is not
// installed as a devDependency (we only need React for the wallet island).
declare module 'react-dom/client' {
  export function createRoot(container: Element | DocumentFragment): {
    render(element: any): void;
    unmount(): void;
  };
}
