import NextLink from "next/link";
import type { ComponentProps } from "react";

/**
 * App-wide Link with prefetching off by default. Every page here is dynamic, per-user and
 * data-heavy; viewport prefetching of dozens of nav/table links rendered the authenticated layout
 * for each one and starved the DB pool in production, delaying real navigations. Pages show
 * loading skeletons instead. Pass prefetch explicitly where it is worth it.
 */
export default function Link({ prefetch = false, ...props }: ComponentProps<typeof NextLink>) {
  return <NextLink prefetch={prefetch} {...props} />;
}
