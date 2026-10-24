import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/posts_/$postId/edit')({ component: () => null })
