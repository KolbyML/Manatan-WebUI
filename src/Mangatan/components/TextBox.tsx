import React, { useRef, useState, useLayoutEffect } from 'react';
import { OcrBlock } from '@/Mangatan/types';
import { useOCR } from '@/Mangatan/context/OCRContext';
import { cleanPunctuation } from '@/Mangatan/utils/api';

const calculateFontSize = (text: string, w: number, h: number, isVertical: boolean, settings: any) => {
    const lines = text.split('\n');
    const lineCount = lines.length || 1;
    const maxLineLength = Math.max(...lines.map((l) => l.length)) || 1;
    let size = 16;
    const safeW = w * 0.85;
    const safeH = h * 0.85;

    if (isVertical) {
        const maxFontSizeByWidth = safeW / lineCount;
        const maxFontSizeByHeight = safeH / maxLineLength;
        size = Math.min(maxFontSizeByWidth, maxFontSizeByHeight);
        size *= settings.fontMultiplierVertical;
    } else {
        const maxFontSizeByHeight = safeH / lineCount;
        const maxFontSizeByWidth = safeW / maxLineLength;
        size = Math.min(maxFontSizeByHeight, maxFontSizeByWidth);
        size *= settings.fontMultiplierHorizontal;
    }
    return Math.max(10, Math.min(size, 200));
};

export const TextBox: React.FC<{
    block: OcrBlock;
    index: number;
    imgSrc: string;
    containerRect: DOMRect;
    onUpdate: (idx: number, txt: string) => void;
    onMerge: (src: number, target: number) => void;
    onDelete: (idx: number) => void;
}> = ({ block, index, imgSrc, containerRect, onUpdate, onMerge, onDelete }) => {
    const { settings, mergeAnchor, setMergeAnchor } = useOCR();
    const [isEditing, setIsEditing] = useState(false);
    const [fontSize, setFontSize] = useState(16);
    const ref = useRef<HTMLDivElement>(null);

    const isVertical =
        block.forcedOrientation === 'vertical' ||
        (settings.textOrientation === 'smart' && block.tightBoundingBox.height > block.tightBoundingBox.width * 1.5) ||
        settings.textOrientation === 'forceVertical';

    const adj = settings.boundingBoxAdjustment || 0;

    useLayoutEffect(() => {
        if (!ref.current) return;
        const pxW = block.tightBoundingBox.width * containerRect.width;
        const pxH = block.tightBoundingBox.height * containerRect.height;

        if (!isEditing) {
            const displayTxt = cleanPunctuation(block.text).replace(/\u200B/g, '\n');
            setFontSize(calculateFontSize(displayTxt, pxW + adj, pxH + adj, isVertical, settings));
        }
    }, [block, containerRect, settings, isEditing, isVertical]);

    // --- HELPER: Find Scroll Container from Image ---
    // This is the most robust method: Find the image this box belongs to, 
    // and find WHO is holding that image.
    const findScrollContainerFromImage = (src: string): HTMLElement | null => {
        // Find the image element in the DOM
        const img = document.querySelector(`img[src="${src}"]`);
        if (!img) return null;

        let parent = img.parentElement;
        while (parent && parent !== document.body) {
            const style = window.getComputedStyle(parent);
            // Check for explicit scroll settings
            if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && parent.scrollHeight > parent.clientHeight) {
                return parent;
            }
            parent = parent.parentElement;
        }
        return null;
    };

    // --- UPDATED: Handle Wheel Events ---
    const handleWheel = (e: React.WheelEvent) => {
        if (isEditing) return;

        // 1. Try to find the container based on the source image (Highest Accuracy)
        const containerFromImg = findScrollContainerFromImage(imgSrc);
        if (containerFromImg) {
            containerFromImg.scrollTop += e.deltaY;
            return;
        }

        // 2. Fallback: Bubbling search from cursor position
        // Useful if the image selector fails for some reason
        if (ref.current) {
            ref.current.style.pointerEvents = 'none';
            const elementUnder = document.elementFromPoint(e.clientX, e.clientY);
            ref.current.style.pointerEvents = '';

            let target = elementUnder;
            while (target && target !== document.body && target !== document.documentElement) {
                const el = target as HTMLElement;
                const style = window.getComputedStyle(el);
                
                if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && el.scrollHeight > el.clientHeight) {
                    el.scrollTop += e.deltaY;
                    return;
                }
                target = target.parentElement;
            }
        }
        
        // 3. NO WINDOW SCROLL FALLBACK
        // We explicitly do NOT call window.scrollBy here. 
        // This prevents the "scroll off page" glitch.
    };

    const handleInteract = (e: React.MouseEvent) => {
        const selection = window.getSelection();
        if (selection && !selection.isCollapsed) return;

        if (isEditing) return;
        e.stopPropagation();

        const isDelete = settings.deleteModifierKey === 'Alt' ? e.altKey : e.ctrlKey;
        const isMerge = settings.mergeModifierKey === 'Control' ? e.ctrlKey : e.altKey;

        if (isDelete) {
            e.preventDefault();
            onDelete(index);
        } else if (isMerge) {
            e.preventDefault();
            if (!mergeAnchor) setMergeAnchor({ imgSrc, index });
            else {
                if (mergeAnchor.imgSrc === imgSrc && mergeAnchor.index !== index) onMerge(mergeAnchor.index, index);
                setMergeAnchor(null);
            }
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (isEditing) return;
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsEditing(true);
        }
        if (e.key === 'Delete') {
            e.preventDefault();
            onDelete(index);
        }
    };

    const isMergedTarget = mergeAnchor?.imgSrc === imgSrc && mergeAnchor?.index === index;
    let content = isEditing ? block.text : cleanPunctuation(block.text);
    content = content.replace(/\u200B/g, '\n');

    return (
        <div
            ref={ref}
            role="button"
            tabIndex={0}
            onKeyDown={handleKeyDown}
            onWheel={handleWheel} 
            className={`gemini-ocr-text-box ${isVertical ? 'vertical' : ''} ${isEditing ? 'editing' : ''} ${isMergedTarget ? 'merge-target' : ''}`}
            contentEditable={isEditing}
            suppressContentEditableWarning
            onDoubleClick={() => setIsEditing(true)}
            onBlur={() => {
                setIsEditing(false);
                const raw = ref.current?.innerText || '';
                if (raw !== content) onUpdate(index, raw.replace(/\n/g, '\u200B'));
            }}
            onClick={handleInteract}
            style={{
                left: `calc(${block.tightBoundingBox.x * 100}% - ${adj / 2}px)`,
                top: `calc(${block.tightBoundingBox.y * 100}% - ${adj / 2}px)`,
                width: `calc(${block.tightBoundingBox.width * 100}% + ${adj}px)`,
                height: `calc(${block.tightBoundingBox.height * 100}% + ${adj}px)`,
                fontSize: `${fontSize}px`,
                color: settings.focusFontColor === 'difference' ? 'white' : 'var(--ocr-text-color)',
                mixBlendMode: settings.focusFontColor === 'difference' ? 'difference' : 'normal',
                whiteSpace: 'pre',
                overflow: isEditing ? 'auto' : 'hidden', 
                touchAction: 'pan-y', 
            }}
        >
            {content}
        </div>
    );
};
