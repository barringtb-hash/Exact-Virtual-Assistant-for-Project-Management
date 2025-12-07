/**
 * Responsive Utilities for Exact Virtual Assistant
 *
 * Mobile-first responsive helpers and breakpoint utilities.
 */

// ============================================
// BREAKPOINT DEFINITIONS
// ============================================

export const breakpoints = {
  xs: 475,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
} as const;

export type Breakpoint = keyof typeof breakpoints;

// ============================================
// MEDIA QUERY HELPERS
// ============================================

/**
 * Get a min-width media query string for a breakpoint
 */
export function minWidth(bp: Breakpoint): string {
  return `(min-width: ${breakpoints[bp]}px)`;
}

/**
 * Get a max-width media query string for a breakpoint
 */
export function maxWidth(bp: Breakpoint): string {
  return `(max-width: ${breakpoints[bp] - 1}px)`;
}

/**
 * Get a media query string for a range between two breakpoints
 */
export function between(minBp: Breakpoint, maxBp: Breakpoint): string {
  return `(min-width: ${breakpoints[minBp]}px) and (max-width: ${breakpoints[maxBp] - 1}px)`;
}

// ============================================
// RESPONSIVE HOOKS
// ============================================

import { useState, useEffect, useCallback } from 'react';

/**
 * Hook to check if a breakpoint is currently active (min-width)
 */
export function useBreakpoint(bp: Breakpoint): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(minWidth(bp)).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia(minWidth(bp));

    const handleChange = (e: MediaQueryListEvent) => {
      setMatches(e.matches);
    };

    // Set initial value
    setMatches(mediaQuery.matches);

    // Add listener
    mediaQuery.addEventListener('change', handleChange);

    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, [bp]);

  return matches;
}

/**
 * Hook to get the current active breakpoint
 */
export function useCurrentBreakpoint(): Breakpoint | 'base' {
  const [current, setCurrent] = useState<Breakpoint | 'base'>('base');

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const checkBreakpoint = () => {
      const width = window.innerWidth;

      if (width >= breakpoints['2xl']) {
        setCurrent('2xl');
      } else if (width >= breakpoints.xl) {
        setCurrent('xl');
      } else if (width >= breakpoints.lg) {
        setCurrent('lg');
      } else if (width >= breakpoints.md) {
        setCurrent('md');
      } else if (width >= breakpoints.sm) {
        setCurrent('sm');
      } else if (width >= breakpoints.xs) {
        setCurrent('xs');
      } else {
        setCurrent('base');
      }
    };

    checkBreakpoint();
    window.addEventListener('resize', checkBreakpoint);

    return () => {
      window.removeEventListener('resize', checkBreakpoint);
    };
  }, []);

  return current;
}

/**
 * Hook to check if the device is mobile (below md breakpoint)
 */
export function useIsMobile(): boolean {
  return !useBreakpoint('md');
}

/**
 * Hook to check if the device is tablet (md to lg breakpoint)
 */
export function useIsTablet(): boolean {
  const isMd = useBreakpoint('md');
  const isLg = useBreakpoint('lg');
  return isMd && !isLg;
}

/**
 * Hook to check if the device is desktop (lg and above)
 */
export function useIsDesktop(): boolean {
  return useBreakpoint('lg');
}

/**
 * Hook to check if the device supports touch
 */
export function useIsTouchDevice(): boolean {
  const [isTouch, setIsTouch] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const checkTouch = () => {
      setIsTouch(
        'ontouchstart' in window ||
        navigator.maxTouchPoints > 0 ||
        window.matchMedia('(hover: none)').matches
      );
    };

    checkTouch();
  }, []);

  return isTouch;
}

/**
 * Hook to check if the user prefers reduced motion
 */
export function usePrefersReducedMotion(): boolean {
  const [prefersReduced, setPrefersReduced] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

    const handleChange = (e: MediaQueryListEvent) => {
      setPrefersReduced(e.matches);
    };

    setPrefersReduced(mediaQuery.matches);
    mediaQuery.addEventListener('change', handleChange);

    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  return prefersReduced;
}

// ============================================
// RESPONSIVE VALUE HELPERS
// ============================================

type ResponsiveValue<T> = T | Partial<Record<Breakpoint | 'base', T>>;

/**
 * Get the value for the current breakpoint from a responsive value object
 */
export function useResponsiveValue<T>(value: ResponsiveValue<T>, defaultValue: T): T {
  const currentBreakpoint = useCurrentBreakpoint();

  if (typeof value !== 'object' || value === null) {
    return value as T;
  }

  const responsiveValue = value as Partial<Record<Breakpoint | 'base', T>>;

  // Check breakpoints in order from current down to base
  const breakpointOrder: (Breakpoint | 'base')[] = ['2xl', 'xl', 'lg', 'md', 'sm', 'xs', 'base'];
  const currentIndex = breakpointOrder.indexOf(currentBreakpoint);

  for (let i = currentIndex; i < breakpointOrder.length; i++) {
    const bp = breakpointOrder[i];
    if (bp in responsiveValue) {
      return responsiveValue[bp] as T;
    }
  }

  return defaultValue;
}

// ============================================
// CLASS NAME UTILITIES
// ============================================

/**
 * Conditionally join class names
 */
export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

/**
 * Create responsive class string from a map of breakpoint to classes
 */
export function responsive(
  classes: Partial<Record<Breakpoint | 'base', string>>
): string {
  const result: string[] = [];

  if (classes.base) {
    result.push(classes.base);
  }

  const breakpointPrefixes: Record<Breakpoint, string> = {
    xs: 'xs:',
    sm: 'sm:',
    md: 'md:',
    lg: 'lg:',
    xl: 'xl:',
    '2xl': '2xl:',
  };

  for (const [bp, prefix] of Object.entries(breakpointPrefixes)) {
    const value = classes[bp as Breakpoint];
    if (value) {
      result.push(
        value
          .split(' ')
          .map((cls) => `${prefix}${cls}`)
          .join(' ')
      );
    }
  }

  return result.join(' ');
}

// ============================================
// CONTAINER UTILITIES
// ============================================

/**
 * Standard container padding classes for different breakpoints
 */
export const containerPadding = 'px-4 sm:px-6 lg:px-8';

/**
 * Standard container max-width with centering
 */
export const containerWidth = 'mx-auto max-w-7xl';

/**
 * Full container classes (padding + max-width + centering)
 */
export const container = `${containerWidth} ${containerPadding}`;

/**
 * Narrow container for forms and focused content
 */
export const containerNarrow = 'mx-auto max-w-2xl px-4 sm:px-6';

/**
 * Wide container for full-width layouts
 */
export const containerWide = 'mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8';

// ============================================
// GRID UTILITIES
// ============================================

/**
 * Standard responsive grid classes
 */
export const gridCols = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
  12: 'grid-cols-1 lg:grid-cols-12',
} as const;

/**
 * Standard responsive gap classes
 */
export const gridGap = {
  sm: 'gap-4',
  md: 'gap-4 md:gap-6',
  lg: 'gap-4 md:gap-6 lg:gap-8',
} as const;
