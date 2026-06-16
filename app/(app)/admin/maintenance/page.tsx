import { requireAdmin } from "@/lib/session";
import { MaintenancePanel } from "./maintenance-panel";

export const dynamic = "force-dynamic";

export default async function AdminMaintenancePage() {
  await requireAdmin();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="eyebrow text-primary mb-2.5">Admin</p>
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          Storage maintenance
        </h1>
        <p className="text-muted-foreground mt-1.5 text-sm">
          Find generated invitation images in Cloudinary that no guest points at
          any more — left over from regenerating, resetting, or removing guests —
          and delete them to free up storage.
        </p>
      </div>

      <MaintenancePanel />
    </div>
  );
}
