"use client";

/**
 * LOCAL-ONLY prototype harness for the single-editor Doc Oct rewrite.
 * Mounts FormatterEditorCore directly with sample APA content so the editor
 * mechanics (Ctrl+A / drag-select / backspace-merge / font-to-selection,
 * page rectangles + spacer pagination) can be tested without the server-backed
 * wizard entry steps. NOT linked from any nav — reach it at /dococt-proto.
 *
 * This page exists only on the `dococt-single-editor` branch and must not be
 * merged into production routes as-is.
 */

import FormatterEditorCore from "@/views/FormatterEditorCore";

const PARA = (n: number) =>
    `Body paragraph ${n}. The Vikings were Norse seafarers who, from the late eighth to the eleventh century, raided, traded, and settled across wide areas of Europe and beyond. Their longships allowed them to travel up shallow rivers and across open ocean alike, reshaping the political and economic map of the medieval world. Archaeological evidence from settlements, hoards, and burial sites continues to revise older assumptions about how these communities lived, governed themselves, and understood the wider world around them.`;

const SAMPLE_ESSAY = [
    PARA(1),
    PARA(2),
    PARA(3),
    PARA(4),
    PARA(5),
    PARA(6),
    PARA(7),
    PARA(8),
].join("\n\n");

const SAMPLE_BIB = [
    "NASA Jet Propulsion Laboratory. (2021). L'Anse aux Meadows and early transatlantic contact. Pasadena, CA.",
    "Vikingeskibsmuseet. (n.d.). The Sea Stallion from Glendalough: Reconstructing the Skuldelev 2. Roskilde, Denmark.",
    "Smith, J. (2019). Norse society and seafaring. Cambridge University Press.",
].join("\n");

export default function DocOctProtoPage() {
    return (
        <div className="h-screen w-screen">
            <FormatterEditorCore
                onBack={() => { /* no-op in proto */ }}
                onFinish={(snapshot) => {
                    // Proto: inspect the reconstructed page-based export snapshot.
                    console.log("[dococt-proto] export snapshot", snapshot);
                    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = "dococt-proto-export.json";
                    a.click();
                    URL.revokeObjectURL(url);
                }}
                content={SAMPLE_ESSAY}
                bibliography={SAMPLE_BIB}
                initialDocTitle="The Vikings: Seafaring, Trade, and Settlement"
                studentName="Jane Student"
                instructorName="Dr. A. Instructor"
                institutionName="University of Example"
                courseInfo="HIST 101: Medieval Europe"
                essayDate="June 20, 2026"
                abstract="This paper examines Viking seafaring, trade networks, and settlement patterns from the late eighth to eleventh centuries, drawing on recent archaeological evidence to reassess older narratives of raiding and conquest."
                keywords="Vikings, Norse, seafaring, settlement, archaeology"
                formatStyle="apa"
            />
        </div>
    );
}
