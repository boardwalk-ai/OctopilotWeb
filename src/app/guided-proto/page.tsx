"use client";

/**
 * LOCAL-ONLY harness for the Guided Generation single-editor port.
 * Seeds the Organizer store with sample APA content, then mounts EditorView
 * (which reads useOrganizer) so the editor can be tested without running the
 * full server-backed wizard. Dev-only — 404s in production.
 */

import { useEffect, useState } from "react";
import { notFound } from "next/navigation";
import { Organizer } from "@/services/OrganizerService";
import EditorView from "@/views/EditorView";

const PARA = (n: number) =>
    `Body paragraph ${n}. The Vikings were Norse seafarers who, from the late eighth to the eleventh century, raided, traded, and settled across wide areas of Europe and beyond. Their longships allowed them to travel up shallow rivers and across open ocean alike, reshaping the political and economic map of the medieval world. Archaeological evidence from settlements, hoards, and burial sites continues to revise older assumptions about how these communities lived, governed themselves, and understood the wider world around them.`;

const SAMPLE_ESSAY = [PARA(1), PARA(2), PARA(3), PARA(4), PARA(5), PARA(6), PARA(7), PARA(8)].join("\n\n");
const SAMPLE_BIB = [
    "NASA Jet Propulsion Laboratory. (2021). L'Anse aux Meadows and early transatlantic contact. Pasadena, CA.",
    "Vikingeskibsmuseet. (n.d.). The Sea Stallion from Glendalough. Roskilde, Denmark.",
    "Smith, J. (2019). Norse society and seafaring. Cambridge University Press.",
].join("\n");

export default function GuidedProtoPage() {
    if (process.env.NODE_ENV === "production") notFound();
    const [ready, setReady] = useState(false);
    useEffect(() => {
        Organizer.set({
            finalEssayTitle: "The Vikings: Seafaring, Trade, and Settlement",
            citationStyle: "APA",
            generatedEssay: SAMPLE_ESSAY,
            generatedBibliography: SAMPLE_BIB,
            studentName: "Jane Student",
            instructorName: "Dr. A. Instructor",
            institutionName: "University of Example",
            courseInfo: "HIST 101: Medieval Europe",
        });
        setReady(true);
    }, []);
    // Only mount EditorView after the store is seeded — its initial state is
    // derived from the organizer in useState initializers (which run once).
    if (!ready) return null;
    return (
        <div className="h-screen w-screen">
            <EditorView onBack={() => { }} onNext={() => { }} onFinish={() => { }} />
        </div>
    );
}
