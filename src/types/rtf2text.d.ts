declare module "rtf2text" {
  const rtf2text: {
    string(
      value: string,
      callback: (error: Error | null, text?: string) => void,
    ): void;
  };

  export default rtf2text;
}
