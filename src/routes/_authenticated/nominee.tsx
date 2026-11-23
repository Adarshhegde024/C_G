import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/nominee")({
  component: NomineeLayout,
});

function NomineeLayout() {
  return <Outlet />;
}
