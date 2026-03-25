declare module "word-extractor" {
  export default class WordExtractor {
    extract(input: string | Buffer): Promise<{
      getBody(options?: { filterUnicode?: boolean }): string;
      getEndnotes(options?: { filterUnicode?: boolean }): string;
      getFootnotes(options?: { filterUnicode?: boolean }): string;
      getTextboxes(options?: {
        filterUnicode?: boolean;
        includeBody?: boolean;
        includeHeadersAndFooters?: boolean;
      }): string;
    }>;
  }
}
