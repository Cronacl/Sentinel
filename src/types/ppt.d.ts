declare module "ppt" {
  const PPT: {
    readFile(path: string): unknown;
    utils: {
      to_text(value: unknown): string[];
    };
  };

  export default PPT;
}
