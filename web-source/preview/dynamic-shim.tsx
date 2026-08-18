// Stand-in for next/dynamic, aliased in vite.preview.config.ts.
//
// app/page.tsx calls next/dynamic(loader, { ssr: false, loading }) to lazily
// load SaxophoneLab. That API only exists inside the vinext/Next.js runtime
// this app is normally built with. The preview build is a plain Vite+React
// mount with no server, so this reimplements just the slice of the API this
// codebase actually uses — React.lazy plus a loading fallback — without
// touching app/page.tsx, which stays identical between the real deployable
// build and this preview.
import { lazy, Suspense, type ComponentType } from "react";

type DynamicOptions = {
  ssr?: boolean;
  loading?: () => JSX.Element;
};

export default function dynamic<P extends object>(
  loader: () => Promise<ComponentType<P>>,
  options: DynamicOptions = {},
) {
  const LazyComponent = lazy(async () => ({ default: await loader() }));
  const Fallback = options.loading ?? (() => null);
  return function DynamicWrapper(props: P) {
    return (
      <Suspense fallback={<Fallback />}>
        <LazyComponent {...props} />
      </Suspense>
    );
  };
}
