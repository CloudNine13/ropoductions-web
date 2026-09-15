import Link from "next/link";

export default function PortalPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 text-center">
      <div className="max-w-3xl space-y-6">
        <h1 className="font-display text-4xl sm:text-5xl md:text-6xl font-bold tracking-wider text-foreground">
          ROPODUCTIONS
        </h1>
        <p className="text-lg sm:text-xl text-muted-foreground font-body max-w-xl mx-auto">
          Atmospheric narrative indie studio crafting immersive, dark fantasy experiences.
        </p>

        <div className="flex flex-col items-center justify-center gap-3 pt-4">
          <div className="flex flex-wrap items-center justify-center gap-4">
            <div className="px-4 py-2 rounded-md bg-card border border-border text-card-foreground shadow-lg">
              Supported Tiers (<span className="text-tier-gold font-semibold">$5–$50 Patrons</span>)
            </div>
            <Link
              href="/play"
              className="inline-flex items-center justify-center px-6 py-2.5 rounded-md bg-primary hover:bg-primary-hover text-primary-foreground font-semibold transition-colors min-h-[44px]"
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
