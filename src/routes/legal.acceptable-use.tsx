import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/legal/acceptable-use')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/legal/acceptable-use"!</div>
}
