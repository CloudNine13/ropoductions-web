import Image from "next/image";
import Link from "next/link";

export default function PortalPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-12 sm:px-6 lg:px-8 text-center">
      <div className="max-w-4xl w-full space-y-8">
        {/* Studio Brand Header */}
        <div className="flex items-center justify-center gap-3">
          <Image
            src="/branding/studio-logo.webp"
            alt="Ropoductions Studio Emblem"
            width={48}
            height={48}
            className="pixelated drop-shadow-[0_0_12px_rgba(34,197,94,0.6)]"
            priority
          />
          <h1 className="font-display text-3xl sm:text-4xl md:text-5xl font-bold tracking-wider text-foreground">
            ROPODUCTIONS
          </h1>
        </div>

        {/* Studio Key Art Banner */}
        <div className="relative mx-auto w-full overflow-hidden rounded-xl border border-border bg-card shadow-[0_0_50px_rgba(34,197,94,0.12)]">
          <div className="aspect-[3/1] w-full relative">
            <Image
              src="/branding/studio-banner.jpeg"
              alt="Final Orginity - Ropoductions Key Banner"
              fill
              className="pixelated object-cover"
              priority
              sizes="(max-width: 1024px) 100vw, 896px"
            />
          </div>
        </div>

        <p className="text-lg sm:text-xl text-muted-foreground font-body max-w-2xl mx-auto">
          Indie game studio crafting cheeky, narrative-driven retro anime RPGs and pixel adventures.
        </p>

        <div className="flex flex-col items-center justify-center gap-4 pt-2">
          <div className="flex flex-wrap items-center justify-center gap-4">
            <div className="px-4 py-2.5 rounded-md bg-card border border-border text-card-foreground shadow-lg text-sm sm:text-base">
              Supported Tiers (<span className="text-tier-gold font-semibold">$5–$50 Patrons</span>)
            </div>
            <Link
              href="/play"
              className="inline-flex items-center justify-center px-6 py-2.5 rounded-md bg-primary hover:bg-primary-hover text-primary-foreground font-semibold transition-colors min-h-[44px] shadow-lg shadow-primary/20"
            >
              Play Now (Patron Access)
            </Link>
          </div>
          <p className="text-xs text-muted-foreground">
            Requires 21+ age confirmation and active Patreon membership ($5+ tier).
          </p>
        </div>
      </div>
    </main>
  );
}
