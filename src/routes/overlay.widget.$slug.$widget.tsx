import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/overlay/widget/$slug/$widget')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/overlay/widget/$slug/$widget"!</div>
}
