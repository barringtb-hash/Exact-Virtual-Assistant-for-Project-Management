import React, { forwardRef } from 'react';
import { cn } from './responsive';

// ============================================
// CARD TYPES
// ============================================

export type CardVariant = 'default' | 'elevated' | 'outlined' | 'ghost' | 'interactive';
export type CardPadding = 'none' | 'sm' | 'md' | 'lg';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual style variant */
  variant?: CardVariant;
  /** Padding size */
  padding?: CardPadding;
  /** Make the card hoverable with elevation change */
  hoverable?: boolean;
  /** Add a subtle animation on mount */
  animate?: boolean;
}

// ============================================
// STYLE DEFINITIONS
// ============================================

const baseStyles = 'rounded-xl transition-all duration-200';

const variantStyles: Record<CardVariant, string> = {
  default: [
    'bg-surface-0 border border-surface-200',
    'shadow-sm',
    'dark:bg-surface-800 dark:border-surface-700',
  ].join(' '),

  elevated: [
    'bg-surface-0 border border-surface-100',
    'shadow-elevation-2',
    'dark:bg-surface-800 dark:border-surface-700',
    'dark:shadow-dark-md',
  ].join(' '),

  outlined: [
    'bg-transparent border-2 border-surface-200',
    'dark:border-surface-700',
  ].join(' '),

  ghost: [
    'bg-surface-50',
    'dark:bg-surface-800/50',
  ].join(' '),

  interactive: [
    'bg-surface-0 border border-surface-200',
    'shadow-sm cursor-pointer',
    'hover:shadow-elevation-2 hover:border-surface-300',
    'active:scale-[0.99]',
    'dark:bg-surface-800 dark:border-surface-700',
    'dark:hover:border-surface-600',
  ].join(' '),
};

const paddingStyles: Record<CardPadding, string> = {
  none: '',
  sm: 'p-3 sm:p-4',
  md: 'p-4 sm:p-5 md:p-6',
  lg: 'p-5 sm:p-6 md:p-8',
};

const hoverStyles = 'hover:shadow-elevation-3 hover:border-surface-300 dark:hover:border-surface-600';

// ============================================
// CARD COMPONENT
// ============================================

export const Card = forwardRef<HTMLDivElement, CardProps>(
  (
    {
      variant = 'default',
      padding = 'md',
      hoverable = false,
      animate = false,
      className,
      children,
      ...props
    },
    ref
  ) => {
    return (
      <div
        ref={ref}
        className={cn(
          baseStyles,
          variantStyles[variant],
          paddingStyles[padding],
          hoverable && variant !== 'interactive' && hoverStyles,
          animate && 'animate-fade-in-up',
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';

// ============================================
// CARD HEADER COMPONENT
// ============================================

export interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Title text */
  title?: React.ReactNode;
  /** Description text below title */
  description?: React.ReactNode;
  /** Actions to display on the right side */
  actions?: React.ReactNode;
  /** Show a bottom border */
  bordered?: boolean;
}

export const CardHeader = forwardRef<HTMLDivElement, CardHeaderProps>(
  ({ title, description, actions, bordered = false, className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'flex items-start justify-between gap-4',
          bordered && 'border-b border-surface-200 dark:border-surface-700 pb-4 mb-4',
          className
        )}
        {...props}
      >
        <div className="flex-1 min-w-0">
          {title && (
            <h3 className="text-base font-semibold text-surface-900 dark:text-surface-50 leading-tight">
              {title}
            </h3>
          )}
          {description && (
            <p className="mt-1 text-sm text-surface-500 dark:text-surface-400">
              {description}
            </p>
          )}
          {children}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
    );
  }
);

CardHeader.displayName = 'CardHeader';

// ============================================
// CARD CONTENT COMPONENT
// ============================================

export interface CardContentProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Add vertical padding */
  padded?: boolean;
}

export const CardContent = forwardRef<HTMLDivElement, CardContentProps>(
  ({ padded = false, className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(padded && 'py-4', className)}
        {...props}
      >
        {children}
      </div>
    );
  }
);

CardContent.displayName = 'CardContent';

// ============================================
// CARD FOOTER COMPONENT
// ============================================

export interface CardFooterProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Show a top border */
  bordered?: boolean;
  /** Align content to the right */
  align?: 'left' | 'center' | 'right' | 'between';
}

export const CardFooter = forwardRef<HTMLDivElement, CardFooterProps>(
  ({ bordered = false, align = 'right', className, children, ...props }, ref) => {
    const alignStyles = {
      left: 'justify-start',
      center: 'justify-center',
      right: 'justify-end',
      between: 'justify-between',
    };

    return (
      <div
        ref={ref}
        className={cn(
          'flex items-center gap-3',
          alignStyles[align],
          bordered && 'border-t border-surface-200 dark:border-surface-700 pt-4 mt-4',
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

CardFooter.displayName = 'CardFooter';

// ============================================
// CARD DIVIDER COMPONENT
// ============================================

export interface CardDividerProps extends React.HTMLAttributes<HTMLHRElement> {}

export const CardDivider = forwardRef<HTMLHRElement, CardDividerProps>(
  ({ className, ...props }, ref) => {
    return (
      <hr
        ref={ref}
        className={cn(
          'border-surface-200 dark:border-surface-700 my-4 -mx-4 sm:-mx-5 md:-mx-6',
          className
        )}
        {...props}
      />
    );
  }
);

CardDivider.displayName = 'CardDivider';

// ============================================
// CARD SKELETON COMPONENT
// ============================================

export interface CardSkeletonProps {
  /** Height of the skeleton content area */
  height?: string | number;
  /** Show header skeleton */
  showHeader?: boolean;
  /** Show footer skeleton */
  showFooter?: boolean;
  className?: string;
}

export function CardSkeleton({
  height = 100,
  showHeader = true,
  showFooter = false,
  className,
}: CardSkeletonProps) {
  return (
    <Card className={cn('animate-pulse', className)} padding="md">
      {showHeader && (
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex-1">
            <div className="h-5 w-32 bg-surface-200 dark:bg-surface-700 rounded" />
            <div className="h-3 w-48 bg-surface-200 dark:bg-surface-700 rounded mt-2" />
          </div>
          <div className="h-8 w-8 bg-surface-200 dark:bg-surface-700 rounded" />
        </div>
      )}
      <div
        className="bg-surface-200 dark:bg-surface-700 rounded"
        style={{ height: typeof height === 'number' ? `${height}px` : height }}
      />
      {showFooter && (
        <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-surface-200 dark:border-surface-700">
          <div className="h-9 w-20 bg-surface-200 dark:bg-surface-700 rounded" />
          <div className="h-9 w-24 bg-surface-200 dark:bg-surface-700 rounded" />
        </div>
      )}
    </Card>
  );
}

export default Card;
