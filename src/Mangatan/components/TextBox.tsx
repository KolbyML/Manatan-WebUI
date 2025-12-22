import React, { useRef, useState, useLayoutEffect } from 'react';
import { OcrBlock } from '@/Mangatan/types';
import { useOCR } from '@/Mangatan/context/OCRContext';
import { cleanPunctuation, lookupYomitan } from '@/Mangatan/utils/api';

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
    const { settings, mergeAnchor, setMergeAnchor, setDictPopup } = useOCR();
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

    // --- HELPER: Find Scroll Container ---
    const findScrollContainerFromImage = (src: string): HTMLElement | null => {
        const img = document.querySelector(`img[src="${src}"]`);
        if (!img) return null;
        let parent = img.parentElement;
        while (parent && parent !== document.body) {
            const style = window.getComputedStyle(parent);
            const canScrollY = (style.overflowY === 'auto' || style.overflowY === 'scroll') && parent.scrollHeight > parent.clientHeight;
            const canScrollX = (style.overflowX === 'auto' || style.overflowX === 'scroll') && parent.scrollWidth > parent.clientWidth;
            if (canScrollY || canScrollX) return parent;
            parent = parent.parentElement;
        }
        return null;
    };

    const handleWheel = (e: React.WheelEvent) => {
        if (isEditing) return;
        const containerFromImg = findScrollContainerFromImage(imgSrc);
        if (containerFromImg) {
            if (containerFromImg.scrollWidth > containerFromImg.clientWidth) {
                containerFromImg.scrollLeft += e.deltaY;
            } else {
                containerFromImg.scrollTop += e.deltaY;
            }
        }
    };

    const handleInteract = async (e: React.MouseEvent) => {
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
        } else {
            if (!settings.enableYomitan) return;

            // 1. Get Initial Char Offset (Browser Logic)
            let charOffset = 0;
            let range: Range | null = null;

            // Try standard API
            if (document.caretRangeFromPoint) {
                range = document.caretRangeFromPoint(e.clientX, e.clientY);
                if (range) charOffset = range.startOffset;
            } else if ((document as any).caretPositionFromPoint) {
                const pos = (document as any).caretPositionFromPoint(e.clientX, e.clientY);
                if (pos) charOffset = pos.offset;
            }

            // 2. CORRECTION LOGIC: Fix "Bottom Half" Clicks
            // If the browser says we are at index N, we check if the click was physically inside character N-1.
            // If so, we assume the user meant character N-1.
            if (range && range.startContainer.nodeType === Node.TEXT_NODE && charOffset > 0) {
                try {
                    const testRange = document.createRange();
                    // Select character BEFORE the cursor
                    testRange.setStart(range.startContainer, charOffset - 1);
                    testRange.setEnd(range.startContainer, charOffset);
                    
                    const rects = testRange.getClientRects();
                    // Check all rects (in case of wrapping, though unlikely for single char)
                    for (let i = 0; i < rects.length; i++) {
                        const rect = rects[i];
                        // Check if click point is inside this character's box
                        if (
                            e.clientX >= rect.left && 
                            e.clientX <= rect.right && 
                            e.clientY >= rect.top && 
                            e.clientY <= rect.bottom
                        ) {
                            // User clicked this character! Shift offset back to point at it.
                            charOffset -= 1;
                            break;
                        }
                    }
                } catch (err) {
                    // Fallback to default behavior if range manip fails
                }
            }

            let content = cleanPunctuation(block.text);
            content = content.replace(/\u200B/g, '\n');

            // 3. Calculate Byte Offset for Rust
            const encoder = new TextEncoder();
            const prefix = content.substring(0, charOffset);
            const byteIndex = encoder.encode(prefix).length;

            setDictPopup({
                visible: true,
                x: e.clientX,
                y: e.clientY,
                results: [],
                isLoading: true,
                systemLoading: false
            });

            // 4. Send Corrected Index
            const results = await lookupYomitan(content, byteIndex);

            if (results === 'loading') {
                 setDictPopup(prev => ({
                    ...prev,
                    results: [],
                    isLoading: false,
                    systemLoading: true
                }));
            } else {
                setDictPopup(prev => ({
                    ...prev,
                    results: results,
                    isLoading: false,
                    systemLoading: false
                }));
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
    let displayContent = isEditing ? block.text : cleanPunctuation(block.text);
    displayContent = displayContent.replace(/\u200B/g, '\n');

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
                if (raw !== displayContent) onUpdate(index, raw.replace(/\n/g, '\u200B'));
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
            {displayContent}
        </div>
    );
};