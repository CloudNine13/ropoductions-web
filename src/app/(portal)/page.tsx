import { StudioHeader } from "@/components/studio-header";
import { HeroSection } from "@/components/hero-section";
import { ProjectShowcase } from "@/components/project-showcase";
import { SocialHub } from "@/components/social-hub";
import { StudioFooter } from "@/components/studio-footer";
import { PaywallModal } from "@/components/paywall-modal";
import { resolvePaywallType } from "@/lib/paywall";

interface PortalPageProps {
  searchParams?: Promise<{
    paywall?: string;
    auth_required?: string;
    auth_error?: string;
  }>;
}
export default async function PortalPage({ searchParams }: PortalPageProps) {
  const resolvedParams = searchParams ? await searchParams : {};
  const paywallType = resolvePaywallType(resolvedParams);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground selection:bg-primary selection:text-primary-foreground overflow-x-clip">
      {/* Sticky Studio Brand Header */}
      <StudioHeader />
      {paywallType && <PaywallModal />}

      {/* Main Content Area with Full-Bleed Hero and Constrained Content Sections */}
      <main className="flex-1 w-full flex flex-col">
        {/* Full-width 100% Edge-to-Edge Hero with Atmospheric Background Key Art Banner */}
        <HeroSection />

        {/* Constrained Media Cards Showcase & Social Hub */}
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-16 py-12 sm:py-16">
          {/* Project Media Cards & Screenshots Lightbox */}
          <ProjectShowcase />

          {/* Verified Community & Social Hub Links */}
          <SocialHub />
        </div>
      </main>
      {/* Studio Compliance & Brand Footer */}
      <StudioFooter />
    </div>
  );
}
