/**
 * UI Component Library for Exact Virtual Assistant
 *
 * This file exports all reusable UI components and utilities.
 */

// ============================================
// CORE COMPONENTS
// ============================================

// Button components
export {
  Button,
  IconButton,
  ButtonGroup,
  type ButtonProps,
  type IconButtonProps,
  type ButtonGroupProps,
  type ButtonVariant,
  type ButtonSize,
} from './Button';

// Card components
export {
  Card,
  CardHeader,
  CardContent,
  CardFooter,
  CardDivider,
  CardSkeleton,
  type CardProps,
  type CardHeaderProps,
  type CardContentProps,
  type CardFooterProps,
  type CardDividerProps,
  type CardSkeletonProps,
  type CardVariant,
  type CardPadding,
} from './Card';

// Input components
export {
  Input,
  Textarea,
  InputGroup,
  InputAddon,
  type InputProps,
  type TextareaProps,
  type InputGroupProps,
  type InputAddonProps,
  type InputSize,
  type InputVariant,
} from './Input';

// Layout components
export {
  AppShell,
  SplitLayout,
  Container,
  Stack,
  Grid,
  Divider,
  type AppShellProps,
  type SplitLayoutProps,
  type ContainerProps,
  type StackProps,
  type GridProps,
  type DividerProps,
} from './Layout';

// ============================================
// RESPONSIVE UTILITIES
// ============================================

export {
  // Breakpoint definitions
  breakpoints,
  type Breakpoint,

  // Media query helpers
  minWidth,
  maxWidth,
  between,

  // Responsive hooks
  useBreakpoint,
  useCurrentBreakpoint,
  useIsMobile,
  useIsTablet,
  useIsDesktop,
  useIsTouchDevice,
  usePrefersReducedMotion,
  useResponsiveValue,

  // Class name utilities
  cn,
  responsive,

  // Container utilities
  containerPadding,
  containerWidth,
  container,
  containerNarrow,
  containerWide,

  // Grid utilities
  gridCols,
  gridGap,
} from './responsive';

// ============================================
// EXISTING COMPONENTS
// ============================================

// Re-export existing components
export { default as TextComposer } from './TextComposer';
export { default as MicButton } from './MicButton';
