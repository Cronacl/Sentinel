declare module "bun:test" {
  export const afterEach: (...args: any[]) => any;
  export const beforeEach: (...args: any[]) => any;
  export const describe: (...args: any[]) => any;
  export const expect: any;
  export const it: (...args: any[]) => any;
  export const mock: any;
}
