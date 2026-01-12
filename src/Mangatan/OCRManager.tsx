import React, { useState, useEffect, useRef } from 'react';
import { useReaderSettingsStore, useReaderPagesStore } from '@/features/reader/stores/ReaderStore.ts';
import { useMangaObserver } from './hooks/useMangaObserver';
import { ImageOverlay } from './components/ImageOverlay';
import { SettingsModal } from './components/SettingsModal';
import { ChapterListInjector } from './components/ChapterListInjector'; 
import { YomitanPopup } from './components/YomitanPopup'; 
import { useOCR } from './context/OCRContext';
import { GlobalDialog } from './components/GlobalDialog';
import { getAppVersion, checkForUpdates, triggerAppUpdate } from './utils/api';
import { ReadingDirection, ReadingMode } from '@/features/reader/Reader.types.ts';

const PUCK_SIZE = 50; 
const STORAGE_KEY = 'mangatan_ocr_puck_pos';

export const OCRManager = () => {
    const images = useMangaObserver(); 
    // FIX: Destructure showDialog and showAlert here so they are available to use
    const { settings, setDictPopup, showDialog, showAlert } = useOCR();
    const [showSettings, setShowSettings] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);

    const [puckPos, setPuckPos] = useState<{x: number, y: number} | null>(null);
    const isDragging = useRef(false);
    const dragStart = useRef({ x: 0, y: 0 });
    const initialPuckPos = useRef({ x: 0, y: 0 });

    const pages = useReaderPagesStore((state) => state.pages.pages);
    const { readingMode, readingDirection } = useReaderSettingsStore((state) => ({
        readingMode: state.settings.readingMode.value,
        readingDirection: state.settings.readingDirection.value
    }));

    const getSpreadData = (imgSrc: string) => {
        if (!pages || pages.length === 0) return undefined;
        if (readingMode !== ReadingMode.DOUBLE_PAGE) return undefined;

        const page = pages.find(p =>
            imgSrc.includes(p.primary.url) || (p.secondary && imgSrc.includes(p.secondary.url))
        );

        if (!page || !page.secondary) return undefined;

        const p1 = page.primary; 
        const p2 = page.secondary; 

        const isRTL = readingDirection === ReadingDirection.RTL;

        if (isRTL) {
            return { leftSrc: p2.url, rightSrc: p1.url };
        } else {
            return { leftSrc: p1.url, rightSrc: p2.url };
        }
    };

    // --- AUTO-UPDATE CHECK (Android Only) ---
    useEffect(() => {
        const check = async () => {
            // Check if running on Android
            const isAndroid = /Android/i.test(navigator.userAgent);
            if (!isAndroid) return;

            // Get Current Version & Variant (Browser vs Native)
            const info = await getAppVersion();
            if (!info || info.version === '0.0.0' || info.variant === 'unknown') return; 

            // Check GitHub for the specific APK variant
            const update = await checkForUpdates(info.version, info.variant);
            
            if (update.hasUpdate) {
                showDialog({
                    type: 'confirm',
                    title: 'Update Available',
                    message: (
                        <div>
                            <p>Version <b>{update.version}</b> is available.</p>
                            <p style={{ margin: '15px 0', fontSize: '0.9em' }}>
                                <a 
                                    href={update.releaseUrl} 
                                    target="_blank" 
                                    rel="noreferrer" 
                                    style={{ color: 'var(--ocr-accent)', textDecoration: 'underline' }}
                                >
                                    View Change Log (GitHub)
                                </a>
                            </p>
                        </div>
                    ),
                    // Use @ts-ignore to bypass strict type check for custom props until types are updated
                    // @ts-ignore 
                    confirmText: 'Download',
                    cancelText: 'Cancel',
                    onConfirm: async () => {
                        try {
                            if (update.url && update.name) {
                                await triggerAppUpdate(update.url, update.name);
                                showAlert('Downloading', 'The update is downloading in the background.\nPlease check your notification tray.');
                            }
                        } catch (e) {
                            showAlert('Error', 'Failed to start download.');
                        }
                    }
                });
            }
        };
        
        check();
    }, [showDialog, showAlert]); // Dependencies added

    // URL Watcher (Reader Mode Toggle)
    useEffect(() => {
        const checkUrl = () => {
            const isReader = window.location.href.includes('/chapter/');
            if (isReader) {
                document.documentElement.classList.add('ocr-reader-mode');
            } else {
                document.documentElement.classList.remove('ocr-reader-mode');
            }
        };

        checkUrl();
        const interval = setInterval(checkUrl, 500);
        return () => {
            clearInterval(interval);
            document.documentElement.classList.remove('ocr-reader-mode');
        };
    }, []);

    // Resize Handler
    useEffect(() => {
        const handleResize = () => {
            setRefreshKey(prev => prev + 1);
            setPuckPos(prev => {
                if (!prev) return null;
                const maxX = window.innerWidth - PUCK_SIZE;
                const maxY = window.innerHeight - PUCK_SIZE;
                return { x: Math.min(prev.x, maxX), y: Math.min(prev.y, maxY) };
            });
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Load Puck Position
    useEffect(() => {
        if (!settings.mobileMode) return;
        const loadPos = () => {
            try {
                const saved = localStorage.getItem(STORAGE_KEY);
                if (saved) {
                    const parsed = JSON.parse(saved);
                    const maxX = window.innerWidth - PUCK_SIZE;
                    const maxY = window.innerHeight - PUCK_SIZE;
                    return { x: Math.min(Math.max(0, parsed.x), maxX), y: Math.min(Math.max(0, parsed.y), maxY) };
                }
            } catch (e) { /* ignore */ }
            return { x: window.innerWidth - 20 - PUCK_SIZE, y: window.innerHeight - 60 - PUCK_SIZE };
        };
        setPuckPos(loadPos());
    }, [settings.mobileMode]);

    const handleTouchStart = (e: React.TouchEvent) => {
        if (!settings.mobileMode || !puckPos) return;
        isDragging.current = false;
        dragStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        initialPuckPos.current = { ...puckPos };
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (!settings.mobileMode || !puckPos) return;
        const dx = e.touches[0].clientX - dragStart.current.x;
        const dy = e.touches[0].clientY - dragStart.current.y;
        if (Math.abs(dx) > 5 || Math.abs(dy) > 5) isDragging.current = true;

        let newX = initialPuckPos.current.x + dx;
        let newY = initialPuckPos.current.y + dy;
        const maxX = window.innerWidth - PUCK_SIZE;
        const maxY = window.innerHeight - PUCK_SIZE;
        newX = Math.max(0, Math.min(newX, maxX));
        newY = Math.max(0, Math.min(newY, maxY));
        setPuckPos({ x: newX, y: newY });
    };

    const handleTouchEnd = () => {
        if (settings.mobileMode && puckPos) localStorage.setItem(STORAGE_KEY, JSON.stringify(puckPos));
    };

    const handlePuckClick = (e: React.MouseEvent) => {
        if (settings.mobileMode && isDragging.current) {
            e.preventDefault();
            e.stopPropagation();
            isDragging.current = false; 
            return;
        }
        setDictPopup(prev => ({ ...prev, visible: false }));
        setShowSettings(true);
    };

    const controlsStyle: React.CSSProperties = (settings.mobileMode && puckPos) 
        ? { left: `${puckPos.x}px`, top: `${puckPos.y}px`, bottom: 'auto', right: 'auto', transform: 'none', touchAction: 'none' }
        : {};

    return (
        <>
            <ChapterListInjector />
            <GlobalDialog />
            
            {images.map(img => (
                <ImageOverlay key={`${img.src}-${refreshKey}`} img={img} spreadData={getSpreadData(img.src)} />
            ))}
            
            <YomitanPopup />

            <div 
                className="ocr-controls"
                style={controlsStyle}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
            >
                <button type="button" onClick={handlePuckClick}>⚙️</button>
            </div>

            {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
        </>
    );
};