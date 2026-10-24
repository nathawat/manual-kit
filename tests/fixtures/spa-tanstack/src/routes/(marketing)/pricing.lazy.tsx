import { createLazyFileRoute } from '@tanstack/react-router'

export const Route = createLazyFileRoute('/pricing')({ component: () => null })
