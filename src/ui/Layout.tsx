import React, { forwardRef, useState, useCallback } from 'react';
import { cn, useIsMobile, useIsDesktop } from './responsive';

// ============================================
// APP SHELL COMPONENT
// ============================================

export interface AppShellProps {
  children: React.ReactNode;
  /** Header content */
  header?: React.ReactNode;
  /** Footer content */
  footer?: React.ReactNode;
  /** Sidebar content (desktop only) */
  sidebar?: React.ReactNode;
  /** Width of the sidebar */
  sidebarWidth?: string;
  /** Whether sidebar is collapsible */
  sidebarCollapsible?: boolean;
  /** Whether sidebar starts collapsed */
  sidebarCollapsed?: boolean;
  className?: string;
}

export function AppShell({
  children,
  header,
  footer,
  sidebar,
  sidebarWidth = '280px',
  sidebarCollapsible = false,
  sidebarCollapsed: initialCollapsed = false,
  className,
}: AppShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(initialCollapsed);
  const isDesktop = useIsDesktop();

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => !prev);
  }, []);

  const showSidebar = sidebar && isDesktop;
  const effectiveSidebarWidth = sidebarCollapsed ? '64px' : sidebarWidth;

  return (
    <div
      className={cn(
        'flex min-h-screen flex-col bg-surface-50 dark:bg-surface-900',
        className
      )}
    >
      {/* Header */}
      {header && (
        <header className="sticky top-0 z-sticky flex-shrink-0">
          {header}
        </header>
      )}

      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        {showSidebar && (
          <aside
            className={cn(
              'hidden lg:flex flex-col flex-shrink-0',
              'bg-surface-0 dark:bg-surface-800',
              'border-r border-surface-200 dark:border-surface-700',
              'transition-all duration-300 ease-in-out'
            )}
            style={{ width: effectiveSidebarWidth }}
          >
            {sidebarCollapsible && (
              <button
                onClick={toggleSidebar}
                className={cn(
                  'absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2',
                  'z-10 h-6 w-6 rounded-full',
                  'bg-surface-0 dark:bg-surface-700',
                  'border border-surface-200 dark:border-surface-600',
                  'shadow-sm hover:shadow-md',
                  'flex items-center justify-center',
                  'transition-all duration-150'
                )}
                aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              >
                <svg
                  className={cn(
                    'h-3 w-3 text-surface-500 transition-transform duration-200',
                    sidebarCollapsed && 'rotate-180'
                  )}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </button>
            )}
            <div className="flex-1 overflow-y-auto">
              {sidebar}
            </div>
          </aside>
        )}

        {/* Main content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>

      {/* Footer */}
      {footer && (
        <footer className="flex-shrink-0">
          {footer}
        </footer>
      )}
    </div>
  );
}

// ============================================
// SPLIT LAYOUT COMPONENT
// ============================================

export interface SplitLayoutProps {
  /** Left/primary panel content */
  left: React.ReactNode;
  /** Right/secondary panel content */
  right: React.ReactNode;
  /** Width ratio of left panel (e.g., '60%', '2/3') */
  leftWidth?: string;
  /** Minimum width of left panel */
  leftMinWidth?: string;
  /** Minimum width of right panel */
  rightMinWidth?: string;
  /** Gap between panels */
  gap?: 'none' | 'sm' | 'md' | 'lg';
  /** Reverse order on mobile */
  reverseMobile?: boolean;
  /** Stack panels on mobile instead of hiding */
  stackOnMobile?: boolean;
  /** Which panel to show on mobile when stacked is false */
  mobilePanel?: 'left' | 'right';
  /** Allow resizing between panels */
  resizable?: boolean;
  /** Show right panel */
  showRight?: boolean;
  className?: string;
}

export function SplitLayout({
  left,
  right,
  leftWidth = '60%',
  leftMinWidth = '300px',
  rightMinWidth = '280px',
  gap = 'md',
  reverseMobile = false,
  stackOnMobile = false,
  mobilePanel = 'left',
  resizable = false,
  showRight = true,
  className,
}: SplitLayoutProps) {
  const isMobile = useIsMobile();
  const [dividerPosition, setDividerPosition] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const gapStyles = {
    none: '',
    sm: 'gap-2 md:gap-3',
    md: 'gap-4 md:gap-6',
    lg: 'gap-6 md:gap-8',
  };

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!resizable) return;
    e.preventDefault();
    setIsDragging(true);
  }, [resizable]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    const container = document.getElementById('split-container');
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const position = ((e.clientX - rect.left) / rect.width) * 100;
    setDividerPosition(Math.min(Math.max(position, 20), 80));
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  React.useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Mobile view
  if (isMobile && !stackOnMobile) {
    return (
      <div className={cn('flex-1 overflow-hidden', className)}>
        {mobilePanel === 'left' ? left : right}
      </div>
    );
  }

  // Stacked mobile view
  if (isMobile && stackOnMobile) {
    return (
      <div
        className={cn(
          'flex flex-col',
          gapStyles[gap],
          reverseMobile && 'flex-col-reverse',
          className
        )}
      >
        <div className="flex-1 min-h-0">{left}</div>
        {showRight && <div className="flex-1 min-h-0">{right}</div>}
      </div>
    );
  }

  // Desktop view
  const effectiveLeftWidth = dividerPosition ? `${dividerPosition}%` : leftWidth;
  const effectiveRightWidth = dividerPosition ? `${100 - dividerPosition}%` : `calc(100% - ${leftWidth})`;

  return (
    <div
      id="split-container"
      className={cn(
        'flex h-full',
        gapStyles[gap],
        isDragging && 'select-none cursor-col-resize',
        className
      )}
    >
      {/* Left Panel */}
      <div
        className="flex-shrink-0 overflow-hidden"
        style={{
          width: showRight ? effectiveLeftWidth : '100%',
          minWidth: showRight ? leftMinWidth : undefined,
        }}
      >
        {left}
      </div>

      {/* Resizable Divider */}
      {resizable && showRight && (
        <div
          className={cn(
            'w-1 flex-shrink-0 cursor-col-resize',
            'bg-surface-200 dark:bg-surface-700',
            'hover:bg-brand-400 dark:hover:bg-brand-500',
            'transition-colors duration-150',
            isDragging && 'bg-brand-500'
          )}
          onMouseDown={handleMouseDown}
          role="separator"
          aria-orientation="vertical"
        />
      )}

      {/* Right Panel */}
      {showRight && (
        <div
          className="flex-1 overflow-hidden"
          style={{ minWidth: rightMinWidth }}
        >
          {right}
        </div>
      )}
    </div>
  );
}

// ============================================
// CONTAINER COMPONENT
// ============================================

export interface ContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Maximum width variant */
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  /** Center the container */
  centered?: boolean;
  /** Add horizontal padding */
  padded?: boolean;
}

export const Container = forwardRef<HTMLDivElement, ContainerProps>(
  ({ size = 'lg', centered = true, padded = true, className, children, ...props }, ref) => {
    const sizeStyles = {
      sm: 'max-w-2xl',
      md: 'max-w-4xl',
      lg: 'max-w-6xl',
      xl: 'max-w-7xl',
      full: 'max-w-full',
    };

    return (
      <div
        ref={ref}
        className={cn(
          sizeStyles[size],
          centered && 'mx-auto',
          padded && 'px-4 sm:px-6 lg:px-8',
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Container.displayName = 'Container';

// ============================================
// STACK COMPONENT
// ============================================

export interface StackProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Direction of the stack */
  direction?: 'horizontal' | 'vertical';
  /** Gap between items */
  gap?: 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  /** Alignment of items */
  align?: 'start' | 'center' | 'end' | 'stretch' | 'baseline';
  /** Justification of items */
  justify?: 'start' | 'center' | 'end' | 'between' | 'around' | 'evenly';
  /** Whether to wrap items */
  wrap?: boolean;
  /** Reverse direction on mobile */
  reverseMobile?: boolean;
}

export const Stack = forwardRef<HTMLDivElement, StackProps>(
  (
    {
      direction = 'vertical',
      gap = 'md',
      align = 'stretch',
      justify = 'start',
      wrap = false,
      reverseMobile = false,
      className,
      children,
      ...props
    },
    ref
  ) => {
    const gapStyles = {
      none: 'gap-0',
      xs: 'gap-1',
      sm: 'gap-2',
      md: 'gap-4',
      lg: 'gap-6',
      xl: 'gap-8',
    };

    const alignStyles = {
      start: 'items-start',
      center: 'items-center',
      end: 'items-end',
      stretch: 'items-stretch',
      baseline: 'items-baseline',
    };

    const justifyStyles = {
      start: 'justify-start',
      center: 'justify-center',
      end: 'justify-end',
      between: 'justify-between',
      around: 'justify-around',
      evenly: 'justify-evenly',
    };

    return (
      <div
        ref={ref}
        className={cn(
          'flex',
          direction === 'horizontal' ? 'flex-row' : 'flex-col',
          reverseMobile && direction === 'horizontal' && 'flex-col sm:flex-row',
          reverseMobile && direction === 'vertical' && 'flex-col-reverse sm:flex-col',
          gapStyles[gap],
          alignStyles[align],
          justifyStyles[justify],
          wrap && 'flex-wrap',
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Stack.displayName = 'Stack';

// ============================================
// GRID COMPONENT
// ============================================

export interface GridProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Number of columns */
  cols?: 1 | 2 | 3 | 4 | 5 | 6 | 12;
  /** Responsive columns */
  colsSm?: 1 | 2 | 3 | 4 | 5 | 6;
  colsMd?: 1 | 2 | 3 | 4 | 5 | 6;
  colsLg?: 1 | 2 | 3 | 4 | 5 | 6 | 12;
  /** Gap between items */
  gap?: 'none' | 'sm' | 'md' | 'lg';
}

export const Grid = forwardRef<HTMLDivElement, GridProps>(
  (
    {
      cols = 1,
      colsSm,
      colsMd,
      colsLg,
      gap = 'md',
      className,
      children,
      ...props
    },
    ref
  ) => {
    const colStyles: Record<number, string> = {
      1: 'grid-cols-1',
      2: 'grid-cols-2',
      3: 'grid-cols-3',
      4: 'grid-cols-4',
      5: 'grid-cols-5',
      6: 'grid-cols-6',
      12: 'grid-cols-12',
    };

    const gapStyles = {
      none: 'gap-0',
      sm: 'gap-2 md:gap-3',
      md: 'gap-4 md:gap-6',
      lg: 'gap-6 md:gap-8',
    };

    return (
      <div
        ref={ref}
        className={cn(
          'grid',
          colStyles[cols],
          colsSm && `sm:grid-cols-${colsSm}`,
          colsMd && `md:grid-cols-${colsMd}`,
          colsLg && `lg:grid-cols-${colsLg}`,
          gapStyles[gap],
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Grid.displayName = 'Grid';

// ============================================
// DIVIDER COMPONENT
// ============================================

export interface DividerProps extends React.HTMLAttributes<HTMLHRElement> {
  /** Orientation of the divider */
  orientation?: 'horizontal' | 'vertical';
  /** Variant of the divider */
  variant?: 'solid' | 'dashed' | 'dotted';
  /** Add text in the middle */
  label?: string;
}

export const Divider = forwardRef<HTMLHRElement, DividerProps>(
  ({ orientation = 'horizontal', variant = 'solid', label, className, ...props }, ref) => {
    const variantStyles = {
      solid: 'border-solid',
      dashed: 'border-dashed',
      dotted: 'border-dotted',
    };

    if (orientation === 'vertical') {
      return (
        <hr
          ref={ref}
          className={cn(
            'h-full w-0 border-l border-surface-200 dark:border-surface-700',
            variantStyles[variant],
            className
          )}
          {...props}
        />
      );
    }

    if (label) {
      return (
        <div className={cn('flex items-center', className)}>
          <hr
            className={cn(
              'flex-1 border-t border-surface-200 dark:border-surface-700',
              variantStyles[variant]
            )}
          />
          <span className="px-3 text-sm text-surface-500 dark:text-surface-400">
            {label}
          </span>
          <hr
            className={cn(
              'flex-1 border-t border-surface-200 dark:border-surface-700',
              variantStyles[variant]
            )}
          />
        </div>
      );
    }

    return (
      <hr
        ref={ref}
        className={cn(
          'border-t border-surface-200 dark:border-surface-700',
          variantStyles[variant],
          className
        )}
        {...props}
      />
    );
  }
);

Divider.displayName = 'Divider';

export default { AppShell, SplitLayout, Container, Stack, Grid, Divider };
