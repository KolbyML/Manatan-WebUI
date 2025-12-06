import { useEffect, useState } from 'react';
import { useOCR } from '@/Mangatan/context/OCRContext';

export const useMangaObserver = () => {
    const { settings } = useOCR();
    const [images, setImages] = useState<HTMLImageElement[]>([]);

    useEffect(() => {
        // FIX: Use destructuring to satisfy prefer-destructuring
        const { imageContainerSelectors: selectors } = settings.site;

        const scan = () => {
            const found: HTMLImageElement[] = [];

            // 1. Try Configured Selectors
            selectors.forEach((sel) => {
                const nodes = document.querySelectorAll(sel);
                nodes.forEach((node) => {
                    if (node instanceof HTMLImageElement) found.push(node);
                    else node.querySelectorAll('img').forEach((img) => found.push(img));
                });
            });

            // 2. Fallback Heuristic (for Suwayomi)
            if (found.length === 0) {
                document.querySelectorAll('img[src*="/chapter/"]').forEach((img) => {
                    if (img instanceof HTMLImageElement && img.naturalHeight > 400) found.push(img);
                });
            }

            const unique = Array.from(new Set(found)).filter((img) => img.naturalHeight > 200 && img.isConnected);

            setImages((prev) => {
                if (prev.length === unique.length && prev.every((img, i) => img.src === unique[i].src)) return prev;
                return unique;
            });
        };

        scan();

        const observer = new MutationObserver((mutations) => {
            if (mutations.some((m) => m.addedNodes.length > 0 || m.attributeName === 'src')) scan();
        });

        observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });

        return () => observer.disconnect();
    }, [settings.site, settings.debugMode]);

    return images;
};
