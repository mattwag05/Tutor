"use client";

import { useEffect } from "react";
import { Layers } from "lucide-react";
import { useTranslation } from "react-i18next";
import PickerModalShell from "@/components/common/PickerModalShell";
import NotebookSelector from "@/components/notebook/NotebookSelector";
import { useNotebookSelection } from "@/components/notebook/useNotebookSelection";
import type { SelectedRecord } from "@/lib/notebook-selection-types";

interface NotebookRecordPickerProps {
  open: boolean;
  onClose: () => void;
  onApply: (records: SelectedRecord[]) => void;
  actionLabel?: string;
}

export default function NotebookRecordPicker({
  open,
  onClose,
  onApply,
  actionLabel = "Use Selected Records ({n})",
}: NotebookRecordPickerProps) {
  const { t } = useTranslation();
  const {
    notebooks,
    expandedNotebooks,
    notebookRecordsMap,
    selectedRecords,
    loadingNotebooks,
    loadingRecordsFor,
    fetchNotebooks,
    toggleNotebookExpanded,
    toggleRecordSelection,
    selectAllFromNotebook,
    deselectAllFromNotebook,
    clearAllSelections,
  } = useNotebookSelection();

  useEffect(() => {
    if (!open) return;
    void fetchNotebooks();
  }, [fetchNotebooks, open]);

  return (
    <PickerModalShell
      open={open}
      onClose={onClose}
      title={t("Select Notebook Records")}
      subtitle={t("Choose records across one or more notebooks to ground the next request.")}
      label={t("Notebook Reference")}
      icon={<Layers className="h-3 w-3" />}
      width="4xl"
    >
      <div className="bg-[var(--background)]/40 p-5">
        <NotebookSelector
          notebooks={notebooks}
          expandedNotebooks={expandedNotebooks}
          notebookRecordsMap={notebookRecordsMap}
          selectedRecords={selectedRecords}
          loadingNotebooks={loadingNotebooks}
          loadingRecordsFor={loadingRecordsFor}
          isLoading={false}
          onToggleExpanded={toggleNotebookExpanded}
          onToggleRecord={toggleRecordSelection}
          onSelectAll={selectAllFromNotebook}
          onDeselectAll={deselectAllFromNotebook}
          onClearAll={clearAllSelections}
          onCreateSession={() => {
            onApply(Array.from(selectedRecords.values()) as SelectedRecord[]);
            onClose();
          }}
          actionLabel={actionLabel}
        />
      </div>
    </PickerModalShell>
  );
}
