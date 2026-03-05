export class OCRService {
    static async readImageRegion(
        imageSrc: string,
        region: { x: number; y: number; width: number; height: number }
    ): Promise<string> {
        const [{ createWorker }, imageBitmap] = await Promise.all([
            import("tesseract.js"),
            OCRService.loadImageBitmap(imageSrc),
        ]);

        const safeWidth = Math.max(1, Math.round(region.width));
        const safeHeight = Math.max(1, Math.round(region.height));
        const safeX = Math.max(0, Math.round(region.x));
        const safeY = Math.max(0, Math.round(region.y));

        const canvas = document.createElement("canvas");
        canvas.width = safeWidth;
        canvas.height = safeHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
            throw new Error("Canvas context unavailable for OCR");
        }

        ctx.drawImage(
            imageBitmap,
            safeX,
            safeY,
            safeWidth,
            safeHeight,
            0,
            0,
            safeWidth,
            safeHeight
        );

        const worker = await createWorker("eng");
        try {
            const { data } = await worker.recognize(canvas);
            return String(data?.text || "").trim();
        } finally {
            await worker.terminate();
        }
    }

    private static async loadImageBitmap(src: string): Promise<HTMLImageElement> {
        return await new Promise<HTMLImageElement>((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = () => reject(new Error("Failed to load image for OCR"));
            image.src = src;
        });
    }
}
