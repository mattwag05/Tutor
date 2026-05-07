import WorkspaceSidebar from "@/components/sidebar/WorkspaceSidebar";
import { UnifiedChatProvider } from "@/context/UnifiedChatContext";

export default function WorkspaceLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <UnifiedChatProvider>
      <div className="flex h-screen overflow-hidden">
        <WorkspaceSidebar />
        <main
          className="flex-1 overflow-hidden bg-[var(--background)] sm:!pb-0"
          style={{ paddingBottom: "calc(3.5rem + env(safe-area-inset-bottom))" }}
        >
          {children}
        </main>
      </div>
    </UnifiedChatProvider>
  );
}
