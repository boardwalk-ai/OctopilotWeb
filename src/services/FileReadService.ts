import { SpoonieService } from "./SpoonieService";

const SUPPORTED_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"];
const SUPPORTED_IMAGE_MIME_PREFIXES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const PDF_WORKER_VERSION = "5.5.207";
const PDF_RENDER_SCALE = 1.5;

function hasSupportedExtension(fileName: string, extensions: string[]): boolean {
    const normalized = fileName.toLowerCase();
    return extensions.some((extension) => normalized.endsWith(extension));
}

export class FileReadService {
    static getAcceptedTypes(): string {
        return ".jpg,.jpeg,.png,.webp,.heic,.heif,.pdf";
    }

    static getSupportedTypeLabel(): string {
        return "JPG, PNG, WEBP, HEIC, or PDF";
    }

    static isPdfFile(file: File): boolean {
        return (file.type || "").toLowerCase().includes("pdf") || /\.pdf$/i.test(file.name || "");
    }

    static isImageFile(file: File): boolean {
        const mimeType = (file.type || "").toLowerCase();
        if (SUPPORTED_IMAGE_MIME_PREFIXES.some((prefix) => mimeType === prefix)) {
            return true;
        }

        return hasSupportedExtension(file.name || "", SUPPORTED_IMAGE_EXTENSIONS);
    }

    static validateFile(file: File | null): string | null {
        if (!file) {
            return "Select one file first.";
        }

        if (FileReadService.isPdfFile(file) || FileReadService.isImageFile(file)) {
            return null;
        }

        return `Only ${FileReadService.getSupportedTypeLabel()} files are supported.`;
    }

    static async extractText(file: File): Promise<string> {
        const validationError = FileReadService.validateFile(file);
        if (validationError) {
            throw new Error(validationError);
        }

        if (FileReadService.isPdfFile(file)) {
            const formData = new FormData();
            formData.append("file", file);

            const response = await fetch("/api/pdf/extract", {
                method: "POST",
                body: formData,
            });

            if (!response.ok) {
                const payload = await response.json().catch(() => ({}));
                throw new Error(payload.error || "Could not read PDF file.");
            }

            const payload = await response.json() as { pages?: string[] };
            return (payload.pages || []).join("\n\n").trim();
        }

        const imageDataUrl = await FileReadService.toDataUrl(file);
        return SpoonieService.extractImageText({ imageDataUrl });
    }

    static async extractPdfPagesAsImages(file: File): Promise<string[]> {
        const validationError = FileReadService.validateFile(file);
        if (validationError) {
            throw new Error(validationError);
        }

        if (!FileReadService.isPdfFile(file)) {
            throw new Error("Only PDF files can be sent as document pages.");
        }

        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        if (!pdfjs.GlobalWorkerOptions.workerSrc) {
            pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${PDF_WORKER_VERSION}/legacy/build/pdf.worker.min.mjs`;
        }

        const buffer = await file.arrayBuffer();
        const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer) });
        const pdf = await loadingTask.promise;
        const pageImages: string[] = [];

        try {
            for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
                const page = await pdf.getPage(pageNumber);
                const viewport = page.getViewport({ scale: PDF_RENDER_SCALE });
                const canvas = document.createElement("canvas");
                const context = canvas.getContext("2d");

                if (!context) {
                    throw new Error("Could not prepare PDF page rendering.");
                }

                canvas.width = Math.ceil(viewport.width);
                canvas.height = Math.ceil(viewport.height);

                await page.render({
                    canvas,
                    canvasContext: context,
                    viewport,
                }).promise;

                pageImages.push(canvas.toDataURL("image/png", 0.92));
                canvas.width = 0;
                canvas.height = 0;
                page.cleanup();
            }
        } finally {
            await loadingTask.destroy();
        }

        if (pageImages.length === 0) {
            throw new Error("Could not prepare the PDF for Zuly.");
        }

        return pageImages;
    }

    static async toDataUrl(file: File): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(new Error("Could not read the uploaded file."));
            reader.onload = () => {
                const result = reader.result;
                if (typeof result !== "string") {
                    reject(new Error("Could not read the uploaded file."));
                    return;
                }
                resolve(result);
            };
            reader.readAsDataURL(file);
        });
    }
}
