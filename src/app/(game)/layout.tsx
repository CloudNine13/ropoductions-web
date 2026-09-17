export default function GameLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#090A0F] text-foreground flex flex-col items-center justify-center overflow-x-hidden">
      {children}
    </div>
  );
}
