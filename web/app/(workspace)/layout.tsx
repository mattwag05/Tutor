import { UnifiedChatProvider } from "@/context/UnifiedChatContext";

export default function WorkspaceLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <UnifiedChatProvider>
      <div className="h-dvh overflow-hidden bg-white">
        {children}
      </div>
    </UnifiedChatProvider>
  );
}
