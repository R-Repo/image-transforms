// headless-gl ships no types. It returns a WebGL1 context with a destroy() helper.
declare module 'gl' {
  interface StackGLContext extends WebGLRenderingContext {
    destroy(): void;
  }
  const createContext: (
    width: number,
    height: number,
    options?: WebGLContextAttributes
  ) => StackGLContext;
  export default createContext;
}
