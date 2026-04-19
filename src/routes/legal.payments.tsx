import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/legal/payments')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/legal/payments"!</div>
}
