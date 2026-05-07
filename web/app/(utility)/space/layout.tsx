import SpaceMiniNav from "@/components/space/SpaceMiniNav";

export default function SpaceLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex h-full overflow-hidden">
      <SpaceMiniNav />
      <main className="flex-1 overflow-y-auto bg-[var(--background)] [scrollbar-gutter:stable]">
        <div className="mx-auto max-w-5xl px-4 py-6 pb-12 sm:px-8 sm:py-8">{children}</div>
      </main>
    </div>
  );
}
