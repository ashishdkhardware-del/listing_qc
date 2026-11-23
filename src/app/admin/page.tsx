import Admin from "@/components/Admin";
import Gate from "@/components/Gate";

export default function Page() {
  return (
    <Gate admin>
      <Admin />
    </Gate>
  );
}
