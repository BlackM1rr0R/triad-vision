// `import copy from '@/i18n/pagesXxx?lazy-copy'` (vite/lazyCopy.ts): per-language loaders for registerLazyCopy.
declare module '*?lazy-copy' {
  const loaders: import('./index').CopyLoaders;
  export default loaders;
}
