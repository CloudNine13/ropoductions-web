import { StudioHeader } from "@/components/studio-header";
import { HeroSection } from "@/components/hero-section";
import { ProjectShowcase } from "@/components/project-showcase";
import { SocialHub } from "@/components/social-hub";
import { StudioFooter } from "@/components/studio-footer";

export default function PortalPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground selection:bg-primary selection:text-primary-foreground overflow-x-clip">
      {/* Sticky Studio Brand Header */}
      <StudioHeader />

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-16 py-6 sm:py-10">
        {/* Studio Hero with Key Art Banner and Play Now CTA */}
        <HeroSection />

        {/* Project Media Cards & Screenshots Lightbox */}
        <ProjectShowcase />

        {/* Verified Community & Social Hub Links */}
        <SocialHub />
      </main>

      {/* Studio Compliance & Brand Footer */}
      <StudioFooter />
    </div>
  );
}
