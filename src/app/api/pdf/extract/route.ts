import { NextRequest, NextResponse } from "next/server";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";
import path from "path";
import { pathToFileURL } from "url";

export const runtime = "nodejs";

// IMPORTANT: Resolve at runtime from cwd (avoid bundler rewriting require.resolve to virtual module ids).
const workerPath = path.join(process.cwd(), "node_modules", "pdfjs-dist", "legacy", "build", "pdf.worker.mjs");
GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get("file");

        if (!(file instanceof File)) {
            return NextResponse.json(
                { error: "Missing PDF file" },
                { status: 400 }
            );
        }

        const name = file.name || "";
        const isPdf = (file.type || "").toLowerCase().includes("pdf") || /\.pdf$/i.test(name);
        if (!isPdf) {
            return NextResponse.json(
                { error: "Only PDF files are supported" },
                { status: 400 }
            );
        }

        const bytes = new Uint8Array(await file.arrayBuffer());
        const loadingTask = getDocument({
            data: bytes,
            useSystemFonts: true,
            isEvalSupported: false,
            disableFontFace: true,
            useWorkerFetch: false,
        });
        const pdf = await loadingTask.promise;
        const pages: string[] = [];

        for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
            const page = await pdf.getPage(pageNo);
            const textContent = await page.getTextContent();
            const items = textContent.items as Array<{ str?: string }>;
            const pageText = items
                .map((item) => (item.str || "").trim())
                .filter(Boolean)
                .join(" ")
                .replace(/\s+/g, " ")
                .trim();
            pages.push(pageText);
        }

        return NextResponse.json({
            fileName: file.name,
            pageCount: pdf.numPages,
            pages,
        });
    } catch (error) {
        console.error("[PDF Extract] Error:", error);
        return NextResponse.json(
            { error: "Failed to parse PDF" },
            { status: 500 }
        );
    }
}
