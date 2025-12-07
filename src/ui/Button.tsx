import React, { forwardRef } from 'react';
import { cn } from './responsive';

// ============================================
// BUTTON TYPES
// ============================================

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'outline';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual style variant */
  variant?: ButtonVariant;
  /** Size of the button */
  size?: ButtonSize;
  /** Show loading spinner */
  loading?: boolean;
  /** Icon to show before the label */
  leftIcon?: React.ReactNode;
  /** Icon to show after the label */
  rightIcon?: React.ReactNode;
  /** Make button full width */
  fullWidth?: boolean;
  /** Use as an icon-only button (square aspect ratio) */
  iconOnly?: boolean;
}

// ============================================
// STYLE DEFINITIONS
// ============================================

const baseStyles = [
  'inline-flex items-center justify-center gap-2',
  'font-medium leading-none',
  'rounded-lg border',
  'transition-all duration-150 ease-out',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
  'disabled:cursor-not-allowed disabled:opacity-50',
  'active:scale-[0.98]',
  'select-none',
].join(' ');

const variantStyles: Record<ButtonVariant, string> = {
  primary: [
    'bg-brand-500 border-brand-500 text-white',
    'hover:bg-brand-600 hover:border-brand-600',
    'focus-visible:ring-brand-500',
    'shadow-sm hover:shadow-md',
    'dark:bg-brand-500 dark:border-brand-500',
    'dark:hover:bg-brand-400 dark:hover:border-brand-400',
  ].join(' '),

  secondary: [
    'bg-surface-0 border-surface-200 text-surface-700',
    'hover:bg-surface-50 hover:border-surface-300',
    'focus-visible:ring-surface-400',
    'shadow-sm',
    'dark:bg-surface-800 dark:border-surface-700 dark:text-surface-100',
    'dark:hover:bg-surface-700 dark:hover:border-surface-600',
  ].join(' '),

  ghost: [
    'bg-transparent border-transparent text-surface-600',
    'hover:bg-surface-100 hover:text-surface-900',
    'focus-visible:ring-surface-400',
    'dark:text-surface-300',
    'dark:hover:bg-surface-800 dark:hover:text-surface-100',
  ].join(' '),

  danger: [
    'bg-error-500 border-error-500 text-white',
    'hover:bg-error-600 hover:border-error-600',
    'focus-visible:ring-error-500',
    'shadow-sm hover:shadow-md',
    'dark:bg-error-600 dark:border-error-600',
    'dark:hover:bg-error-500 dark:hover:border-error-500',
  ].join(' '),

  success: [
    'bg-success-500 border-success-500 text-white',
    'hover:bg-success-600 hover:border-success-600',
    'focus-visible:ring-success-500',
    'shadow-sm hover:shadow-md',
    'dark:bg-success-600 dark:border-success-600',
    'dark:hover:bg-success-500 dark:hover:border-success-500',
  ].join(' '),

  outline: [
    'bg-transparent border-brand-500 text-brand-500',
    'hover:bg-brand-50 hover:text-brand-600',
    'focus-visible:ring-brand-500',
    'dark:border-brand-400 dark:text-brand-400',
    'dark:hover:bg-brand-950 dark:hover:text-brand-300',
  ].join(' '),
};

const sizeStyles: Record<ButtonSize, string> = {
  xs: 'h-7 px-2.5 text-xs',
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-11 px-5 text-base',
  xl: 'h-12 px-6 text-base',
};

const iconOnlySizeStyles: Record<ButtonSize, string> = {
  xs: 'h-7 w-7',
  sm: 'h-8 w-8',
  md: 'h-10 w-10',
  lg: 'h-11 w-11',
  xl: 'h-12 w-12',
};

const iconSizeStyles: Record<ButtonSize, string> = {
  xs: 'h-3.5 w-3.5',
  sm: 'h-4 w-4',
  md: 'h-4 w-4',
  lg: 'h-5 w-5',
  xl: 'h-5 w-5',
};

// ============================================
// LOADING SPINNER
// ============================================

function LoadingSpinner({ size }: { size: ButtonSize }) {
  return (
    <svg
      className={cn('animate-spin', iconSizeStyles[size])}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

// ============================================
// BUTTON COMPONENT
// ============================================

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      leftIcon,
      rightIcon,
      fullWidth = false,
      iconOnly = false,
      disabled,
      className,
      children,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={cn(
          baseStyles,
          variantStyles[variant],
          iconOnly ? iconOnlySizeStyles[size] : sizeStyles[size],
          fullWidth && 'w-full',
          className
        )}
        {...props}
      >
        {loading ? (
          <LoadingSpinner size={size} />
        ) : leftIcon ? (
          <span className={iconSizeStyles[size]}>{leftIcon}</span>
        ) : null}

        {!iconOnly && children}

        {!loading && rightIcon && (
          <span className={iconSizeStyles[size]}>{rightIcon}</span>
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';

// ============================================
// ICON BUTTON COMPONENT
// ============================================

export interface IconButtonProps extends Omit<ButtonProps, 'leftIcon' | 'rightIcon' | 'iconOnly'> {
  /** Accessible label for screen readers */
  'aria-label': string;
  /** The icon to display */
  icon: React.ReactNode;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ icon, size = 'md', className, ...props }, ref) => {
    return (
      <Button
        ref={ref}
        size={size}
        iconOnly
        className={cn('p-0', className)}
        {...props}
      >
        <span className={iconSizeStyles[size]}>{icon}</span>
      </Button>
    );
  }
);

IconButton.displayName = 'IconButton';

// ============================================
// BUTTON GROUP COMPONENT
// ============================================

export interface ButtonGroupProps {
  children: React.ReactNode;
  className?: string;
  /** Direction of the button group */
  direction?: 'horizontal' | 'vertical';
  /** Whether buttons should be attached */
  attached?: boolean;
}

export function ButtonGroup({
  children,
  className,
  direction = 'horizontal',
  attached = false,
}: ButtonGroupProps) {
  return (
    <div
      role="group"
      className={cn(
        'inline-flex',
        direction === 'vertical' ? 'flex-col' : 'flex-row',
        attached && direction === 'horizontal' && [
          '[&>button]:rounded-none',
          '[&>button:first-child]:rounded-l-lg',
          '[&>button:last-child]:rounded-r-lg',
          '[&>button:not(:first-child)]:-ml-px',
        ].join(' '),
        attached && direction === 'vertical' && [
          '[&>button]:rounded-none',
          '[&>button:first-child]:rounded-t-lg',
          '[&>button:last-child]:rounded-b-lg',
          '[&>button:not(:first-child)]:-mt-px',
        ].join(' '),
        !attached && (direction === 'horizontal' ? 'gap-2' : 'gap-2'),
        className
      )}
    >
      {children}
    </div>
  );
}

export default Button;
