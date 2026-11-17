declare module "bidi-js" {
  export interface BidiEngine {
    getEmbeddingLevels(text: string, direction: "ltr" | "rtl"): unknown;
    getReorderedString(text: string, levels: unknown): string;
  }
  export default function bidiFactory(): BidiEngine;
}
