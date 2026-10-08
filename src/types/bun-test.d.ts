declare module "bun:test" {
  type TestFn = (...args: any[]) => any;
  type TestApi = TestFn & {
    each: (...args: any[]) => TestFn;
    if: (condition: boolean) => TestFn;
    only: TestFn;
    skip: TestFn;
    skipIf: (condition: boolean) => TestFn;
    todo: TestFn;
  };

  export const afterAll: (...args: any[]) => any;
  export const afterEach: (...args: any[]) => any;
  export const beforeAll: (...args: any[]) => any;
  export const beforeEach: (...args: any[]) => any;
  export const describe: TestApi;
  export const expect: any;
  export const it: TestApi;
  export const jest: any;
  export const mock: any;
  export const setSystemTime: (...args: any[]) => any;
  export const spyOn: any;
  export const test: TestApi;
}
