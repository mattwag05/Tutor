import UtilitySidebar from "@/components/sidebar/UtilitySidebar";

export default function UtilityLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex h-screen overflow-hidden">
      <UtilitySidebar />
      <main
        className="flex-1 overflow-hidden bg-[var(--background)] sm:!pb-0"
        style={{ paddingBottom: "calc(3.5rem + env(safe-area-inset-bottom))" }}
      >
        {children}
      </main>
    </div>
  );
}
