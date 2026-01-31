import type { DictionaryResult, WordAudioSource, WordAudioSourceSelection, YomitanLanguage } from '@/Manatan/types';

type LanguageSummary = {
    iso: string;
    iso639_3: string;
    pod101Name?: string;
};

const LANGUAGE_SUMMARIES: Record<YomitanLanguage, LanguageSummary> = {
    japanese: { iso: 'ja', iso639_3: 'jpn', pod101Name: 'Japanese' },
    english: { iso: 'en', iso639_3: 'eng', pod101Name: 'English' },
    chinese: { iso: 'zh', iso639_3: 'zho', pod101Name: 'Chinese' },
    korean: { iso: 'ko', iso639_3: 'kor', pod101Name: 'Korean' },
    arabic: { iso: 'ar', iso639_3: 'ara', pod101Name: 'Arabic' },
    spanish: { iso: 'es', iso639_3: 'spa', pod101Name: 'Spanish' },
    french: { iso: 'fr', iso639_3: 'fra', pod101Name: 'French' },
    german: { iso: 'de', iso639_3: 'deu', pod101Name: 'German' },
    portuguese: { iso: 'pt', iso639_3: 'por', pod101Name: 'Portuguese' },
    bulgarian: { iso: 'bg', iso639_3: 'bul', pod101Name: 'Bulgarian' },
    czech: { iso: 'cs', iso639_3: 'ces', pod101Name: 'Czech' },
    danish: { iso: 'da', iso639_3: 'dan', pod101Name: 'Danish' },
    greek: { iso: 'el', iso639_3: 'ell', pod101Name: 'Greek' },
    estonian: { iso: 'et', iso639_3: 'est' },
    persian: { iso: 'fa', iso639_3: 'fas', pod101Name: 'Persian' },
    finnish: { iso: 'fi', iso639_3: 'fin', pod101Name: 'Finnish' },
    hebrew: { iso: 'he', iso639_3: 'heb', pod101Name: 'Hebrew' },
    hindi: { iso: 'hi', iso639_3: 'hin', pod101Name: 'Hindi' },
    hungarian: { iso: 'hu', iso639_3: 'hun', pod101Name: 'Hungarian' },
    indonesian: { iso: 'id', iso639_3: 'ind', pod101Name: 'Indonesian' },
    italian: { iso: 'it', iso639_3: 'ita', pod101Name: 'Italian' },
    latin: { iso: 'la', iso639_3: 'lat' },
    lao: { iso: 'lo', iso639_3: 'lao' },
    latvian: { iso: 'lv', iso639_3: 'lav' },
    georgian: { iso: 'ka', iso639_3: 'kat' },
    kannada: { iso: 'kn', iso639_3: 'kan' },
    khmer: { iso: 'km', iso639_3: 'khm' },
    mongolian: { iso: 'mn', iso639_3: 'mon' },
    maltese: { iso: 'mt', iso639_3: 'mlt' },
    dutch: { iso: 'nl', iso639_3: 'nld', pod101Name: 'Dutch' },
    norwegian: { iso: 'no', iso639_3: 'nor', pod101Name: 'Norwegian' },
    polish: { iso: 'pl', iso639_3: 'pol', pod101Name: 'Polish' },
    romanian: { iso: 'ro', iso639_3: 'ron', pod101Name: 'Romanian' },
    russian: { iso: 'ru', iso639_3: 'rus', pod101Name: 'Russian' },
    swedish: { iso: 'sv', iso639_3: 'swe', pod101Name: 'Swedish' },
    thai: { iso: 'th', iso639_3: 'tha', pod101Name: 'Thai' },
    tagalog: { iso: 'tl', iso639_3: 'tgl', pod101Name: 'Filipino' },
    turkish: { iso: 'tr', iso639_3: 'tur', pod101Name: 'Turkish' },
    ukrainian: { iso: 'uk', iso639_3: 'ukr' },
    vietnamese: { iso: 'vi', iso639_3: 'vie', pod101Name: 'Vietnamese' },
    welsh: { iso: 'cy', iso639_3: 'cym' },
    cantonese: { iso: 'yue', iso639_3: 'yue', pod101Name: 'Cantonese' },
};

const WORD_AUDIO_SOURCE_LABELS: Record<WordAudioSource, string> = {
    'jpod101': 'JapanesePod101',
    'language-pod-101': 'LanguagePod101',
    'jisho': 'Jisho',
    'lingua-libre': 'Lingua Libre',
    'wiktionary': 'Wiktionary',
};

const LANGUAGE_POD_101_POD_LANGS = new Set([
    'Afrikaans',
    'Arabic',
    'Bulgarian',
    'Dutch',
    'Filipino',
    'Finnish',
    'French',
    'German',
    'Greek',
    'Hebrew',
    'Hindi',
    'Hungarian',
    'Indonesian',
    'Italian',
    'Japanese',
    'Persian',
    'Polish',
    'Portuguese',
    'Romanian',
    'Russian',
    'Spanish',
    'Swahili',
    'Swedish',
    'Thai',
    'Urdu',
    'Vietnamese',
]);

const LANGUAGE_POD_101_CLASS_LANGS = new Set([
    'Cantonese',
    'Chinese',
    'Czech',
    'Danish',
    'English',
    'Korean',
    'Norwegian',
    'Turkish',
]);

const audioUrlCache = new Map<string, Promise<string | null>>();

let sharedAudio: HTMLAudioElement | null = null;
let clickAudioContext: AudioContext | null = null;

const getLanguageSummary = (language?: YomitanLanguage): LanguageSummary | null => {
    const resolved = language || 'japanese';
    return LANGUAGE_SUMMARIES[resolved] || null;
};

const isStringEntirelyKana = (text: string): boolean =>
    text.length > 0 && Array.from(text).every((char) => {
        const code = char.codePointAt(0) as number;
        return (code >= 0x3040 && code <= 0x30ff) || (code >= 0x31f0 && code <= 0x31ff) || code === 0x30fc;
    });

const normalizeUrl = (url: string, base: string): string => new URL(url, base).href;

const getLanguagePod101FetchUrl = (languageName: string): string => {
    const lower = languageName.toLowerCase();
    const podOrClass = LANGUAGE_POD_101_POD_LANGS.has(languageName)
        ? 'pod'
        : LANGUAGE_POD_101_CLASS_LANGS.has(languageName)
            ? 'class'
            : null;
    if (!podOrClass) {
        throw new Error('Unsupported LanguagePod101 language');
    }
    return `https://www.${lower}${podOrClass}101.com/learningcenter/reference/dictionary_post`;
};

const getJpod101Url = (term: string, reading: string): string => {
    let finalTerm = term;
    let finalReading = reading;
    if (reading === term && isStringEntirelyKana(term)) {
        finalReading = term;
        finalTerm = '';
    }

    const params = new URLSearchParams();
    if (finalTerm) {
        params.set('kanji', finalTerm);
    }
    if (finalReading) {
        params.set('kana', finalReading);
    }
    return `https://assets.languagepod101.com/dictionary/japanese/audiomp3.php?${params.toString()}`;
};

const getLanguagePod101Urls = async (
    term: string,
    reading: string,
    languageSummary: LanguageSummary,
): Promise<string[]> => {
    if (!languageSummary.pod101Name) {
        return [];
    }
    const fetchUrl = getLanguagePod101FetchUrl(languageSummary.pod101Name);
    const data = new URLSearchParams({
        post: 'dictionary_reference',
        match_type: 'exact',
        search_query: term,
        vulgar: 'true',
    });
    const response = await fetch(fetchUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: data,
    });
    const responseText = await response.text();
    const dom = new DOMParser().parseFromString(responseText, 'text/html');
    const rows = Array.from(dom.getElementsByClassName('dc-result-row'));
    const urls = new Set<string>();

    rows.forEach((row) => {
        const audio = row.querySelector('audio');
        if (!audio) {
            return;
        }
        const source = audio.querySelector('source');
        if (!source) {
            return;
        }
        const src = source.getAttribute('src');
        if (!src) {
            return;
        }

        if (languageSummary.pod101Name === 'Japanese') {
            const readingEl = row.querySelector('.dc-vocab_kana');
            const htmlReading = readingEl?.textContent?.trim() || '';
            if (reading && reading !== term && reading !== htmlReading) {
                return;
            }
        } else {
            const vocab = row.querySelector('.dc-vocab');
            const htmlTerm = vocab?.textContent?.trim() || '';
            if (htmlTerm && htmlTerm !== term) {
                return;
            }
        }

        urls.add(normalizeUrl(src, response.url));
    });

    return Array.from(urls);
};

const getJishoUrls = async (term: string, reading: string): Promise<string[]> => {
    const response = await fetch(`https://jisho.org/search/${encodeURIComponent(term)}`);
    const responseText = await response.text();
    const dom = new DOMParser().parseFromString(responseText, 'text/html');
    const audioId = `audio_${term}:${reading}`;
    const audio = dom.getElementById(audioId);
    if (!audio) {
        return [];
    }
    const source = audio.querySelector('source');
    if (!source) {
        return [];
    }
    const src = source.getAttribute('src');
    if (!src) {
        return [];
    }
    return [normalizeUrl(src, response.url)];
};

type WikimediaFileInfo = { url: string; name?: string };

const fetchWikimediaAudioUrls = async (
    searchUrl: string,
    validateFilename: (filename: string, fileUser: string) => boolean,
    displayName?: (filename: string, fileUser: string) => string,
): Promise<WikimediaFileInfo[]> => {
    const response = await fetch(searchUrl);
    if (!response.ok) {
        return [];
    }
    const lookupResponse = await response.json();
    const lookupResults = lookupResponse?.query?.search || [];
    if (!Array.isArray(lookupResults)) {
        return [];
    }

    const fileInfos = await Promise.all(
        lookupResults.map(async ({ title }: { title: string }) => {
            const fileInfoUrl = `https://commons.wikimedia.org/w/api.php?action=query&format=json&titles=${title}&prop=imageinfo&iiprop=user|url&origin=*`;
            const response2 = await fetch(fileInfoUrl);
            if (!response2.ok) {
                return [] as WikimediaFileInfo[];
            }
            const fileResponse = await response2.json();
            const fileResults = fileResponse?.query?.pages || {};
            const results: WikimediaFileInfo[] = [];
            Object.values(fileResults).forEach((page: any) => {
                const fileUrl = page?.imageinfo?.[0]?.url;
                const fileUser = page?.imageinfo?.[0]?.user;
                if (!fileUrl || !fileUser) {
                    return;
                }
                if (validateFilename(title, fileUser)) {
                    const name = displayName ? displayName(title, fileUser) : undefined;
                    results.push({ url: fileUrl, name });
                }
            });
            return results;
        }),
    );

    return fileInfos.flat();
};

const getLinguaLibreUrls = async (term: string, languageSummary: LanguageSummary): Promise<string[]> => {
    const searchCategory = `incategory:"Lingua_Libre_pronunciation-${languageSummary.iso639_3}"`;
    const searchString = `-${term}.wav`;
    const fetchUrl = `https://commons.wikimedia.org/w/api.php?action=query&format=json&list=search&srsearch=intitle:/${searchString}/i+${searchCategory}&srnamespace=6&origin=*`;
    const validateFilename = (filename: string, fileUser: string) => {
        const regex = new RegExp(`^File:LL-Q\\d+\\s+\\(${languageSummary.iso639_3}\\)-${fileUser}-${term}\\.wav$`, 'i');
        return regex.test(filename);
    };
    const results = await fetchWikimediaAudioUrls(fetchUrl, validateFilename);
    return results.map((result) => result.url);
};

const getWiktionaryUrls = async (term: string, languageSummary: LanguageSummary): Promise<string[]> => {
    const searchString = `${languageSummary.iso}(-[a-zA-Z]{2})?-${term}[0123456789]*.ogg`;
    const fetchUrl = `https://commons.wikimedia.org/w/api.php?action=query&format=json&list=search&srsearch=intitle:/${searchString}/i&srnamespace=6&origin=*`;
    const validateFilename = (filename: string) => {
        const regex = new RegExp(`^File:${languageSummary.iso}(-\\w\\w)?-${term}\\d*\\.ogg$`, 'i');
        return regex.test(filename);
    };
    const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
    const displayName = (filename: string, fileUser: string) => {
        const match = filename.match(new RegExp(`^File:${languageSummary.iso}(-\\w\\w)-${term}`, 'i'));
        if (!match) {
            return fileUser;
        }
        const region = match[1].substring(1).toUpperCase();
        const regionName = regionNames.of(region);
        return `(${regionName}) ${fileUser}`;
    };
    const results = await fetchWikimediaAudioUrls(fetchUrl, validateFilename, displayName);
    return results.map((result) => result.url);
};

const getAudioUrlForSource = async (
    source: WordAudioSource,
    term: string,
    reading: string,
    languageSummary: LanguageSummary,
): Promise<string | null> => {
    const cacheKey = `${source}|${languageSummary.iso}|${term}|${reading}`;
    const cached = audioUrlCache.get(cacheKey);
    if (cached) {
        return cached;
    }
    const promise = (async () => {
        try {
            switch (source) {
                case 'jpod101':
                    return getJpod101Url(term, reading);
                case 'language-pod-101': {
                    const urls = await getLanguagePod101Urls(term, reading, languageSummary);
                    return urls[0] || null;
                }
                case 'jisho': {
                    const urls = await getJishoUrls(term, reading);
                    return urls[0] || null;
                }
                case 'lingua-libre': {
                    const urls = await getLinguaLibreUrls(term, languageSummary);
                    return urls[0] || null;
                }
                case 'wiktionary': {
                    const urls = await getWiktionaryUrls(term, languageSummary);
                    return urls[0] || null;
                }
                default:
                    return null;
            }
        } catch (error) {
            return null;
        }
    })();
    audioUrlCache.set(cacheKey, promise);
    return promise;
};

const getSharedAudio = (): HTMLAudioElement => {
    if (!sharedAudio) {
        sharedAudio = new Audio();
    }
    return sharedAudio;
};

export const playAudioFailClick = (): void => {
    if (typeof window === 'undefined') {
        return;
    }
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) {
        return;
    }
    if (!clickAudioContext) {
        clickAudioContext = new AudioContextClass();
    }
    const context = clickAudioContext;
    if (context.state === 'suspended') {
        context.resume().catch(() => undefined);
    }
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'triangle';
    oscillator.frequency.value = 1000;
    const now = context.currentTime;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.06);
};

const tryPlayAudioUrl = (url: string): Promise<boolean> =>
    new Promise((resolve) => {
        const audio = getSharedAudio();
        let settled = false;

        const cleanup = () => {
            audio.oncanplaythrough = null;
            audio.onerror = null;
        };

        audio.onerror = () => {
            if (settled) {
                return;
            }
            settled = true;
            cleanup();
            resolve(false);
        };

        audio.oncanplaythrough = () => {
            audio
                .play()
                .then(() => {
                    if (settled) {
                        return;
                    }
                    settled = true;
                    cleanup();
                    resolve(true);
                })
                .catch(() => {
                    if (settled) {
                        return;
                    }
                    settled = true;
                    cleanup();
                    resolve(false);
                });
        };

        audio.src = url;
        audio.load();
    });

export const getWordAudioSourceOptions = (language?: YomitanLanguage): WordAudioSource[] => {
    const summary = getLanguageSummary(language);
    if (!summary) {
        return [];
    }
    return summary.iso === 'ja'
        ? ['jpod101', 'language-pod-101', 'jisho']
        : ['lingua-libre', 'language-pod-101', 'wiktionary'];
};

export const getWordAudioSourceLabel = (source: WordAudioSource): string => WORD_AUDIO_SOURCE_LABELS[source];

export const resolveWordAudioUrl = async (
    entry: DictionaryResult,
    language: YomitanLanguage | undefined,
    selection: WordAudioSourceSelection = 'auto',
): Promise<{ source: WordAudioSource; url: string } | null> => {
    const summary = getLanguageSummary(language);
    if (!summary) {
        return null;
    }
    const term = entry.headword || '';
    const reading = entry.reading || '';
    const sources = selection === 'auto' ? getWordAudioSourceOptions(language) : [selection];
    for (const source of sources) {
        const url = await getAudioUrlForSource(source, term, reading, summary);
        if (url) {
            return { source, url };
        }
    }
    return null;
};

export const playWordAudio = async (
    entry: DictionaryResult,
    language: YomitanLanguage | undefined,
    selection: WordAudioSourceSelection = 'auto',
): Promise<WordAudioSource | null> => {
    const summary = getLanguageSummary(language);
    if (!summary) {
        return null;
    }
    const term = entry.headword || '';
    const reading = entry.reading || '';
    const sources = selection === 'auto' ? getWordAudioSourceOptions(language) : [selection];
    for (const source of sources) {
        const url = await getAudioUrlForSource(source, term, reading, summary);
        if (!url) {
            continue;
        }
        const played = await tryPlayAudioUrl(url);
        if (played) {
            return source;
        }
    }
    return null;
};

export const getWordAudioFilename = (url: string): string => {
    const cleaned = url.split('?')[0];
    const match = cleaned.match(/\.([a-z0-9]+)$/i);
    const extension = match ? match[1] : 'mp3';
    return `manatan_word_${Date.now()}.${extension}`;
};
