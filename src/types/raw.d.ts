declare module "*?raw" {
  const content: string;
  export default content;
}

declare global {
  interface Env extends Record<string, unknown> {}
}

declare module "cloudflare:workflows" {
  export interface WorkflowEntrypoint<E = Env> {
    run(event: unknown, env: E, ctx: ExecutionContext): Promise<any>;
  }
}

