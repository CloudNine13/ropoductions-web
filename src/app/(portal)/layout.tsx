import { cookies } from "next/headers";
import { AgeGateDialog } from "@/components/age-gate-dialog";
import { AGE_VERIFIED_COOKIE_NAME } from "@/lib/cookies";

export default async function PortalLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const rawValue = cookieStore.get(AGE_VERIFIED_COOKIE_NAME)?.value;
  const isVerified = rawValue?.replace(/^"|"$/g, "") === "true";

  return (
    <div className="relative min-h-screen flex flex-col bg-background text-foreground">
      <AgeGateDialog isServerVerified={isVerified} />
      {children}
    </div>
  );
}
