"use client";

import { useState } from "react";
import FormatterEditorView from "@/views/FormatterEditorView";
import FormatterExportView from "@/views/FormatterExportView";
import type { ExportDocumentSnapshot } from "@/services/OrganizerService";
import type { FormatStyleId } from "@/views/FormatStyleView";

type Page = "editor" | "export";

export default function StandaloneFormatterGate() {
  const [page, setPage] = useState<Page>("editor");
  const [snapshot, setSnapshot] = useState<ExportDocumentSnapshot | null>(null);
  const [formatStyle, setFormatStyle] = useState<FormatStyleId>("mla");

  if (page === "export" && snapshot) {
    return (
      <FormatterExportView
        snapshot={snapshot}
        formatStyle={formatStyle}
        onBack={() => setPage("editor")}
        onRestart={() => {
          setSnapshot(null);
          setPage("editor");
        }}
      />
    );
  }

  return (
    <FormatterEditorView
      onBack={() => {/* no-op: no previous page in standalone */}}
      onFinish={(snap, style) => {
        setSnapshot(snap);
        setFormatStyle(style);
        setPage("export");
      }}
    />
  );
}
