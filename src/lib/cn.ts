// Re-export clsx as `cn` — shorter name, matches the popular shadcn/ui
// convention. Use for conditional className composition:
//   cn('base', isActive && 'active', { 'open': isOpen })
export { default as cn } from 'clsx'
