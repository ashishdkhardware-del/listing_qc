import { Suspense } from "react";
import FolderPage from "@/components/FolderPage";

export default function Page() {
  return (
    <Suspense>
      <FolderPage view="report" />
    </Suspense>
  );
}
