// Ambient declaration so the sidecar typechecks even when the SDK isn't
// installed locally. The actual module is resolved at runtime via the
// dynamic `await import('@anthropic-ai/claude-agent-sdk')` in sessions.ts.
declare module '@anthropic-ai/claude-agent-sdk' {
  // The SDK's API is consumed via duck-typing in sessions.ts (we cast to
  // a narrow shape after the dynamic import). Keeping this ambient avoids
  // pinning the consumer to a specific SDK version at build time.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const query: (opts: unknown) => AsyncIterable<unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const _default: any;
  export default _default;
}
