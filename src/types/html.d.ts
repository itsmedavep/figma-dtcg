// src/types/html.d.ts
// Minimal module declaration so esbuild can inline html assets in TypeScript files.

declare module "*.html" {
    const html: string;
    export default html;
}
