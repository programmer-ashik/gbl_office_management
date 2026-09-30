import { useSyncExternalStore } from 'react'

/** Must match the `max-width: 960px` mobile breakpoint in index.css. */
export const MOBILE_QUERY = '(max-width: 960px)'

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}
