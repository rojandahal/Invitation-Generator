import { requireAdmin } from "@/lib/session";
import { MaintenancePanel } from "./maintenance-panel";

export const dynamic = "force-dynamic";

export default async function AdminMaintenancePage() {
  await requireAdmin();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Storage maintenance</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Find generated invitation images in Cloudinary that no guest points at
          any more — left over from regenerating, resetting, or removing guests —
          and delete them to free up storage.
        </p>
      </div>

      <MaintenancePanel />
    </div>
  );
}
