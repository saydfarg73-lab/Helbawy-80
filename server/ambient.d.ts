declare module 'arabic-reshaper' {
  const ArabicReshaper: {
    convertArabic(text: string): string;
    convertArabicBack(text: string): string;
  };
  export default ArabicReshaper;
}

declare module 'bidi-js' {
  interface BidiInstance {
    getEmbeddingLevels(text: string, direction?: 'ltr' | 'rtl' | 'auto'): {
      levels: Uint8Array;
      paragraphs: Array<{ start: number; end: number; level: number }>;
    };
    getReorderedString(
      text: string,
      embeddingLevels: { levels: Uint8Array; paragraphs: Array<{ start: number; end: number; level: number }> }
    ): string;
  }
  export default function bidiFactory(): BidiInstance;
}
