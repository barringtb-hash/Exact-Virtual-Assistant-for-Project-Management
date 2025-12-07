import React, { forwardRef, useId } from 'react';
import { cn } from './responsive';

// ============================================
// INPUT TYPES
// ============================================

export type InputSize = 'sm' | 'md' | 'lg';
export type InputVariant = 'default' | 'filled' | 'flushed';

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** Size of the input */
  size?: InputSize;
  /** Visual variant */
  variant?: InputVariant;
  /** Label text */
  label?: string;
  /** Helper text below the input */
  helperText?: string;
  /** Error message (also sets error state) */
  error?: string;
  /** Success state */
  success?: boolean;
  /** Left element/icon */
  leftElement?: React.ReactNode;
  /** Right element/icon */
  rightElement?: React.ReactNode;
  /** Make the input full width */
  fullWidth?: boolean;
  /** Required indicator */
  required?: boolean;
  /** Optional indicator */
  optional?: boolean;
}

// ============================================
// STYLE DEFINITIONS
// ============================================

const baseInputStyles = [
  'w-full bg-surface-0',
  'text-surface-900 placeholder:text-surface-400',
  'transition-all duration-150',
  'focus:outline-none',
  'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-surface-50',
  'dark:bg-surface-800 dark:text-surface-100 dark:placeholder:text-surface-500',
  'dark:disabled:bg-surface-900',
].join(' ');

const variantStyles: Record<InputVariant, string> = {
  default: [
    'border border-surface-200 rounded-lg',
    'shadow-inner-sm',
    'hover:border-surface-300',
    'focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20',
    'dark:border-surface-700',
    'dark:hover:border-surface-600',
    'dark:focus:border-brand-400 dark:focus:ring-brand-400/20',
  ].join(' '),

  filled: [
    'bg-surface-100 border border-transparent rounded-lg',
    'hover:bg-surface-200',
    'focus:bg-surface-0 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20',
    'dark:bg-surface-700',
    'dark:hover:bg-surface-600',
    'dark:focus:bg-surface-800 dark:focus:border-brand-400',
  ].join(' '),

  flushed: [
    'bg-transparent border-0 border-b-2 border-surface-200 rounded-none px-0',
    'hover:border-surface-300',
    'focus:border-brand-500',
    'dark:border-surface-700',
    'dark:hover:border-surface-600',
    'dark:focus:border-brand-400',
  ].join(' '),
};

const sizeStyles: Record<InputSize, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-3.5 text-base',
  lg: 'h-12 px-4 text-lg',
};

const errorStyles = [
  'border-error-500 focus:border-error-500 focus:ring-error-500/20',
  'dark:border-error-400 dark:focus:border-error-400 dark:focus:ring-error-400/20',
].join(' ');

const successStyles = [
  'border-success-500 focus:border-success-500 focus:ring-success-500/20',
  'dark:border-success-400 dark:focus:border-success-400 dark:focus:ring-success-400/20',
].join(' ');

// ============================================
// INPUT COMPONENT
// ============================================

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      size = 'md',
      variant = 'default',
      label,
      helperText,
      error,
      success,
      leftElement,
      rightElement,
      fullWidth = true,
      required,
      optional,
      className,
      id: providedId,
      ...props
    },
    ref
  ) => {
    const generatedId = useId();
    const inputId = providedId || generatedId;
    const hasError = !!error;

    return (
      <div className={cn('relative', fullWidth ? 'w-full' : 'w-auto', className)}>
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5"
          >
            {label}
            {required && <span className="text-error-500 ml-0.5">*</span>}
            {optional && (
              <span className="text-surface-400 dark:text-surface-500 text-xs font-normal ml-1.5">
                (optional)
              </span>
            )}
          </label>
        )}

        <div className="relative">
          {leftElement && (
            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-surface-400 dark:text-surface-500">
              {leftElement}
            </div>
          )}

          <input
            ref={ref}
            id={inputId}
            className={cn(
              baseInputStyles,
              variantStyles[variant],
              sizeStyles[size],
              hasError && errorStyles,
              success && !hasError && successStyles,
              leftElement && 'pl-10',
              rightElement && 'pr-10'
            )}
            aria-invalid={hasError}
            aria-describedby={
              error ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined
            }
            {...props}
          />

          {rightElement && (
            <div className="absolute inset-y-0 right-0 flex items-center pr-3 text-surface-400 dark:text-surface-500">
              {rightElement}
            </div>
          )}
        </div>

        {(error || helperText) && (
          <p
            id={error ? `${inputId}-error` : `${inputId}-helper`}
            className={cn(
              'mt-1.5 text-sm',
              hasError
                ? 'text-error-500 dark:text-error-400'
                : 'text-surface-500 dark:text-surface-400'
            )}
          >
            {error || helperText}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

// ============================================
// TEXTAREA TYPES
// ============================================

export interface TextareaProps
  extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'size'> {
  /** Size of the textarea */
  size?: InputSize;
  /** Visual variant */
  variant?: InputVariant;
  /** Label text */
  label?: string;
  /** Helper text below the textarea */
  helperText?: string;
  /** Error message (also sets error state) */
  error?: string;
  /** Success state */
  success?: boolean;
  /** Make the textarea full width */
  fullWidth?: boolean;
  /** Required indicator */
  required?: boolean;
  /** Optional indicator */
  optional?: boolean;
  /** Auto-resize based on content */
  autoResize?: boolean;
  /** Minimum number of rows */
  minRows?: number;
  /** Maximum number of rows */
  maxRows?: number;
}

// ============================================
// TEXTAREA COMPONENT
// ============================================

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      size = 'md',
      variant = 'default',
      label,
      helperText,
      error,
      success,
      fullWidth = true,
      required,
      optional,
      autoResize = false,
      minRows = 3,
      maxRows = 10,
      className,
      id: providedId,
      onChange,
      ...props
    },
    ref
  ) => {
    const generatedId = useId();
    const inputId = providedId || generatedId;
    const hasError = !!error;

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (autoResize) {
        const textarea = e.target;
        textarea.style.height = 'auto';
        const lineHeight = parseInt(getComputedStyle(textarea).lineHeight);
        const minHeight = minRows * lineHeight;
        const maxHeight = maxRows * lineHeight;
        const scrollHeight = textarea.scrollHeight;
        textarea.style.height = `${Math.min(Math.max(scrollHeight, minHeight), maxHeight)}px`;
      }
      onChange?.(e);
    };

    const textSizeStyles: Record<InputSize, string> = {
      sm: 'px-3 py-2 text-sm',
      md: 'px-3.5 py-2.5 text-base',
      lg: 'px-4 py-3 text-lg',
    };

    return (
      <div className={cn('relative', fullWidth ? 'w-full' : 'w-auto', className)}>
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5"
          >
            {label}
            {required && <span className="text-error-500 ml-0.5">*</span>}
            {optional && (
              <span className="text-surface-400 dark:text-surface-500 text-xs font-normal ml-1.5">
                (optional)
              </span>
            )}
          </label>
        )}

        <textarea
          ref={ref}
          id={inputId}
          rows={minRows}
          className={cn(
            baseInputStyles,
            variantStyles[variant],
            textSizeStyles[size],
            'resize-y min-h-[80px]',
            hasError && errorStyles,
            success && !hasError && successStyles,
            autoResize && 'resize-none overflow-hidden'
          )}
          aria-invalid={hasError}
          aria-describedby={
            error ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined
          }
          onChange={handleChange}
          {...props}
        />

        {(error || helperText) && (
          <p
            id={error ? `${inputId}-error` : `${inputId}-helper`}
            className={cn(
              'mt-1.5 text-sm',
              hasError
                ? 'text-error-500 dark:text-error-400'
                : 'text-surface-500 dark:text-surface-400'
            )}
          >
            {error || helperText}
          </p>
        )}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';

// ============================================
// INPUT GROUP COMPONENT
// ============================================

export interface InputGroupProps {
  children: React.ReactNode;
  className?: string;
}

export function InputGroup({ children, className }: InputGroupProps) {
  return <div className={cn('flex', className)}>{children}</div>;
}

// ============================================
// INPUT ADDON COMPONENT
// ============================================

export interface InputAddonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Position of the addon */
  position?: 'left' | 'right';
}

export function InputAddon({
  position = 'left',
  className,
  children,
  ...props
}: InputAddonProps) {
  return (
    <div
      className={cn(
        'inline-flex items-center px-3',
        'bg-surface-100 border border-surface-200',
        'text-sm text-surface-600',
        'dark:bg-surface-700 dark:border-surface-600 dark:text-surface-300',
        position === 'left' && 'border-r-0 rounded-l-lg',
        position === 'right' && 'border-l-0 rounded-r-lg',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export default Input;
