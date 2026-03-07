
/**
 * Client
**/

import * as runtime from './runtime/library.js';
import $Types = runtime.Types // general types
import $Public = runtime.Types.Public
import $Utils = runtime.Types.Utils
import $Extensions = runtime.Types.Extensions
import $Result = runtime.Types.Result

export type PrismaPromise<T> = $Public.PrismaPromise<T>


/**
 * Model User
 * 
 */
export type User = $Result.DefaultSelection<Prisma.$UserPayload>
/**
 * Model Workspace
 * 
 */
export type Workspace = $Result.DefaultSelection<Prisma.$WorkspacePayload>
/**
 * Model Thread
 * 
 */
export type Thread = $Result.DefaultSelection<Prisma.$ThreadPayload>
/**
 * Model ThreadMessage
 * 
 */
export type ThreadMessage = $Result.DefaultSelection<Prisma.$ThreadMessagePayload>
/**
 * Model ProviderCredential
 * 
 */
export type ProviderCredential = $Result.DefaultSelection<Prisma.$ProviderCredentialPayload>
/**
 * Model ModelPreference
 * 
 */
export type ModelPreference = $Result.DefaultSelection<Prisma.$ModelPreferencePayload>

/**
 * Enums
 */
export namespace $Enums {
  export const AIProvider: {
  openai: 'openai',
  anthropic: 'anthropic',
  google: 'google',
  google_vertex: 'google_vertex'
};

export type AIProvider = (typeof AIProvider)[keyof typeof AIProvider]


export const PersonalityPreset: {
  friendly: 'friendly',
  pragmatic: 'pragmatic',
  analytical: 'analytical',
  mentor: 'mentor'
};

export type PersonalityPreset = (typeof PersonalityPreset)[keyof typeof PersonalityPreset]


export const ThemePreference: {
  light: 'light',
  dark: 'dark',
  system: 'system'
};

export type ThemePreference = (typeof ThemePreference)[keyof typeof ThemePreference]


export const ThreadListOrganizeBy: {
  workspace: 'workspace',
  chronological: 'chronological'
};

export type ThreadListOrganizeBy = (typeof ThreadListOrganizeBy)[keyof typeof ThreadListOrganizeBy]


export const ThreadListSortBy: {
  created: 'created',
  updated: 'updated'
};

export type ThreadListSortBy = (typeof ThreadListSortBy)[keyof typeof ThreadListSortBy]


export const ThreadMessageRole: {
  system: 'system',
  user: 'user',
  assistant: 'assistant'
};

export type ThreadMessageRole = (typeof ThreadMessageRole)[keyof typeof ThreadMessageRole]

}

export type AIProvider = $Enums.AIProvider

export const AIProvider: typeof $Enums.AIProvider

export type PersonalityPreset = $Enums.PersonalityPreset

export const PersonalityPreset: typeof $Enums.PersonalityPreset

export type ThemePreference = $Enums.ThemePreference

export const ThemePreference: typeof $Enums.ThemePreference

export type ThreadListOrganizeBy = $Enums.ThreadListOrganizeBy

export const ThreadListOrganizeBy: typeof $Enums.ThreadListOrganizeBy

export type ThreadListSortBy = $Enums.ThreadListSortBy

export const ThreadListSortBy: typeof $Enums.ThreadListSortBy

export type ThreadMessageRole = $Enums.ThreadMessageRole

export const ThreadMessageRole: typeof $Enums.ThreadMessageRole

/**
 * ##  Prisma Client ʲˢ
 *
 * Type-safe database client for TypeScript & Node.js
 * @example
 * ```
 * const prisma = new PrismaClient()
 * // Fetch zero or more Users
 * const users = await prisma.user.findMany()
 * ```
 *
 *
 * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client).
 */
export class PrismaClient<
  ClientOptions extends Prisma.PrismaClientOptions = Prisma.PrismaClientOptions,
  const U = 'log' extends keyof ClientOptions ? ClientOptions['log'] extends Array<Prisma.LogLevel | Prisma.LogDefinition> ? Prisma.GetEvents<ClientOptions['log']> : never : never,
  ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs
> {
  [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['other'] }

    /**
   * ##  Prisma Client ʲˢ
   *
   * Type-safe database client for TypeScript & Node.js
   * @example
   * ```
   * const prisma = new PrismaClient()
   * // Fetch zero or more Users
   * const users = await prisma.user.findMany()
   * ```
   *
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client).
   */

  constructor(optionsArg ?: Prisma.Subset<ClientOptions, Prisma.PrismaClientOptions>);
  $on<V extends U>(eventType: V, callback: (event: V extends 'query' ? Prisma.QueryEvent : Prisma.LogEvent) => void): PrismaClient;

  /**
   * Connect with the database
   */
  $connect(): $Utils.JsPromise<void>;

  /**
   * Disconnect from the database
   */
  $disconnect(): $Utils.JsPromise<void>;

/**
   * Executes a prepared raw query and returns the number of affected rows.
   * @example
   * ```
   * const result = await prisma.$executeRaw`UPDATE User SET cool = ${true} WHERE email = ${'user@email.com'};`
   * ```
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $executeRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: any[]): Prisma.PrismaPromise<number>;

  /**
   * Executes a raw query and returns the number of affected rows.
   * Susceptible to SQL injections, see documentation.
   * @example
   * ```
   * const result = await prisma.$executeRawUnsafe('UPDATE User SET cool = $1 WHERE email = $2 ;', true, 'user@email.com')
   * ```
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $executeRawUnsafe<T = unknown>(query: string, ...values: any[]): Prisma.PrismaPromise<number>;

  /**
   * Performs a prepared raw query and returns the `SELECT` data.
   * @example
   * ```
   * const result = await prisma.$queryRaw`SELECT * FROM User WHERE id = ${1} OR email = ${'user@email.com'};`
   * ```
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $queryRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: any[]): Prisma.PrismaPromise<T>;

  /**
   * Performs a raw query and returns the `SELECT` data.
   * Susceptible to SQL injections, see documentation.
   * @example
   * ```
   * const result = await prisma.$queryRawUnsafe('SELECT * FROM User WHERE id = $1 OR email = $2;', 1, 'user@email.com')
   * ```
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $queryRawUnsafe<T = unknown>(query: string, ...values: any[]): Prisma.PrismaPromise<T>;


  /**
   * Allows the running of a sequence of read/write operations that are guaranteed to either succeed or fail as a whole.
   * @example
   * ```
   * const [george, bob, alice] = await prisma.$transaction([
   *   prisma.user.create({ data: { name: 'George' } }),
   *   prisma.user.create({ data: { name: 'Bob' } }),
   *   prisma.user.create({ data: { name: 'Alice' } }),
   * ])
   * ```
   * 
   * Read more in our [docs](https://www.prisma.io/docs/concepts/components/prisma-client/transactions).
   */
  $transaction<P extends Prisma.PrismaPromise<any>[]>(arg: [...P], options?: { isolationLevel?: Prisma.TransactionIsolationLevel }): $Utils.JsPromise<runtime.Types.Utils.UnwrapTuple<P>>

  $transaction<R>(fn: (prisma: Omit<PrismaClient, runtime.ITXClientDenyList>) => $Utils.JsPromise<R>, options?: { maxWait?: number, timeout?: number, isolationLevel?: Prisma.TransactionIsolationLevel }): $Utils.JsPromise<R>


  $extends: $Extensions.ExtendsHook<"extends", Prisma.TypeMapCb<ClientOptions>, ExtArgs, $Utils.Call<Prisma.TypeMapCb<ClientOptions>, {
    extArgs: ExtArgs
  }>>

      /**
   * `prisma.user`: Exposes CRUD operations for the **User** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Users
    * const users = await prisma.user.findMany()
    * ```
    */
  get user(): Prisma.UserDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.workspace`: Exposes CRUD operations for the **Workspace** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Workspaces
    * const workspaces = await prisma.workspace.findMany()
    * ```
    */
  get workspace(): Prisma.WorkspaceDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.thread`: Exposes CRUD operations for the **Thread** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Threads
    * const threads = await prisma.thread.findMany()
    * ```
    */
  get thread(): Prisma.ThreadDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.threadMessage`: Exposes CRUD operations for the **ThreadMessage** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more ThreadMessages
    * const threadMessages = await prisma.threadMessage.findMany()
    * ```
    */
  get threadMessage(): Prisma.ThreadMessageDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.providerCredential`: Exposes CRUD operations for the **ProviderCredential** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more ProviderCredentials
    * const providerCredentials = await prisma.providerCredential.findMany()
    * ```
    */
  get providerCredential(): Prisma.ProviderCredentialDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.modelPreference`: Exposes CRUD operations for the **ModelPreference** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more ModelPreferences
    * const modelPreferences = await prisma.modelPreference.findMany()
    * ```
    */
  get modelPreference(): Prisma.ModelPreferenceDelegate<ExtArgs, ClientOptions>;
}

export namespace Prisma {
  export import DMMF = runtime.DMMF

  export type PrismaPromise<T> = $Public.PrismaPromise<T>

  /**
   * Validator
   */
  export import validator = runtime.Public.validator

  /**
   * Prisma Errors
   */
  export import PrismaClientKnownRequestError = runtime.PrismaClientKnownRequestError
  export import PrismaClientUnknownRequestError = runtime.PrismaClientUnknownRequestError
  export import PrismaClientRustPanicError = runtime.PrismaClientRustPanicError
  export import PrismaClientInitializationError = runtime.PrismaClientInitializationError
  export import PrismaClientValidationError = runtime.PrismaClientValidationError

  /**
   * Re-export of sql-template-tag
   */
  export import sql = runtime.sqltag
  export import empty = runtime.empty
  export import join = runtime.join
  export import raw = runtime.raw
  export import Sql = runtime.Sql



  /**
   * Decimal.js
   */
  export import Decimal = runtime.Decimal

  export type DecimalJsLike = runtime.DecimalJsLike

  /**
   * Metrics
   */
  export type Metrics = runtime.Metrics
  export type Metric<T> = runtime.Metric<T>
  export type MetricHistogram = runtime.MetricHistogram
  export type MetricHistogramBucket = runtime.MetricHistogramBucket

  /**
  * Extensions
  */
  export import Extension = $Extensions.UserArgs
  export import getExtensionContext = runtime.Extensions.getExtensionContext
  export import Args = $Public.Args
  export import Payload = $Public.Payload
  export import Result = $Public.Result
  export import Exact = $Public.Exact

  /**
   * Prisma Client JS version: 6.19.2
   * Query Engine version: c2990dca591cba766e3b7ef5d9e8a84796e47ab7
   */
  export type PrismaVersion = {
    client: string
  }

  export const prismaVersion: PrismaVersion

  /**
   * Utility Types
   */


  export import Bytes = runtime.Bytes
  export import JsonObject = runtime.JsonObject
  export import JsonArray = runtime.JsonArray
  export import JsonValue = runtime.JsonValue
  export import InputJsonObject = runtime.InputJsonObject
  export import InputJsonArray = runtime.InputJsonArray
  export import InputJsonValue = runtime.InputJsonValue

  /**
   * Types of the values used to represent different kinds of `null` values when working with JSON fields.
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  namespace NullTypes {
    /**
    * Type of `Prisma.DbNull`.
    *
    * You cannot use other instances of this class. Please use the `Prisma.DbNull` value.
    *
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class DbNull {
      private DbNull: never
      private constructor()
    }

    /**
    * Type of `Prisma.JsonNull`.
    *
    * You cannot use other instances of this class. Please use the `Prisma.JsonNull` value.
    *
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class JsonNull {
      private JsonNull: never
      private constructor()
    }

    /**
    * Type of `Prisma.AnyNull`.
    *
    * You cannot use other instances of this class. Please use the `Prisma.AnyNull` value.
    *
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class AnyNull {
      private AnyNull: never
      private constructor()
    }
  }

  /**
   * Helper for filtering JSON entries that have `null` on the database (empty on the db)
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const DbNull: NullTypes.DbNull

  /**
   * Helper for filtering JSON entries that have JSON `null` values (not empty on the db)
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const JsonNull: NullTypes.JsonNull

  /**
   * Helper for filtering JSON entries that are `Prisma.DbNull` or `Prisma.JsonNull`
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const AnyNull: NullTypes.AnyNull

  type SelectAndInclude = {
    select: any
    include: any
  }

  type SelectAndOmit = {
    select: any
    omit: any
  }

  /**
   * Get the type of the value, that the Promise holds.
   */
  export type PromiseType<T extends PromiseLike<any>> = T extends PromiseLike<infer U> ? U : T;

  /**
   * Get the return type of a function which returns a Promise.
   */
  export type PromiseReturnType<T extends (...args: any) => $Utils.JsPromise<any>> = PromiseType<ReturnType<T>>

  /**
   * From T, pick a set of properties whose keys are in the union K
   */
  type Prisma__Pick<T, K extends keyof T> = {
      [P in K]: T[P];
  };


  export type Enumerable<T> = T | Array<T>;

  export type RequiredKeys<T> = {
    [K in keyof T]-?: {} extends Prisma__Pick<T, K> ? never : K
  }[keyof T]

  export type TruthyKeys<T> = keyof {
    [K in keyof T as T[K] extends false | undefined | null ? never : K]: K
  }

  export type TrueKeys<T> = TruthyKeys<Prisma__Pick<T, RequiredKeys<T>>>

  /**
   * Subset
   * @desc From `T` pick properties that exist in `U`. Simple version of Intersection
   */
  export type Subset<T, U> = {
    [key in keyof T]: key extends keyof U ? T[key] : never;
  };

  /**
   * SelectSubset
   * @desc From `T` pick properties that exist in `U`. Simple version of Intersection.
   * Additionally, it validates, if both select and include are present. If the case, it errors.
   */
  export type SelectSubset<T, U> = {
    [key in keyof T]: key extends keyof U ? T[key] : never
  } &
    (T extends SelectAndInclude
      ? 'Please either choose `select` or `include`.'
      : T extends SelectAndOmit
        ? 'Please either choose `select` or `omit`.'
        : {})

  /**
   * Subset + Intersection
   * @desc From `T` pick properties that exist in `U` and intersect `K`
   */
  export type SubsetIntersection<T, U, K> = {
    [key in keyof T]: key extends keyof U ? T[key] : never
  } &
    K

  type Without<T, U> = { [P in Exclude<keyof T, keyof U>]?: never };

  /**
   * XOR is needed to have a real mutually exclusive union type
   * https://stackoverflow.com/questions/42123407/does-typescript-support-mutually-exclusive-types
   */
  type XOR<T, U> =
    T extends object ?
    U extends object ?
      (Without<T, U> & U) | (Without<U, T> & T)
    : U : T


  /**
   * Is T a Record?
   */
  type IsObject<T extends any> = T extends Array<any>
  ? False
  : T extends Date
  ? False
  : T extends Uint8Array
  ? False
  : T extends BigInt
  ? False
  : T extends object
  ? True
  : False


  /**
   * If it's T[], return T
   */
  export type UnEnumerate<T extends unknown> = T extends Array<infer U> ? U : T

  /**
   * From ts-toolbelt
   */

  type __Either<O extends object, K extends Key> = Omit<O, K> &
    {
      // Merge all but K
      [P in K]: Prisma__Pick<O, P & keyof O> // With K possibilities
    }[K]

  type EitherStrict<O extends object, K extends Key> = Strict<__Either<O, K>>

  type EitherLoose<O extends object, K extends Key> = ComputeRaw<__Either<O, K>>

  type _Either<
    O extends object,
    K extends Key,
    strict extends Boolean
  > = {
    1: EitherStrict<O, K>
    0: EitherLoose<O, K>
  }[strict]

  type Either<
    O extends object,
    K extends Key,
    strict extends Boolean = 1
  > = O extends unknown ? _Either<O, K, strict> : never

  export type Union = any

  type PatchUndefined<O extends object, O1 extends object> = {
    [K in keyof O]: O[K] extends undefined ? At<O1, K> : O[K]
  } & {}

  /** Helper Types for "Merge" **/
  export type IntersectOf<U extends Union> = (
    U extends unknown ? (k: U) => void : never
  ) extends (k: infer I) => void
    ? I
    : never

  export type Overwrite<O extends object, O1 extends object> = {
      [K in keyof O]: K extends keyof O1 ? O1[K] : O[K];
  } & {};

  type _Merge<U extends object> = IntersectOf<Overwrite<U, {
      [K in keyof U]-?: At<U, K>;
  }>>;

  type Key = string | number | symbol;
  type AtBasic<O extends object, K extends Key> = K extends keyof O ? O[K] : never;
  type AtStrict<O extends object, K extends Key> = O[K & keyof O];
  type AtLoose<O extends object, K extends Key> = O extends unknown ? AtStrict<O, K> : never;
  export type At<O extends object, K extends Key, strict extends Boolean = 1> = {
      1: AtStrict<O, K>;
      0: AtLoose<O, K>;
  }[strict];

  export type ComputeRaw<A extends any> = A extends Function ? A : {
    [K in keyof A]: A[K];
  } & {};

  export type OptionalFlat<O> = {
    [K in keyof O]?: O[K];
  } & {};

  type _Record<K extends keyof any, T> = {
    [P in K]: T;
  };

  // cause typescript not to expand types and preserve names
  type NoExpand<T> = T extends unknown ? T : never;

  // this type assumes the passed object is entirely optional
  type AtLeast<O extends object, K extends string> = NoExpand<
    O extends unknown
    ? | (K extends keyof O ? { [P in K]: O[P] } & O : O)
      | {[P in keyof O as P extends K ? P : never]-?: O[P]} & O
    : never>;

  type _Strict<U, _U = U> = U extends unknown ? U & OptionalFlat<_Record<Exclude<Keys<_U>, keyof U>, never>> : never;

  export type Strict<U extends object> = ComputeRaw<_Strict<U>>;
  /** End Helper Types for "Merge" **/

  export type Merge<U extends object> = ComputeRaw<_Merge<Strict<U>>>;

  /**
  A [[Boolean]]
  */
  export type Boolean = True | False

  // /**
  // 1
  // */
  export type True = 1

  /**
  0
  */
  export type False = 0

  export type Not<B extends Boolean> = {
    0: 1
    1: 0
  }[B]

  export type Extends<A1 extends any, A2 extends any> = [A1] extends [never]
    ? 0 // anything `never` is false
    : A1 extends A2
    ? 1
    : 0

  export type Has<U extends Union, U1 extends Union> = Not<
    Extends<Exclude<U1, U>, U1>
  >

  export type Or<B1 extends Boolean, B2 extends Boolean> = {
    0: {
      0: 0
      1: 1
    }
    1: {
      0: 1
      1: 1
    }
  }[B1][B2]

  export type Keys<U extends Union> = U extends unknown ? keyof U : never

  type Cast<A, B> = A extends B ? A : B;

  export const type: unique symbol;



  /**
   * Used by group by
   */

  export type GetScalarType<T, O> = O extends object ? {
    [P in keyof T]: P extends keyof O
      ? O[P]
      : never
  } : never

  type FieldPaths<
    T,
    U = Omit<T, '_avg' | '_sum' | '_count' | '_min' | '_max'>
  > = IsObject<T> extends True ? U : T

  type GetHavingFields<T> = {
    [K in keyof T]: Or<
      Or<Extends<'OR', K>, Extends<'AND', K>>,
      Extends<'NOT', K>
    > extends True
      ? // infer is only needed to not hit TS limit
        // based on the brilliant idea of Pierre-Antoine Mills
        // https://github.com/microsoft/TypeScript/issues/30188#issuecomment-478938437
        T[K] extends infer TK
        ? GetHavingFields<UnEnumerate<TK> extends object ? Merge<UnEnumerate<TK>> : never>
        : never
      : {} extends FieldPaths<T[K]>
      ? never
      : K
  }[keyof T]

  /**
   * Convert tuple to union
   */
  type _TupleToUnion<T> = T extends (infer E)[] ? E : never
  type TupleToUnion<K extends readonly any[]> = _TupleToUnion<K>
  type MaybeTupleToUnion<T> = T extends any[] ? TupleToUnion<T> : T

  /**
   * Like `Pick`, but additionally can also accept an array of keys
   */
  type PickEnumerable<T, K extends Enumerable<keyof T> | keyof T> = Prisma__Pick<T, MaybeTupleToUnion<K>>

  /**
   * Exclude all keys with underscores
   */
  type ExcludeUnderscoreKeys<T extends string> = T extends `_${string}` ? never : T


  export type FieldRef<Model, FieldType> = runtime.FieldRef<Model, FieldType>

  type FieldRefInputType<Model, FieldType> = Model extends never ? never : FieldRef<Model, FieldType>


  export const ModelName: {
    User: 'User',
    Workspace: 'Workspace',
    Thread: 'Thread',
    ThreadMessage: 'ThreadMessage',
    ProviderCredential: 'ProviderCredential',
    ModelPreference: 'ModelPreference'
  };

  export type ModelName = (typeof ModelName)[keyof typeof ModelName]


  export type Datasources = {
    db?: Datasource
  }

  interface TypeMapCb<ClientOptions = {}> extends $Utils.Fn<{extArgs: $Extensions.InternalArgs }, $Utils.Record<string, any>> {
    returns: Prisma.TypeMap<this['params']['extArgs'], ClientOptions extends { omit: infer OmitOptions } ? OmitOptions : {}>
  }

  export type TypeMap<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> = {
    globalOmitOptions: {
      omit: GlobalOmitOptions
    }
    meta: {
      modelProps: "user" | "workspace" | "thread" | "threadMessage" | "providerCredential" | "modelPreference"
      txIsolationLevel: Prisma.TransactionIsolationLevel
    }
    model: {
      User: {
        payload: Prisma.$UserPayload<ExtArgs>
        fields: Prisma.UserFieldRefs
        operations: {
          findUnique: {
            args: Prisma.UserFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.UserFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload>
          }
          findFirst: {
            args: Prisma.UserFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.UserFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload>
          }
          findMany: {
            args: Prisma.UserFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload>[]
          }
          create: {
            args: Prisma.UserCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload>
          }
          createMany: {
            args: Prisma.UserCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.UserCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload>[]
          }
          delete: {
            args: Prisma.UserDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload>
          }
          update: {
            args: Prisma.UserUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload>
          }
          deleteMany: {
            args: Prisma.UserDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.UserUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.UserUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload>[]
          }
          upsert: {
            args: Prisma.UserUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload>
          }
          aggregate: {
            args: Prisma.UserAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateUser>
          }
          groupBy: {
            args: Prisma.UserGroupByArgs<ExtArgs>
            result: $Utils.Optional<UserGroupByOutputType>[]
          }
          count: {
            args: Prisma.UserCountArgs<ExtArgs>
            result: $Utils.Optional<UserCountAggregateOutputType> | number
          }
        }
      }
      Workspace: {
        payload: Prisma.$WorkspacePayload<ExtArgs>
        fields: Prisma.WorkspaceFieldRefs
        operations: {
          findUnique: {
            args: Prisma.WorkspaceFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkspacePayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.WorkspaceFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkspacePayload>
          }
          findFirst: {
            args: Prisma.WorkspaceFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkspacePayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.WorkspaceFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkspacePayload>
          }
          findMany: {
            args: Prisma.WorkspaceFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkspacePayload>[]
          }
          create: {
            args: Prisma.WorkspaceCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkspacePayload>
          }
          createMany: {
            args: Prisma.WorkspaceCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.WorkspaceCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkspacePayload>[]
          }
          delete: {
            args: Prisma.WorkspaceDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkspacePayload>
          }
          update: {
            args: Prisma.WorkspaceUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkspacePayload>
          }
          deleteMany: {
            args: Prisma.WorkspaceDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.WorkspaceUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.WorkspaceUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkspacePayload>[]
          }
          upsert: {
            args: Prisma.WorkspaceUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkspacePayload>
          }
          aggregate: {
            args: Prisma.WorkspaceAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateWorkspace>
          }
          groupBy: {
            args: Prisma.WorkspaceGroupByArgs<ExtArgs>
            result: $Utils.Optional<WorkspaceGroupByOutputType>[]
          }
          count: {
            args: Prisma.WorkspaceCountArgs<ExtArgs>
            result: $Utils.Optional<WorkspaceCountAggregateOutputType> | number
          }
        }
      }
      Thread: {
        payload: Prisma.$ThreadPayload<ExtArgs>
        fields: Prisma.ThreadFieldRefs
        operations: {
          findUnique: {
            args: Prisma.ThreadFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ThreadPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.ThreadFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ThreadPayload>
          }
          findFirst: {
            args: Prisma.ThreadFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ThreadPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.ThreadFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ThreadPayload>
          }
          findMany: {
            args: Prisma.ThreadFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ThreadPayload>[]
          }
          create: {
            args: Prisma.ThreadCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ThreadPayload>
          }
          createMany: {
            args: Prisma.ThreadCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.ThreadCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ThreadPayload>[]
          }
          delete: {
            args: Prisma.ThreadDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ThreadPayload>
          }
          update: {
            args: Prisma.ThreadUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ThreadPayload>
          }
          deleteMany: {
            args: Prisma.ThreadDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.ThreadUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.ThreadUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ThreadPayload>[]
          }
          upsert: {
            args: Prisma.ThreadUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ThreadPayload>
          }
          aggregate: {
            args: Prisma.ThreadAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateThread>
          }
          groupBy: {
            args: Prisma.ThreadGroupByArgs<ExtArgs>
            result: $Utils.Optional<ThreadGroupByOutputType>[]
          }
          count: {
            args: Prisma.ThreadCountArgs<ExtArgs>
            result: $Utils.Optional<ThreadCountAggregateOutputType> | number
          }
        }
      }
      ThreadMessage: {
        payload: Prisma.$ThreadMessagePayload<ExtArgs>
        fields: Prisma.ThreadMessageFieldRefs
        operations: {
          findUnique: {
            args: Prisma.ThreadMessageFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ThreadMessagePayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.ThreadMessageFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ThreadMessagePayload>
          }
          findFirst: {
            args: Prisma.ThreadMessageFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ThreadMessagePayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.ThreadMessageFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ThreadMessagePayload>
          }
          findMany: {
            args: Prisma.ThreadMessageFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ThreadMessagePayload>[]
          }
          create: {
            args: Prisma.ThreadMessageCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ThreadMessagePayload>
          }
          createMany: {
            args: Prisma.ThreadMessageCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.ThreadMessageCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ThreadMessagePayload>[]
          }
          delete: {
            args: Prisma.ThreadMessageDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ThreadMessagePayload>
          }
          update: {
            args: Prisma.ThreadMessageUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ThreadMessagePayload>
          }
          deleteMany: {
            args: Prisma.ThreadMessageDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.ThreadMessageUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.ThreadMessageUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ThreadMessagePayload>[]
          }
          upsert: {
            args: Prisma.ThreadMessageUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ThreadMessagePayload>
          }
          aggregate: {
            args: Prisma.ThreadMessageAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateThreadMessage>
          }
          groupBy: {
            args: Prisma.ThreadMessageGroupByArgs<ExtArgs>
            result: $Utils.Optional<ThreadMessageGroupByOutputType>[]
          }
          count: {
            args: Prisma.ThreadMessageCountArgs<ExtArgs>
            result: $Utils.Optional<ThreadMessageCountAggregateOutputType> | number
          }
        }
      }
      ProviderCredential: {
        payload: Prisma.$ProviderCredentialPayload<ExtArgs>
        fields: Prisma.ProviderCredentialFieldRefs
        operations: {
          findUnique: {
            args: Prisma.ProviderCredentialFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ProviderCredentialPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.ProviderCredentialFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ProviderCredentialPayload>
          }
          findFirst: {
            args: Prisma.ProviderCredentialFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ProviderCredentialPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.ProviderCredentialFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ProviderCredentialPayload>
          }
          findMany: {
            args: Prisma.ProviderCredentialFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ProviderCredentialPayload>[]
          }
          create: {
            args: Prisma.ProviderCredentialCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ProviderCredentialPayload>
          }
          createMany: {
            args: Prisma.ProviderCredentialCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.ProviderCredentialCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ProviderCredentialPayload>[]
          }
          delete: {
            args: Prisma.ProviderCredentialDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ProviderCredentialPayload>
          }
          update: {
            args: Prisma.ProviderCredentialUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ProviderCredentialPayload>
          }
          deleteMany: {
            args: Prisma.ProviderCredentialDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.ProviderCredentialUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.ProviderCredentialUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ProviderCredentialPayload>[]
          }
          upsert: {
            args: Prisma.ProviderCredentialUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ProviderCredentialPayload>
          }
          aggregate: {
            args: Prisma.ProviderCredentialAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateProviderCredential>
          }
          groupBy: {
            args: Prisma.ProviderCredentialGroupByArgs<ExtArgs>
            result: $Utils.Optional<ProviderCredentialGroupByOutputType>[]
          }
          count: {
            args: Prisma.ProviderCredentialCountArgs<ExtArgs>
            result: $Utils.Optional<ProviderCredentialCountAggregateOutputType> | number
          }
        }
      }
      ModelPreference: {
        payload: Prisma.$ModelPreferencePayload<ExtArgs>
        fields: Prisma.ModelPreferenceFieldRefs
        operations: {
          findUnique: {
            args: Prisma.ModelPreferenceFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ModelPreferencePayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.ModelPreferenceFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ModelPreferencePayload>
          }
          findFirst: {
            args: Prisma.ModelPreferenceFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ModelPreferencePayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.ModelPreferenceFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ModelPreferencePayload>
          }
          findMany: {
            args: Prisma.ModelPreferenceFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ModelPreferencePayload>[]
          }
          create: {
            args: Prisma.ModelPreferenceCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ModelPreferencePayload>
          }
          createMany: {
            args: Prisma.ModelPreferenceCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.ModelPreferenceCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ModelPreferencePayload>[]
          }
          delete: {
            args: Prisma.ModelPreferenceDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ModelPreferencePayload>
          }
          update: {
            args: Prisma.ModelPreferenceUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ModelPreferencePayload>
          }
          deleteMany: {
            args: Prisma.ModelPreferenceDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.ModelPreferenceUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.ModelPreferenceUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ModelPreferencePayload>[]
          }
          upsert: {
            args: Prisma.ModelPreferenceUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ModelPreferencePayload>
          }
          aggregate: {
            args: Prisma.ModelPreferenceAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateModelPreference>
          }
          groupBy: {
            args: Prisma.ModelPreferenceGroupByArgs<ExtArgs>
            result: $Utils.Optional<ModelPreferenceGroupByOutputType>[]
          }
          count: {
            args: Prisma.ModelPreferenceCountArgs<ExtArgs>
            result: $Utils.Optional<ModelPreferenceCountAggregateOutputType> | number
          }
        }
      }
    }
  } & {
    other: {
      payload: any
      operations: {
        $executeRaw: {
          args: [query: TemplateStringsArray | Prisma.Sql, ...values: any[]],
          result: any
        }
        $executeRawUnsafe: {
          args: [query: string, ...values: any[]],
          result: any
        }
        $queryRaw: {
          args: [query: TemplateStringsArray | Prisma.Sql, ...values: any[]],
          result: any
        }
        $queryRawUnsafe: {
          args: [query: string, ...values: any[]],
          result: any
        }
      }
    }
  }
  export const defineExtension: $Extensions.ExtendsHook<"define", Prisma.TypeMapCb, $Extensions.DefaultArgs>
  export type DefaultPrismaClient = PrismaClient
  export type ErrorFormat = 'pretty' | 'colorless' | 'minimal'
  export interface PrismaClientOptions {
    /**
     * Overwrites the datasource url from your schema.prisma file
     */
    datasources?: Datasources
    /**
     * Overwrites the datasource url from your schema.prisma file
     */
    datasourceUrl?: string
    /**
     * @default "colorless"
     */
    errorFormat?: ErrorFormat
    /**
     * @example
     * ```
     * // Shorthand for `emit: 'stdout'`
     * log: ['query', 'info', 'warn', 'error']
     * 
     * // Emit as events only
     * log: [
     *   { emit: 'event', level: 'query' },
     *   { emit: 'event', level: 'info' },
     *   { emit: 'event', level: 'warn' }
     *   { emit: 'event', level: 'error' }
     * ]
     * 
     * / Emit as events and log to stdout
     * og: [
     *  { emit: 'stdout', level: 'query' },
     *  { emit: 'stdout', level: 'info' },
     *  { emit: 'stdout', level: 'warn' }
     *  { emit: 'stdout', level: 'error' }
     * 
     * ```
     * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/logging#the-log-option).
     */
    log?: (LogLevel | LogDefinition)[]
    /**
     * The default values for transactionOptions
     * maxWait ?= 2000
     * timeout ?= 5000
     */
    transactionOptions?: {
      maxWait?: number
      timeout?: number
      isolationLevel?: Prisma.TransactionIsolationLevel
    }
    /**
     * Instance of a Driver Adapter, e.g., like one provided by `@prisma/adapter-planetscale`
     */
    adapter?: runtime.SqlDriverAdapterFactory | null
    /**
     * Global configuration for omitting model fields by default.
     * 
     * @example
     * ```
     * const prisma = new PrismaClient({
     *   omit: {
     *     user: {
     *       password: true
     *     }
     *   }
     * })
     * ```
     */
    omit?: Prisma.GlobalOmitConfig
  }
  export type GlobalOmitConfig = {
    user?: UserOmit
    workspace?: WorkspaceOmit
    thread?: ThreadOmit
    threadMessage?: ThreadMessageOmit
    providerCredential?: ProviderCredentialOmit
    modelPreference?: ModelPreferenceOmit
  }

  /* Types for Logging */
  export type LogLevel = 'info' | 'query' | 'warn' | 'error'
  export type LogDefinition = {
    level: LogLevel
    emit: 'stdout' | 'event'
  }

  export type CheckIsLogLevel<T> = T extends LogLevel ? T : never;

  export type GetLogType<T> = CheckIsLogLevel<
    T extends LogDefinition ? T['level'] : T
  >;

  export type GetEvents<T extends any[]> = T extends Array<LogLevel | LogDefinition>
    ? GetLogType<T[number]>
    : never;

  export type QueryEvent = {
    timestamp: Date
    query: string
    params: string
    duration: number
    target: string
  }

  export type LogEvent = {
    timestamp: Date
    message: string
    target: string
  }
  /* End Types for Logging */


  export type PrismaAction =
    | 'findUnique'
    | 'findUniqueOrThrow'
    | 'findMany'
    | 'findFirst'
    | 'findFirstOrThrow'
    | 'create'
    | 'createMany'
    | 'createManyAndReturn'
    | 'update'
    | 'updateMany'
    | 'updateManyAndReturn'
    | 'upsert'
    | 'delete'
    | 'deleteMany'
    | 'executeRaw'
    | 'queryRaw'
    | 'aggregate'
    | 'count'
    | 'runCommandRaw'
    | 'findRaw'
    | 'groupBy'

  // tested in getLogLevel.test.ts
  export function getLogLevel(log: Array<LogLevel | LogDefinition>): LogLevel | undefined;

  /**
   * `PrismaClient` proxy available in interactive transactions.
   */
  export type TransactionClient = Omit<Prisma.DefaultPrismaClient, runtime.ITXClientDenyList>

  export type Datasource = {
    url?: string
  }

  /**
   * Count Types
   */


  /**
   * Count Type UserCountOutputType
   */

  export type UserCountOutputType = {
    ownedWorkspaces: number
    threads: number
    credentials: number
    modelPreferences: number
  }

  export type UserCountOutputTypeSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    ownedWorkspaces?: boolean | UserCountOutputTypeCountOwnedWorkspacesArgs
    threads?: boolean | UserCountOutputTypeCountThreadsArgs
    credentials?: boolean | UserCountOutputTypeCountCredentialsArgs
    modelPreferences?: boolean | UserCountOutputTypeCountModelPreferencesArgs
  }

  // Custom InputTypes
  /**
   * UserCountOutputType without action
   */
  export type UserCountOutputTypeDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the UserCountOutputType
     */
    select?: UserCountOutputTypeSelect<ExtArgs> | null
  }

  /**
   * UserCountOutputType without action
   */
  export type UserCountOutputTypeCountOwnedWorkspacesArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: WorkspaceWhereInput
  }

  /**
   * UserCountOutputType without action
   */
  export type UserCountOutputTypeCountThreadsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: ThreadWhereInput
  }

  /**
   * UserCountOutputType without action
   */
  export type UserCountOutputTypeCountCredentialsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: ProviderCredentialWhereInput
  }

  /**
   * UserCountOutputType without action
   */
  export type UserCountOutputTypeCountModelPreferencesArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: ModelPreferenceWhereInput
  }


  /**
   * Count Type WorkspaceCountOutputType
   */

  export type WorkspaceCountOutputType = {
    selectedByUsers: number
    threads: number
  }

  export type WorkspaceCountOutputTypeSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    selectedByUsers?: boolean | WorkspaceCountOutputTypeCountSelectedByUsersArgs
    threads?: boolean | WorkspaceCountOutputTypeCountThreadsArgs
  }

  // Custom InputTypes
  /**
   * WorkspaceCountOutputType without action
   */
  export type WorkspaceCountOutputTypeDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WorkspaceCountOutputType
     */
    select?: WorkspaceCountOutputTypeSelect<ExtArgs> | null
  }

  /**
   * WorkspaceCountOutputType without action
   */
  export type WorkspaceCountOutputTypeCountSelectedByUsersArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: UserWhereInput
  }

  /**
   * WorkspaceCountOutputType without action
   */
  export type WorkspaceCountOutputTypeCountThreadsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: ThreadWhereInput
  }


  /**
   * Count Type ThreadCountOutputType
   */

  export type ThreadCountOutputType = {
    messages: number
  }

  export type ThreadCountOutputTypeSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    messages?: boolean | ThreadCountOutputTypeCountMessagesArgs
  }

  // Custom InputTypes
  /**
   * ThreadCountOutputType without action
   */
  export type ThreadCountOutputTypeDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ThreadCountOutputType
     */
    select?: ThreadCountOutputTypeSelect<ExtArgs> | null
  }

  /**
   * ThreadCountOutputType without action
   */
  export type ThreadCountOutputTypeCountMessagesArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: ThreadMessageWhereInput
  }


  /**
   * Models
   */

  /**
   * Model User
   */

  export type AggregateUser = {
    _count: UserCountAggregateOutputType | null
    _min: UserMinAggregateOutputType | null
    _max: UserMaxAggregateOutputType | null
  }

  export type UserMinAggregateOutputType = {
    id: string | null
    name: string | null
    email: string | null
    emailVerified: boolean | null
    image: string | null
    nickname: string | null
    occupation: string | null
    aboutUser: string | null
    personalityPreset: $Enums.PersonalityPreset | null
    customInstructions: string | null
    themePreference: $Enums.ThemePreference | null
    selectedWorkspaceId: string | null
    threadListOrganizeBy: $Enums.ThreadListOrganizeBy | null
    threadListSortBy: $Enums.ThreadListSortBy | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type UserMaxAggregateOutputType = {
    id: string | null
    name: string | null
    email: string | null
    emailVerified: boolean | null
    image: string | null
    nickname: string | null
    occupation: string | null
    aboutUser: string | null
    personalityPreset: $Enums.PersonalityPreset | null
    customInstructions: string | null
    themePreference: $Enums.ThemePreference | null
    selectedWorkspaceId: string | null
    threadListOrganizeBy: $Enums.ThreadListOrganizeBy | null
    threadListSortBy: $Enums.ThreadListSortBy | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type UserCountAggregateOutputType = {
    id: number
    name: number
    email: number
    emailVerified: number
    image: number
    nickname: number
    occupation: number
    aboutUser: number
    personalityPreset: number
    customInstructions: number
    themePreference: number
    selectedWorkspaceId: number
    threadListOrganizeBy: number
    threadListSortBy: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type UserMinAggregateInputType = {
    id?: true
    name?: true
    email?: true
    emailVerified?: true
    image?: true
    nickname?: true
    occupation?: true
    aboutUser?: true
    personalityPreset?: true
    customInstructions?: true
    themePreference?: true
    selectedWorkspaceId?: true
    threadListOrganizeBy?: true
    threadListSortBy?: true
    createdAt?: true
    updatedAt?: true
  }

  export type UserMaxAggregateInputType = {
    id?: true
    name?: true
    email?: true
    emailVerified?: true
    image?: true
    nickname?: true
    occupation?: true
    aboutUser?: true
    personalityPreset?: true
    customInstructions?: true
    themePreference?: true
    selectedWorkspaceId?: true
    threadListOrganizeBy?: true
    threadListSortBy?: true
    createdAt?: true
    updatedAt?: true
  }

  export type UserCountAggregateInputType = {
    id?: true
    name?: true
    email?: true
    emailVerified?: true
    image?: true
    nickname?: true
    occupation?: true
    aboutUser?: true
    personalityPreset?: true
    customInstructions?: true
    themePreference?: true
    selectedWorkspaceId?: true
    threadListOrganizeBy?: true
    threadListSortBy?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type UserAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which User to aggregate.
     */
    where?: UserWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Users to fetch.
     */
    orderBy?: UserOrderByWithRelationInput | UserOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: UserWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Users from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Users.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned Users
    **/
    _count?: true | UserCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: UserMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: UserMaxAggregateInputType
  }

  export type GetUserAggregateType<T extends UserAggregateArgs> = {
        [P in keyof T & keyof AggregateUser]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateUser[P]>
      : GetScalarType<T[P], AggregateUser[P]>
  }




  export type UserGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: UserWhereInput
    orderBy?: UserOrderByWithAggregationInput | UserOrderByWithAggregationInput[]
    by: UserScalarFieldEnum[] | UserScalarFieldEnum
    having?: UserScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: UserCountAggregateInputType | true
    _min?: UserMinAggregateInputType
    _max?: UserMaxAggregateInputType
  }

  export type UserGroupByOutputType = {
    id: string
    name: string
    email: string
    emailVerified: boolean
    image: string | null
    nickname: string | null
    occupation: string | null
    aboutUser: string | null
    personalityPreset: $Enums.PersonalityPreset
    customInstructions: string | null
    themePreference: $Enums.ThemePreference
    selectedWorkspaceId: string | null
    threadListOrganizeBy: $Enums.ThreadListOrganizeBy
    threadListSortBy: $Enums.ThreadListSortBy
    createdAt: Date
    updatedAt: Date
    _count: UserCountAggregateOutputType | null
    _min: UserMinAggregateOutputType | null
    _max: UserMaxAggregateOutputType | null
  }

  type GetUserGroupByPayload<T extends UserGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<UserGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof UserGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], UserGroupByOutputType[P]>
            : GetScalarType<T[P], UserGroupByOutputType[P]>
        }
      >
    >


  export type UserSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    name?: boolean
    email?: boolean
    emailVerified?: boolean
    image?: boolean
    nickname?: boolean
    occupation?: boolean
    aboutUser?: boolean
    personalityPreset?: boolean
    customInstructions?: boolean
    themePreference?: boolean
    selectedWorkspaceId?: boolean
    threadListOrganizeBy?: boolean
    threadListSortBy?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    selectedWorkspace?: boolean | User$selectedWorkspaceArgs<ExtArgs>
    ownedWorkspaces?: boolean | User$ownedWorkspacesArgs<ExtArgs>
    threads?: boolean | User$threadsArgs<ExtArgs>
    credentials?: boolean | User$credentialsArgs<ExtArgs>
    modelPreferences?: boolean | User$modelPreferencesArgs<ExtArgs>
    _count?: boolean | UserCountOutputTypeDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["user"]>

  export type UserSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    name?: boolean
    email?: boolean
    emailVerified?: boolean
    image?: boolean
    nickname?: boolean
    occupation?: boolean
    aboutUser?: boolean
    personalityPreset?: boolean
    customInstructions?: boolean
    themePreference?: boolean
    selectedWorkspaceId?: boolean
    threadListOrganizeBy?: boolean
    threadListSortBy?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    selectedWorkspace?: boolean | User$selectedWorkspaceArgs<ExtArgs>
  }, ExtArgs["result"]["user"]>

  export type UserSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    name?: boolean
    email?: boolean
    emailVerified?: boolean
    image?: boolean
    nickname?: boolean
    occupation?: boolean
    aboutUser?: boolean
    personalityPreset?: boolean
    customInstructions?: boolean
    themePreference?: boolean
    selectedWorkspaceId?: boolean
    threadListOrganizeBy?: boolean
    threadListSortBy?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    selectedWorkspace?: boolean | User$selectedWorkspaceArgs<ExtArgs>
  }, ExtArgs["result"]["user"]>

  export type UserSelectScalar = {
    id?: boolean
    name?: boolean
    email?: boolean
    emailVerified?: boolean
    image?: boolean
    nickname?: boolean
    occupation?: boolean
    aboutUser?: boolean
    personalityPreset?: boolean
    customInstructions?: boolean
    themePreference?: boolean
    selectedWorkspaceId?: boolean
    threadListOrganizeBy?: boolean
    threadListSortBy?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }

  export type UserOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "name" | "email" | "emailVerified" | "image" | "nickname" | "occupation" | "aboutUser" | "personalityPreset" | "customInstructions" | "themePreference" | "selectedWorkspaceId" | "threadListOrganizeBy" | "threadListSortBy" | "createdAt" | "updatedAt", ExtArgs["result"]["user"]>
  export type UserInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    selectedWorkspace?: boolean | User$selectedWorkspaceArgs<ExtArgs>
    ownedWorkspaces?: boolean | User$ownedWorkspacesArgs<ExtArgs>
    threads?: boolean | User$threadsArgs<ExtArgs>
    credentials?: boolean | User$credentialsArgs<ExtArgs>
    modelPreferences?: boolean | User$modelPreferencesArgs<ExtArgs>
    _count?: boolean | UserCountOutputTypeDefaultArgs<ExtArgs>
  }
  export type UserIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    selectedWorkspace?: boolean | User$selectedWorkspaceArgs<ExtArgs>
  }
  export type UserIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    selectedWorkspace?: boolean | User$selectedWorkspaceArgs<ExtArgs>
  }

  export type $UserPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "User"
    objects: {
      selectedWorkspace: Prisma.$WorkspacePayload<ExtArgs> | null
      ownedWorkspaces: Prisma.$WorkspacePayload<ExtArgs>[]
      threads: Prisma.$ThreadPayload<ExtArgs>[]
      credentials: Prisma.$ProviderCredentialPayload<ExtArgs>[]
      modelPreferences: Prisma.$ModelPreferencePayload<ExtArgs>[]
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      name: string
      email: string
      emailVerified: boolean
      image: string | null
      nickname: string | null
      occupation: string | null
      aboutUser: string | null
      personalityPreset: $Enums.PersonalityPreset
      customInstructions: string | null
      themePreference: $Enums.ThemePreference
      selectedWorkspaceId: string | null
      threadListOrganizeBy: $Enums.ThreadListOrganizeBy
      threadListSortBy: $Enums.ThreadListSortBy
      createdAt: Date
      updatedAt: Date
    }, ExtArgs["result"]["user"]>
    composites: {}
  }

  type UserGetPayload<S extends boolean | null | undefined | UserDefaultArgs> = $Result.GetResult<Prisma.$UserPayload, S>

  type UserCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<UserFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: UserCountAggregateInputType | true
    }

  export interface UserDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['User'], meta: { name: 'User' } }
    /**
     * Find zero or one User that matches the filter.
     * @param {UserFindUniqueArgs} args - Arguments to find a User
     * @example
     * // Get one User
     * const user = await prisma.user.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends UserFindUniqueArgs>(args: SelectSubset<T, UserFindUniqueArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one User that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {UserFindUniqueOrThrowArgs} args - Arguments to find a User
     * @example
     * // Get one User
     * const user = await prisma.user.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends UserFindUniqueOrThrowArgs>(args: SelectSubset<T, UserFindUniqueOrThrowArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first User that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserFindFirstArgs} args - Arguments to find a User
     * @example
     * // Get one User
     * const user = await prisma.user.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends UserFindFirstArgs>(args?: SelectSubset<T, UserFindFirstArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first User that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserFindFirstOrThrowArgs} args - Arguments to find a User
     * @example
     * // Get one User
     * const user = await prisma.user.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends UserFindFirstOrThrowArgs>(args?: SelectSubset<T, UserFindFirstOrThrowArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more Users that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Users
     * const users = await prisma.user.findMany()
     * 
     * // Get first 10 Users
     * const users = await prisma.user.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const userWithIdOnly = await prisma.user.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends UserFindManyArgs>(args?: SelectSubset<T, UserFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a User.
     * @param {UserCreateArgs} args - Arguments to create a User.
     * @example
     * // Create one User
     * const User = await prisma.user.create({
     *   data: {
     *     // ... data to create a User
     *   }
     * })
     * 
     */
    create<T extends UserCreateArgs>(args: SelectSubset<T, UserCreateArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many Users.
     * @param {UserCreateManyArgs} args - Arguments to create many Users.
     * @example
     * // Create many Users
     * const user = await prisma.user.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends UserCreateManyArgs>(args?: SelectSubset<T, UserCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many Users and returns the data saved in the database.
     * @param {UserCreateManyAndReturnArgs} args - Arguments to create many Users.
     * @example
     * // Create many Users
     * const user = await prisma.user.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many Users and only return the `id`
     * const userWithIdOnly = await prisma.user.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends UserCreateManyAndReturnArgs>(args?: SelectSubset<T, UserCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a User.
     * @param {UserDeleteArgs} args - Arguments to delete one User.
     * @example
     * // Delete one User
     * const User = await prisma.user.delete({
     *   where: {
     *     // ... filter to delete one User
     *   }
     * })
     * 
     */
    delete<T extends UserDeleteArgs>(args: SelectSubset<T, UserDeleteArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one User.
     * @param {UserUpdateArgs} args - Arguments to update one User.
     * @example
     * // Update one User
     * const user = await prisma.user.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends UserUpdateArgs>(args: SelectSubset<T, UserUpdateArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more Users.
     * @param {UserDeleteManyArgs} args - Arguments to filter Users to delete.
     * @example
     * // Delete a few Users
     * const { count } = await prisma.user.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends UserDeleteManyArgs>(args?: SelectSubset<T, UserDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Users.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Users
     * const user = await prisma.user.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends UserUpdateManyArgs>(args: SelectSubset<T, UserUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Users and returns the data updated in the database.
     * @param {UserUpdateManyAndReturnArgs} args - Arguments to update many Users.
     * @example
     * // Update many Users
     * const user = await prisma.user.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more Users and only return the `id`
     * const userWithIdOnly = await prisma.user.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends UserUpdateManyAndReturnArgs>(args: SelectSubset<T, UserUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one User.
     * @param {UserUpsertArgs} args - Arguments to update or create a User.
     * @example
     * // Update or create a User
     * const user = await prisma.user.upsert({
     *   create: {
     *     // ... data to create a User
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the User we want to update
     *   }
     * })
     */
    upsert<T extends UserUpsertArgs>(args: SelectSubset<T, UserUpsertArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of Users.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserCountArgs} args - Arguments to filter Users to count.
     * @example
     * // Count the number of Users
     * const count = await prisma.user.count({
     *   where: {
     *     // ... the filter for the Users we want to count
     *   }
     * })
    **/
    count<T extends UserCountArgs>(
      args?: Subset<T, UserCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], UserCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a User.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends UserAggregateArgs>(args: Subset<T, UserAggregateArgs>): Prisma.PrismaPromise<GetUserAggregateType<T>>

    /**
     * Group by User.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends UserGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: UserGroupByArgs['orderBy'] }
        : { orderBy?: UserGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, UserGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetUserGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the User model
   */
  readonly fields: UserFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for User.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__UserClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    selectedWorkspace<T extends User$selectedWorkspaceArgs<ExtArgs> = {}>(args?: Subset<T, User$selectedWorkspaceArgs<ExtArgs>>): Prisma__WorkspaceClient<$Result.GetResult<Prisma.$WorkspacePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>
    ownedWorkspaces<T extends User$ownedWorkspacesArgs<ExtArgs> = {}>(args?: Subset<T, User$ownedWorkspacesArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$WorkspacePayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    threads<T extends User$threadsArgs<ExtArgs> = {}>(args?: Subset<T, User$threadsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ThreadPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    credentials<T extends User$credentialsArgs<ExtArgs> = {}>(args?: Subset<T, User$credentialsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ProviderCredentialPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    modelPreferences<T extends User$modelPreferencesArgs<ExtArgs> = {}>(args?: Subset<T, User$modelPreferencesArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ModelPreferencePayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the User model
   */
  interface UserFieldRefs {
    readonly id: FieldRef<"User", 'String'>
    readonly name: FieldRef<"User", 'String'>
    readonly email: FieldRef<"User", 'String'>
    readonly emailVerified: FieldRef<"User", 'Boolean'>
    readonly image: FieldRef<"User", 'String'>
    readonly nickname: FieldRef<"User", 'String'>
    readonly occupation: FieldRef<"User", 'String'>
    readonly aboutUser: FieldRef<"User", 'String'>
    readonly personalityPreset: FieldRef<"User", 'PersonalityPreset'>
    readonly customInstructions: FieldRef<"User", 'String'>
    readonly themePreference: FieldRef<"User", 'ThemePreference'>
    readonly selectedWorkspaceId: FieldRef<"User", 'String'>
    readonly threadListOrganizeBy: FieldRef<"User", 'ThreadListOrganizeBy'>
    readonly threadListSortBy: FieldRef<"User", 'ThreadListSortBy'>
    readonly createdAt: FieldRef<"User", 'DateTime'>
    readonly updatedAt: FieldRef<"User", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * User findUnique
   */
  export type UserFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserInclude<ExtArgs> | null
    /**
     * Filter, which User to fetch.
     */
    where: UserWhereUniqueInput
  }

  /**
   * User findUniqueOrThrow
   */
  export type UserFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserInclude<ExtArgs> | null
    /**
     * Filter, which User to fetch.
     */
    where: UserWhereUniqueInput
  }

  /**
   * User findFirst
   */
  export type UserFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserInclude<ExtArgs> | null
    /**
     * Filter, which User to fetch.
     */
    where?: UserWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Users to fetch.
     */
    orderBy?: UserOrderByWithRelationInput | UserOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Users.
     */
    cursor?: UserWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Users from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Users.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Users.
     */
    distinct?: UserScalarFieldEnum | UserScalarFieldEnum[]
  }

  /**
   * User findFirstOrThrow
   */
  export type UserFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserInclude<ExtArgs> | null
    /**
     * Filter, which User to fetch.
     */
    where?: UserWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Users to fetch.
     */
    orderBy?: UserOrderByWithRelationInput | UserOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Users.
     */
    cursor?: UserWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Users from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Users.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Users.
     */
    distinct?: UserScalarFieldEnum | UserScalarFieldEnum[]
  }

  /**
   * User findMany
   */
  export type UserFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserInclude<ExtArgs> | null
    /**
     * Filter, which Users to fetch.
     */
    where?: UserWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Users to fetch.
     */
    orderBy?: UserOrderByWithRelationInput | UserOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing Users.
     */
    cursor?: UserWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Users from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Users.
     */
    skip?: number
    distinct?: UserScalarFieldEnum | UserScalarFieldEnum[]
  }

  /**
   * User create
   */
  export type UserCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserInclude<ExtArgs> | null
    /**
     * The data needed to create a User.
     */
    data: XOR<UserCreateInput, UserUncheckedCreateInput>
  }

  /**
   * User createMany
   */
  export type UserCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many Users.
     */
    data: UserCreateManyInput | UserCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * User createManyAndReturn
   */
  export type UserCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * The data used to create many Users.
     */
    data: UserCreateManyInput | UserCreateManyInput[]
    skipDuplicates?: boolean
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * User update
   */
  export type UserUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserInclude<ExtArgs> | null
    /**
     * The data needed to update a User.
     */
    data: XOR<UserUpdateInput, UserUncheckedUpdateInput>
    /**
     * Choose, which User to update.
     */
    where: UserWhereUniqueInput
  }

  /**
   * User updateMany
   */
  export type UserUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update Users.
     */
    data: XOR<UserUpdateManyMutationInput, UserUncheckedUpdateManyInput>
    /**
     * Filter which Users to update
     */
    where?: UserWhereInput
    /**
     * Limit how many Users to update.
     */
    limit?: number
  }

  /**
   * User updateManyAndReturn
   */
  export type UserUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * The data used to update Users.
     */
    data: XOR<UserUpdateManyMutationInput, UserUncheckedUpdateManyInput>
    /**
     * Filter which Users to update
     */
    where?: UserWhereInput
    /**
     * Limit how many Users to update.
     */
    limit?: number
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserIncludeUpdateManyAndReturn<ExtArgs> | null
  }

  /**
   * User upsert
   */
  export type UserUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserInclude<ExtArgs> | null
    /**
     * The filter to search for the User to update in case it exists.
     */
    where: UserWhereUniqueInput
    /**
     * In case the User found by the `where` argument doesn't exist, create a new User with this data.
     */
    create: XOR<UserCreateInput, UserUncheckedCreateInput>
    /**
     * In case the User was found with the provided `where` argument, update it with this data.
     */
    update: XOR<UserUpdateInput, UserUncheckedUpdateInput>
  }

  /**
   * User delete
   */
  export type UserDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserInclude<ExtArgs> | null
    /**
     * Filter which User to delete.
     */
    where: UserWhereUniqueInput
  }

  /**
   * User deleteMany
   */
  export type UserDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Users to delete
     */
    where?: UserWhereInput
    /**
     * Limit how many Users to delete.
     */
    limit?: number
  }

  /**
   * User.selectedWorkspace
   */
  export type User$selectedWorkspaceArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Workspace
     */
    select?: WorkspaceSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Workspace
     */
    omit?: WorkspaceOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkspaceInclude<ExtArgs> | null
    where?: WorkspaceWhereInput
  }

  /**
   * User.ownedWorkspaces
   */
  export type User$ownedWorkspacesArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Workspace
     */
    select?: WorkspaceSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Workspace
     */
    omit?: WorkspaceOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkspaceInclude<ExtArgs> | null
    where?: WorkspaceWhereInput
    orderBy?: WorkspaceOrderByWithRelationInput | WorkspaceOrderByWithRelationInput[]
    cursor?: WorkspaceWhereUniqueInput
    take?: number
    skip?: number
    distinct?: WorkspaceScalarFieldEnum | WorkspaceScalarFieldEnum[]
  }

  /**
   * User.threads
   */
  export type User$threadsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Thread
     */
    select?: ThreadSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Thread
     */
    omit?: ThreadOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ThreadInclude<ExtArgs> | null
    where?: ThreadWhereInput
    orderBy?: ThreadOrderByWithRelationInput | ThreadOrderByWithRelationInput[]
    cursor?: ThreadWhereUniqueInput
    take?: number
    skip?: number
    distinct?: ThreadScalarFieldEnum | ThreadScalarFieldEnum[]
  }

  /**
   * User.credentials
   */
  export type User$credentialsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ProviderCredential
     */
    select?: ProviderCredentialSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ProviderCredential
     */
    omit?: ProviderCredentialOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ProviderCredentialInclude<ExtArgs> | null
    where?: ProviderCredentialWhereInput
    orderBy?: ProviderCredentialOrderByWithRelationInput | ProviderCredentialOrderByWithRelationInput[]
    cursor?: ProviderCredentialWhereUniqueInput
    take?: number
    skip?: number
    distinct?: ProviderCredentialScalarFieldEnum | ProviderCredentialScalarFieldEnum[]
  }

  /**
   * User.modelPreferences
   */
  export type User$modelPreferencesArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ModelPreference
     */
    select?: ModelPreferenceSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ModelPreference
     */
    omit?: ModelPreferenceOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ModelPreferenceInclude<ExtArgs> | null
    where?: ModelPreferenceWhereInput
    orderBy?: ModelPreferenceOrderByWithRelationInput | ModelPreferenceOrderByWithRelationInput[]
    cursor?: ModelPreferenceWhereUniqueInput
    take?: number
    skip?: number
    distinct?: ModelPreferenceScalarFieldEnum | ModelPreferenceScalarFieldEnum[]
  }

  /**
   * User without action
   */
  export type UserDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserInclude<ExtArgs> | null
  }


  /**
   * Model Workspace
   */

  export type AggregateWorkspace = {
    _count: WorkspaceCountAggregateOutputType | null
    _min: WorkspaceMinAggregateOutputType | null
    _max: WorkspaceMaxAggregateOutputType | null
  }

  export type WorkspaceMinAggregateOutputType = {
    id: string | null
    userId: string | null
    name: string | null
    rootPath: string | null
    description: string | null
    isArchived: boolean | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type WorkspaceMaxAggregateOutputType = {
    id: string | null
    userId: string | null
    name: string | null
    rootPath: string | null
    description: string | null
    isArchived: boolean | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type WorkspaceCountAggregateOutputType = {
    id: number
    userId: number
    name: number
    rootPath: number
    description: number
    isArchived: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type WorkspaceMinAggregateInputType = {
    id?: true
    userId?: true
    name?: true
    rootPath?: true
    description?: true
    isArchived?: true
    createdAt?: true
    updatedAt?: true
  }

  export type WorkspaceMaxAggregateInputType = {
    id?: true
    userId?: true
    name?: true
    rootPath?: true
    description?: true
    isArchived?: true
    createdAt?: true
    updatedAt?: true
  }

  export type WorkspaceCountAggregateInputType = {
    id?: true
    userId?: true
    name?: true
    rootPath?: true
    description?: true
    isArchived?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type WorkspaceAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Workspace to aggregate.
     */
    where?: WorkspaceWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Workspaces to fetch.
     */
    orderBy?: WorkspaceOrderByWithRelationInput | WorkspaceOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: WorkspaceWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Workspaces from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Workspaces.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned Workspaces
    **/
    _count?: true | WorkspaceCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: WorkspaceMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: WorkspaceMaxAggregateInputType
  }

  export type GetWorkspaceAggregateType<T extends WorkspaceAggregateArgs> = {
        [P in keyof T & keyof AggregateWorkspace]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateWorkspace[P]>
      : GetScalarType<T[P], AggregateWorkspace[P]>
  }




  export type WorkspaceGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: WorkspaceWhereInput
    orderBy?: WorkspaceOrderByWithAggregationInput | WorkspaceOrderByWithAggregationInput[]
    by: WorkspaceScalarFieldEnum[] | WorkspaceScalarFieldEnum
    having?: WorkspaceScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: WorkspaceCountAggregateInputType | true
    _min?: WorkspaceMinAggregateInputType
    _max?: WorkspaceMaxAggregateInputType
  }

  export type WorkspaceGroupByOutputType = {
    id: string
    userId: string
    name: string
    rootPath: string | null
    description: string | null
    isArchived: boolean
    createdAt: Date
    updatedAt: Date
    _count: WorkspaceCountAggregateOutputType | null
    _min: WorkspaceMinAggregateOutputType | null
    _max: WorkspaceMaxAggregateOutputType | null
  }

  type GetWorkspaceGroupByPayload<T extends WorkspaceGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<WorkspaceGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof WorkspaceGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], WorkspaceGroupByOutputType[P]>
            : GetScalarType<T[P], WorkspaceGroupByOutputType[P]>
        }
      >
    >


  export type WorkspaceSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    userId?: boolean
    name?: boolean
    rootPath?: boolean
    description?: boolean
    isArchived?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    user?: boolean | UserDefaultArgs<ExtArgs>
    selectedByUsers?: boolean | Workspace$selectedByUsersArgs<ExtArgs>
    threads?: boolean | Workspace$threadsArgs<ExtArgs>
    _count?: boolean | WorkspaceCountOutputTypeDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["workspace"]>

  export type WorkspaceSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    userId?: boolean
    name?: boolean
    rootPath?: boolean
    description?: boolean
    isArchived?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    user?: boolean | UserDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["workspace"]>

  export type WorkspaceSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    userId?: boolean
    name?: boolean
    rootPath?: boolean
    description?: boolean
    isArchived?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    user?: boolean | UserDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["workspace"]>

  export type WorkspaceSelectScalar = {
    id?: boolean
    userId?: boolean
    name?: boolean
    rootPath?: boolean
    description?: boolean
    isArchived?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }

  export type WorkspaceOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "userId" | "name" | "rootPath" | "description" | "isArchived" | "createdAt" | "updatedAt", ExtArgs["result"]["workspace"]>
  export type WorkspaceInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    user?: boolean | UserDefaultArgs<ExtArgs>
    selectedByUsers?: boolean | Workspace$selectedByUsersArgs<ExtArgs>
    threads?: boolean | Workspace$threadsArgs<ExtArgs>
    _count?: boolean | WorkspaceCountOutputTypeDefaultArgs<ExtArgs>
  }
  export type WorkspaceIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    user?: boolean | UserDefaultArgs<ExtArgs>
  }
  export type WorkspaceIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    user?: boolean | UserDefaultArgs<ExtArgs>
  }

  export type $WorkspacePayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "Workspace"
    objects: {
      user: Prisma.$UserPayload<ExtArgs>
      selectedByUsers: Prisma.$UserPayload<ExtArgs>[]
      threads: Prisma.$ThreadPayload<ExtArgs>[]
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      userId: string
      name: string
      rootPath: string | null
      description: string | null
      isArchived: boolean
      createdAt: Date
      updatedAt: Date
    }, ExtArgs["result"]["workspace"]>
    composites: {}
  }

  type WorkspaceGetPayload<S extends boolean | null | undefined | WorkspaceDefaultArgs> = $Result.GetResult<Prisma.$WorkspacePayload, S>

  type WorkspaceCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<WorkspaceFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: WorkspaceCountAggregateInputType | true
    }

  export interface WorkspaceDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['Workspace'], meta: { name: 'Workspace' } }
    /**
     * Find zero or one Workspace that matches the filter.
     * @param {WorkspaceFindUniqueArgs} args - Arguments to find a Workspace
     * @example
     * // Get one Workspace
     * const workspace = await prisma.workspace.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends WorkspaceFindUniqueArgs>(args: SelectSubset<T, WorkspaceFindUniqueArgs<ExtArgs>>): Prisma__WorkspaceClient<$Result.GetResult<Prisma.$WorkspacePayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one Workspace that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {WorkspaceFindUniqueOrThrowArgs} args - Arguments to find a Workspace
     * @example
     * // Get one Workspace
     * const workspace = await prisma.workspace.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends WorkspaceFindUniqueOrThrowArgs>(args: SelectSubset<T, WorkspaceFindUniqueOrThrowArgs<ExtArgs>>): Prisma__WorkspaceClient<$Result.GetResult<Prisma.$WorkspacePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Workspace that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WorkspaceFindFirstArgs} args - Arguments to find a Workspace
     * @example
     * // Get one Workspace
     * const workspace = await prisma.workspace.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends WorkspaceFindFirstArgs>(args?: SelectSubset<T, WorkspaceFindFirstArgs<ExtArgs>>): Prisma__WorkspaceClient<$Result.GetResult<Prisma.$WorkspacePayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Workspace that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WorkspaceFindFirstOrThrowArgs} args - Arguments to find a Workspace
     * @example
     * // Get one Workspace
     * const workspace = await prisma.workspace.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends WorkspaceFindFirstOrThrowArgs>(args?: SelectSubset<T, WorkspaceFindFirstOrThrowArgs<ExtArgs>>): Prisma__WorkspaceClient<$Result.GetResult<Prisma.$WorkspacePayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more Workspaces that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WorkspaceFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Workspaces
     * const workspaces = await prisma.workspace.findMany()
     * 
     * // Get first 10 Workspaces
     * const workspaces = await prisma.workspace.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const workspaceWithIdOnly = await prisma.workspace.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends WorkspaceFindManyArgs>(args?: SelectSubset<T, WorkspaceFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$WorkspacePayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a Workspace.
     * @param {WorkspaceCreateArgs} args - Arguments to create a Workspace.
     * @example
     * // Create one Workspace
     * const Workspace = await prisma.workspace.create({
     *   data: {
     *     // ... data to create a Workspace
     *   }
     * })
     * 
     */
    create<T extends WorkspaceCreateArgs>(args: SelectSubset<T, WorkspaceCreateArgs<ExtArgs>>): Prisma__WorkspaceClient<$Result.GetResult<Prisma.$WorkspacePayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many Workspaces.
     * @param {WorkspaceCreateManyArgs} args - Arguments to create many Workspaces.
     * @example
     * // Create many Workspaces
     * const workspace = await prisma.workspace.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends WorkspaceCreateManyArgs>(args?: SelectSubset<T, WorkspaceCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many Workspaces and returns the data saved in the database.
     * @param {WorkspaceCreateManyAndReturnArgs} args - Arguments to create many Workspaces.
     * @example
     * // Create many Workspaces
     * const workspace = await prisma.workspace.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many Workspaces and only return the `id`
     * const workspaceWithIdOnly = await prisma.workspace.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends WorkspaceCreateManyAndReturnArgs>(args?: SelectSubset<T, WorkspaceCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$WorkspacePayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a Workspace.
     * @param {WorkspaceDeleteArgs} args - Arguments to delete one Workspace.
     * @example
     * // Delete one Workspace
     * const Workspace = await prisma.workspace.delete({
     *   where: {
     *     // ... filter to delete one Workspace
     *   }
     * })
     * 
     */
    delete<T extends WorkspaceDeleteArgs>(args: SelectSubset<T, WorkspaceDeleteArgs<ExtArgs>>): Prisma__WorkspaceClient<$Result.GetResult<Prisma.$WorkspacePayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one Workspace.
     * @param {WorkspaceUpdateArgs} args - Arguments to update one Workspace.
     * @example
     * // Update one Workspace
     * const workspace = await prisma.workspace.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends WorkspaceUpdateArgs>(args: SelectSubset<T, WorkspaceUpdateArgs<ExtArgs>>): Prisma__WorkspaceClient<$Result.GetResult<Prisma.$WorkspacePayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more Workspaces.
     * @param {WorkspaceDeleteManyArgs} args - Arguments to filter Workspaces to delete.
     * @example
     * // Delete a few Workspaces
     * const { count } = await prisma.workspace.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends WorkspaceDeleteManyArgs>(args?: SelectSubset<T, WorkspaceDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Workspaces.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WorkspaceUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Workspaces
     * const workspace = await prisma.workspace.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends WorkspaceUpdateManyArgs>(args: SelectSubset<T, WorkspaceUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Workspaces and returns the data updated in the database.
     * @param {WorkspaceUpdateManyAndReturnArgs} args - Arguments to update many Workspaces.
     * @example
     * // Update many Workspaces
     * const workspace = await prisma.workspace.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more Workspaces and only return the `id`
     * const workspaceWithIdOnly = await prisma.workspace.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends WorkspaceUpdateManyAndReturnArgs>(args: SelectSubset<T, WorkspaceUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$WorkspacePayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one Workspace.
     * @param {WorkspaceUpsertArgs} args - Arguments to update or create a Workspace.
     * @example
     * // Update or create a Workspace
     * const workspace = await prisma.workspace.upsert({
     *   create: {
     *     // ... data to create a Workspace
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Workspace we want to update
     *   }
     * })
     */
    upsert<T extends WorkspaceUpsertArgs>(args: SelectSubset<T, WorkspaceUpsertArgs<ExtArgs>>): Prisma__WorkspaceClient<$Result.GetResult<Prisma.$WorkspacePayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of Workspaces.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WorkspaceCountArgs} args - Arguments to filter Workspaces to count.
     * @example
     * // Count the number of Workspaces
     * const count = await prisma.workspace.count({
     *   where: {
     *     // ... the filter for the Workspaces we want to count
     *   }
     * })
    **/
    count<T extends WorkspaceCountArgs>(
      args?: Subset<T, WorkspaceCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], WorkspaceCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a Workspace.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WorkspaceAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends WorkspaceAggregateArgs>(args: Subset<T, WorkspaceAggregateArgs>): Prisma.PrismaPromise<GetWorkspaceAggregateType<T>>

    /**
     * Group by Workspace.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WorkspaceGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends WorkspaceGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: WorkspaceGroupByArgs['orderBy'] }
        : { orderBy?: WorkspaceGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, WorkspaceGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetWorkspaceGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the Workspace model
   */
  readonly fields: WorkspaceFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for Workspace.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__WorkspaceClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    user<T extends UserDefaultArgs<ExtArgs> = {}>(args?: Subset<T, UserDefaultArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    selectedByUsers<T extends Workspace$selectedByUsersArgs<ExtArgs> = {}>(args?: Subset<T, Workspace$selectedByUsersArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    threads<T extends Workspace$threadsArgs<ExtArgs> = {}>(args?: Subset<T, Workspace$threadsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ThreadPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the Workspace model
   */
  interface WorkspaceFieldRefs {
    readonly id: FieldRef<"Workspace", 'String'>
    readonly userId: FieldRef<"Workspace", 'String'>
    readonly name: FieldRef<"Workspace", 'String'>
    readonly rootPath: FieldRef<"Workspace", 'String'>
    readonly description: FieldRef<"Workspace", 'String'>
    readonly isArchived: FieldRef<"Workspace", 'Boolean'>
    readonly createdAt: FieldRef<"Workspace", 'DateTime'>
    readonly updatedAt: FieldRef<"Workspace", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * Workspace findUnique
   */
  export type WorkspaceFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Workspace
     */
    select?: WorkspaceSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Workspace
     */
    omit?: WorkspaceOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkspaceInclude<ExtArgs> | null
    /**
     * Filter, which Workspace to fetch.
     */
    where: WorkspaceWhereUniqueInput
  }

  /**
   * Workspace findUniqueOrThrow
   */
  export type WorkspaceFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Workspace
     */
    select?: WorkspaceSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Workspace
     */
    omit?: WorkspaceOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkspaceInclude<ExtArgs> | null
    /**
     * Filter, which Workspace to fetch.
     */
    where: WorkspaceWhereUniqueInput
  }

  /**
   * Workspace findFirst
   */
  export type WorkspaceFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Workspace
     */
    select?: WorkspaceSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Workspace
     */
    omit?: WorkspaceOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkspaceInclude<ExtArgs> | null
    /**
     * Filter, which Workspace to fetch.
     */
    where?: WorkspaceWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Workspaces to fetch.
     */
    orderBy?: WorkspaceOrderByWithRelationInput | WorkspaceOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Workspaces.
     */
    cursor?: WorkspaceWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Workspaces from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Workspaces.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Workspaces.
     */
    distinct?: WorkspaceScalarFieldEnum | WorkspaceScalarFieldEnum[]
  }

  /**
   * Workspace findFirstOrThrow
   */
  export type WorkspaceFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Workspace
     */
    select?: WorkspaceSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Workspace
     */
    omit?: WorkspaceOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkspaceInclude<ExtArgs> | null
    /**
     * Filter, which Workspace to fetch.
     */
    where?: WorkspaceWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Workspaces to fetch.
     */
    orderBy?: WorkspaceOrderByWithRelationInput | WorkspaceOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Workspaces.
     */
    cursor?: WorkspaceWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Workspaces from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Workspaces.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Workspaces.
     */
    distinct?: WorkspaceScalarFieldEnum | WorkspaceScalarFieldEnum[]
  }

  /**
   * Workspace findMany
   */
  export type WorkspaceFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Workspace
     */
    select?: WorkspaceSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Workspace
     */
    omit?: WorkspaceOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkspaceInclude<ExtArgs> | null
    /**
     * Filter, which Workspaces to fetch.
     */
    where?: WorkspaceWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Workspaces to fetch.
     */
    orderBy?: WorkspaceOrderByWithRelationInput | WorkspaceOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing Workspaces.
     */
    cursor?: WorkspaceWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Workspaces from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Workspaces.
     */
    skip?: number
    distinct?: WorkspaceScalarFieldEnum | WorkspaceScalarFieldEnum[]
  }

  /**
   * Workspace create
   */
  export type WorkspaceCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Workspace
     */
    select?: WorkspaceSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Workspace
     */
    omit?: WorkspaceOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkspaceInclude<ExtArgs> | null
    /**
     * The data needed to create a Workspace.
     */
    data: XOR<WorkspaceCreateInput, WorkspaceUncheckedCreateInput>
  }

  /**
   * Workspace createMany
   */
  export type WorkspaceCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many Workspaces.
     */
    data: WorkspaceCreateManyInput | WorkspaceCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * Workspace createManyAndReturn
   */
  export type WorkspaceCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Workspace
     */
    select?: WorkspaceSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Workspace
     */
    omit?: WorkspaceOmit<ExtArgs> | null
    /**
     * The data used to create many Workspaces.
     */
    data: WorkspaceCreateManyInput | WorkspaceCreateManyInput[]
    skipDuplicates?: boolean
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkspaceIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * Workspace update
   */
  export type WorkspaceUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Workspace
     */
    select?: WorkspaceSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Workspace
     */
    omit?: WorkspaceOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkspaceInclude<ExtArgs> | null
    /**
     * The data needed to update a Workspace.
     */
    data: XOR<WorkspaceUpdateInput, WorkspaceUncheckedUpdateInput>
    /**
     * Choose, which Workspace to update.
     */
    where: WorkspaceWhereUniqueInput
  }

  /**
   * Workspace updateMany
   */
  export type WorkspaceUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update Workspaces.
     */
    data: XOR<WorkspaceUpdateManyMutationInput, WorkspaceUncheckedUpdateManyInput>
    /**
     * Filter which Workspaces to update
     */
    where?: WorkspaceWhereInput
    /**
     * Limit how many Workspaces to update.
     */
    limit?: number
  }

  /**
   * Workspace updateManyAndReturn
   */
  export type WorkspaceUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Workspace
     */
    select?: WorkspaceSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Workspace
     */
    omit?: WorkspaceOmit<ExtArgs> | null
    /**
     * The data used to update Workspaces.
     */
    data: XOR<WorkspaceUpdateManyMutationInput, WorkspaceUncheckedUpdateManyInput>
    /**
     * Filter which Workspaces to update
     */
    where?: WorkspaceWhereInput
    /**
     * Limit how many Workspaces to update.
     */
    limit?: number
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkspaceIncludeUpdateManyAndReturn<ExtArgs> | null
  }

  /**
   * Workspace upsert
   */
  export type WorkspaceUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Workspace
     */
    select?: WorkspaceSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Workspace
     */
    omit?: WorkspaceOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkspaceInclude<ExtArgs> | null
    /**
     * The filter to search for the Workspace to update in case it exists.
     */
    where: WorkspaceWhereUniqueInput
    /**
     * In case the Workspace found by the `where` argument doesn't exist, create a new Workspace with this data.
     */
    create: XOR<WorkspaceCreateInput, WorkspaceUncheckedCreateInput>
    /**
     * In case the Workspace was found with the provided `where` argument, update it with this data.
     */
    update: XOR<WorkspaceUpdateInput, WorkspaceUncheckedUpdateInput>
  }

  /**
   * Workspace delete
   */
  export type WorkspaceDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Workspace
     */
    select?: WorkspaceSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Workspace
     */
    omit?: WorkspaceOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkspaceInclude<ExtArgs> | null
    /**
     * Filter which Workspace to delete.
     */
    where: WorkspaceWhereUniqueInput
  }

  /**
   * Workspace deleteMany
   */
  export type WorkspaceDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Workspaces to delete
     */
    where?: WorkspaceWhereInput
    /**
     * Limit how many Workspaces to delete.
     */
    limit?: number
  }

  /**
   * Workspace.selectedByUsers
   */
  export type Workspace$selectedByUsersArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserInclude<ExtArgs> | null
    where?: UserWhereInput
    orderBy?: UserOrderByWithRelationInput | UserOrderByWithRelationInput[]
    cursor?: UserWhereUniqueInput
    take?: number
    skip?: number
    distinct?: UserScalarFieldEnum | UserScalarFieldEnum[]
  }

  /**
   * Workspace.threads
   */
  export type Workspace$threadsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Thread
     */
    select?: ThreadSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Thread
     */
    omit?: ThreadOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ThreadInclude<ExtArgs> | null
    where?: ThreadWhereInput
    orderBy?: ThreadOrderByWithRelationInput | ThreadOrderByWithRelationInput[]
    cursor?: ThreadWhereUniqueInput
    take?: number
    skip?: number
    distinct?: ThreadScalarFieldEnum | ThreadScalarFieldEnum[]
  }

  /**
   * Workspace without action
   */
  export type WorkspaceDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Workspace
     */
    select?: WorkspaceSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Workspace
     */
    omit?: WorkspaceOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkspaceInclude<ExtArgs> | null
  }


  /**
   * Model Thread
   */

  export type AggregateThread = {
    _count: ThreadCountAggregateOutputType | null
    _min: ThreadMinAggregateOutputType | null
    _max: ThreadMaxAggregateOutputType | null
  }

  export type ThreadMinAggregateOutputType = {
    id: string | null
    workspaceId: string | null
    userId: string | null
    title: string | null
    summary: string | null
    createdAt: Date | null
    updatedAt: Date | null
    archivedAt: Date | null
  }

  export type ThreadMaxAggregateOutputType = {
    id: string | null
    workspaceId: string | null
    userId: string | null
    title: string | null
    summary: string | null
    createdAt: Date | null
    updatedAt: Date | null
    archivedAt: Date | null
  }

  export type ThreadCountAggregateOutputType = {
    id: number
    workspaceId: number
    userId: number
    title: number
    summary: number
    createdAt: number
    updatedAt: number
    archivedAt: number
    _all: number
  }


  export type ThreadMinAggregateInputType = {
    id?: true
    workspaceId?: true
    userId?: true
    title?: true
    summary?: true
    createdAt?: true
    updatedAt?: true
    archivedAt?: true
  }

  export type ThreadMaxAggregateInputType = {
    id?: true
    workspaceId?: true
    userId?: true
    title?: true
    summary?: true
    createdAt?: true
    updatedAt?: true
    archivedAt?: true
  }

  export type ThreadCountAggregateInputType = {
    id?: true
    workspaceId?: true
    userId?: true
    title?: true
    summary?: true
    createdAt?: true
    updatedAt?: true
    archivedAt?: true
    _all?: true
  }

  export type ThreadAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Thread to aggregate.
     */
    where?: ThreadWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Threads to fetch.
     */
    orderBy?: ThreadOrderByWithRelationInput | ThreadOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: ThreadWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Threads from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Threads.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned Threads
    **/
    _count?: true | ThreadCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: ThreadMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: ThreadMaxAggregateInputType
  }

  export type GetThreadAggregateType<T extends ThreadAggregateArgs> = {
        [P in keyof T & keyof AggregateThread]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateThread[P]>
      : GetScalarType<T[P], AggregateThread[P]>
  }




  export type ThreadGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: ThreadWhereInput
    orderBy?: ThreadOrderByWithAggregationInput | ThreadOrderByWithAggregationInput[]
    by: ThreadScalarFieldEnum[] | ThreadScalarFieldEnum
    having?: ThreadScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: ThreadCountAggregateInputType | true
    _min?: ThreadMinAggregateInputType
    _max?: ThreadMaxAggregateInputType
  }

  export type ThreadGroupByOutputType = {
    id: string
    workspaceId: string
    userId: string
    title: string
    summary: string | null
    createdAt: Date
    updatedAt: Date
    archivedAt: Date | null
    _count: ThreadCountAggregateOutputType | null
    _min: ThreadMinAggregateOutputType | null
    _max: ThreadMaxAggregateOutputType | null
  }

  type GetThreadGroupByPayload<T extends ThreadGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<ThreadGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof ThreadGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], ThreadGroupByOutputType[P]>
            : GetScalarType<T[P], ThreadGroupByOutputType[P]>
        }
      >
    >


  export type ThreadSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    workspaceId?: boolean
    userId?: boolean
    title?: boolean
    summary?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    archivedAt?: boolean
    workspace?: boolean | WorkspaceDefaultArgs<ExtArgs>
    user?: boolean | UserDefaultArgs<ExtArgs>
    messages?: boolean | Thread$messagesArgs<ExtArgs>
    _count?: boolean | ThreadCountOutputTypeDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["thread"]>

  export type ThreadSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    workspaceId?: boolean
    userId?: boolean
    title?: boolean
    summary?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    archivedAt?: boolean
    workspace?: boolean | WorkspaceDefaultArgs<ExtArgs>
    user?: boolean | UserDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["thread"]>

  export type ThreadSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    workspaceId?: boolean
    userId?: boolean
    title?: boolean
    summary?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    archivedAt?: boolean
    workspace?: boolean | WorkspaceDefaultArgs<ExtArgs>
    user?: boolean | UserDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["thread"]>

  export type ThreadSelectScalar = {
    id?: boolean
    workspaceId?: boolean
    userId?: boolean
    title?: boolean
    summary?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    archivedAt?: boolean
  }

  export type ThreadOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "workspaceId" | "userId" | "title" | "summary" | "createdAt" | "updatedAt" | "archivedAt", ExtArgs["result"]["thread"]>
  export type ThreadInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    workspace?: boolean | WorkspaceDefaultArgs<ExtArgs>
    user?: boolean | UserDefaultArgs<ExtArgs>
    messages?: boolean | Thread$messagesArgs<ExtArgs>
    _count?: boolean | ThreadCountOutputTypeDefaultArgs<ExtArgs>
  }
  export type ThreadIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    workspace?: boolean | WorkspaceDefaultArgs<ExtArgs>
    user?: boolean | UserDefaultArgs<ExtArgs>
  }
  export type ThreadIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    workspace?: boolean | WorkspaceDefaultArgs<ExtArgs>
    user?: boolean | UserDefaultArgs<ExtArgs>
  }

  export type $ThreadPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "Thread"
    objects: {
      workspace: Prisma.$WorkspacePayload<ExtArgs>
      user: Prisma.$UserPayload<ExtArgs>
      messages: Prisma.$ThreadMessagePayload<ExtArgs>[]
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      workspaceId: string
      userId: string
      title: string
      summary: string | null
      createdAt: Date
      updatedAt: Date
      archivedAt: Date | null
    }, ExtArgs["result"]["thread"]>
    composites: {}
  }

  type ThreadGetPayload<S extends boolean | null | undefined | ThreadDefaultArgs> = $Result.GetResult<Prisma.$ThreadPayload, S>

  type ThreadCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<ThreadFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: ThreadCountAggregateInputType | true
    }

  export interface ThreadDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['Thread'], meta: { name: 'Thread' } }
    /**
     * Find zero or one Thread that matches the filter.
     * @param {ThreadFindUniqueArgs} args - Arguments to find a Thread
     * @example
     * // Get one Thread
     * const thread = await prisma.thread.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends ThreadFindUniqueArgs>(args: SelectSubset<T, ThreadFindUniqueArgs<ExtArgs>>): Prisma__ThreadClient<$Result.GetResult<Prisma.$ThreadPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one Thread that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {ThreadFindUniqueOrThrowArgs} args - Arguments to find a Thread
     * @example
     * // Get one Thread
     * const thread = await prisma.thread.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends ThreadFindUniqueOrThrowArgs>(args: SelectSubset<T, ThreadFindUniqueOrThrowArgs<ExtArgs>>): Prisma__ThreadClient<$Result.GetResult<Prisma.$ThreadPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Thread that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ThreadFindFirstArgs} args - Arguments to find a Thread
     * @example
     * // Get one Thread
     * const thread = await prisma.thread.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends ThreadFindFirstArgs>(args?: SelectSubset<T, ThreadFindFirstArgs<ExtArgs>>): Prisma__ThreadClient<$Result.GetResult<Prisma.$ThreadPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Thread that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ThreadFindFirstOrThrowArgs} args - Arguments to find a Thread
     * @example
     * // Get one Thread
     * const thread = await prisma.thread.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends ThreadFindFirstOrThrowArgs>(args?: SelectSubset<T, ThreadFindFirstOrThrowArgs<ExtArgs>>): Prisma__ThreadClient<$Result.GetResult<Prisma.$ThreadPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more Threads that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ThreadFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Threads
     * const threads = await prisma.thread.findMany()
     * 
     * // Get first 10 Threads
     * const threads = await prisma.thread.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const threadWithIdOnly = await prisma.thread.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends ThreadFindManyArgs>(args?: SelectSubset<T, ThreadFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ThreadPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a Thread.
     * @param {ThreadCreateArgs} args - Arguments to create a Thread.
     * @example
     * // Create one Thread
     * const Thread = await prisma.thread.create({
     *   data: {
     *     // ... data to create a Thread
     *   }
     * })
     * 
     */
    create<T extends ThreadCreateArgs>(args: SelectSubset<T, ThreadCreateArgs<ExtArgs>>): Prisma__ThreadClient<$Result.GetResult<Prisma.$ThreadPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many Threads.
     * @param {ThreadCreateManyArgs} args - Arguments to create many Threads.
     * @example
     * // Create many Threads
     * const thread = await prisma.thread.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends ThreadCreateManyArgs>(args?: SelectSubset<T, ThreadCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many Threads and returns the data saved in the database.
     * @param {ThreadCreateManyAndReturnArgs} args - Arguments to create many Threads.
     * @example
     * // Create many Threads
     * const thread = await prisma.thread.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many Threads and only return the `id`
     * const threadWithIdOnly = await prisma.thread.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends ThreadCreateManyAndReturnArgs>(args?: SelectSubset<T, ThreadCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ThreadPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a Thread.
     * @param {ThreadDeleteArgs} args - Arguments to delete one Thread.
     * @example
     * // Delete one Thread
     * const Thread = await prisma.thread.delete({
     *   where: {
     *     // ... filter to delete one Thread
     *   }
     * })
     * 
     */
    delete<T extends ThreadDeleteArgs>(args: SelectSubset<T, ThreadDeleteArgs<ExtArgs>>): Prisma__ThreadClient<$Result.GetResult<Prisma.$ThreadPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one Thread.
     * @param {ThreadUpdateArgs} args - Arguments to update one Thread.
     * @example
     * // Update one Thread
     * const thread = await prisma.thread.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends ThreadUpdateArgs>(args: SelectSubset<T, ThreadUpdateArgs<ExtArgs>>): Prisma__ThreadClient<$Result.GetResult<Prisma.$ThreadPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more Threads.
     * @param {ThreadDeleteManyArgs} args - Arguments to filter Threads to delete.
     * @example
     * // Delete a few Threads
     * const { count } = await prisma.thread.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends ThreadDeleteManyArgs>(args?: SelectSubset<T, ThreadDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Threads.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ThreadUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Threads
     * const thread = await prisma.thread.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends ThreadUpdateManyArgs>(args: SelectSubset<T, ThreadUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Threads and returns the data updated in the database.
     * @param {ThreadUpdateManyAndReturnArgs} args - Arguments to update many Threads.
     * @example
     * // Update many Threads
     * const thread = await prisma.thread.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more Threads and only return the `id`
     * const threadWithIdOnly = await prisma.thread.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends ThreadUpdateManyAndReturnArgs>(args: SelectSubset<T, ThreadUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ThreadPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one Thread.
     * @param {ThreadUpsertArgs} args - Arguments to update or create a Thread.
     * @example
     * // Update or create a Thread
     * const thread = await prisma.thread.upsert({
     *   create: {
     *     // ... data to create a Thread
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Thread we want to update
     *   }
     * })
     */
    upsert<T extends ThreadUpsertArgs>(args: SelectSubset<T, ThreadUpsertArgs<ExtArgs>>): Prisma__ThreadClient<$Result.GetResult<Prisma.$ThreadPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of Threads.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ThreadCountArgs} args - Arguments to filter Threads to count.
     * @example
     * // Count the number of Threads
     * const count = await prisma.thread.count({
     *   where: {
     *     // ... the filter for the Threads we want to count
     *   }
     * })
    **/
    count<T extends ThreadCountArgs>(
      args?: Subset<T, ThreadCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], ThreadCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a Thread.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ThreadAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends ThreadAggregateArgs>(args: Subset<T, ThreadAggregateArgs>): Prisma.PrismaPromise<GetThreadAggregateType<T>>

    /**
     * Group by Thread.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ThreadGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends ThreadGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: ThreadGroupByArgs['orderBy'] }
        : { orderBy?: ThreadGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, ThreadGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetThreadGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the Thread model
   */
  readonly fields: ThreadFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for Thread.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__ThreadClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    workspace<T extends WorkspaceDefaultArgs<ExtArgs> = {}>(args?: Subset<T, WorkspaceDefaultArgs<ExtArgs>>): Prisma__WorkspaceClient<$Result.GetResult<Prisma.$WorkspacePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    user<T extends UserDefaultArgs<ExtArgs> = {}>(args?: Subset<T, UserDefaultArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    messages<T extends Thread$messagesArgs<ExtArgs> = {}>(args?: Subset<T, Thread$messagesArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ThreadMessagePayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the Thread model
   */
  interface ThreadFieldRefs {
    readonly id: FieldRef<"Thread", 'String'>
    readonly workspaceId: FieldRef<"Thread", 'String'>
    readonly userId: FieldRef<"Thread", 'String'>
    readonly title: FieldRef<"Thread", 'String'>
    readonly summary: FieldRef<"Thread", 'String'>
    readonly createdAt: FieldRef<"Thread", 'DateTime'>
    readonly updatedAt: FieldRef<"Thread", 'DateTime'>
    readonly archivedAt: FieldRef<"Thread", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * Thread findUnique
   */
  export type ThreadFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Thread
     */
    select?: ThreadSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Thread
     */
    omit?: ThreadOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ThreadInclude<ExtArgs> | null
    /**
     * Filter, which Thread to fetch.
     */
    where: ThreadWhereUniqueInput
  }

  /**
   * Thread findUniqueOrThrow
   */
  export type ThreadFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Thread
     */
    select?: ThreadSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Thread
     */
    omit?: ThreadOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ThreadInclude<ExtArgs> | null
    /**
     * Filter, which Thread to fetch.
     */
    where: ThreadWhereUniqueInput
  }

  /**
   * Thread findFirst
   */
  export type ThreadFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Thread
     */
    select?: ThreadSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Thread
     */
    omit?: ThreadOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ThreadInclude<ExtArgs> | null
    /**
     * Filter, which Thread to fetch.
     */
    where?: ThreadWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Threads to fetch.
     */
    orderBy?: ThreadOrderByWithRelationInput | ThreadOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Threads.
     */
    cursor?: ThreadWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Threads from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Threads.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Threads.
     */
    distinct?: ThreadScalarFieldEnum | ThreadScalarFieldEnum[]
  }

  /**
   * Thread findFirstOrThrow
   */
  export type ThreadFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Thread
     */
    select?: ThreadSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Thread
     */
    omit?: ThreadOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ThreadInclude<ExtArgs> | null
    /**
     * Filter, which Thread to fetch.
     */
    where?: ThreadWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Threads to fetch.
     */
    orderBy?: ThreadOrderByWithRelationInput | ThreadOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Threads.
     */
    cursor?: ThreadWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Threads from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Threads.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Threads.
     */
    distinct?: ThreadScalarFieldEnum | ThreadScalarFieldEnum[]
  }

  /**
   * Thread findMany
   */
  export type ThreadFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Thread
     */
    select?: ThreadSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Thread
     */
    omit?: ThreadOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ThreadInclude<ExtArgs> | null
    /**
     * Filter, which Threads to fetch.
     */
    where?: ThreadWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Threads to fetch.
     */
    orderBy?: ThreadOrderByWithRelationInput | ThreadOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing Threads.
     */
    cursor?: ThreadWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Threads from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Threads.
     */
    skip?: number
    distinct?: ThreadScalarFieldEnum | ThreadScalarFieldEnum[]
  }

  /**
   * Thread create
   */
  export type ThreadCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Thread
     */
    select?: ThreadSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Thread
     */
    omit?: ThreadOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ThreadInclude<ExtArgs> | null
    /**
     * The data needed to create a Thread.
     */
    data: XOR<ThreadCreateInput, ThreadUncheckedCreateInput>
  }

  /**
   * Thread createMany
   */
  export type ThreadCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many Threads.
     */
    data: ThreadCreateManyInput | ThreadCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * Thread createManyAndReturn
   */
  export type ThreadCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Thread
     */
    select?: ThreadSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Thread
     */
    omit?: ThreadOmit<ExtArgs> | null
    /**
     * The data used to create many Threads.
     */
    data: ThreadCreateManyInput | ThreadCreateManyInput[]
    skipDuplicates?: boolean
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ThreadIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * Thread update
   */
  export type ThreadUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Thread
     */
    select?: ThreadSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Thread
     */
    omit?: ThreadOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ThreadInclude<ExtArgs> | null
    /**
     * The data needed to update a Thread.
     */
    data: XOR<ThreadUpdateInput, ThreadUncheckedUpdateInput>
    /**
     * Choose, which Thread to update.
     */
    where: ThreadWhereUniqueInput
  }

  /**
   * Thread updateMany
   */
  export type ThreadUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update Threads.
     */
    data: XOR<ThreadUpdateManyMutationInput, ThreadUncheckedUpdateManyInput>
    /**
     * Filter which Threads to update
     */
    where?: ThreadWhereInput
    /**
     * Limit how many Threads to update.
     */
    limit?: number
  }

  /**
   * Thread updateManyAndReturn
   */
  export type ThreadUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Thread
     */
    select?: ThreadSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Thread
     */
    omit?: ThreadOmit<ExtArgs> | null
    /**
     * The data used to update Threads.
     */
    data: XOR<ThreadUpdateManyMutationInput, ThreadUncheckedUpdateManyInput>
    /**
     * Filter which Threads to update
     */
    where?: ThreadWhereInput
    /**
     * Limit how many Threads to update.
     */
    limit?: number
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ThreadIncludeUpdateManyAndReturn<ExtArgs> | null
  }

  /**
   * Thread upsert
   */
  export type ThreadUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Thread
     */
    select?: ThreadSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Thread
     */
    omit?: ThreadOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ThreadInclude<ExtArgs> | null
    /**
     * The filter to search for the Thread to update in case it exists.
     */
    where: ThreadWhereUniqueInput
    /**
     * In case the Thread found by the `where` argument doesn't exist, create a new Thread with this data.
     */
    create: XOR<ThreadCreateInput, ThreadUncheckedCreateInput>
    /**
     * In case the Thread was found with the provided `where` argument, update it with this data.
     */
    update: XOR<ThreadUpdateInput, ThreadUncheckedUpdateInput>
  }

  /**
   * Thread delete
   */
  export type ThreadDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Thread
     */
    select?: ThreadSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Thread
     */
    omit?: ThreadOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ThreadInclude<ExtArgs> | null
    /**
     * Filter which Thread to delete.
     */
    where: ThreadWhereUniqueInput
  }

  /**
   * Thread deleteMany
   */
  export type ThreadDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Threads to delete
     */
    where?: ThreadWhereInput
    /**
     * Limit how many Threads to delete.
     */
    limit?: number
  }

  /**
   * Thread.messages
   */
  export type Thread$messagesArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ThreadMessage
     */
    select?: ThreadMessageSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ThreadMessage
     */
    omit?: ThreadMessageOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ThreadMessageInclude<ExtArgs> | null
    where?: ThreadMessageWhereInput
    orderBy?: ThreadMessageOrderByWithRelationInput | ThreadMessageOrderByWithRelationInput[]
    cursor?: ThreadMessageWhereUniqueInput
    take?: number
    skip?: number
    distinct?: ThreadMessageScalarFieldEnum | ThreadMessageScalarFieldEnum[]
  }

  /**
   * Thread without action
   */
  export type ThreadDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Thread
     */
    select?: ThreadSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Thread
     */
    omit?: ThreadOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ThreadInclude<ExtArgs> | null
  }


  /**
   * Model ThreadMessage
   */

  export type AggregateThreadMessage = {
    _count: ThreadMessageCountAggregateOutputType | null
    _min: ThreadMessageMinAggregateOutputType | null
    _max: ThreadMessageMaxAggregateOutputType | null
  }

  export type ThreadMessageMinAggregateOutputType = {
    id: string | null
    threadId: string | null
    messageId: string | null
    role: $Enums.ThreadMessageRole | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type ThreadMessageMaxAggregateOutputType = {
    id: string | null
    threadId: string | null
    messageId: string | null
    role: $Enums.ThreadMessageRole | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type ThreadMessageCountAggregateOutputType = {
    id: number
    threadId: number
    messageId: number
    role: number
    parts: number
    metadata: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type ThreadMessageMinAggregateInputType = {
    id?: true
    threadId?: true
    messageId?: true
    role?: true
    createdAt?: true
    updatedAt?: true
  }

  export type ThreadMessageMaxAggregateInputType = {
    id?: true
    threadId?: true
    messageId?: true
    role?: true
    createdAt?: true
    updatedAt?: true
  }

  export type ThreadMessageCountAggregateInputType = {
    id?: true
    threadId?: true
    messageId?: true
    role?: true
    parts?: true
    metadata?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type ThreadMessageAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which ThreadMessage to aggregate.
     */
    where?: ThreadMessageWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of ThreadMessages to fetch.
     */
    orderBy?: ThreadMessageOrderByWithRelationInput | ThreadMessageOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: ThreadMessageWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` ThreadMessages from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` ThreadMessages.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned ThreadMessages
    **/
    _count?: true | ThreadMessageCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: ThreadMessageMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: ThreadMessageMaxAggregateInputType
  }

  export type GetThreadMessageAggregateType<T extends ThreadMessageAggregateArgs> = {
        [P in keyof T & keyof AggregateThreadMessage]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateThreadMessage[P]>
      : GetScalarType<T[P], AggregateThreadMessage[P]>
  }




  export type ThreadMessageGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: ThreadMessageWhereInput
    orderBy?: ThreadMessageOrderByWithAggregationInput | ThreadMessageOrderByWithAggregationInput[]
    by: ThreadMessageScalarFieldEnum[] | ThreadMessageScalarFieldEnum
    having?: ThreadMessageScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: ThreadMessageCountAggregateInputType | true
    _min?: ThreadMessageMinAggregateInputType
    _max?: ThreadMessageMaxAggregateInputType
  }

  export type ThreadMessageGroupByOutputType = {
    id: string
    threadId: string
    messageId: string
    role: $Enums.ThreadMessageRole
    parts: JsonValue
    metadata: JsonValue | null
    createdAt: Date
    updatedAt: Date
    _count: ThreadMessageCountAggregateOutputType | null
    _min: ThreadMessageMinAggregateOutputType | null
    _max: ThreadMessageMaxAggregateOutputType | null
  }

  type GetThreadMessageGroupByPayload<T extends ThreadMessageGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<ThreadMessageGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof ThreadMessageGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], ThreadMessageGroupByOutputType[P]>
            : GetScalarType<T[P], ThreadMessageGroupByOutputType[P]>
        }
      >
    >


  export type ThreadMessageSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    threadId?: boolean
    messageId?: boolean
    role?: boolean
    parts?: boolean
    metadata?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    thread?: boolean | ThreadDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["threadMessage"]>

  export type ThreadMessageSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    threadId?: boolean
    messageId?: boolean
    role?: boolean
    parts?: boolean
    metadata?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    thread?: boolean | ThreadDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["threadMessage"]>

  export type ThreadMessageSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    threadId?: boolean
    messageId?: boolean
    role?: boolean
    parts?: boolean
    metadata?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    thread?: boolean | ThreadDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["threadMessage"]>

  export type ThreadMessageSelectScalar = {
    id?: boolean
    threadId?: boolean
    messageId?: boolean
    role?: boolean
    parts?: boolean
    metadata?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }

  export type ThreadMessageOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "threadId" | "messageId" | "role" | "parts" | "metadata" | "createdAt" | "updatedAt", ExtArgs["result"]["threadMessage"]>
  export type ThreadMessageInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    thread?: boolean | ThreadDefaultArgs<ExtArgs>
  }
  export type ThreadMessageIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    thread?: boolean | ThreadDefaultArgs<ExtArgs>
  }
  export type ThreadMessageIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    thread?: boolean | ThreadDefaultArgs<ExtArgs>
  }

  export type $ThreadMessagePayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "ThreadMessage"
    objects: {
      thread: Prisma.$ThreadPayload<ExtArgs>
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      threadId: string
      messageId: string
      role: $Enums.ThreadMessageRole
      parts: Prisma.JsonValue
      metadata: Prisma.JsonValue | null
      createdAt: Date
      updatedAt: Date
    }, ExtArgs["result"]["threadMessage"]>
    composites: {}
  }

  type ThreadMessageGetPayload<S extends boolean | null | undefined | ThreadMessageDefaultArgs> = $Result.GetResult<Prisma.$ThreadMessagePayload, S>

  type ThreadMessageCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<ThreadMessageFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: ThreadMessageCountAggregateInputType | true
    }

  export interface ThreadMessageDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['ThreadMessage'], meta: { name: 'ThreadMessage' } }
    /**
     * Find zero or one ThreadMessage that matches the filter.
     * @param {ThreadMessageFindUniqueArgs} args - Arguments to find a ThreadMessage
     * @example
     * // Get one ThreadMessage
     * const threadMessage = await prisma.threadMessage.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends ThreadMessageFindUniqueArgs>(args: SelectSubset<T, ThreadMessageFindUniqueArgs<ExtArgs>>): Prisma__ThreadMessageClient<$Result.GetResult<Prisma.$ThreadMessagePayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one ThreadMessage that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {ThreadMessageFindUniqueOrThrowArgs} args - Arguments to find a ThreadMessage
     * @example
     * // Get one ThreadMessage
     * const threadMessage = await prisma.threadMessage.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends ThreadMessageFindUniqueOrThrowArgs>(args: SelectSubset<T, ThreadMessageFindUniqueOrThrowArgs<ExtArgs>>): Prisma__ThreadMessageClient<$Result.GetResult<Prisma.$ThreadMessagePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first ThreadMessage that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ThreadMessageFindFirstArgs} args - Arguments to find a ThreadMessage
     * @example
     * // Get one ThreadMessage
     * const threadMessage = await prisma.threadMessage.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends ThreadMessageFindFirstArgs>(args?: SelectSubset<T, ThreadMessageFindFirstArgs<ExtArgs>>): Prisma__ThreadMessageClient<$Result.GetResult<Prisma.$ThreadMessagePayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first ThreadMessage that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ThreadMessageFindFirstOrThrowArgs} args - Arguments to find a ThreadMessage
     * @example
     * // Get one ThreadMessage
     * const threadMessage = await prisma.threadMessage.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends ThreadMessageFindFirstOrThrowArgs>(args?: SelectSubset<T, ThreadMessageFindFirstOrThrowArgs<ExtArgs>>): Prisma__ThreadMessageClient<$Result.GetResult<Prisma.$ThreadMessagePayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more ThreadMessages that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ThreadMessageFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all ThreadMessages
     * const threadMessages = await prisma.threadMessage.findMany()
     * 
     * // Get first 10 ThreadMessages
     * const threadMessages = await prisma.threadMessage.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const threadMessageWithIdOnly = await prisma.threadMessage.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends ThreadMessageFindManyArgs>(args?: SelectSubset<T, ThreadMessageFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ThreadMessagePayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a ThreadMessage.
     * @param {ThreadMessageCreateArgs} args - Arguments to create a ThreadMessage.
     * @example
     * // Create one ThreadMessage
     * const ThreadMessage = await prisma.threadMessage.create({
     *   data: {
     *     // ... data to create a ThreadMessage
     *   }
     * })
     * 
     */
    create<T extends ThreadMessageCreateArgs>(args: SelectSubset<T, ThreadMessageCreateArgs<ExtArgs>>): Prisma__ThreadMessageClient<$Result.GetResult<Prisma.$ThreadMessagePayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many ThreadMessages.
     * @param {ThreadMessageCreateManyArgs} args - Arguments to create many ThreadMessages.
     * @example
     * // Create many ThreadMessages
     * const threadMessage = await prisma.threadMessage.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends ThreadMessageCreateManyArgs>(args?: SelectSubset<T, ThreadMessageCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many ThreadMessages and returns the data saved in the database.
     * @param {ThreadMessageCreateManyAndReturnArgs} args - Arguments to create many ThreadMessages.
     * @example
     * // Create many ThreadMessages
     * const threadMessage = await prisma.threadMessage.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many ThreadMessages and only return the `id`
     * const threadMessageWithIdOnly = await prisma.threadMessage.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends ThreadMessageCreateManyAndReturnArgs>(args?: SelectSubset<T, ThreadMessageCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ThreadMessagePayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a ThreadMessage.
     * @param {ThreadMessageDeleteArgs} args - Arguments to delete one ThreadMessage.
     * @example
     * // Delete one ThreadMessage
     * const ThreadMessage = await prisma.threadMessage.delete({
     *   where: {
     *     // ... filter to delete one ThreadMessage
     *   }
     * })
     * 
     */
    delete<T extends ThreadMessageDeleteArgs>(args: SelectSubset<T, ThreadMessageDeleteArgs<ExtArgs>>): Prisma__ThreadMessageClient<$Result.GetResult<Prisma.$ThreadMessagePayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one ThreadMessage.
     * @param {ThreadMessageUpdateArgs} args - Arguments to update one ThreadMessage.
     * @example
     * // Update one ThreadMessage
     * const threadMessage = await prisma.threadMessage.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends ThreadMessageUpdateArgs>(args: SelectSubset<T, ThreadMessageUpdateArgs<ExtArgs>>): Prisma__ThreadMessageClient<$Result.GetResult<Prisma.$ThreadMessagePayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more ThreadMessages.
     * @param {ThreadMessageDeleteManyArgs} args - Arguments to filter ThreadMessages to delete.
     * @example
     * // Delete a few ThreadMessages
     * const { count } = await prisma.threadMessage.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends ThreadMessageDeleteManyArgs>(args?: SelectSubset<T, ThreadMessageDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more ThreadMessages.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ThreadMessageUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many ThreadMessages
     * const threadMessage = await prisma.threadMessage.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends ThreadMessageUpdateManyArgs>(args: SelectSubset<T, ThreadMessageUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more ThreadMessages and returns the data updated in the database.
     * @param {ThreadMessageUpdateManyAndReturnArgs} args - Arguments to update many ThreadMessages.
     * @example
     * // Update many ThreadMessages
     * const threadMessage = await prisma.threadMessage.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more ThreadMessages and only return the `id`
     * const threadMessageWithIdOnly = await prisma.threadMessage.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends ThreadMessageUpdateManyAndReturnArgs>(args: SelectSubset<T, ThreadMessageUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ThreadMessagePayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one ThreadMessage.
     * @param {ThreadMessageUpsertArgs} args - Arguments to update or create a ThreadMessage.
     * @example
     * // Update or create a ThreadMessage
     * const threadMessage = await prisma.threadMessage.upsert({
     *   create: {
     *     // ... data to create a ThreadMessage
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the ThreadMessage we want to update
     *   }
     * })
     */
    upsert<T extends ThreadMessageUpsertArgs>(args: SelectSubset<T, ThreadMessageUpsertArgs<ExtArgs>>): Prisma__ThreadMessageClient<$Result.GetResult<Prisma.$ThreadMessagePayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of ThreadMessages.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ThreadMessageCountArgs} args - Arguments to filter ThreadMessages to count.
     * @example
     * // Count the number of ThreadMessages
     * const count = await prisma.threadMessage.count({
     *   where: {
     *     // ... the filter for the ThreadMessages we want to count
     *   }
     * })
    **/
    count<T extends ThreadMessageCountArgs>(
      args?: Subset<T, ThreadMessageCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], ThreadMessageCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a ThreadMessage.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ThreadMessageAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends ThreadMessageAggregateArgs>(args: Subset<T, ThreadMessageAggregateArgs>): Prisma.PrismaPromise<GetThreadMessageAggregateType<T>>

    /**
     * Group by ThreadMessage.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ThreadMessageGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends ThreadMessageGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: ThreadMessageGroupByArgs['orderBy'] }
        : { orderBy?: ThreadMessageGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, ThreadMessageGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetThreadMessageGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the ThreadMessage model
   */
  readonly fields: ThreadMessageFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for ThreadMessage.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__ThreadMessageClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    thread<T extends ThreadDefaultArgs<ExtArgs> = {}>(args?: Subset<T, ThreadDefaultArgs<ExtArgs>>): Prisma__ThreadClient<$Result.GetResult<Prisma.$ThreadPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the ThreadMessage model
   */
  interface ThreadMessageFieldRefs {
    readonly id: FieldRef<"ThreadMessage", 'String'>
    readonly threadId: FieldRef<"ThreadMessage", 'String'>
    readonly messageId: FieldRef<"ThreadMessage", 'String'>
    readonly role: FieldRef<"ThreadMessage", 'ThreadMessageRole'>
    readonly parts: FieldRef<"ThreadMessage", 'Json'>
    readonly metadata: FieldRef<"ThreadMessage", 'Json'>
    readonly createdAt: FieldRef<"ThreadMessage", 'DateTime'>
    readonly updatedAt: FieldRef<"ThreadMessage", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * ThreadMessage findUnique
   */
  export type ThreadMessageFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ThreadMessage
     */
    select?: ThreadMessageSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ThreadMessage
     */
    omit?: ThreadMessageOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ThreadMessageInclude<ExtArgs> | null
    /**
     * Filter, which ThreadMessage to fetch.
     */
    where: ThreadMessageWhereUniqueInput
  }

  /**
   * ThreadMessage findUniqueOrThrow
   */
  export type ThreadMessageFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ThreadMessage
     */
    select?: ThreadMessageSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ThreadMessage
     */
    omit?: ThreadMessageOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ThreadMessageInclude<ExtArgs> | null
    /**
     * Filter, which ThreadMessage to fetch.
     */
    where: ThreadMessageWhereUniqueInput
  }

  /**
   * ThreadMessage findFirst
   */
  export type ThreadMessageFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ThreadMessage
     */
    select?: ThreadMessageSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ThreadMessage
     */
    omit?: ThreadMessageOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ThreadMessageInclude<ExtArgs> | null
    /**
     * Filter, which ThreadMessage to fetch.
     */
    where?: ThreadMessageWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of ThreadMessages to fetch.
     */
    orderBy?: ThreadMessageOrderByWithRelationInput | ThreadMessageOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for ThreadMessages.
     */
    cursor?: ThreadMessageWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` ThreadMessages from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` ThreadMessages.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of ThreadMessages.
     */
    distinct?: ThreadMessageScalarFieldEnum | ThreadMessageScalarFieldEnum[]
  }

  /**
   * ThreadMessage findFirstOrThrow
   */
  export type ThreadMessageFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ThreadMessage
     */
    select?: ThreadMessageSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ThreadMessage
     */
    omit?: ThreadMessageOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ThreadMessageInclude<ExtArgs> | null
    /**
     * Filter, which ThreadMessage to fetch.
     */
    where?: ThreadMessageWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of ThreadMessages to fetch.
     */
    orderBy?: ThreadMessageOrderByWithRelationInput | ThreadMessageOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for ThreadMessages.
     */
    cursor?: ThreadMessageWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` ThreadMessages from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` ThreadMessages.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of ThreadMessages.
     */
    distinct?: ThreadMessageScalarFieldEnum | ThreadMessageScalarFieldEnum[]
  }

  /**
   * ThreadMessage findMany
   */
  export type ThreadMessageFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ThreadMessage
     */
    select?: ThreadMessageSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ThreadMessage
     */
    omit?: ThreadMessageOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ThreadMessageInclude<ExtArgs> | null
    /**
     * Filter, which ThreadMessages to fetch.
     */
    where?: ThreadMessageWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of ThreadMessages to fetch.
     */
    orderBy?: ThreadMessageOrderByWithRelationInput | ThreadMessageOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing ThreadMessages.
     */
    cursor?: ThreadMessageWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` ThreadMessages from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` ThreadMessages.
     */
    skip?: number
    distinct?: ThreadMessageScalarFieldEnum | ThreadMessageScalarFieldEnum[]
  }

  /**
   * ThreadMessage create
   */
  export type ThreadMessageCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ThreadMessage
     */
    select?: ThreadMessageSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ThreadMessage
     */
    omit?: ThreadMessageOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ThreadMessageInclude<ExtArgs> | null
    /**
     * The data needed to create a ThreadMessage.
     */
    data: XOR<ThreadMessageCreateInput, ThreadMessageUncheckedCreateInput>
  }

  /**
   * ThreadMessage createMany
   */
  export type ThreadMessageCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many ThreadMessages.
     */
    data: ThreadMessageCreateManyInput | ThreadMessageCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * ThreadMessage createManyAndReturn
   */
  export type ThreadMessageCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ThreadMessage
     */
    select?: ThreadMessageSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the ThreadMessage
     */
    omit?: ThreadMessageOmit<ExtArgs> | null
    /**
     * The data used to create many ThreadMessages.
     */
    data: ThreadMessageCreateManyInput | ThreadMessageCreateManyInput[]
    skipDuplicates?: boolean
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ThreadMessageIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * ThreadMessage update
   */
  export type ThreadMessageUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ThreadMessage
     */
    select?: ThreadMessageSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ThreadMessage
     */
    omit?: ThreadMessageOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ThreadMessageInclude<ExtArgs> | null
    /**
     * The data needed to update a ThreadMessage.
     */
    data: XOR<ThreadMessageUpdateInput, ThreadMessageUncheckedUpdateInput>
    /**
     * Choose, which ThreadMessage to update.
     */
    where: ThreadMessageWhereUniqueInput
  }

  /**
   * ThreadMessage updateMany
   */
  export type ThreadMessageUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update ThreadMessages.
     */
    data: XOR<ThreadMessageUpdateManyMutationInput, ThreadMessageUncheckedUpdateManyInput>
    /**
     * Filter which ThreadMessages to update
     */
    where?: ThreadMessageWhereInput
    /**
     * Limit how many ThreadMessages to update.
     */
    limit?: number
  }

  /**
   * ThreadMessage updateManyAndReturn
   */
  export type ThreadMessageUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ThreadMessage
     */
    select?: ThreadMessageSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the ThreadMessage
     */
    omit?: ThreadMessageOmit<ExtArgs> | null
    /**
     * The data used to update ThreadMessages.
     */
    data: XOR<ThreadMessageUpdateManyMutationInput, ThreadMessageUncheckedUpdateManyInput>
    /**
     * Filter which ThreadMessages to update
     */
    where?: ThreadMessageWhereInput
    /**
     * Limit how many ThreadMessages to update.
     */
    limit?: number
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ThreadMessageIncludeUpdateManyAndReturn<ExtArgs> | null
  }

  /**
   * ThreadMessage upsert
   */
  export type ThreadMessageUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ThreadMessage
     */
    select?: ThreadMessageSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ThreadMessage
     */
    omit?: ThreadMessageOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ThreadMessageInclude<ExtArgs> | null
    /**
     * The filter to search for the ThreadMessage to update in case it exists.
     */
    where: ThreadMessageWhereUniqueInput
    /**
     * In case the ThreadMessage found by the `where` argument doesn't exist, create a new ThreadMessage with this data.
     */
    create: XOR<ThreadMessageCreateInput, ThreadMessageUncheckedCreateInput>
    /**
     * In case the ThreadMessage was found with the provided `where` argument, update it with this data.
     */
    update: XOR<ThreadMessageUpdateInput, ThreadMessageUncheckedUpdateInput>
  }

  /**
   * ThreadMessage delete
   */
  export type ThreadMessageDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ThreadMessage
     */
    select?: ThreadMessageSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ThreadMessage
     */
    omit?: ThreadMessageOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ThreadMessageInclude<ExtArgs> | null
    /**
     * Filter which ThreadMessage to delete.
     */
    where: ThreadMessageWhereUniqueInput
  }

  /**
   * ThreadMessage deleteMany
   */
  export type ThreadMessageDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which ThreadMessages to delete
     */
    where?: ThreadMessageWhereInput
    /**
     * Limit how many ThreadMessages to delete.
     */
    limit?: number
  }

  /**
   * ThreadMessage without action
   */
  export type ThreadMessageDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ThreadMessage
     */
    select?: ThreadMessageSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ThreadMessage
     */
    omit?: ThreadMessageOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ThreadMessageInclude<ExtArgs> | null
  }


  /**
   * Model ProviderCredential
   */

  export type AggregateProviderCredential = {
    _count: ProviderCredentialCountAggregateOutputType | null
    _min: ProviderCredentialMinAggregateOutputType | null
    _max: ProviderCredentialMaxAggregateOutputType | null
  }

  export type ProviderCredentialMinAggregateOutputType = {
    id: string | null
    userId: string | null
    provider: $Enums.AIProvider | null
    encryptedConfig: string | null
    isEnabled: boolean | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type ProviderCredentialMaxAggregateOutputType = {
    id: string | null
    userId: string | null
    provider: $Enums.AIProvider | null
    encryptedConfig: string | null
    isEnabled: boolean | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type ProviderCredentialCountAggregateOutputType = {
    id: number
    userId: number
    provider: number
    encryptedConfig: number
    isEnabled: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type ProviderCredentialMinAggregateInputType = {
    id?: true
    userId?: true
    provider?: true
    encryptedConfig?: true
    isEnabled?: true
    createdAt?: true
    updatedAt?: true
  }

  export type ProviderCredentialMaxAggregateInputType = {
    id?: true
    userId?: true
    provider?: true
    encryptedConfig?: true
    isEnabled?: true
    createdAt?: true
    updatedAt?: true
  }

  export type ProviderCredentialCountAggregateInputType = {
    id?: true
    userId?: true
    provider?: true
    encryptedConfig?: true
    isEnabled?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type ProviderCredentialAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which ProviderCredential to aggregate.
     */
    where?: ProviderCredentialWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of ProviderCredentials to fetch.
     */
    orderBy?: ProviderCredentialOrderByWithRelationInput | ProviderCredentialOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: ProviderCredentialWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` ProviderCredentials from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` ProviderCredentials.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned ProviderCredentials
    **/
    _count?: true | ProviderCredentialCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: ProviderCredentialMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: ProviderCredentialMaxAggregateInputType
  }

  export type GetProviderCredentialAggregateType<T extends ProviderCredentialAggregateArgs> = {
        [P in keyof T & keyof AggregateProviderCredential]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateProviderCredential[P]>
      : GetScalarType<T[P], AggregateProviderCredential[P]>
  }




  export type ProviderCredentialGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: ProviderCredentialWhereInput
    orderBy?: ProviderCredentialOrderByWithAggregationInput | ProviderCredentialOrderByWithAggregationInput[]
    by: ProviderCredentialScalarFieldEnum[] | ProviderCredentialScalarFieldEnum
    having?: ProviderCredentialScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: ProviderCredentialCountAggregateInputType | true
    _min?: ProviderCredentialMinAggregateInputType
    _max?: ProviderCredentialMaxAggregateInputType
  }

  export type ProviderCredentialGroupByOutputType = {
    id: string
    userId: string
    provider: $Enums.AIProvider
    encryptedConfig: string
    isEnabled: boolean
    createdAt: Date
    updatedAt: Date
    _count: ProviderCredentialCountAggregateOutputType | null
    _min: ProviderCredentialMinAggregateOutputType | null
    _max: ProviderCredentialMaxAggregateOutputType | null
  }

  type GetProviderCredentialGroupByPayload<T extends ProviderCredentialGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<ProviderCredentialGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof ProviderCredentialGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], ProviderCredentialGroupByOutputType[P]>
            : GetScalarType<T[P], ProviderCredentialGroupByOutputType[P]>
        }
      >
    >


  export type ProviderCredentialSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    userId?: boolean
    provider?: boolean
    encryptedConfig?: boolean
    isEnabled?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    user?: boolean | UserDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["providerCredential"]>

  export type ProviderCredentialSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    userId?: boolean
    provider?: boolean
    encryptedConfig?: boolean
    isEnabled?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    user?: boolean | UserDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["providerCredential"]>

  export type ProviderCredentialSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    userId?: boolean
    provider?: boolean
    encryptedConfig?: boolean
    isEnabled?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    user?: boolean | UserDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["providerCredential"]>

  export type ProviderCredentialSelectScalar = {
    id?: boolean
    userId?: boolean
    provider?: boolean
    encryptedConfig?: boolean
    isEnabled?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }

  export type ProviderCredentialOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "userId" | "provider" | "encryptedConfig" | "isEnabled" | "createdAt" | "updatedAt", ExtArgs["result"]["providerCredential"]>
  export type ProviderCredentialInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    user?: boolean | UserDefaultArgs<ExtArgs>
  }
  export type ProviderCredentialIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    user?: boolean | UserDefaultArgs<ExtArgs>
  }
  export type ProviderCredentialIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    user?: boolean | UserDefaultArgs<ExtArgs>
  }

  export type $ProviderCredentialPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "ProviderCredential"
    objects: {
      user: Prisma.$UserPayload<ExtArgs>
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      userId: string
      provider: $Enums.AIProvider
      encryptedConfig: string
      isEnabled: boolean
      createdAt: Date
      updatedAt: Date
    }, ExtArgs["result"]["providerCredential"]>
    composites: {}
  }

  type ProviderCredentialGetPayload<S extends boolean | null | undefined | ProviderCredentialDefaultArgs> = $Result.GetResult<Prisma.$ProviderCredentialPayload, S>

  type ProviderCredentialCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<ProviderCredentialFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: ProviderCredentialCountAggregateInputType | true
    }

  export interface ProviderCredentialDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['ProviderCredential'], meta: { name: 'ProviderCredential' } }
    /**
     * Find zero or one ProviderCredential that matches the filter.
     * @param {ProviderCredentialFindUniqueArgs} args - Arguments to find a ProviderCredential
     * @example
     * // Get one ProviderCredential
     * const providerCredential = await prisma.providerCredential.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends ProviderCredentialFindUniqueArgs>(args: SelectSubset<T, ProviderCredentialFindUniqueArgs<ExtArgs>>): Prisma__ProviderCredentialClient<$Result.GetResult<Prisma.$ProviderCredentialPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one ProviderCredential that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {ProviderCredentialFindUniqueOrThrowArgs} args - Arguments to find a ProviderCredential
     * @example
     * // Get one ProviderCredential
     * const providerCredential = await prisma.providerCredential.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends ProviderCredentialFindUniqueOrThrowArgs>(args: SelectSubset<T, ProviderCredentialFindUniqueOrThrowArgs<ExtArgs>>): Prisma__ProviderCredentialClient<$Result.GetResult<Prisma.$ProviderCredentialPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first ProviderCredential that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ProviderCredentialFindFirstArgs} args - Arguments to find a ProviderCredential
     * @example
     * // Get one ProviderCredential
     * const providerCredential = await prisma.providerCredential.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends ProviderCredentialFindFirstArgs>(args?: SelectSubset<T, ProviderCredentialFindFirstArgs<ExtArgs>>): Prisma__ProviderCredentialClient<$Result.GetResult<Prisma.$ProviderCredentialPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first ProviderCredential that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ProviderCredentialFindFirstOrThrowArgs} args - Arguments to find a ProviderCredential
     * @example
     * // Get one ProviderCredential
     * const providerCredential = await prisma.providerCredential.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends ProviderCredentialFindFirstOrThrowArgs>(args?: SelectSubset<T, ProviderCredentialFindFirstOrThrowArgs<ExtArgs>>): Prisma__ProviderCredentialClient<$Result.GetResult<Prisma.$ProviderCredentialPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more ProviderCredentials that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ProviderCredentialFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all ProviderCredentials
     * const providerCredentials = await prisma.providerCredential.findMany()
     * 
     * // Get first 10 ProviderCredentials
     * const providerCredentials = await prisma.providerCredential.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const providerCredentialWithIdOnly = await prisma.providerCredential.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends ProviderCredentialFindManyArgs>(args?: SelectSubset<T, ProviderCredentialFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ProviderCredentialPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a ProviderCredential.
     * @param {ProviderCredentialCreateArgs} args - Arguments to create a ProviderCredential.
     * @example
     * // Create one ProviderCredential
     * const ProviderCredential = await prisma.providerCredential.create({
     *   data: {
     *     // ... data to create a ProviderCredential
     *   }
     * })
     * 
     */
    create<T extends ProviderCredentialCreateArgs>(args: SelectSubset<T, ProviderCredentialCreateArgs<ExtArgs>>): Prisma__ProviderCredentialClient<$Result.GetResult<Prisma.$ProviderCredentialPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many ProviderCredentials.
     * @param {ProviderCredentialCreateManyArgs} args - Arguments to create many ProviderCredentials.
     * @example
     * // Create many ProviderCredentials
     * const providerCredential = await prisma.providerCredential.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends ProviderCredentialCreateManyArgs>(args?: SelectSubset<T, ProviderCredentialCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many ProviderCredentials and returns the data saved in the database.
     * @param {ProviderCredentialCreateManyAndReturnArgs} args - Arguments to create many ProviderCredentials.
     * @example
     * // Create many ProviderCredentials
     * const providerCredential = await prisma.providerCredential.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many ProviderCredentials and only return the `id`
     * const providerCredentialWithIdOnly = await prisma.providerCredential.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends ProviderCredentialCreateManyAndReturnArgs>(args?: SelectSubset<T, ProviderCredentialCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ProviderCredentialPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a ProviderCredential.
     * @param {ProviderCredentialDeleteArgs} args - Arguments to delete one ProviderCredential.
     * @example
     * // Delete one ProviderCredential
     * const ProviderCredential = await prisma.providerCredential.delete({
     *   where: {
     *     // ... filter to delete one ProviderCredential
     *   }
     * })
     * 
     */
    delete<T extends ProviderCredentialDeleteArgs>(args: SelectSubset<T, ProviderCredentialDeleteArgs<ExtArgs>>): Prisma__ProviderCredentialClient<$Result.GetResult<Prisma.$ProviderCredentialPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one ProviderCredential.
     * @param {ProviderCredentialUpdateArgs} args - Arguments to update one ProviderCredential.
     * @example
     * // Update one ProviderCredential
     * const providerCredential = await prisma.providerCredential.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends ProviderCredentialUpdateArgs>(args: SelectSubset<T, ProviderCredentialUpdateArgs<ExtArgs>>): Prisma__ProviderCredentialClient<$Result.GetResult<Prisma.$ProviderCredentialPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more ProviderCredentials.
     * @param {ProviderCredentialDeleteManyArgs} args - Arguments to filter ProviderCredentials to delete.
     * @example
     * // Delete a few ProviderCredentials
     * const { count } = await prisma.providerCredential.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends ProviderCredentialDeleteManyArgs>(args?: SelectSubset<T, ProviderCredentialDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more ProviderCredentials.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ProviderCredentialUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many ProviderCredentials
     * const providerCredential = await prisma.providerCredential.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends ProviderCredentialUpdateManyArgs>(args: SelectSubset<T, ProviderCredentialUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more ProviderCredentials and returns the data updated in the database.
     * @param {ProviderCredentialUpdateManyAndReturnArgs} args - Arguments to update many ProviderCredentials.
     * @example
     * // Update many ProviderCredentials
     * const providerCredential = await prisma.providerCredential.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more ProviderCredentials and only return the `id`
     * const providerCredentialWithIdOnly = await prisma.providerCredential.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends ProviderCredentialUpdateManyAndReturnArgs>(args: SelectSubset<T, ProviderCredentialUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ProviderCredentialPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one ProviderCredential.
     * @param {ProviderCredentialUpsertArgs} args - Arguments to update or create a ProviderCredential.
     * @example
     * // Update or create a ProviderCredential
     * const providerCredential = await prisma.providerCredential.upsert({
     *   create: {
     *     // ... data to create a ProviderCredential
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the ProviderCredential we want to update
     *   }
     * })
     */
    upsert<T extends ProviderCredentialUpsertArgs>(args: SelectSubset<T, ProviderCredentialUpsertArgs<ExtArgs>>): Prisma__ProviderCredentialClient<$Result.GetResult<Prisma.$ProviderCredentialPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of ProviderCredentials.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ProviderCredentialCountArgs} args - Arguments to filter ProviderCredentials to count.
     * @example
     * // Count the number of ProviderCredentials
     * const count = await prisma.providerCredential.count({
     *   where: {
     *     // ... the filter for the ProviderCredentials we want to count
     *   }
     * })
    **/
    count<T extends ProviderCredentialCountArgs>(
      args?: Subset<T, ProviderCredentialCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], ProviderCredentialCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a ProviderCredential.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ProviderCredentialAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends ProviderCredentialAggregateArgs>(args: Subset<T, ProviderCredentialAggregateArgs>): Prisma.PrismaPromise<GetProviderCredentialAggregateType<T>>

    /**
     * Group by ProviderCredential.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ProviderCredentialGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends ProviderCredentialGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: ProviderCredentialGroupByArgs['orderBy'] }
        : { orderBy?: ProviderCredentialGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, ProviderCredentialGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetProviderCredentialGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the ProviderCredential model
   */
  readonly fields: ProviderCredentialFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for ProviderCredential.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__ProviderCredentialClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    user<T extends UserDefaultArgs<ExtArgs> = {}>(args?: Subset<T, UserDefaultArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the ProviderCredential model
   */
  interface ProviderCredentialFieldRefs {
    readonly id: FieldRef<"ProviderCredential", 'String'>
    readonly userId: FieldRef<"ProviderCredential", 'String'>
    readonly provider: FieldRef<"ProviderCredential", 'AIProvider'>
    readonly encryptedConfig: FieldRef<"ProviderCredential", 'String'>
    readonly isEnabled: FieldRef<"ProviderCredential", 'Boolean'>
    readonly createdAt: FieldRef<"ProviderCredential", 'DateTime'>
    readonly updatedAt: FieldRef<"ProviderCredential", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * ProviderCredential findUnique
   */
  export type ProviderCredentialFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ProviderCredential
     */
    select?: ProviderCredentialSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ProviderCredential
     */
    omit?: ProviderCredentialOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ProviderCredentialInclude<ExtArgs> | null
    /**
     * Filter, which ProviderCredential to fetch.
     */
    where: ProviderCredentialWhereUniqueInput
  }

  /**
   * ProviderCredential findUniqueOrThrow
   */
  export type ProviderCredentialFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ProviderCredential
     */
    select?: ProviderCredentialSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ProviderCredential
     */
    omit?: ProviderCredentialOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ProviderCredentialInclude<ExtArgs> | null
    /**
     * Filter, which ProviderCredential to fetch.
     */
    where: ProviderCredentialWhereUniqueInput
  }

  /**
   * ProviderCredential findFirst
   */
  export type ProviderCredentialFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ProviderCredential
     */
    select?: ProviderCredentialSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ProviderCredential
     */
    omit?: ProviderCredentialOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ProviderCredentialInclude<ExtArgs> | null
    /**
     * Filter, which ProviderCredential to fetch.
     */
    where?: ProviderCredentialWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of ProviderCredentials to fetch.
     */
    orderBy?: ProviderCredentialOrderByWithRelationInput | ProviderCredentialOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for ProviderCredentials.
     */
    cursor?: ProviderCredentialWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` ProviderCredentials from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` ProviderCredentials.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of ProviderCredentials.
     */
    distinct?: ProviderCredentialScalarFieldEnum | ProviderCredentialScalarFieldEnum[]
  }

  /**
   * ProviderCredential findFirstOrThrow
   */
  export type ProviderCredentialFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ProviderCredential
     */
    select?: ProviderCredentialSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ProviderCredential
     */
    omit?: ProviderCredentialOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ProviderCredentialInclude<ExtArgs> | null
    /**
     * Filter, which ProviderCredential to fetch.
     */
    where?: ProviderCredentialWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of ProviderCredentials to fetch.
     */
    orderBy?: ProviderCredentialOrderByWithRelationInput | ProviderCredentialOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for ProviderCredentials.
     */
    cursor?: ProviderCredentialWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` ProviderCredentials from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` ProviderCredentials.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of ProviderCredentials.
     */
    distinct?: ProviderCredentialScalarFieldEnum | ProviderCredentialScalarFieldEnum[]
  }

  /**
   * ProviderCredential findMany
   */
  export type ProviderCredentialFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ProviderCredential
     */
    select?: ProviderCredentialSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ProviderCredential
     */
    omit?: ProviderCredentialOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ProviderCredentialInclude<ExtArgs> | null
    /**
     * Filter, which ProviderCredentials to fetch.
     */
    where?: ProviderCredentialWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of ProviderCredentials to fetch.
     */
    orderBy?: ProviderCredentialOrderByWithRelationInput | ProviderCredentialOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing ProviderCredentials.
     */
    cursor?: ProviderCredentialWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` ProviderCredentials from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` ProviderCredentials.
     */
    skip?: number
    distinct?: ProviderCredentialScalarFieldEnum | ProviderCredentialScalarFieldEnum[]
  }

  /**
   * ProviderCredential create
   */
  export type ProviderCredentialCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ProviderCredential
     */
    select?: ProviderCredentialSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ProviderCredential
     */
    omit?: ProviderCredentialOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ProviderCredentialInclude<ExtArgs> | null
    /**
     * The data needed to create a ProviderCredential.
     */
    data: XOR<ProviderCredentialCreateInput, ProviderCredentialUncheckedCreateInput>
  }

  /**
   * ProviderCredential createMany
   */
  export type ProviderCredentialCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many ProviderCredentials.
     */
    data: ProviderCredentialCreateManyInput | ProviderCredentialCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * ProviderCredential createManyAndReturn
   */
  export type ProviderCredentialCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ProviderCredential
     */
    select?: ProviderCredentialSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the ProviderCredential
     */
    omit?: ProviderCredentialOmit<ExtArgs> | null
    /**
     * The data used to create many ProviderCredentials.
     */
    data: ProviderCredentialCreateManyInput | ProviderCredentialCreateManyInput[]
    skipDuplicates?: boolean
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ProviderCredentialIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * ProviderCredential update
   */
  export type ProviderCredentialUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ProviderCredential
     */
    select?: ProviderCredentialSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ProviderCredential
     */
    omit?: ProviderCredentialOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ProviderCredentialInclude<ExtArgs> | null
    /**
     * The data needed to update a ProviderCredential.
     */
    data: XOR<ProviderCredentialUpdateInput, ProviderCredentialUncheckedUpdateInput>
    /**
     * Choose, which ProviderCredential to update.
     */
    where: ProviderCredentialWhereUniqueInput
  }

  /**
   * ProviderCredential updateMany
   */
  export type ProviderCredentialUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update ProviderCredentials.
     */
    data: XOR<ProviderCredentialUpdateManyMutationInput, ProviderCredentialUncheckedUpdateManyInput>
    /**
     * Filter which ProviderCredentials to update
     */
    where?: ProviderCredentialWhereInput
    /**
     * Limit how many ProviderCredentials to update.
     */
    limit?: number
  }

  /**
   * ProviderCredential updateManyAndReturn
   */
  export type ProviderCredentialUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ProviderCredential
     */
    select?: ProviderCredentialSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the ProviderCredential
     */
    omit?: ProviderCredentialOmit<ExtArgs> | null
    /**
     * The data used to update ProviderCredentials.
     */
    data: XOR<ProviderCredentialUpdateManyMutationInput, ProviderCredentialUncheckedUpdateManyInput>
    /**
     * Filter which ProviderCredentials to update
     */
    where?: ProviderCredentialWhereInput
    /**
     * Limit how many ProviderCredentials to update.
     */
    limit?: number
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ProviderCredentialIncludeUpdateManyAndReturn<ExtArgs> | null
  }

  /**
   * ProviderCredential upsert
   */
  export type ProviderCredentialUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ProviderCredential
     */
    select?: ProviderCredentialSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ProviderCredential
     */
    omit?: ProviderCredentialOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ProviderCredentialInclude<ExtArgs> | null
    /**
     * The filter to search for the ProviderCredential to update in case it exists.
     */
    where: ProviderCredentialWhereUniqueInput
    /**
     * In case the ProviderCredential found by the `where` argument doesn't exist, create a new ProviderCredential with this data.
     */
    create: XOR<ProviderCredentialCreateInput, ProviderCredentialUncheckedCreateInput>
    /**
     * In case the ProviderCredential was found with the provided `where` argument, update it with this data.
     */
    update: XOR<ProviderCredentialUpdateInput, ProviderCredentialUncheckedUpdateInput>
  }

  /**
   * ProviderCredential delete
   */
  export type ProviderCredentialDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ProviderCredential
     */
    select?: ProviderCredentialSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ProviderCredential
     */
    omit?: ProviderCredentialOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ProviderCredentialInclude<ExtArgs> | null
    /**
     * Filter which ProviderCredential to delete.
     */
    where: ProviderCredentialWhereUniqueInput
  }

  /**
   * ProviderCredential deleteMany
   */
  export type ProviderCredentialDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which ProviderCredentials to delete
     */
    where?: ProviderCredentialWhereInput
    /**
     * Limit how many ProviderCredentials to delete.
     */
    limit?: number
  }

  /**
   * ProviderCredential without action
   */
  export type ProviderCredentialDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ProviderCredential
     */
    select?: ProviderCredentialSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ProviderCredential
     */
    omit?: ProviderCredentialOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ProviderCredentialInclude<ExtArgs> | null
  }


  /**
   * Model ModelPreference
   */

  export type AggregateModelPreference = {
    _count: ModelPreferenceCountAggregateOutputType | null
    _min: ModelPreferenceMinAggregateOutputType | null
    _max: ModelPreferenceMaxAggregateOutputType | null
  }

  export type ModelPreferenceMinAggregateOutputType = {
    id: string | null
    userId: string | null
    provider: $Enums.AIProvider | null
    modelId: string | null
    isCustom: boolean | null
    isEnabled: boolean | null
    createdAt: Date | null
  }

  export type ModelPreferenceMaxAggregateOutputType = {
    id: string | null
    userId: string | null
    provider: $Enums.AIProvider | null
    modelId: string | null
    isCustom: boolean | null
    isEnabled: boolean | null
    createdAt: Date | null
  }

  export type ModelPreferenceCountAggregateOutputType = {
    id: number
    userId: number
    provider: number
    modelId: number
    isCustom: number
    isEnabled: number
    createdAt: number
    _all: number
  }


  export type ModelPreferenceMinAggregateInputType = {
    id?: true
    userId?: true
    provider?: true
    modelId?: true
    isCustom?: true
    isEnabled?: true
    createdAt?: true
  }

  export type ModelPreferenceMaxAggregateInputType = {
    id?: true
    userId?: true
    provider?: true
    modelId?: true
    isCustom?: true
    isEnabled?: true
    createdAt?: true
  }

  export type ModelPreferenceCountAggregateInputType = {
    id?: true
    userId?: true
    provider?: true
    modelId?: true
    isCustom?: true
    isEnabled?: true
    createdAt?: true
    _all?: true
  }

  export type ModelPreferenceAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which ModelPreference to aggregate.
     */
    where?: ModelPreferenceWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of ModelPreferences to fetch.
     */
    orderBy?: ModelPreferenceOrderByWithRelationInput | ModelPreferenceOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: ModelPreferenceWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` ModelPreferences from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` ModelPreferences.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned ModelPreferences
    **/
    _count?: true | ModelPreferenceCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: ModelPreferenceMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: ModelPreferenceMaxAggregateInputType
  }

  export type GetModelPreferenceAggregateType<T extends ModelPreferenceAggregateArgs> = {
        [P in keyof T & keyof AggregateModelPreference]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateModelPreference[P]>
      : GetScalarType<T[P], AggregateModelPreference[P]>
  }




  export type ModelPreferenceGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: ModelPreferenceWhereInput
    orderBy?: ModelPreferenceOrderByWithAggregationInput | ModelPreferenceOrderByWithAggregationInput[]
    by: ModelPreferenceScalarFieldEnum[] | ModelPreferenceScalarFieldEnum
    having?: ModelPreferenceScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: ModelPreferenceCountAggregateInputType | true
    _min?: ModelPreferenceMinAggregateInputType
    _max?: ModelPreferenceMaxAggregateInputType
  }

  export type ModelPreferenceGroupByOutputType = {
    id: string
    userId: string
    provider: $Enums.AIProvider
    modelId: string
    isCustom: boolean
    isEnabled: boolean
    createdAt: Date
    _count: ModelPreferenceCountAggregateOutputType | null
    _min: ModelPreferenceMinAggregateOutputType | null
    _max: ModelPreferenceMaxAggregateOutputType | null
  }

  type GetModelPreferenceGroupByPayload<T extends ModelPreferenceGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<ModelPreferenceGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof ModelPreferenceGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], ModelPreferenceGroupByOutputType[P]>
            : GetScalarType<T[P], ModelPreferenceGroupByOutputType[P]>
        }
      >
    >


  export type ModelPreferenceSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    userId?: boolean
    provider?: boolean
    modelId?: boolean
    isCustom?: boolean
    isEnabled?: boolean
    createdAt?: boolean
    user?: boolean | UserDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["modelPreference"]>

  export type ModelPreferenceSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    userId?: boolean
    provider?: boolean
    modelId?: boolean
    isCustom?: boolean
    isEnabled?: boolean
    createdAt?: boolean
    user?: boolean | UserDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["modelPreference"]>

  export type ModelPreferenceSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    userId?: boolean
    provider?: boolean
    modelId?: boolean
    isCustom?: boolean
    isEnabled?: boolean
    createdAt?: boolean
    user?: boolean | UserDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["modelPreference"]>

  export type ModelPreferenceSelectScalar = {
    id?: boolean
    userId?: boolean
    provider?: boolean
    modelId?: boolean
    isCustom?: boolean
    isEnabled?: boolean
    createdAt?: boolean
  }

  export type ModelPreferenceOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "userId" | "provider" | "modelId" | "isCustom" | "isEnabled" | "createdAt", ExtArgs["result"]["modelPreference"]>
  export type ModelPreferenceInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    user?: boolean | UserDefaultArgs<ExtArgs>
  }
  export type ModelPreferenceIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    user?: boolean | UserDefaultArgs<ExtArgs>
  }
  export type ModelPreferenceIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    user?: boolean | UserDefaultArgs<ExtArgs>
  }

  export type $ModelPreferencePayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "ModelPreference"
    objects: {
      user: Prisma.$UserPayload<ExtArgs>
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      userId: string
      provider: $Enums.AIProvider
      modelId: string
      isCustom: boolean
      isEnabled: boolean
      createdAt: Date
    }, ExtArgs["result"]["modelPreference"]>
    composites: {}
  }

  type ModelPreferenceGetPayload<S extends boolean | null | undefined | ModelPreferenceDefaultArgs> = $Result.GetResult<Prisma.$ModelPreferencePayload, S>

  type ModelPreferenceCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<ModelPreferenceFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: ModelPreferenceCountAggregateInputType | true
    }

  export interface ModelPreferenceDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['ModelPreference'], meta: { name: 'ModelPreference' } }
    /**
     * Find zero or one ModelPreference that matches the filter.
     * @param {ModelPreferenceFindUniqueArgs} args - Arguments to find a ModelPreference
     * @example
     * // Get one ModelPreference
     * const modelPreference = await prisma.modelPreference.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends ModelPreferenceFindUniqueArgs>(args: SelectSubset<T, ModelPreferenceFindUniqueArgs<ExtArgs>>): Prisma__ModelPreferenceClient<$Result.GetResult<Prisma.$ModelPreferencePayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one ModelPreference that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {ModelPreferenceFindUniqueOrThrowArgs} args - Arguments to find a ModelPreference
     * @example
     * // Get one ModelPreference
     * const modelPreference = await prisma.modelPreference.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends ModelPreferenceFindUniqueOrThrowArgs>(args: SelectSubset<T, ModelPreferenceFindUniqueOrThrowArgs<ExtArgs>>): Prisma__ModelPreferenceClient<$Result.GetResult<Prisma.$ModelPreferencePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first ModelPreference that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ModelPreferenceFindFirstArgs} args - Arguments to find a ModelPreference
     * @example
     * // Get one ModelPreference
     * const modelPreference = await prisma.modelPreference.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends ModelPreferenceFindFirstArgs>(args?: SelectSubset<T, ModelPreferenceFindFirstArgs<ExtArgs>>): Prisma__ModelPreferenceClient<$Result.GetResult<Prisma.$ModelPreferencePayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first ModelPreference that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ModelPreferenceFindFirstOrThrowArgs} args - Arguments to find a ModelPreference
     * @example
     * // Get one ModelPreference
     * const modelPreference = await prisma.modelPreference.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends ModelPreferenceFindFirstOrThrowArgs>(args?: SelectSubset<T, ModelPreferenceFindFirstOrThrowArgs<ExtArgs>>): Prisma__ModelPreferenceClient<$Result.GetResult<Prisma.$ModelPreferencePayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more ModelPreferences that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ModelPreferenceFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all ModelPreferences
     * const modelPreferences = await prisma.modelPreference.findMany()
     * 
     * // Get first 10 ModelPreferences
     * const modelPreferences = await prisma.modelPreference.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const modelPreferenceWithIdOnly = await prisma.modelPreference.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends ModelPreferenceFindManyArgs>(args?: SelectSubset<T, ModelPreferenceFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ModelPreferencePayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a ModelPreference.
     * @param {ModelPreferenceCreateArgs} args - Arguments to create a ModelPreference.
     * @example
     * // Create one ModelPreference
     * const ModelPreference = await prisma.modelPreference.create({
     *   data: {
     *     // ... data to create a ModelPreference
     *   }
     * })
     * 
     */
    create<T extends ModelPreferenceCreateArgs>(args: SelectSubset<T, ModelPreferenceCreateArgs<ExtArgs>>): Prisma__ModelPreferenceClient<$Result.GetResult<Prisma.$ModelPreferencePayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many ModelPreferences.
     * @param {ModelPreferenceCreateManyArgs} args - Arguments to create many ModelPreferences.
     * @example
     * // Create many ModelPreferences
     * const modelPreference = await prisma.modelPreference.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends ModelPreferenceCreateManyArgs>(args?: SelectSubset<T, ModelPreferenceCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many ModelPreferences and returns the data saved in the database.
     * @param {ModelPreferenceCreateManyAndReturnArgs} args - Arguments to create many ModelPreferences.
     * @example
     * // Create many ModelPreferences
     * const modelPreference = await prisma.modelPreference.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many ModelPreferences and only return the `id`
     * const modelPreferenceWithIdOnly = await prisma.modelPreference.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends ModelPreferenceCreateManyAndReturnArgs>(args?: SelectSubset<T, ModelPreferenceCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ModelPreferencePayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a ModelPreference.
     * @param {ModelPreferenceDeleteArgs} args - Arguments to delete one ModelPreference.
     * @example
     * // Delete one ModelPreference
     * const ModelPreference = await prisma.modelPreference.delete({
     *   where: {
     *     // ... filter to delete one ModelPreference
     *   }
     * })
     * 
     */
    delete<T extends ModelPreferenceDeleteArgs>(args: SelectSubset<T, ModelPreferenceDeleteArgs<ExtArgs>>): Prisma__ModelPreferenceClient<$Result.GetResult<Prisma.$ModelPreferencePayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one ModelPreference.
     * @param {ModelPreferenceUpdateArgs} args - Arguments to update one ModelPreference.
     * @example
     * // Update one ModelPreference
     * const modelPreference = await prisma.modelPreference.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends ModelPreferenceUpdateArgs>(args: SelectSubset<T, ModelPreferenceUpdateArgs<ExtArgs>>): Prisma__ModelPreferenceClient<$Result.GetResult<Prisma.$ModelPreferencePayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more ModelPreferences.
     * @param {ModelPreferenceDeleteManyArgs} args - Arguments to filter ModelPreferences to delete.
     * @example
     * // Delete a few ModelPreferences
     * const { count } = await prisma.modelPreference.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends ModelPreferenceDeleteManyArgs>(args?: SelectSubset<T, ModelPreferenceDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more ModelPreferences.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ModelPreferenceUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many ModelPreferences
     * const modelPreference = await prisma.modelPreference.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends ModelPreferenceUpdateManyArgs>(args: SelectSubset<T, ModelPreferenceUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more ModelPreferences and returns the data updated in the database.
     * @param {ModelPreferenceUpdateManyAndReturnArgs} args - Arguments to update many ModelPreferences.
     * @example
     * // Update many ModelPreferences
     * const modelPreference = await prisma.modelPreference.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more ModelPreferences and only return the `id`
     * const modelPreferenceWithIdOnly = await prisma.modelPreference.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends ModelPreferenceUpdateManyAndReturnArgs>(args: SelectSubset<T, ModelPreferenceUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ModelPreferencePayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one ModelPreference.
     * @param {ModelPreferenceUpsertArgs} args - Arguments to update or create a ModelPreference.
     * @example
     * // Update or create a ModelPreference
     * const modelPreference = await prisma.modelPreference.upsert({
     *   create: {
     *     // ... data to create a ModelPreference
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the ModelPreference we want to update
     *   }
     * })
     */
    upsert<T extends ModelPreferenceUpsertArgs>(args: SelectSubset<T, ModelPreferenceUpsertArgs<ExtArgs>>): Prisma__ModelPreferenceClient<$Result.GetResult<Prisma.$ModelPreferencePayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of ModelPreferences.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ModelPreferenceCountArgs} args - Arguments to filter ModelPreferences to count.
     * @example
     * // Count the number of ModelPreferences
     * const count = await prisma.modelPreference.count({
     *   where: {
     *     // ... the filter for the ModelPreferences we want to count
     *   }
     * })
    **/
    count<T extends ModelPreferenceCountArgs>(
      args?: Subset<T, ModelPreferenceCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], ModelPreferenceCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a ModelPreference.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ModelPreferenceAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends ModelPreferenceAggregateArgs>(args: Subset<T, ModelPreferenceAggregateArgs>): Prisma.PrismaPromise<GetModelPreferenceAggregateType<T>>

    /**
     * Group by ModelPreference.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ModelPreferenceGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends ModelPreferenceGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: ModelPreferenceGroupByArgs['orderBy'] }
        : { orderBy?: ModelPreferenceGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, ModelPreferenceGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetModelPreferenceGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the ModelPreference model
   */
  readonly fields: ModelPreferenceFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for ModelPreference.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__ModelPreferenceClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    user<T extends UserDefaultArgs<ExtArgs> = {}>(args?: Subset<T, UserDefaultArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the ModelPreference model
   */
  interface ModelPreferenceFieldRefs {
    readonly id: FieldRef<"ModelPreference", 'String'>
    readonly userId: FieldRef<"ModelPreference", 'String'>
    readonly provider: FieldRef<"ModelPreference", 'AIProvider'>
    readonly modelId: FieldRef<"ModelPreference", 'String'>
    readonly isCustom: FieldRef<"ModelPreference", 'Boolean'>
    readonly isEnabled: FieldRef<"ModelPreference", 'Boolean'>
    readonly createdAt: FieldRef<"ModelPreference", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * ModelPreference findUnique
   */
  export type ModelPreferenceFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ModelPreference
     */
    select?: ModelPreferenceSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ModelPreference
     */
    omit?: ModelPreferenceOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ModelPreferenceInclude<ExtArgs> | null
    /**
     * Filter, which ModelPreference to fetch.
     */
    where: ModelPreferenceWhereUniqueInput
  }

  /**
   * ModelPreference findUniqueOrThrow
   */
  export type ModelPreferenceFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ModelPreference
     */
    select?: ModelPreferenceSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ModelPreference
     */
    omit?: ModelPreferenceOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ModelPreferenceInclude<ExtArgs> | null
    /**
     * Filter, which ModelPreference to fetch.
     */
    where: ModelPreferenceWhereUniqueInput
  }

  /**
   * ModelPreference findFirst
   */
  export type ModelPreferenceFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ModelPreference
     */
    select?: ModelPreferenceSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ModelPreference
     */
    omit?: ModelPreferenceOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ModelPreferenceInclude<ExtArgs> | null
    /**
     * Filter, which ModelPreference to fetch.
     */
    where?: ModelPreferenceWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of ModelPreferences to fetch.
     */
    orderBy?: ModelPreferenceOrderByWithRelationInput | ModelPreferenceOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for ModelPreferences.
     */
    cursor?: ModelPreferenceWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` ModelPreferences from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` ModelPreferences.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of ModelPreferences.
     */
    distinct?: ModelPreferenceScalarFieldEnum | ModelPreferenceScalarFieldEnum[]
  }

  /**
   * ModelPreference findFirstOrThrow
   */
  export type ModelPreferenceFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ModelPreference
     */
    select?: ModelPreferenceSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ModelPreference
     */
    omit?: ModelPreferenceOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ModelPreferenceInclude<ExtArgs> | null
    /**
     * Filter, which ModelPreference to fetch.
     */
    where?: ModelPreferenceWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of ModelPreferences to fetch.
     */
    orderBy?: ModelPreferenceOrderByWithRelationInput | ModelPreferenceOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for ModelPreferences.
     */
    cursor?: ModelPreferenceWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` ModelPreferences from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` ModelPreferences.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of ModelPreferences.
     */
    distinct?: ModelPreferenceScalarFieldEnum | ModelPreferenceScalarFieldEnum[]
  }

  /**
   * ModelPreference findMany
   */
  export type ModelPreferenceFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ModelPreference
     */
    select?: ModelPreferenceSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ModelPreference
     */
    omit?: ModelPreferenceOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ModelPreferenceInclude<ExtArgs> | null
    /**
     * Filter, which ModelPreferences to fetch.
     */
    where?: ModelPreferenceWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of ModelPreferences to fetch.
     */
    orderBy?: ModelPreferenceOrderByWithRelationInput | ModelPreferenceOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing ModelPreferences.
     */
    cursor?: ModelPreferenceWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` ModelPreferences from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` ModelPreferences.
     */
    skip?: number
    distinct?: ModelPreferenceScalarFieldEnum | ModelPreferenceScalarFieldEnum[]
  }

  /**
   * ModelPreference create
   */
  export type ModelPreferenceCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ModelPreference
     */
    select?: ModelPreferenceSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ModelPreference
     */
    omit?: ModelPreferenceOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ModelPreferenceInclude<ExtArgs> | null
    /**
     * The data needed to create a ModelPreference.
     */
    data: XOR<ModelPreferenceCreateInput, ModelPreferenceUncheckedCreateInput>
  }

  /**
   * ModelPreference createMany
   */
  export type ModelPreferenceCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many ModelPreferences.
     */
    data: ModelPreferenceCreateManyInput | ModelPreferenceCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * ModelPreference createManyAndReturn
   */
  export type ModelPreferenceCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ModelPreference
     */
    select?: ModelPreferenceSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the ModelPreference
     */
    omit?: ModelPreferenceOmit<ExtArgs> | null
    /**
     * The data used to create many ModelPreferences.
     */
    data: ModelPreferenceCreateManyInput | ModelPreferenceCreateManyInput[]
    skipDuplicates?: boolean
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ModelPreferenceIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * ModelPreference update
   */
  export type ModelPreferenceUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ModelPreference
     */
    select?: ModelPreferenceSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ModelPreference
     */
    omit?: ModelPreferenceOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ModelPreferenceInclude<ExtArgs> | null
    /**
     * The data needed to update a ModelPreference.
     */
    data: XOR<ModelPreferenceUpdateInput, ModelPreferenceUncheckedUpdateInput>
    /**
     * Choose, which ModelPreference to update.
     */
    where: ModelPreferenceWhereUniqueInput
  }

  /**
   * ModelPreference updateMany
   */
  export type ModelPreferenceUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update ModelPreferences.
     */
    data: XOR<ModelPreferenceUpdateManyMutationInput, ModelPreferenceUncheckedUpdateManyInput>
    /**
     * Filter which ModelPreferences to update
     */
    where?: ModelPreferenceWhereInput
    /**
     * Limit how many ModelPreferences to update.
     */
    limit?: number
  }

  /**
   * ModelPreference updateManyAndReturn
   */
  export type ModelPreferenceUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ModelPreference
     */
    select?: ModelPreferenceSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the ModelPreference
     */
    omit?: ModelPreferenceOmit<ExtArgs> | null
    /**
     * The data used to update ModelPreferences.
     */
    data: XOR<ModelPreferenceUpdateManyMutationInput, ModelPreferenceUncheckedUpdateManyInput>
    /**
     * Filter which ModelPreferences to update
     */
    where?: ModelPreferenceWhereInput
    /**
     * Limit how many ModelPreferences to update.
     */
    limit?: number
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ModelPreferenceIncludeUpdateManyAndReturn<ExtArgs> | null
  }

  /**
   * ModelPreference upsert
   */
  export type ModelPreferenceUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ModelPreference
     */
    select?: ModelPreferenceSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ModelPreference
     */
    omit?: ModelPreferenceOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ModelPreferenceInclude<ExtArgs> | null
    /**
     * The filter to search for the ModelPreference to update in case it exists.
     */
    where: ModelPreferenceWhereUniqueInput
    /**
     * In case the ModelPreference found by the `where` argument doesn't exist, create a new ModelPreference with this data.
     */
    create: XOR<ModelPreferenceCreateInput, ModelPreferenceUncheckedCreateInput>
    /**
     * In case the ModelPreference was found with the provided `where` argument, update it with this data.
     */
    update: XOR<ModelPreferenceUpdateInput, ModelPreferenceUncheckedUpdateInput>
  }

  /**
   * ModelPreference delete
   */
  export type ModelPreferenceDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ModelPreference
     */
    select?: ModelPreferenceSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ModelPreference
     */
    omit?: ModelPreferenceOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ModelPreferenceInclude<ExtArgs> | null
    /**
     * Filter which ModelPreference to delete.
     */
    where: ModelPreferenceWhereUniqueInput
  }

  /**
   * ModelPreference deleteMany
   */
  export type ModelPreferenceDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which ModelPreferences to delete
     */
    where?: ModelPreferenceWhereInput
    /**
     * Limit how many ModelPreferences to delete.
     */
    limit?: number
  }

  /**
   * ModelPreference without action
   */
  export type ModelPreferenceDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ModelPreference
     */
    select?: ModelPreferenceSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ModelPreference
     */
    omit?: ModelPreferenceOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ModelPreferenceInclude<ExtArgs> | null
  }


  /**
   * Enums
   */

  export const TransactionIsolationLevel: {
    ReadUncommitted: 'ReadUncommitted',
    ReadCommitted: 'ReadCommitted',
    RepeatableRead: 'RepeatableRead',
    Serializable: 'Serializable'
  };

  export type TransactionIsolationLevel = (typeof TransactionIsolationLevel)[keyof typeof TransactionIsolationLevel]


  export const UserScalarFieldEnum: {
    id: 'id',
    name: 'name',
    email: 'email',
    emailVerified: 'emailVerified',
    image: 'image',
    nickname: 'nickname',
    occupation: 'occupation',
    aboutUser: 'aboutUser',
    personalityPreset: 'personalityPreset',
    customInstructions: 'customInstructions',
    themePreference: 'themePreference',
    selectedWorkspaceId: 'selectedWorkspaceId',
    threadListOrganizeBy: 'threadListOrganizeBy',
    threadListSortBy: 'threadListSortBy',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  };

  export type UserScalarFieldEnum = (typeof UserScalarFieldEnum)[keyof typeof UserScalarFieldEnum]


  export const WorkspaceScalarFieldEnum: {
    id: 'id',
    userId: 'userId',
    name: 'name',
    rootPath: 'rootPath',
    description: 'description',
    isArchived: 'isArchived',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  };

  export type WorkspaceScalarFieldEnum = (typeof WorkspaceScalarFieldEnum)[keyof typeof WorkspaceScalarFieldEnum]


  export const ThreadScalarFieldEnum: {
    id: 'id',
    workspaceId: 'workspaceId',
    userId: 'userId',
    title: 'title',
    summary: 'summary',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
    archivedAt: 'archivedAt'
  };

  export type ThreadScalarFieldEnum = (typeof ThreadScalarFieldEnum)[keyof typeof ThreadScalarFieldEnum]


  export const ThreadMessageScalarFieldEnum: {
    id: 'id',
    threadId: 'threadId',
    messageId: 'messageId',
    role: 'role',
    parts: 'parts',
    metadata: 'metadata',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  };

  export type ThreadMessageScalarFieldEnum = (typeof ThreadMessageScalarFieldEnum)[keyof typeof ThreadMessageScalarFieldEnum]


  export const ProviderCredentialScalarFieldEnum: {
    id: 'id',
    userId: 'userId',
    provider: 'provider',
    encryptedConfig: 'encryptedConfig',
    isEnabled: 'isEnabled',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  };

  export type ProviderCredentialScalarFieldEnum = (typeof ProviderCredentialScalarFieldEnum)[keyof typeof ProviderCredentialScalarFieldEnum]


  export const ModelPreferenceScalarFieldEnum: {
    id: 'id',
    userId: 'userId',
    provider: 'provider',
    modelId: 'modelId',
    isCustom: 'isCustom',
    isEnabled: 'isEnabled',
    createdAt: 'createdAt'
  };

  export type ModelPreferenceScalarFieldEnum = (typeof ModelPreferenceScalarFieldEnum)[keyof typeof ModelPreferenceScalarFieldEnum]


  export const SortOrder: {
    asc: 'asc',
    desc: 'desc'
  };

  export type SortOrder = (typeof SortOrder)[keyof typeof SortOrder]


  export const JsonNullValueInput: {
    JsonNull: typeof JsonNull
  };

  export type JsonNullValueInput = (typeof JsonNullValueInput)[keyof typeof JsonNullValueInput]


  export const NullableJsonNullValueInput: {
    DbNull: typeof DbNull,
    JsonNull: typeof JsonNull
  };

  export type NullableJsonNullValueInput = (typeof NullableJsonNullValueInput)[keyof typeof NullableJsonNullValueInput]


  export const QueryMode: {
    default: 'default',
    insensitive: 'insensitive'
  };

  export type QueryMode = (typeof QueryMode)[keyof typeof QueryMode]


  export const NullsOrder: {
    first: 'first',
    last: 'last'
  };

  export type NullsOrder = (typeof NullsOrder)[keyof typeof NullsOrder]


  export const JsonNullValueFilter: {
    DbNull: typeof DbNull,
    JsonNull: typeof JsonNull,
    AnyNull: typeof AnyNull
  };

  export type JsonNullValueFilter = (typeof JsonNullValueFilter)[keyof typeof JsonNullValueFilter]


  /**
   * Field references
   */


  /**
   * Reference to a field of type 'String'
   */
  export type StringFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'String'>
    


  /**
   * Reference to a field of type 'String[]'
   */
  export type ListStringFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'String[]'>
    


  /**
   * Reference to a field of type 'Boolean'
   */
  export type BooleanFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Boolean'>
    


  /**
   * Reference to a field of type 'PersonalityPreset'
   */
  export type EnumPersonalityPresetFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'PersonalityPreset'>
    


  /**
   * Reference to a field of type 'PersonalityPreset[]'
   */
  export type ListEnumPersonalityPresetFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'PersonalityPreset[]'>
    


  /**
   * Reference to a field of type 'ThemePreference'
   */
  export type EnumThemePreferenceFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'ThemePreference'>
    


  /**
   * Reference to a field of type 'ThemePreference[]'
   */
  export type ListEnumThemePreferenceFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'ThemePreference[]'>
    


  /**
   * Reference to a field of type 'ThreadListOrganizeBy'
   */
  export type EnumThreadListOrganizeByFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'ThreadListOrganizeBy'>
    


  /**
   * Reference to a field of type 'ThreadListOrganizeBy[]'
   */
  export type ListEnumThreadListOrganizeByFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'ThreadListOrganizeBy[]'>
    


  /**
   * Reference to a field of type 'ThreadListSortBy'
   */
  export type EnumThreadListSortByFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'ThreadListSortBy'>
    


  /**
   * Reference to a field of type 'ThreadListSortBy[]'
   */
  export type ListEnumThreadListSortByFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'ThreadListSortBy[]'>
    


  /**
   * Reference to a field of type 'DateTime'
   */
  export type DateTimeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'DateTime'>
    


  /**
   * Reference to a field of type 'DateTime[]'
   */
  export type ListDateTimeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'DateTime[]'>
    


  /**
   * Reference to a field of type 'ThreadMessageRole'
   */
  export type EnumThreadMessageRoleFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'ThreadMessageRole'>
    


  /**
   * Reference to a field of type 'ThreadMessageRole[]'
   */
  export type ListEnumThreadMessageRoleFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'ThreadMessageRole[]'>
    


  /**
   * Reference to a field of type 'Json'
   */
  export type JsonFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Json'>
    


  /**
   * Reference to a field of type 'QueryMode'
   */
  export type EnumQueryModeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'QueryMode'>
    


  /**
   * Reference to a field of type 'AIProvider'
   */
  export type EnumAIProviderFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'AIProvider'>
    


  /**
   * Reference to a field of type 'AIProvider[]'
   */
  export type ListEnumAIProviderFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'AIProvider[]'>
    


  /**
   * Reference to a field of type 'Int'
   */
  export type IntFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Int'>
    


  /**
   * Reference to a field of type 'Int[]'
   */
  export type ListIntFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Int[]'>
    
  /**
   * Deep Input Types
   */


  export type UserWhereInput = {
    AND?: UserWhereInput | UserWhereInput[]
    OR?: UserWhereInput[]
    NOT?: UserWhereInput | UserWhereInput[]
    id?: StringFilter<"User"> | string
    name?: StringFilter<"User"> | string
    email?: StringFilter<"User"> | string
    emailVerified?: BoolFilter<"User"> | boolean
    image?: StringNullableFilter<"User"> | string | null
    nickname?: StringNullableFilter<"User"> | string | null
    occupation?: StringNullableFilter<"User"> | string | null
    aboutUser?: StringNullableFilter<"User"> | string | null
    personalityPreset?: EnumPersonalityPresetFilter<"User"> | $Enums.PersonalityPreset
    customInstructions?: StringNullableFilter<"User"> | string | null
    themePreference?: EnumThemePreferenceFilter<"User"> | $Enums.ThemePreference
    selectedWorkspaceId?: StringNullableFilter<"User"> | string | null
    threadListOrganizeBy?: EnumThreadListOrganizeByFilter<"User"> | $Enums.ThreadListOrganizeBy
    threadListSortBy?: EnumThreadListSortByFilter<"User"> | $Enums.ThreadListSortBy
    createdAt?: DateTimeFilter<"User"> | Date | string
    updatedAt?: DateTimeFilter<"User"> | Date | string
    selectedWorkspace?: XOR<WorkspaceNullableScalarRelationFilter, WorkspaceWhereInput> | null
    ownedWorkspaces?: WorkspaceListRelationFilter
    threads?: ThreadListRelationFilter
    credentials?: ProviderCredentialListRelationFilter
    modelPreferences?: ModelPreferenceListRelationFilter
  }

  export type UserOrderByWithRelationInput = {
    id?: SortOrder
    name?: SortOrder
    email?: SortOrder
    emailVerified?: SortOrder
    image?: SortOrderInput | SortOrder
    nickname?: SortOrderInput | SortOrder
    occupation?: SortOrderInput | SortOrder
    aboutUser?: SortOrderInput | SortOrder
    personalityPreset?: SortOrder
    customInstructions?: SortOrderInput | SortOrder
    themePreference?: SortOrder
    selectedWorkspaceId?: SortOrderInput | SortOrder
    threadListOrganizeBy?: SortOrder
    threadListSortBy?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    selectedWorkspace?: WorkspaceOrderByWithRelationInput
    ownedWorkspaces?: WorkspaceOrderByRelationAggregateInput
    threads?: ThreadOrderByRelationAggregateInput
    credentials?: ProviderCredentialOrderByRelationAggregateInput
    modelPreferences?: ModelPreferenceOrderByRelationAggregateInput
  }

  export type UserWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    email?: string
    AND?: UserWhereInput | UserWhereInput[]
    OR?: UserWhereInput[]
    NOT?: UserWhereInput | UserWhereInput[]
    name?: StringFilter<"User"> | string
    emailVerified?: BoolFilter<"User"> | boolean
    image?: StringNullableFilter<"User"> | string | null
    nickname?: StringNullableFilter<"User"> | string | null
    occupation?: StringNullableFilter<"User"> | string | null
    aboutUser?: StringNullableFilter<"User"> | string | null
    personalityPreset?: EnumPersonalityPresetFilter<"User"> | $Enums.PersonalityPreset
    customInstructions?: StringNullableFilter<"User"> | string | null
    themePreference?: EnumThemePreferenceFilter<"User"> | $Enums.ThemePreference
    selectedWorkspaceId?: StringNullableFilter<"User"> | string | null
    threadListOrganizeBy?: EnumThreadListOrganizeByFilter<"User"> | $Enums.ThreadListOrganizeBy
    threadListSortBy?: EnumThreadListSortByFilter<"User"> | $Enums.ThreadListSortBy
    createdAt?: DateTimeFilter<"User"> | Date | string
    updatedAt?: DateTimeFilter<"User"> | Date | string
    selectedWorkspace?: XOR<WorkspaceNullableScalarRelationFilter, WorkspaceWhereInput> | null
    ownedWorkspaces?: WorkspaceListRelationFilter
    threads?: ThreadListRelationFilter
    credentials?: ProviderCredentialListRelationFilter
    modelPreferences?: ModelPreferenceListRelationFilter
  }, "id" | "email">

  export type UserOrderByWithAggregationInput = {
    id?: SortOrder
    name?: SortOrder
    email?: SortOrder
    emailVerified?: SortOrder
    image?: SortOrderInput | SortOrder
    nickname?: SortOrderInput | SortOrder
    occupation?: SortOrderInput | SortOrder
    aboutUser?: SortOrderInput | SortOrder
    personalityPreset?: SortOrder
    customInstructions?: SortOrderInput | SortOrder
    themePreference?: SortOrder
    selectedWorkspaceId?: SortOrderInput | SortOrder
    threadListOrganizeBy?: SortOrder
    threadListSortBy?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: UserCountOrderByAggregateInput
    _max?: UserMaxOrderByAggregateInput
    _min?: UserMinOrderByAggregateInput
  }

  export type UserScalarWhereWithAggregatesInput = {
    AND?: UserScalarWhereWithAggregatesInput | UserScalarWhereWithAggregatesInput[]
    OR?: UserScalarWhereWithAggregatesInput[]
    NOT?: UserScalarWhereWithAggregatesInput | UserScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"User"> | string
    name?: StringWithAggregatesFilter<"User"> | string
    email?: StringWithAggregatesFilter<"User"> | string
    emailVerified?: BoolWithAggregatesFilter<"User"> | boolean
    image?: StringNullableWithAggregatesFilter<"User"> | string | null
    nickname?: StringNullableWithAggregatesFilter<"User"> | string | null
    occupation?: StringNullableWithAggregatesFilter<"User"> | string | null
    aboutUser?: StringNullableWithAggregatesFilter<"User"> | string | null
    personalityPreset?: EnumPersonalityPresetWithAggregatesFilter<"User"> | $Enums.PersonalityPreset
    customInstructions?: StringNullableWithAggregatesFilter<"User"> | string | null
    themePreference?: EnumThemePreferenceWithAggregatesFilter<"User"> | $Enums.ThemePreference
    selectedWorkspaceId?: StringNullableWithAggregatesFilter<"User"> | string | null
    threadListOrganizeBy?: EnumThreadListOrganizeByWithAggregatesFilter<"User"> | $Enums.ThreadListOrganizeBy
    threadListSortBy?: EnumThreadListSortByWithAggregatesFilter<"User"> | $Enums.ThreadListSortBy
    createdAt?: DateTimeWithAggregatesFilter<"User"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"User"> | Date | string
  }

  export type WorkspaceWhereInput = {
    AND?: WorkspaceWhereInput | WorkspaceWhereInput[]
    OR?: WorkspaceWhereInput[]
    NOT?: WorkspaceWhereInput | WorkspaceWhereInput[]
    id?: StringFilter<"Workspace"> | string
    userId?: StringFilter<"Workspace"> | string
    name?: StringFilter<"Workspace"> | string
    rootPath?: StringNullableFilter<"Workspace"> | string | null
    description?: StringNullableFilter<"Workspace"> | string | null
    isArchived?: BoolFilter<"Workspace"> | boolean
    createdAt?: DateTimeFilter<"Workspace"> | Date | string
    updatedAt?: DateTimeFilter<"Workspace"> | Date | string
    user?: XOR<UserScalarRelationFilter, UserWhereInput>
    selectedByUsers?: UserListRelationFilter
    threads?: ThreadListRelationFilter
  }

  export type WorkspaceOrderByWithRelationInput = {
    id?: SortOrder
    userId?: SortOrder
    name?: SortOrder
    rootPath?: SortOrderInput | SortOrder
    description?: SortOrderInput | SortOrder
    isArchived?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    user?: UserOrderByWithRelationInput
    selectedByUsers?: UserOrderByRelationAggregateInput
    threads?: ThreadOrderByRelationAggregateInput
  }

  export type WorkspaceWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    AND?: WorkspaceWhereInput | WorkspaceWhereInput[]
    OR?: WorkspaceWhereInput[]
    NOT?: WorkspaceWhereInput | WorkspaceWhereInput[]
    userId?: StringFilter<"Workspace"> | string
    name?: StringFilter<"Workspace"> | string
    rootPath?: StringNullableFilter<"Workspace"> | string | null
    description?: StringNullableFilter<"Workspace"> | string | null
    isArchived?: BoolFilter<"Workspace"> | boolean
    createdAt?: DateTimeFilter<"Workspace"> | Date | string
    updatedAt?: DateTimeFilter<"Workspace"> | Date | string
    user?: XOR<UserScalarRelationFilter, UserWhereInput>
    selectedByUsers?: UserListRelationFilter
    threads?: ThreadListRelationFilter
  }, "id">

  export type WorkspaceOrderByWithAggregationInput = {
    id?: SortOrder
    userId?: SortOrder
    name?: SortOrder
    rootPath?: SortOrderInput | SortOrder
    description?: SortOrderInput | SortOrder
    isArchived?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: WorkspaceCountOrderByAggregateInput
    _max?: WorkspaceMaxOrderByAggregateInput
    _min?: WorkspaceMinOrderByAggregateInput
  }

  export type WorkspaceScalarWhereWithAggregatesInput = {
    AND?: WorkspaceScalarWhereWithAggregatesInput | WorkspaceScalarWhereWithAggregatesInput[]
    OR?: WorkspaceScalarWhereWithAggregatesInput[]
    NOT?: WorkspaceScalarWhereWithAggregatesInput | WorkspaceScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"Workspace"> | string
    userId?: StringWithAggregatesFilter<"Workspace"> | string
    name?: StringWithAggregatesFilter<"Workspace"> | string
    rootPath?: StringNullableWithAggregatesFilter<"Workspace"> | string | null
    description?: StringNullableWithAggregatesFilter<"Workspace"> | string | null
    isArchived?: BoolWithAggregatesFilter<"Workspace"> | boolean
    createdAt?: DateTimeWithAggregatesFilter<"Workspace"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"Workspace"> | Date | string
  }

  export type ThreadWhereInput = {
    AND?: ThreadWhereInput | ThreadWhereInput[]
    OR?: ThreadWhereInput[]
    NOT?: ThreadWhereInput | ThreadWhereInput[]
    id?: StringFilter<"Thread"> | string
    workspaceId?: StringFilter<"Thread"> | string
    userId?: StringFilter<"Thread"> | string
    title?: StringFilter<"Thread"> | string
    summary?: StringNullableFilter<"Thread"> | string | null
    createdAt?: DateTimeFilter<"Thread"> | Date | string
    updatedAt?: DateTimeFilter<"Thread"> | Date | string
    archivedAt?: DateTimeNullableFilter<"Thread"> | Date | string | null
    workspace?: XOR<WorkspaceScalarRelationFilter, WorkspaceWhereInput>
    user?: XOR<UserScalarRelationFilter, UserWhereInput>
    messages?: ThreadMessageListRelationFilter
  }

  export type ThreadOrderByWithRelationInput = {
    id?: SortOrder
    workspaceId?: SortOrder
    userId?: SortOrder
    title?: SortOrder
    summary?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    archivedAt?: SortOrderInput | SortOrder
    workspace?: WorkspaceOrderByWithRelationInput
    user?: UserOrderByWithRelationInput
    messages?: ThreadMessageOrderByRelationAggregateInput
  }

  export type ThreadWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    AND?: ThreadWhereInput | ThreadWhereInput[]
    OR?: ThreadWhereInput[]
    NOT?: ThreadWhereInput | ThreadWhereInput[]
    workspaceId?: StringFilter<"Thread"> | string
    userId?: StringFilter<"Thread"> | string
    title?: StringFilter<"Thread"> | string
    summary?: StringNullableFilter<"Thread"> | string | null
    createdAt?: DateTimeFilter<"Thread"> | Date | string
    updatedAt?: DateTimeFilter<"Thread"> | Date | string
    archivedAt?: DateTimeNullableFilter<"Thread"> | Date | string | null
    workspace?: XOR<WorkspaceScalarRelationFilter, WorkspaceWhereInput>
    user?: XOR<UserScalarRelationFilter, UserWhereInput>
    messages?: ThreadMessageListRelationFilter
  }, "id">

  export type ThreadOrderByWithAggregationInput = {
    id?: SortOrder
    workspaceId?: SortOrder
    userId?: SortOrder
    title?: SortOrder
    summary?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    archivedAt?: SortOrderInput | SortOrder
    _count?: ThreadCountOrderByAggregateInput
    _max?: ThreadMaxOrderByAggregateInput
    _min?: ThreadMinOrderByAggregateInput
  }

  export type ThreadScalarWhereWithAggregatesInput = {
    AND?: ThreadScalarWhereWithAggregatesInput | ThreadScalarWhereWithAggregatesInput[]
    OR?: ThreadScalarWhereWithAggregatesInput[]
    NOT?: ThreadScalarWhereWithAggregatesInput | ThreadScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"Thread"> | string
    workspaceId?: StringWithAggregatesFilter<"Thread"> | string
    userId?: StringWithAggregatesFilter<"Thread"> | string
    title?: StringWithAggregatesFilter<"Thread"> | string
    summary?: StringNullableWithAggregatesFilter<"Thread"> | string | null
    createdAt?: DateTimeWithAggregatesFilter<"Thread"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"Thread"> | Date | string
    archivedAt?: DateTimeNullableWithAggregatesFilter<"Thread"> | Date | string | null
  }

  export type ThreadMessageWhereInput = {
    AND?: ThreadMessageWhereInput | ThreadMessageWhereInput[]
    OR?: ThreadMessageWhereInput[]
    NOT?: ThreadMessageWhereInput | ThreadMessageWhereInput[]
    id?: StringFilter<"ThreadMessage"> | string
    threadId?: StringFilter<"ThreadMessage"> | string
    messageId?: StringFilter<"ThreadMessage"> | string
    role?: EnumThreadMessageRoleFilter<"ThreadMessage"> | $Enums.ThreadMessageRole
    parts?: JsonFilter<"ThreadMessage">
    metadata?: JsonNullableFilter<"ThreadMessage">
    createdAt?: DateTimeFilter<"ThreadMessage"> | Date | string
    updatedAt?: DateTimeFilter<"ThreadMessage"> | Date | string
    thread?: XOR<ThreadScalarRelationFilter, ThreadWhereInput>
  }

  export type ThreadMessageOrderByWithRelationInput = {
    id?: SortOrder
    threadId?: SortOrder
    messageId?: SortOrder
    role?: SortOrder
    parts?: SortOrder
    metadata?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    thread?: ThreadOrderByWithRelationInput
  }

  export type ThreadMessageWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    threadId_messageId?: ThreadMessageThreadIdMessageIdCompoundUniqueInput
    AND?: ThreadMessageWhereInput | ThreadMessageWhereInput[]
    OR?: ThreadMessageWhereInput[]
    NOT?: ThreadMessageWhereInput | ThreadMessageWhereInput[]
    threadId?: StringFilter<"ThreadMessage"> | string
    messageId?: StringFilter<"ThreadMessage"> | string
    role?: EnumThreadMessageRoleFilter<"ThreadMessage"> | $Enums.ThreadMessageRole
    parts?: JsonFilter<"ThreadMessage">
    metadata?: JsonNullableFilter<"ThreadMessage">
    createdAt?: DateTimeFilter<"ThreadMessage"> | Date | string
    updatedAt?: DateTimeFilter<"ThreadMessage"> | Date | string
    thread?: XOR<ThreadScalarRelationFilter, ThreadWhereInput>
  }, "id" | "threadId_messageId">

  export type ThreadMessageOrderByWithAggregationInput = {
    id?: SortOrder
    threadId?: SortOrder
    messageId?: SortOrder
    role?: SortOrder
    parts?: SortOrder
    metadata?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: ThreadMessageCountOrderByAggregateInput
    _max?: ThreadMessageMaxOrderByAggregateInput
    _min?: ThreadMessageMinOrderByAggregateInput
  }

  export type ThreadMessageScalarWhereWithAggregatesInput = {
    AND?: ThreadMessageScalarWhereWithAggregatesInput | ThreadMessageScalarWhereWithAggregatesInput[]
    OR?: ThreadMessageScalarWhereWithAggregatesInput[]
    NOT?: ThreadMessageScalarWhereWithAggregatesInput | ThreadMessageScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"ThreadMessage"> | string
    threadId?: StringWithAggregatesFilter<"ThreadMessage"> | string
    messageId?: StringWithAggregatesFilter<"ThreadMessage"> | string
    role?: EnumThreadMessageRoleWithAggregatesFilter<"ThreadMessage"> | $Enums.ThreadMessageRole
    parts?: JsonWithAggregatesFilter<"ThreadMessage">
    metadata?: JsonNullableWithAggregatesFilter<"ThreadMessage">
    createdAt?: DateTimeWithAggregatesFilter<"ThreadMessage"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"ThreadMessage"> | Date | string
  }

  export type ProviderCredentialWhereInput = {
    AND?: ProviderCredentialWhereInput | ProviderCredentialWhereInput[]
    OR?: ProviderCredentialWhereInput[]
    NOT?: ProviderCredentialWhereInput | ProviderCredentialWhereInput[]
    id?: StringFilter<"ProviderCredential"> | string
    userId?: StringFilter<"ProviderCredential"> | string
    provider?: EnumAIProviderFilter<"ProviderCredential"> | $Enums.AIProvider
    encryptedConfig?: StringFilter<"ProviderCredential"> | string
    isEnabled?: BoolFilter<"ProviderCredential"> | boolean
    createdAt?: DateTimeFilter<"ProviderCredential"> | Date | string
    updatedAt?: DateTimeFilter<"ProviderCredential"> | Date | string
    user?: XOR<UserScalarRelationFilter, UserWhereInput>
  }

  export type ProviderCredentialOrderByWithRelationInput = {
    id?: SortOrder
    userId?: SortOrder
    provider?: SortOrder
    encryptedConfig?: SortOrder
    isEnabled?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    user?: UserOrderByWithRelationInput
  }

  export type ProviderCredentialWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    userId_provider?: ProviderCredentialUserIdProviderCompoundUniqueInput
    AND?: ProviderCredentialWhereInput | ProviderCredentialWhereInput[]
    OR?: ProviderCredentialWhereInput[]
    NOT?: ProviderCredentialWhereInput | ProviderCredentialWhereInput[]
    userId?: StringFilter<"ProviderCredential"> | string
    provider?: EnumAIProviderFilter<"ProviderCredential"> | $Enums.AIProvider
    encryptedConfig?: StringFilter<"ProviderCredential"> | string
    isEnabled?: BoolFilter<"ProviderCredential"> | boolean
    createdAt?: DateTimeFilter<"ProviderCredential"> | Date | string
    updatedAt?: DateTimeFilter<"ProviderCredential"> | Date | string
    user?: XOR<UserScalarRelationFilter, UserWhereInput>
  }, "id" | "userId_provider">

  export type ProviderCredentialOrderByWithAggregationInput = {
    id?: SortOrder
    userId?: SortOrder
    provider?: SortOrder
    encryptedConfig?: SortOrder
    isEnabled?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: ProviderCredentialCountOrderByAggregateInput
    _max?: ProviderCredentialMaxOrderByAggregateInput
    _min?: ProviderCredentialMinOrderByAggregateInput
  }

  export type ProviderCredentialScalarWhereWithAggregatesInput = {
    AND?: ProviderCredentialScalarWhereWithAggregatesInput | ProviderCredentialScalarWhereWithAggregatesInput[]
    OR?: ProviderCredentialScalarWhereWithAggregatesInput[]
    NOT?: ProviderCredentialScalarWhereWithAggregatesInput | ProviderCredentialScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"ProviderCredential"> | string
    userId?: StringWithAggregatesFilter<"ProviderCredential"> | string
    provider?: EnumAIProviderWithAggregatesFilter<"ProviderCredential"> | $Enums.AIProvider
    encryptedConfig?: StringWithAggregatesFilter<"ProviderCredential"> | string
    isEnabled?: BoolWithAggregatesFilter<"ProviderCredential"> | boolean
    createdAt?: DateTimeWithAggregatesFilter<"ProviderCredential"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"ProviderCredential"> | Date | string
  }

  export type ModelPreferenceWhereInput = {
    AND?: ModelPreferenceWhereInput | ModelPreferenceWhereInput[]
    OR?: ModelPreferenceWhereInput[]
    NOT?: ModelPreferenceWhereInput | ModelPreferenceWhereInput[]
    id?: StringFilter<"ModelPreference"> | string
    userId?: StringFilter<"ModelPreference"> | string
    provider?: EnumAIProviderFilter<"ModelPreference"> | $Enums.AIProvider
    modelId?: StringFilter<"ModelPreference"> | string
    isCustom?: BoolFilter<"ModelPreference"> | boolean
    isEnabled?: BoolFilter<"ModelPreference"> | boolean
    createdAt?: DateTimeFilter<"ModelPreference"> | Date | string
    user?: XOR<UserScalarRelationFilter, UserWhereInput>
  }

  export type ModelPreferenceOrderByWithRelationInput = {
    id?: SortOrder
    userId?: SortOrder
    provider?: SortOrder
    modelId?: SortOrder
    isCustom?: SortOrder
    isEnabled?: SortOrder
    createdAt?: SortOrder
    user?: UserOrderByWithRelationInput
  }

  export type ModelPreferenceWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    userId_provider_modelId?: ModelPreferenceUserIdProviderModelIdCompoundUniqueInput
    AND?: ModelPreferenceWhereInput | ModelPreferenceWhereInput[]
    OR?: ModelPreferenceWhereInput[]
    NOT?: ModelPreferenceWhereInput | ModelPreferenceWhereInput[]
    userId?: StringFilter<"ModelPreference"> | string
    provider?: EnumAIProviderFilter<"ModelPreference"> | $Enums.AIProvider
    modelId?: StringFilter<"ModelPreference"> | string
    isCustom?: BoolFilter<"ModelPreference"> | boolean
    isEnabled?: BoolFilter<"ModelPreference"> | boolean
    createdAt?: DateTimeFilter<"ModelPreference"> | Date | string
    user?: XOR<UserScalarRelationFilter, UserWhereInput>
  }, "id" | "userId_provider_modelId">

  export type ModelPreferenceOrderByWithAggregationInput = {
    id?: SortOrder
    userId?: SortOrder
    provider?: SortOrder
    modelId?: SortOrder
    isCustom?: SortOrder
    isEnabled?: SortOrder
    createdAt?: SortOrder
    _count?: ModelPreferenceCountOrderByAggregateInput
    _max?: ModelPreferenceMaxOrderByAggregateInput
    _min?: ModelPreferenceMinOrderByAggregateInput
  }

  export type ModelPreferenceScalarWhereWithAggregatesInput = {
    AND?: ModelPreferenceScalarWhereWithAggregatesInput | ModelPreferenceScalarWhereWithAggregatesInput[]
    OR?: ModelPreferenceScalarWhereWithAggregatesInput[]
    NOT?: ModelPreferenceScalarWhereWithAggregatesInput | ModelPreferenceScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"ModelPreference"> | string
    userId?: StringWithAggregatesFilter<"ModelPreference"> | string
    provider?: EnumAIProviderWithAggregatesFilter<"ModelPreference"> | $Enums.AIProvider
    modelId?: StringWithAggregatesFilter<"ModelPreference"> | string
    isCustom?: BoolWithAggregatesFilter<"ModelPreference"> | boolean
    isEnabled?: BoolWithAggregatesFilter<"ModelPreference"> | boolean
    createdAt?: DateTimeWithAggregatesFilter<"ModelPreference"> | Date | string
  }

  export type UserCreateInput = {
    id: string
    name: string
    email: string
    emailVerified?: boolean
    image?: string | null
    nickname?: string | null
    occupation?: string | null
    aboutUser?: string | null
    personalityPreset?: $Enums.PersonalityPreset
    customInstructions?: string | null
    themePreference?: $Enums.ThemePreference
    threadListOrganizeBy?: $Enums.ThreadListOrganizeBy
    threadListSortBy?: $Enums.ThreadListSortBy
    createdAt?: Date | string
    updatedAt?: Date | string
    selectedWorkspace?: WorkspaceCreateNestedOneWithoutSelectedByUsersInput
    ownedWorkspaces?: WorkspaceCreateNestedManyWithoutUserInput
    threads?: ThreadCreateNestedManyWithoutUserInput
    credentials?: ProviderCredentialCreateNestedManyWithoutUserInput
    modelPreferences?: ModelPreferenceCreateNestedManyWithoutUserInput
  }

  export type UserUncheckedCreateInput = {
    id: string
    name: string
    email: string
    emailVerified?: boolean
    image?: string | null
    nickname?: string | null
    occupation?: string | null
    aboutUser?: string | null
    personalityPreset?: $Enums.PersonalityPreset
    customInstructions?: string | null
    themePreference?: $Enums.ThemePreference
    selectedWorkspaceId?: string | null
    threadListOrganizeBy?: $Enums.ThreadListOrganizeBy
    threadListSortBy?: $Enums.ThreadListSortBy
    createdAt?: Date | string
    updatedAt?: Date | string
    ownedWorkspaces?: WorkspaceUncheckedCreateNestedManyWithoutUserInput
    threads?: ThreadUncheckedCreateNestedManyWithoutUserInput
    credentials?: ProviderCredentialUncheckedCreateNestedManyWithoutUserInput
    modelPreferences?: ModelPreferenceUncheckedCreateNestedManyWithoutUserInput
  }

  export type UserUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    emailVerified?: BoolFieldUpdateOperationsInput | boolean
    image?: NullableStringFieldUpdateOperationsInput | string | null
    nickname?: NullableStringFieldUpdateOperationsInput | string | null
    occupation?: NullableStringFieldUpdateOperationsInput | string | null
    aboutUser?: NullableStringFieldUpdateOperationsInput | string | null
    personalityPreset?: EnumPersonalityPresetFieldUpdateOperationsInput | $Enums.PersonalityPreset
    customInstructions?: NullableStringFieldUpdateOperationsInput | string | null
    themePreference?: EnumThemePreferenceFieldUpdateOperationsInput | $Enums.ThemePreference
    threadListOrganizeBy?: EnumThreadListOrganizeByFieldUpdateOperationsInput | $Enums.ThreadListOrganizeBy
    threadListSortBy?: EnumThreadListSortByFieldUpdateOperationsInput | $Enums.ThreadListSortBy
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    selectedWorkspace?: WorkspaceUpdateOneWithoutSelectedByUsersNestedInput
    ownedWorkspaces?: WorkspaceUpdateManyWithoutUserNestedInput
    threads?: ThreadUpdateManyWithoutUserNestedInput
    credentials?: ProviderCredentialUpdateManyWithoutUserNestedInput
    modelPreferences?: ModelPreferenceUpdateManyWithoutUserNestedInput
  }

  export type UserUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    emailVerified?: BoolFieldUpdateOperationsInput | boolean
    image?: NullableStringFieldUpdateOperationsInput | string | null
    nickname?: NullableStringFieldUpdateOperationsInput | string | null
    occupation?: NullableStringFieldUpdateOperationsInput | string | null
    aboutUser?: NullableStringFieldUpdateOperationsInput | string | null
    personalityPreset?: EnumPersonalityPresetFieldUpdateOperationsInput | $Enums.PersonalityPreset
    customInstructions?: NullableStringFieldUpdateOperationsInput | string | null
    themePreference?: EnumThemePreferenceFieldUpdateOperationsInput | $Enums.ThemePreference
    selectedWorkspaceId?: NullableStringFieldUpdateOperationsInput | string | null
    threadListOrganizeBy?: EnumThreadListOrganizeByFieldUpdateOperationsInput | $Enums.ThreadListOrganizeBy
    threadListSortBy?: EnumThreadListSortByFieldUpdateOperationsInput | $Enums.ThreadListSortBy
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    ownedWorkspaces?: WorkspaceUncheckedUpdateManyWithoutUserNestedInput
    threads?: ThreadUncheckedUpdateManyWithoutUserNestedInput
    credentials?: ProviderCredentialUncheckedUpdateManyWithoutUserNestedInput
    modelPreferences?: ModelPreferenceUncheckedUpdateManyWithoutUserNestedInput
  }

  export type UserCreateManyInput = {
    id: string
    name: string
    email: string
    emailVerified?: boolean
    image?: string | null
    nickname?: string | null
    occupation?: string | null
    aboutUser?: string | null
    personalityPreset?: $Enums.PersonalityPreset
    customInstructions?: string | null
    themePreference?: $Enums.ThemePreference
    selectedWorkspaceId?: string | null
    threadListOrganizeBy?: $Enums.ThreadListOrganizeBy
    threadListSortBy?: $Enums.ThreadListSortBy
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type UserUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    emailVerified?: BoolFieldUpdateOperationsInput | boolean
    image?: NullableStringFieldUpdateOperationsInput | string | null
    nickname?: NullableStringFieldUpdateOperationsInput | string | null
    occupation?: NullableStringFieldUpdateOperationsInput | string | null
    aboutUser?: NullableStringFieldUpdateOperationsInput | string | null
    personalityPreset?: EnumPersonalityPresetFieldUpdateOperationsInput | $Enums.PersonalityPreset
    customInstructions?: NullableStringFieldUpdateOperationsInput | string | null
    themePreference?: EnumThemePreferenceFieldUpdateOperationsInput | $Enums.ThemePreference
    threadListOrganizeBy?: EnumThreadListOrganizeByFieldUpdateOperationsInput | $Enums.ThreadListOrganizeBy
    threadListSortBy?: EnumThreadListSortByFieldUpdateOperationsInput | $Enums.ThreadListSortBy
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type UserUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    emailVerified?: BoolFieldUpdateOperationsInput | boolean
    image?: NullableStringFieldUpdateOperationsInput | string | null
    nickname?: NullableStringFieldUpdateOperationsInput | string | null
    occupation?: NullableStringFieldUpdateOperationsInput | string | null
    aboutUser?: NullableStringFieldUpdateOperationsInput | string | null
    personalityPreset?: EnumPersonalityPresetFieldUpdateOperationsInput | $Enums.PersonalityPreset
    customInstructions?: NullableStringFieldUpdateOperationsInput | string | null
    themePreference?: EnumThemePreferenceFieldUpdateOperationsInput | $Enums.ThemePreference
    selectedWorkspaceId?: NullableStringFieldUpdateOperationsInput | string | null
    threadListOrganizeBy?: EnumThreadListOrganizeByFieldUpdateOperationsInput | $Enums.ThreadListOrganizeBy
    threadListSortBy?: EnumThreadListSortByFieldUpdateOperationsInput | $Enums.ThreadListSortBy
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type WorkspaceCreateInput = {
    id?: string
    name: string
    rootPath?: string | null
    description?: string | null
    isArchived?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
    user: UserCreateNestedOneWithoutOwnedWorkspacesInput
    selectedByUsers?: UserCreateNestedManyWithoutSelectedWorkspaceInput
    threads?: ThreadCreateNestedManyWithoutWorkspaceInput
  }

  export type WorkspaceUncheckedCreateInput = {
    id?: string
    userId: string
    name: string
    rootPath?: string | null
    description?: string | null
    isArchived?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
    selectedByUsers?: UserUncheckedCreateNestedManyWithoutSelectedWorkspaceInput
    threads?: ThreadUncheckedCreateNestedManyWithoutWorkspaceInput
  }

  export type WorkspaceUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    rootPath?: NullableStringFieldUpdateOperationsInput | string | null
    description?: NullableStringFieldUpdateOperationsInput | string | null
    isArchived?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    user?: UserUpdateOneRequiredWithoutOwnedWorkspacesNestedInput
    selectedByUsers?: UserUpdateManyWithoutSelectedWorkspaceNestedInput
    threads?: ThreadUpdateManyWithoutWorkspaceNestedInput
  }

  export type WorkspaceUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    userId?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    rootPath?: NullableStringFieldUpdateOperationsInput | string | null
    description?: NullableStringFieldUpdateOperationsInput | string | null
    isArchived?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    selectedByUsers?: UserUncheckedUpdateManyWithoutSelectedWorkspaceNestedInput
    threads?: ThreadUncheckedUpdateManyWithoutWorkspaceNestedInput
  }

  export type WorkspaceCreateManyInput = {
    id?: string
    userId: string
    name: string
    rootPath?: string | null
    description?: string | null
    isArchived?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type WorkspaceUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    rootPath?: NullableStringFieldUpdateOperationsInput | string | null
    description?: NullableStringFieldUpdateOperationsInput | string | null
    isArchived?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type WorkspaceUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    userId?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    rootPath?: NullableStringFieldUpdateOperationsInput | string | null
    description?: NullableStringFieldUpdateOperationsInput | string | null
    isArchived?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ThreadCreateInput = {
    id?: string
    title: string
    summary?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    archivedAt?: Date | string | null
    workspace: WorkspaceCreateNestedOneWithoutThreadsInput
    user: UserCreateNestedOneWithoutThreadsInput
    messages?: ThreadMessageCreateNestedManyWithoutThreadInput
  }

  export type ThreadUncheckedCreateInput = {
    id?: string
    workspaceId: string
    userId: string
    title: string
    summary?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    archivedAt?: Date | string | null
    messages?: ThreadMessageUncheckedCreateNestedManyWithoutThreadInput
  }

  export type ThreadUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    title?: StringFieldUpdateOperationsInput | string
    summary?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    archivedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    workspace?: WorkspaceUpdateOneRequiredWithoutThreadsNestedInput
    user?: UserUpdateOneRequiredWithoutThreadsNestedInput
    messages?: ThreadMessageUpdateManyWithoutThreadNestedInput
  }

  export type ThreadUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    workspaceId?: StringFieldUpdateOperationsInput | string
    userId?: StringFieldUpdateOperationsInput | string
    title?: StringFieldUpdateOperationsInput | string
    summary?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    archivedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    messages?: ThreadMessageUncheckedUpdateManyWithoutThreadNestedInput
  }

  export type ThreadCreateManyInput = {
    id?: string
    workspaceId: string
    userId: string
    title: string
    summary?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    archivedAt?: Date | string | null
  }

  export type ThreadUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    title?: StringFieldUpdateOperationsInput | string
    summary?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    archivedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
  }

  export type ThreadUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    workspaceId?: StringFieldUpdateOperationsInput | string
    userId?: StringFieldUpdateOperationsInput | string
    title?: StringFieldUpdateOperationsInput | string
    summary?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    archivedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
  }

  export type ThreadMessageCreateInput = {
    id?: string
    messageId: string
    role: $Enums.ThreadMessageRole
    parts: JsonNullValueInput | InputJsonValue
    metadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    updatedAt?: Date | string
    thread: ThreadCreateNestedOneWithoutMessagesInput
  }

  export type ThreadMessageUncheckedCreateInput = {
    id?: string
    threadId: string
    messageId: string
    role: $Enums.ThreadMessageRole
    parts: JsonNullValueInput | InputJsonValue
    metadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type ThreadMessageUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    messageId?: StringFieldUpdateOperationsInput | string
    role?: EnumThreadMessageRoleFieldUpdateOperationsInput | $Enums.ThreadMessageRole
    parts?: JsonNullValueInput | InputJsonValue
    metadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    thread?: ThreadUpdateOneRequiredWithoutMessagesNestedInput
  }

  export type ThreadMessageUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    threadId?: StringFieldUpdateOperationsInput | string
    messageId?: StringFieldUpdateOperationsInput | string
    role?: EnumThreadMessageRoleFieldUpdateOperationsInput | $Enums.ThreadMessageRole
    parts?: JsonNullValueInput | InputJsonValue
    metadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ThreadMessageCreateManyInput = {
    id?: string
    threadId: string
    messageId: string
    role: $Enums.ThreadMessageRole
    parts: JsonNullValueInput | InputJsonValue
    metadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type ThreadMessageUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    messageId?: StringFieldUpdateOperationsInput | string
    role?: EnumThreadMessageRoleFieldUpdateOperationsInput | $Enums.ThreadMessageRole
    parts?: JsonNullValueInput | InputJsonValue
    metadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ThreadMessageUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    threadId?: StringFieldUpdateOperationsInput | string
    messageId?: StringFieldUpdateOperationsInput | string
    role?: EnumThreadMessageRoleFieldUpdateOperationsInput | $Enums.ThreadMessageRole
    parts?: JsonNullValueInput | InputJsonValue
    metadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ProviderCredentialCreateInput = {
    id?: string
    provider: $Enums.AIProvider
    encryptedConfig: string
    isEnabled?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
    user: UserCreateNestedOneWithoutCredentialsInput
  }

  export type ProviderCredentialUncheckedCreateInput = {
    id?: string
    userId: string
    provider: $Enums.AIProvider
    encryptedConfig: string
    isEnabled?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type ProviderCredentialUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    provider?: EnumAIProviderFieldUpdateOperationsInput | $Enums.AIProvider
    encryptedConfig?: StringFieldUpdateOperationsInput | string
    isEnabled?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    user?: UserUpdateOneRequiredWithoutCredentialsNestedInput
  }

  export type ProviderCredentialUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    userId?: StringFieldUpdateOperationsInput | string
    provider?: EnumAIProviderFieldUpdateOperationsInput | $Enums.AIProvider
    encryptedConfig?: StringFieldUpdateOperationsInput | string
    isEnabled?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ProviderCredentialCreateManyInput = {
    id?: string
    userId: string
    provider: $Enums.AIProvider
    encryptedConfig: string
    isEnabled?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type ProviderCredentialUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    provider?: EnumAIProviderFieldUpdateOperationsInput | $Enums.AIProvider
    encryptedConfig?: StringFieldUpdateOperationsInput | string
    isEnabled?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ProviderCredentialUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    userId?: StringFieldUpdateOperationsInput | string
    provider?: EnumAIProviderFieldUpdateOperationsInput | $Enums.AIProvider
    encryptedConfig?: StringFieldUpdateOperationsInput | string
    isEnabled?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ModelPreferenceCreateInput = {
    id?: string
    provider: $Enums.AIProvider
    modelId: string
    isCustom?: boolean
    isEnabled?: boolean
    createdAt?: Date | string
    user: UserCreateNestedOneWithoutModelPreferencesInput
  }

  export type ModelPreferenceUncheckedCreateInput = {
    id?: string
    userId: string
    provider: $Enums.AIProvider
    modelId: string
    isCustom?: boolean
    isEnabled?: boolean
    createdAt?: Date | string
  }

  export type ModelPreferenceUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    provider?: EnumAIProviderFieldUpdateOperationsInput | $Enums.AIProvider
    modelId?: StringFieldUpdateOperationsInput | string
    isCustom?: BoolFieldUpdateOperationsInput | boolean
    isEnabled?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    user?: UserUpdateOneRequiredWithoutModelPreferencesNestedInput
  }

  export type ModelPreferenceUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    userId?: StringFieldUpdateOperationsInput | string
    provider?: EnumAIProviderFieldUpdateOperationsInput | $Enums.AIProvider
    modelId?: StringFieldUpdateOperationsInput | string
    isCustom?: BoolFieldUpdateOperationsInput | boolean
    isEnabled?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ModelPreferenceCreateManyInput = {
    id?: string
    userId: string
    provider: $Enums.AIProvider
    modelId: string
    isCustom?: boolean
    isEnabled?: boolean
    createdAt?: Date | string
  }

  export type ModelPreferenceUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    provider?: EnumAIProviderFieldUpdateOperationsInput | $Enums.AIProvider
    modelId?: StringFieldUpdateOperationsInput | string
    isCustom?: BoolFieldUpdateOperationsInput | boolean
    isEnabled?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ModelPreferenceUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    userId?: StringFieldUpdateOperationsInput | string
    provider?: EnumAIProviderFieldUpdateOperationsInput | $Enums.AIProvider
    modelId?: StringFieldUpdateOperationsInput | string
    isCustom?: BoolFieldUpdateOperationsInput | boolean
    isEnabled?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type StringFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringFilter<$PrismaModel> | string
  }

  export type BoolFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolFilter<$PrismaModel> | boolean
  }

  export type StringNullableFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringNullableFilter<$PrismaModel> | string | null
  }

  export type EnumPersonalityPresetFilter<$PrismaModel = never> = {
    equals?: $Enums.PersonalityPreset | EnumPersonalityPresetFieldRefInput<$PrismaModel>
    in?: $Enums.PersonalityPreset[] | ListEnumPersonalityPresetFieldRefInput<$PrismaModel>
    notIn?: $Enums.PersonalityPreset[] | ListEnumPersonalityPresetFieldRefInput<$PrismaModel>
    not?: NestedEnumPersonalityPresetFilter<$PrismaModel> | $Enums.PersonalityPreset
  }

  export type EnumThemePreferenceFilter<$PrismaModel = never> = {
    equals?: $Enums.ThemePreference | EnumThemePreferenceFieldRefInput<$PrismaModel>
    in?: $Enums.ThemePreference[] | ListEnumThemePreferenceFieldRefInput<$PrismaModel>
    notIn?: $Enums.ThemePreference[] | ListEnumThemePreferenceFieldRefInput<$PrismaModel>
    not?: NestedEnumThemePreferenceFilter<$PrismaModel> | $Enums.ThemePreference
  }

  export type EnumThreadListOrganizeByFilter<$PrismaModel = never> = {
    equals?: $Enums.ThreadListOrganizeBy | EnumThreadListOrganizeByFieldRefInput<$PrismaModel>
    in?: $Enums.ThreadListOrganizeBy[] | ListEnumThreadListOrganizeByFieldRefInput<$PrismaModel>
    notIn?: $Enums.ThreadListOrganizeBy[] | ListEnumThreadListOrganizeByFieldRefInput<$PrismaModel>
    not?: NestedEnumThreadListOrganizeByFilter<$PrismaModel> | $Enums.ThreadListOrganizeBy
  }

  export type EnumThreadListSortByFilter<$PrismaModel = never> = {
    equals?: $Enums.ThreadListSortBy | EnumThreadListSortByFieldRefInput<$PrismaModel>
    in?: $Enums.ThreadListSortBy[] | ListEnumThreadListSortByFieldRefInput<$PrismaModel>
    notIn?: $Enums.ThreadListSortBy[] | ListEnumThreadListSortByFieldRefInput<$PrismaModel>
    not?: NestedEnumThreadListSortByFilter<$PrismaModel> | $Enums.ThreadListSortBy
  }

  export type DateTimeFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeFilter<$PrismaModel> | Date | string
  }

  export type WorkspaceNullableScalarRelationFilter = {
    is?: WorkspaceWhereInput | null
    isNot?: WorkspaceWhereInput | null
  }

  export type WorkspaceListRelationFilter = {
    every?: WorkspaceWhereInput
    some?: WorkspaceWhereInput
    none?: WorkspaceWhereInput
  }

  export type ThreadListRelationFilter = {
    every?: ThreadWhereInput
    some?: ThreadWhereInput
    none?: ThreadWhereInput
  }

  export type ProviderCredentialListRelationFilter = {
    every?: ProviderCredentialWhereInput
    some?: ProviderCredentialWhereInput
    none?: ProviderCredentialWhereInput
  }

  export type ModelPreferenceListRelationFilter = {
    every?: ModelPreferenceWhereInput
    some?: ModelPreferenceWhereInput
    none?: ModelPreferenceWhereInput
  }

  export type SortOrderInput = {
    sort: SortOrder
    nulls?: NullsOrder
  }

  export type WorkspaceOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type ThreadOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type ProviderCredentialOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type ModelPreferenceOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type UserCountOrderByAggregateInput = {
    id?: SortOrder
    name?: SortOrder
    email?: SortOrder
    emailVerified?: SortOrder
    image?: SortOrder
    nickname?: SortOrder
    occupation?: SortOrder
    aboutUser?: SortOrder
    personalityPreset?: SortOrder
    customInstructions?: SortOrder
    themePreference?: SortOrder
    selectedWorkspaceId?: SortOrder
    threadListOrganizeBy?: SortOrder
    threadListSortBy?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type UserMaxOrderByAggregateInput = {
    id?: SortOrder
    name?: SortOrder
    email?: SortOrder
    emailVerified?: SortOrder
    image?: SortOrder
    nickname?: SortOrder
    occupation?: SortOrder
    aboutUser?: SortOrder
    personalityPreset?: SortOrder
    customInstructions?: SortOrder
    themePreference?: SortOrder
    selectedWorkspaceId?: SortOrder
    threadListOrganizeBy?: SortOrder
    threadListSortBy?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type UserMinOrderByAggregateInput = {
    id?: SortOrder
    name?: SortOrder
    email?: SortOrder
    emailVerified?: SortOrder
    image?: SortOrder
    nickname?: SortOrder
    occupation?: SortOrder
    aboutUser?: SortOrder
    personalityPreset?: SortOrder
    customInstructions?: SortOrder
    themePreference?: SortOrder
    selectedWorkspaceId?: SortOrder
    threadListOrganizeBy?: SortOrder
    threadListSortBy?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type StringWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringWithAggregatesFilter<$PrismaModel> | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedStringFilter<$PrismaModel>
    _max?: NestedStringFilter<$PrismaModel>
  }

  export type BoolWithAggregatesFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolWithAggregatesFilter<$PrismaModel> | boolean
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedBoolFilter<$PrismaModel>
    _max?: NestedBoolFilter<$PrismaModel>
  }

  export type StringNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringNullableWithAggregatesFilter<$PrismaModel> | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedStringNullableFilter<$PrismaModel>
    _max?: NestedStringNullableFilter<$PrismaModel>
  }

  export type EnumPersonalityPresetWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.PersonalityPreset | EnumPersonalityPresetFieldRefInput<$PrismaModel>
    in?: $Enums.PersonalityPreset[] | ListEnumPersonalityPresetFieldRefInput<$PrismaModel>
    notIn?: $Enums.PersonalityPreset[] | ListEnumPersonalityPresetFieldRefInput<$PrismaModel>
    not?: NestedEnumPersonalityPresetWithAggregatesFilter<$PrismaModel> | $Enums.PersonalityPreset
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumPersonalityPresetFilter<$PrismaModel>
    _max?: NestedEnumPersonalityPresetFilter<$PrismaModel>
  }

  export type EnumThemePreferenceWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.ThemePreference | EnumThemePreferenceFieldRefInput<$PrismaModel>
    in?: $Enums.ThemePreference[] | ListEnumThemePreferenceFieldRefInput<$PrismaModel>
    notIn?: $Enums.ThemePreference[] | ListEnumThemePreferenceFieldRefInput<$PrismaModel>
    not?: NestedEnumThemePreferenceWithAggregatesFilter<$PrismaModel> | $Enums.ThemePreference
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumThemePreferenceFilter<$PrismaModel>
    _max?: NestedEnumThemePreferenceFilter<$PrismaModel>
  }

  export type EnumThreadListOrganizeByWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.ThreadListOrganizeBy | EnumThreadListOrganizeByFieldRefInput<$PrismaModel>
    in?: $Enums.ThreadListOrganizeBy[] | ListEnumThreadListOrganizeByFieldRefInput<$PrismaModel>
    notIn?: $Enums.ThreadListOrganizeBy[] | ListEnumThreadListOrganizeByFieldRefInput<$PrismaModel>
    not?: NestedEnumThreadListOrganizeByWithAggregatesFilter<$PrismaModel> | $Enums.ThreadListOrganizeBy
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumThreadListOrganizeByFilter<$PrismaModel>
    _max?: NestedEnumThreadListOrganizeByFilter<$PrismaModel>
  }

  export type EnumThreadListSortByWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.ThreadListSortBy | EnumThreadListSortByFieldRefInput<$PrismaModel>
    in?: $Enums.ThreadListSortBy[] | ListEnumThreadListSortByFieldRefInput<$PrismaModel>
    notIn?: $Enums.ThreadListSortBy[] | ListEnumThreadListSortByFieldRefInput<$PrismaModel>
    not?: NestedEnumThreadListSortByWithAggregatesFilter<$PrismaModel> | $Enums.ThreadListSortBy
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumThreadListSortByFilter<$PrismaModel>
    _max?: NestedEnumThreadListSortByFilter<$PrismaModel>
  }

  export type DateTimeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeWithAggregatesFilter<$PrismaModel> | Date | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedDateTimeFilter<$PrismaModel>
    _max?: NestedDateTimeFilter<$PrismaModel>
  }

  export type UserScalarRelationFilter = {
    is?: UserWhereInput
    isNot?: UserWhereInput
  }

  export type UserListRelationFilter = {
    every?: UserWhereInput
    some?: UserWhereInput
    none?: UserWhereInput
  }

  export type UserOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type WorkspaceCountOrderByAggregateInput = {
    id?: SortOrder
    userId?: SortOrder
    name?: SortOrder
    rootPath?: SortOrder
    description?: SortOrder
    isArchived?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type WorkspaceMaxOrderByAggregateInput = {
    id?: SortOrder
    userId?: SortOrder
    name?: SortOrder
    rootPath?: SortOrder
    description?: SortOrder
    isArchived?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type WorkspaceMinOrderByAggregateInput = {
    id?: SortOrder
    userId?: SortOrder
    name?: SortOrder
    rootPath?: SortOrder
    description?: SortOrder
    isArchived?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type DateTimeNullableFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableFilter<$PrismaModel> | Date | string | null
  }

  export type WorkspaceScalarRelationFilter = {
    is?: WorkspaceWhereInput
    isNot?: WorkspaceWhereInput
  }

  export type ThreadMessageListRelationFilter = {
    every?: ThreadMessageWhereInput
    some?: ThreadMessageWhereInput
    none?: ThreadMessageWhereInput
  }

  export type ThreadMessageOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type ThreadCountOrderByAggregateInput = {
    id?: SortOrder
    workspaceId?: SortOrder
    userId?: SortOrder
    title?: SortOrder
    summary?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    archivedAt?: SortOrder
  }

  export type ThreadMaxOrderByAggregateInput = {
    id?: SortOrder
    workspaceId?: SortOrder
    userId?: SortOrder
    title?: SortOrder
    summary?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    archivedAt?: SortOrder
  }

  export type ThreadMinOrderByAggregateInput = {
    id?: SortOrder
    workspaceId?: SortOrder
    userId?: SortOrder
    title?: SortOrder
    summary?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    archivedAt?: SortOrder
  }

  export type DateTimeNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableWithAggregatesFilter<$PrismaModel> | Date | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedDateTimeNullableFilter<$PrismaModel>
    _max?: NestedDateTimeNullableFilter<$PrismaModel>
  }

  export type EnumThreadMessageRoleFilter<$PrismaModel = never> = {
    equals?: $Enums.ThreadMessageRole | EnumThreadMessageRoleFieldRefInput<$PrismaModel>
    in?: $Enums.ThreadMessageRole[] | ListEnumThreadMessageRoleFieldRefInput<$PrismaModel>
    notIn?: $Enums.ThreadMessageRole[] | ListEnumThreadMessageRoleFieldRefInput<$PrismaModel>
    not?: NestedEnumThreadMessageRoleFilter<$PrismaModel> | $Enums.ThreadMessageRole
  }
  export type JsonFilter<$PrismaModel = never> =
    | PatchUndefined<
        Either<Required<JsonFilterBase<$PrismaModel>>, Exclude<keyof Required<JsonFilterBase<$PrismaModel>>, 'path'>>,
        Required<JsonFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<JsonFilterBase<$PrismaModel>>, 'path'>>

  export type JsonFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    path?: string[]
    mode?: QueryMode | EnumQueryModeFieldRefInput<$PrismaModel>
    string_contains?: string | StringFieldRefInput<$PrismaModel>
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    lt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    lte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
  }
  export type JsonNullableFilter<$PrismaModel = never> =
    | PatchUndefined<
        Either<Required<JsonNullableFilterBase<$PrismaModel>>, Exclude<keyof Required<JsonNullableFilterBase<$PrismaModel>>, 'path'>>,
        Required<JsonNullableFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<JsonNullableFilterBase<$PrismaModel>>, 'path'>>

  export type JsonNullableFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    path?: string[]
    mode?: QueryMode | EnumQueryModeFieldRefInput<$PrismaModel>
    string_contains?: string | StringFieldRefInput<$PrismaModel>
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    lt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    lte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
  }

  export type ThreadScalarRelationFilter = {
    is?: ThreadWhereInput
    isNot?: ThreadWhereInput
  }

  export type ThreadMessageThreadIdMessageIdCompoundUniqueInput = {
    threadId: string
    messageId: string
  }

  export type ThreadMessageCountOrderByAggregateInput = {
    id?: SortOrder
    threadId?: SortOrder
    messageId?: SortOrder
    role?: SortOrder
    parts?: SortOrder
    metadata?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type ThreadMessageMaxOrderByAggregateInput = {
    id?: SortOrder
    threadId?: SortOrder
    messageId?: SortOrder
    role?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type ThreadMessageMinOrderByAggregateInput = {
    id?: SortOrder
    threadId?: SortOrder
    messageId?: SortOrder
    role?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type EnumThreadMessageRoleWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.ThreadMessageRole | EnumThreadMessageRoleFieldRefInput<$PrismaModel>
    in?: $Enums.ThreadMessageRole[] | ListEnumThreadMessageRoleFieldRefInput<$PrismaModel>
    notIn?: $Enums.ThreadMessageRole[] | ListEnumThreadMessageRoleFieldRefInput<$PrismaModel>
    not?: NestedEnumThreadMessageRoleWithAggregatesFilter<$PrismaModel> | $Enums.ThreadMessageRole
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumThreadMessageRoleFilter<$PrismaModel>
    _max?: NestedEnumThreadMessageRoleFilter<$PrismaModel>
  }
  export type JsonWithAggregatesFilter<$PrismaModel = never> =
    | PatchUndefined<
        Either<Required<JsonWithAggregatesFilterBase<$PrismaModel>>, Exclude<keyof Required<JsonWithAggregatesFilterBase<$PrismaModel>>, 'path'>>,
        Required<JsonWithAggregatesFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<JsonWithAggregatesFilterBase<$PrismaModel>>, 'path'>>

  export type JsonWithAggregatesFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    path?: string[]
    mode?: QueryMode | EnumQueryModeFieldRefInput<$PrismaModel>
    string_contains?: string | StringFieldRefInput<$PrismaModel>
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    lt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    lte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedJsonFilter<$PrismaModel>
    _max?: NestedJsonFilter<$PrismaModel>
  }
  export type JsonNullableWithAggregatesFilter<$PrismaModel = never> =
    | PatchUndefined<
        Either<Required<JsonNullableWithAggregatesFilterBase<$PrismaModel>>, Exclude<keyof Required<JsonNullableWithAggregatesFilterBase<$PrismaModel>>, 'path'>>,
        Required<JsonNullableWithAggregatesFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<JsonNullableWithAggregatesFilterBase<$PrismaModel>>, 'path'>>

  export type JsonNullableWithAggregatesFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    path?: string[]
    mode?: QueryMode | EnumQueryModeFieldRefInput<$PrismaModel>
    string_contains?: string | StringFieldRefInput<$PrismaModel>
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    lt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    lte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedJsonNullableFilter<$PrismaModel>
    _max?: NestedJsonNullableFilter<$PrismaModel>
  }

  export type EnumAIProviderFilter<$PrismaModel = never> = {
    equals?: $Enums.AIProvider | EnumAIProviderFieldRefInput<$PrismaModel>
    in?: $Enums.AIProvider[] | ListEnumAIProviderFieldRefInput<$PrismaModel>
    notIn?: $Enums.AIProvider[] | ListEnumAIProviderFieldRefInput<$PrismaModel>
    not?: NestedEnumAIProviderFilter<$PrismaModel> | $Enums.AIProvider
  }

  export type ProviderCredentialUserIdProviderCompoundUniqueInput = {
    userId: string
    provider: $Enums.AIProvider
  }

  export type ProviderCredentialCountOrderByAggregateInput = {
    id?: SortOrder
    userId?: SortOrder
    provider?: SortOrder
    encryptedConfig?: SortOrder
    isEnabled?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type ProviderCredentialMaxOrderByAggregateInput = {
    id?: SortOrder
    userId?: SortOrder
    provider?: SortOrder
    encryptedConfig?: SortOrder
    isEnabled?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type ProviderCredentialMinOrderByAggregateInput = {
    id?: SortOrder
    userId?: SortOrder
    provider?: SortOrder
    encryptedConfig?: SortOrder
    isEnabled?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type EnumAIProviderWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.AIProvider | EnumAIProviderFieldRefInput<$PrismaModel>
    in?: $Enums.AIProvider[] | ListEnumAIProviderFieldRefInput<$PrismaModel>
    notIn?: $Enums.AIProvider[] | ListEnumAIProviderFieldRefInput<$PrismaModel>
    not?: NestedEnumAIProviderWithAggregatesFilter<$PrismaModel> | $Enums.AIProvider
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumAIProviderFilter<$PrismaModel>
    _max?: NestedEnumAIProviderFilter<$PrismaModel>
  }

  export type ModelPreferenceUserIdProviderModelIdCompoundUniqueInput = {
    userId: string
    provider: $Enums.AIProvider
    modelId: string
  }

  export type ModelPreferenceCountOrderByAggregateInput = {
    id?: SortOrder
    userId?: SortOrder
    provider?: SortOrder
    modelId?: SortOrder
    isCustom?: SortOrder
    isEnabled?: SortOrder
    createdAt?: SortOrder
  }

  export type ModelPreferenceMaxOrderByAggregateInput = {
    id?: SortOrder
    userId?: SortOrder
    provider?: SortOrder
    modelId?: SortOrder
    isCustom?: SortOrder
    isEnabled?: SortOrder
    createdAt?: SortOrder
  }

  export type ModelPreferenceMinOrderByAggregateInput = {
    id?: SortOrder
    userId?: SortOrder
    provider?: SortOrder
    modelId?: SortOrder
    isCustom?: SortOrder
    isEnabled?: SortOrder
    createdAt?: SortOrder
  }

  export type WorkspaceCreateNestedOneWithoutSelectedByUsersInput = {
    create?: XOR<WorkspaceCreateWithoutSelectedByUsersInput, WorkspaceUncheckedCreateWithoutSelectedByUsersInput>
    connectOrCreate?: WorkspaceCreateOrConnectWithoutSelectedByUsersInput
    connect?: WorkspaceWhereUniqueInput
  }

  export type WorkspaceCreateNestedManyWithoutUserInput = {
    create?: XOR<WorkspaceCreateWithoutUserInput, WorkspaceUncheckedCreateWithoutUserInput> | WorkspaceCreateWithoutUserInput[] | WorkspaceUncheckedCreateWithoutUserInput[]
    connectOrCreate?: WorkspaceCreateOrConnectWithoutUserInput | WorkspaceCreateOrConnectWithoutUserInput[]
    createMany?: WorkspaceCreateManyUserInputEnvelope
    connect?: WorkspaceWhereUniqueInput | WorkspaceWhereUniqueInput[]
  }

  export type ThreadCreateNestedManyWithoutUserInput = {
    create?: XOR<ThreadCreateWithoutUserInput, ThreadUncheckedCreateWithoutUserInput> | ThreadCreateWithoutUserInput[] | ThreadUncheckedCreateWithoutUserInput[]
    connectOrCreate?: ThreadCreateOrConnectWithoutUserInput | ThreadCreateOrConnectWithoutUserInput[]
    createMany?: ThreadCreateManyUserInputEnvelope
    connect?: ThreadWhereUniqueInput | ThreadWhereUniqueInput[]
  }

  export type ProviderCredentialCreateNestedManyWithoutUserInput = {
    create?: XOR<ProviderCredentialCreateWithoutUserInput, ProviderCredentialUncheckedCreateWithoutUserInput> | ProviderCredentialCreateWithoutUserInput[] | ProviderCredentialUncheckedCreateWithoutUserInput[]
    connectOrCreate?: ProviderCredentialCreateOrConnectWithoutUserInput | ProviderCredentialCreateOrConnectWithoutUserInput[]
    createMany?: ProviderCredentialCreateManyUserInputEnvelope
    connect?: ProviderCredentialWhereUniqueInput | ProviderCredentialWhereUniqueInput[]
  }

  export type ModelPreferenceCreateNestedManyWithoutUserInput = {
    create?: XOR<ModelPreferenceCreateWithoutUserInput, ModelPreferenceUncheckedCreateWithoutUserInput> | ModelPreferenceCreateWithoutUserInput[] | ModelPreferenceUncheckedCreateWithoutUserInput[]
    connectOrCreate?: ModelPreferenceCreateOrConnectWithoutUserInput | ModelPreferenceCreateOrConnectWithoutUserInput[]
    createMany?: ModelPreferenceCreateManyUserInputEnvelope
    connect?: ModelPreferenceWhereUniqueInput | ModelPreferenceWhereUniqueInput[]
  }

  export type WorkspaceUncheckedCreateNestedManyWithoutUserInput = {
    create?: XOR<WorkspaceCreateWithoutUserInput, WorkspaceUncheckedCreateWithoutUserInput> | WorkspaceCreateWithoutUserInput[] | WorkspaceUncheckedCreateWithoutUserInput[]
    connectOrCreate?: WorkspaceCreateOrConnectWithoutUserInput | WorkspaceCreateOrConnectWithoutUserInput[]
    createMany?: WorkspaceCreateManyUserInputEnvelope
    connect?: WorkspaceWhereUniqueInput | WorkspaceWhereUniqueInput[]
  }

  export type ThreadUncheckedCreateNestedManyWithoutUserInput = {
    create?: XOR<ThreadCreateWithoutUserInput, ThreadUncheckedCreateWithoutUserInput> | ThreadCreateWithoutUserInput[] | ThreadUncheckedCreateWithoutUserInput[]
    connectOrCreate?: ThreadCreateOrConnectWithoutUserInput | ThreadCreateOrConnectWithoutUserInput[]
    createMany?: ThreadCreateManyUserInputEnvelope
    connect?: ThreadWhereUniqueInput | ThreadWhereUniqueInput[]
  }

  export type ProviderCredentialUncheckedCreateNestedManyWithoutUserInput = {
    create?: XOR<ProviderCredentialCreateWithoutUserInput, ProviderCredentialUncheckedCreateWithoutUserInput> | ProviderCredentialCreateWithoutUserInput[] | ProviderCredentialUncheckedCreateWithoutUserInput[]
    connectOrCreate?: ProviderCredentialCreateOrConnectWithoutUserInput | ProviderCredentialCreateOrConnectWithoutUserInput[]
    createMany?: ProviderCredentialCreateManyUserInputEnvelope
    connect?: ProviderCredentialWhereUniqueInput | ProviderCredentialWhereUniqueInput[]
  }

  export type ModelPreferenceUncheckedCreateNestedManyWithoutUserInput = {
    create?: XOR<ModelPreferenceCreateWithoutUserInput, ModelPreferenceUncheckedCreateWithoutUserInput> | ModelPreferenceCreateWithoutUserInput[] | ModelPreferenceUncheckedCreateWithoutUserInput[]
    connectOrCreate?: ModelPreferenceCreateOrConnectWithoutUserInput | ModelPreferenceCreateOrConnectWithoutUserInput[]
    createMany?: ModelPreferenceCreateManyUserInputEnvelope
    connect?: ModelPreferenceWhereUniqueInput | ModelPreferenceWhereUniqueInput[]
  }

  export type StringFieldUpdateOperationsInput = {
    set?: string
  }

  export type BoolFieldUpdateOperationsInput = {
    set?: boolean
  }

  export type NullableStringFieldUpdateOperationsInput = {
    set?: string | null
  }

  export type EnumPersonalityPresetFieldUpdateOperationsInput = {
    set?: $Enums.PersonalityPreset
  }

  export type EnumThemePreferenceFieldUpdateOperationsInput = {
    set?: $Enums.ThemePreference
  }

  export type EnumThreadListOrganizeByFieldUpdateOperationsInput = {
    set?: $Enums.ThreadListOrganizeBy
  }

  export type EnumThreadListSortByFieldUpdateOperationsInput = {
    set?: $Enums.ThreadListSortBy
  }

  export type DateTimeFieldUpdateOperationsInput = {
    set?: Date | string
  }

  export type WorkspaceUpdateOneWithoutSelectedByUsersNestedInput = {
    create?: XOR<WorkspaceCreateWithoutSelectedByUsersInput, WorkspaceUncheckedCreateWithoutSelectedByUsersInput>
    connectOrCreate?: WorkspaceCreateOrConnectWithoutSelectedByUsersInput
    upsert?: WorkspaceUpsertWithoutSelectedByUsersInput
    disconnect?: WorkspaceWhereInput | boolean
    delete?: WorkspaceWhereInput | boolean
    connect?: WorkspaceWhereUniqueInput
    update?: XOR<XOR<WorkspaceUpdateToOneWithWhereWithoutSelectedByUsersInput, WorkspaceUpdateWithoutSelectedByUsersInput>, WorkspaceUncheckedUpdateWithoutSelectedByUsersInput>
  }

  export type WorkspaceUpdateManyWithoutUserNestedInput = {
    create?: XOR<WorkspaceCreateWithoutUserInput, WorkspaceUncheckedCreateWithoutUserInput> | WorkspaceCreateWithoutUserInput[] | WorkspaceUncheckedCreateWithoutUserInput[]
    connectOrCreate?: WorkspaceCreateOrConnectWithoutUserInput | WorkspaceCreateOrConnectWithoutUserInput[]
    upsert?: WorkspaceUpsertWithWhereUniqueWithoutUserInput | WorkspaceUpsertWithWhereUniqueWithoutUserInput[]
    createMany?: WorkspaceCreateManyUserInputEnvelope
    set?: WorkspaceWhereUniqueInput | WorkspaceWhereUniqueInput[]
    disconnect?: WorkspaceWhereUniqueInput | WorkspaceWhereUniqueInput[]
    delete?: WorkspaceWhereUniqueInput | WorkspaceWhereUniqueInput[]
    connect?: WorkspaceWhereUniqueInput | WorkspaceWhereUniqueInput[]
    update?: WorkspaceUpdateWithWhereUniqueWithoutUserInput | WorkspaceUpdateWithWhereUniqueWithoutUserInput[]
    updateMany?: WorkspaceUpdateManyWithWhereWithoutUserInput | WorkspaceUpdateManyWithWhereWithoutUserInput[]
    deleteMany?: WorkspaceScalarWhereInput | WorkspaceScalarWhereInput[]
  }

  export type ThreadUpdateManyWithoutUserNestedInput = {
    create?: XOR<ThreadCreateWithoutUserInput, ThreadUncheckedCreateWithoutUserInput> | ThreadCreateWithoutUserInput[] | ThreadUncheckedCreateWithoutUserInput[]
    connectOrCreate?: ThreadCreateOrConnectWithoutUserInput | ThreadCreateOrConnectWithoutUserInput[]
    upsert?: ThreadUpsertWithWhereUniqueWithoutUserInput | ThreadUpsertWithWhereUniqueWithoutUserInput[]
    createMany?: ThreadCreateManyUserInputEnvelope
    set?: ThreadWhereUniqueInput | ThreadWhereUniqueInput[]
    disconnect?: ThreadWhereUniqueInput | ThreadWhereUniqueInput[]
    delete?: ThreadWhereUniqueInput | ThreadWhereUniqueInput[]
    connect?: ThreadWhereUniqueInput | ThreadWhereUniqueInput[]
    update?: ThreadUpdateWithWhereUniqueWithoutUserInput | ThreadUpdateWithWhereUniqueWithoutUserInput[]
    updateMany?: ThreadUpdateManyWithWhereWithoutUserInput | ThreadUpdateManyWithWhereWithoutUserInput[]
    deleteMany?: ThreadScalarWhereInput | ThreadScalarWhereInput[]
  }

  export type ProviderCredentialUpdateManyWithoutUserNestedInput = {
    create?: XOR<ProviderCredentialCreateWithoutUserInput, ProviderCredentialUncheckedCreateWithoutUserInput> | ProviderCredentialCreateWithoutUserInput[] | ProviderCredentialUncheckedCreateWithoutUserInput[]
    connectOrCreate?: ProviderCredentialCreateOrConnectWithoutUserInput | ProviderCredentialCreateOrConnectWithoutUserInput[]
    upsert?: ProviderCredentialUpsertWithWhereUniqueWithoutUserInput | ProviderCredentialUpsertWithWhereUniqueWithoutUserInput[]
    createMany?: ProviderCredentialCreateManyUserInputEnvelope
    set?: ProviderCredentialWhereUniqueInput | ProviderCredentialWhereUniqueInput[]
    disconnect?: ProviderCredentialWhereUniqueInput | ProviderCredentialWhereUniqueInput[]
    delete?: ProviderCredentialWhereUniqueInput | ProviderCredentialWhereUniqueInput[]
    connect?: ProviderCredentialWhereUniqueInput | ProviderCredentialWhereUniqueInput[]
    update?: ProviderCredentialUpdateWithWhereUniqueWithoutUserInput | ProviderCredentialUpdateWithWhereUniqueWithoutUserInput[]
    updateMany?: ProviderCredentialUpdateManyWithWhereWithoutUserInput | ProviderCredentialUpdateManyWithWhereWithoutUserInput[]
    deleteMany?: ProviderCredentialScalarWhereInput | ProviderCredentialScalarWhereInput[]
  }

  export type ModelPreferenceUpdateManyWithoutUserNestedInput = {
    create?: XOR<ModelPreferenceCreateWithoutUserInput, ModelPreferenceUncheckedCreateWithoutUserInput> | ModelPreferenceCreateWithoutUserInput[] | ModelPreferenceUncheckedCreateWithoutUserInput[]
    connectOrCreate?: ModelPreferenceCreateOrConnectWithoutUserInput | ModelPreferenceCreateOrConnectWithoutUserInput[]
    upsert?: ModelPreferenceUpsertWithWhereUniqueWithoutUserInput | ModelPreferenceUpsertWithWhereUniqueWithoutUserInput[]
    createMany?: ModelPreferenceCreateManyUserInputEnvelope
    set?: ModelPreferenceWhereUniqueInput | ModelPreferenceWhereUniqueInput[]
    disconnect?: ModelPreferenceWhereUniqueInput | ModelPreferenceWhereUniqueInput[]
    delete?: ModelPreferenceWhereUniqueInput | ModelPreferenceWhereUniqueInput[]
    connect?: ModelPreferenceWhereUniqueInput | ModelPreferenceWhereUniqueInput[]
    update?: ModelPreferenceUpdateWithWhereUniqueWithoutUserInput | ModelPreferenceUpdateWithWhereUniqueWithoutUserInput[]
    updateMany?: ModelPreferenceUpdateManyWithWhereWithoutUserInput | ModelPreferenceUpdateManyWithWhereWithoutUserInput[]
    deleteMany?: ModelPreferenceScalarWhereInput | ModelPreferenceScalarWhereInput[]
  }

  export type WorkspaceUncheckedUpdateManyWithoutUserNestedInput = {
    create?: XOR<WorkspaceCreateWithoutUserInput, WorkspaceUncheckedCreateWithoutUserInput> | WorkspaceCreateWithoutUserInput[] | WorkspaceUncheckedCreateWithoutUserInput[]
    connectOrCreate?: WorkspaceCreateOrConnectWithoutUserInput | WorkspaceCreateOrConnectWithoutUserInput[]
    upsert?: WorkspaceUpsertWithWhereUniqueWithoutUserInput | WorkspaceUpsertWithWhereUniqueWithoutUserInput[]
    createMany?: WorkspaceCreateManyUserInputEnvelope
    set?: WorkspaceWhereUniqueInput | WorkspaceWhereUniqueInput[]
    disconnect?: WorkspaceWhereUniqueInput | WorkspaceWhereUniqueInput[]
    delete?: WorkspaceWhereUniqueInput | WorkspaceWhereUniqueInput[]
    connect?: WorkspaceWhereUniqueInput | WorkspaceWhereUniqueInput[]
    update?: WorkspaceUpdateWithWhereUniqueWithoutUserInput | WorkspaceUpdateWithWhereUniqueWithoutUserInput[]
    updateMany?: WorkspaceUpdateManyWithWhereWithoutUserInput | WorkspaceUpdateManyWithWhereWithoutUserInput[]
    deleteMany?: WorkspaceScalarWhereInput | WorkspaceScalarWhereInput[]
  }

  export type ThreadUncheckedUpdateManyWithoutUserNestedInput = {
    create?: XOR<ThreadCreateWithoutUserInput, ThreadUncheckedCreateWithoutUserInput> | ThreadCreateWithoutUserInput[] | ThreadUncheckedCreateWithoutUserInput[]
    connectOrCreate?: ThreadCreateOrConnectWithoutUserInput | ThreadCreateOrConnectWithoutUserInput[]
    upsert?: ThreadUpsertWithWhereUniqueWithoutUserInput | ThreadUpsertWithWhereUniqueWithoutUserInput[]
    createMany?: ThreadCreateManyUserInputEnvelope
    set?: ThreadWhereUniqueInput | ThreadWhereUniqueInput[]
    disconnect?: ThreadWhereUniqueInput | ThreadWhereUniqueInput[]
    delete?: ThreadWhereUniqueInput | ThreadWhereUniqueInput[]
    connect?: ThreadWhereUniqueInput | ThreadWhereUniqueInput[]
    update?: ThreadUpdateWithWhereUniqueWithoutUserInput | ThreadUpdateWithWhereUniqueWithoutUserInput[]
    updateMany?: ThreadUpdateManyWithWhereWithoutUserInput | ThreadUpdateManyWithWhereWithoutUserInput[]
    deleteMany?: ThreadScalarWhereInput | ThreadScalarWhereInput[]
  }

  export type ProviderCredentialUncheckedUpdateManyWithoutUserNestedInput = {
    create?: XOR<ProviderCredentialCreateWithoutUserInput, ProviderCredentialUncheckedCreateWithoutUserInput> | ProviderCredentialCreateWithoutUserInput[] | ProviderCredentialUncheckedCreateWithoutUserInput[]
    connectOrCreate?: ProviderCredentialCreateOrConnectWithoutUserInput | ProviderCredentialCreateOrConnectWithoutUserInput[]
    upsert?: ProviderCredentialUpsertWithWhereUniqueWithoutUserInput | ProviderCredentialUpsertWithWhereUniqueWithoutUserInput[]
    createMany?: ProviderCredentialCreateManyUserInputEnvelope
    set?: ProviderCredentialWhereUniqueInput | ProviderCredentialWhereUniqueInput[]
    disconnect?: ProviderCredentialWhereUniqueInput | ProviderCredentialWhereUniqueInput[]
    delete?: ProviderCredentialWhereUniqueInput | ProviderCredentialWhereUniqueInput[]
    connect?: ProviderCredentialWhereUniqueInput | ProviderCredentialWhereUniqueInput[]
    update?: ProviderCredentialUpdateWithWhereUniqueWithoutUserInput | ProviderCredentialUpdateWithWhereUniqueWithoutUserInput[]
    updateMany?: ProviderCredentialUpdateManyWithWhereWithoutUserInput | ProviderCredentialUpdateManyWithWhereWithoutUserInput[]
    deleteMany?: ProviderCredentialScalarWhereInput | ProviderCredentialScalarWhereInput[]
  }

  export type ModelPreferenceUncheckedUpdateManyWithoutUserNestedInput = {
    create?: XOR<ModelPreferenceCreateWithoutUserInput, ModelPreferenceUncheckedCreateWithoutUserInput> | ModelPreferenceCreateWithoutUserInput[] | ModelPreferenceUncheckedCreateWithoutUserInput[]
    connectOrCreate?: ModelPreferenceCreateOrConnectWithoutUserInput | ModelPreferenceCreateOrConnectWithoutUserInput[]
    upsert?: ModelPreferenceUpsertWithWhereUniqueWithoutUserInput | ModelPreferenceUpsertWithWhereUniqueWithoutUserInput[]
    createMany?: ModelPreferenceCreateManyUserInputEnvelope
    set?: ModelPreferenceWhereUniqueInput | ModelPreferenceWhereUniqueInput[]
    disconnect?: ModelPreferenceWhereUniqueInput | ModelPreferenceWhereUniqueInput[]
    delete?: ModelPreferenceWhereUniqueInput | ModelPreferenceWhereUniqueInput[]
    connect?: ModelPreferenceWhereUniqueInput | ModelPreferenceWhereUniqueInput[]
    update?: ModelPreferenceUpdateWithWhereUniqueWithoutUserInput | ModelPreferenceUpdateWithWhereUniqueWithoutUserInput[]
    updateMany?: ModelPreferenceUpdateManyWithWhereWithoutUserInput | ModelPreferenceUpdateManyWithWhereWithoutUserInput[]
    deleteMany?: ModelPreferenceScalarWhereInput | ModelPreferenceScalarWhereInput[]
  }

  export type UserCreateNestedOneWithoutOwnedWorkspacesInput = {
    create?: XOR<UserCreateWithoutOwnedWorkspacesInput, UserUncheckedCreateWithoutOwnedWorkspacesInput>
    connectOrCreate?: UserCreateOrConnectWithoutOwnedWorkspacesInput
    connect?: UserWhereUniqueInput
  }

  export type UserCreateNestedManyWithoutSelectedWorkspaceInput = {
    create?: XOR<UserCreateWithoutSelectedWorkspaceInput, UserUncheckedCreateWithoutSelectedWorkspaceInput> | UserCreateWithoutSelectedWorkspaceInput[] | UserUncheckedCreateWithoutSelectedWorkspaceInput[]
    connectOrCreate?: UserCreateOrConnectWithoutSelectedWorkspaceInput | UserCreateOrConnectWithoutSelectedWorkspaceInput[]
    createMany?: UserCreateManySelectedWorkspaceInputEnvelope
    connect?: UserWhereUniqueInput | UserWhereUniqueInput[]
  }

  export type ThreadCreateNestedManyWithoutWorkspaceInput = {
    create?: XOR<ThreadCreateWithoutWorkspaceInput, ThreadUncheckedCreateWithoutWorkspaceInput> | ThreadCreateWithoutWorkspaceInput[] | ThreadUncheckedCreateWithoutWorkspaceInput[]
    connectOrCreate?: ThreadCreateOrConnectWithoutWorkspaceInput | ThreadCreateOrConnectWithoutWorkspaceInput[]
    createMany?: ThreadCreateManyWorkspaceInputEnvelope
    connect?: ThreadWhereUniqueInput | ThreadWhereUniqueInput[]
  }

  export type UserUncheckedCreateNestedManyWithoutSelectedWorkspaceInput = {
    create?: XOR<UserCreateWithoutSelectedWorkspaceInput, UserUncheckedCreateWithoutSelectedWorkspaceInput> | UserCreateWithoutSelectedWorkspaceInput[] | UserUncheckedCreateWithoutSelectedWorkspaceInput[]
    connectOrCreate?: UserCreateOrConnectWithoutSelectedWorkspaceInput | UserCreateOrConnectWithoutSelectedWorkspaceInput[]
    createMany?: UserCreateManySelectedWorkspaceInputEnvelope
    connect?: UserWhereUniqueInput | UserWhereUniqueInput[]
  }

  export type ThreadUncheckedCreateNestedManyWithoutWorkspaceInput = {
    create?: XOR<ThreadCreateWithoutWorkspaceInput, ThreadUncheckedCreateWithoutWorkspaceInput> | ThreadCreateWithoutWorkspaceInput[] | ThreadUncheckedCreateWithoutWorkspaceInput[]
    connectOrCreate?: ThreadCreateOrConnectWithoutWorkspaceInput | ThreadCreateOrConnectWithoutWorkspaceInput[]
    createMany?: ThreadCreateManyWorkspaceInputEnvelope
    connect?: ThreadWhereUniqueInput | ThreadWhereUniqueInput[]
  }

  export type UserUpdateOneRequiredWithoutOwnedWorkspacesNestedInput = {
    create?: XOR<UserCreateWithoutOwnedWorkspacesInput, UserUncheckedCreateWithoutOwnedWorkspacesInput>
    connectOrCreate?: UserCreateOrConnectWithoutOwnedWorkspacesInput
    upsert?: UserUpsertWithoutOwnedWorkspacesInput
    connect?: UserWhereUniqueInput
    update?: XOR<XOR<UserUpdateToOneWithWhereWithoutOwnedWorkspacesInput, UserUpdateWithoutOwnedWorkspacesInput>, UserUncheckedUpdateWithoutOwnedWorkspacesInput>
  }

  export type UserUpdateManyWithoutSelectedWorkspaceNestedInput = {
    create?: XOR<UserCreateWithoutSelectedWorkspaceInput, UserUncheckedCreateWithoutSelectedWorkspaceInput> | UserCreateWithoutSelectedWorkspaceInput[] | UserUncheckedCreateWithoutSelectedWorkspaceInput[]
    connectOrCreate?: UserCreateOrConnectWithoutSelectedWorkspaceInput | UserCreateOrConnectWithoutSelectedWorkspaceInput[]
    upsert?: UserUpsertWithWhereUniqueWithoutSelectedWorkspaceInput | UserUpsertWithWhereUniqueWithoutSelectedWorkspaceInput[]
    createMany?: UserCreateManySelectedWorkspaceInputEnvelope
    set?: UserWhereUniqueInput | UserWhereUniqueInput[]
    disconnect?: UserWhereUniqueInput | UserWhereUniqueInput[]
    delete?: UserWhereUniqueInput | UserWhereUniqueInput[]
    connect?: UserWhereUniqueInput | UserWhereUniqueInput[]
    update?: UserUpdateWithWhereUniqueWithoutSelectedWorkspaceInput | UserUpdateWithWhereUniqueWithoutSelectedWorkspaceInput[]
    updateMany?: UserUpdateManyWithWhereWithoutSelectedWorkspaceInput | UserUpdateManyWithWhereWithoutSelectedWorkspaceInput[]
    deleteMany?: UserScalarWhereInput | UserScalarWhereInput[]
  }

  export type ThreadUpdateManyWithoutWorkspaceNestedInput = {
    create?: XOR<ThreadCreateWithoutWorkspaceInput, ThreadUncheckedCreateWithoutWorkspaceInput> | ThreadCreateWithoutWorkspaceInput[] | ThreadUncheckedCreateWithoutWorkspaceInput[]
    connectOrCreate?: ThreadCreateOrConnectWithoutWorkspaceInput | ThreadCreateOrConnectWithoutWorkspaceInput[]
    upsert?: ThreadUpsertWithWhereUniqueWithoutWorkspaceInput | ThreadUpsertWithWhereUniqueWithoutWorkspaceInput[]
    createMany?: ThreadCreateManyWorkspaceInputEnvelope
    set?: ThreadWhereUniqueInput | ThreadWhereUniqueInput[]
    disconnect?: ThreadWhereUniqueInput | ThreadWhereUniqueInput[]
    delete?: ThreadWhereUniqueInput | ThreadWhereUniqueInput[]
    connect?: ThreadWhereUniqueInput | ThreadWhereUniqueInput[]
    update?: ThreadUpdateWithWhereUniqueWithoutWorkspaceInput | ThreadUpdateWithWhereUniqueWithoutWorkspaceInput[]
    updateMany?: ThreadUpdateManyWithWhereWithoutWorkspaceInput | ThreadUpdateManyWithWhereWithoutWorkspaceInput[]
    deleteMany?: ThreadScalarWhereInput | ThreadScalarWhereInput[]
  }

  export type UserUncheckedUpdateManyWithoutSelectedWorkspaceNestedInput = {
    create?: XOR<UserCreateWithoutSelectedWorkspaceInput, UserUncheckedCreateWithoutSelectedWorkspaceInput> | UserCreateWithoutSelectedWorkspaceInput[] | UserUncheckedCreateWithoutSelectedWorkspaceInput[]
    connectOrCreate?: UserCreateOrConnectWithoutSelectedWorkspaceInput | UserCreateOrConnectWithoutSelectedWorkspaceInput[]
    upsert?: UserUpsertWithWhereUniqueWithoutSelectedWorkspaceInput | UserUpsertWithWhereUniqueWithoutSelectedWorkspaceInput[]
    createMany?: UserCreateManySelectedWorkspaceInputEnvelope
    set?: UserWhereUniqueInput | UserWhereUniqueInput[]
    disconnect?: UserWhereUniqueInput | UserWhereUniqueInput[]
    delete?: UserWhereUniqueInput | UserWhereUniqueInput[]
    connect?: UserWhereUniqueInput | UserWhereUniqueInput[]
    update?: UserUpdateWithWhereUniqueWithoutSelectedWorkspaceInput | UserUpdateWithWhereUniqueWithoutSelectedWorkspaceInput[]
    updateMany?: UserUpdateManyWithWhereWithoutSelectedWorkspaceInput | UserUpdateManyWithWhereWithoutSelectedWorkspaceInput[]
    deleteMany?: UserScalarWhereInput | UserScalarWhereInput[]
  }

  export type ThreadUncheckedUpdateManyWithoutWorkspaceNestedInput = {
    create?: XOR<ThreadCreateWithoutWorkspaceInput, ThreadUncheckedCreateWithoutWorkspaceInput> | ThreadCreateWithoutWorkspaceInput[] | ThreadUncheckedCreateWithoutWorkspaceInput[]
    connectOrCreate?: ThreadCreateOrConnectWithoutWorkspaceInput | ThreadCreateOrConnectWithoutWorkspaceInput[]
    upsert?: ThreadUpsertWithWhereUniqueWithoutWorkspaceInput | ThreadUpsertWithWhereUniqueWithoutWorkspaceInput[]
    createMany?: ThreadCreateManyWorkspaceInputEnvelope
    set?: ThreadWhereUniqueInput | ThreadWhereUniqueInput[]
    disconnect?: ThreadWhereUniqueInput | ThreadWhereUniqueInput[]
    delete?: ThreadWhereUniqueInput | ThreadWhereUniqueInput[]
    connect?: ThreadWhereUniqueInput | ThreadWhereUniqueInput[]
    update?: ThreadUpdateWithWhereUniqueWithoutWorkspaceInput | ThreadUpdateWithWhereUniqueWithoutWorkspaceInput[]
    updateMany?: ThreadUpdateManyWithWhereWithoutWorkspaceInput | ThreadUpdateManyWithWhereWithoutWorkspaceInput[]
    deleteMany?: ThreadScalarWhereInput | ThreadScalarWhereInput[]
  }

  export type WorkspaceCreateNestedOneWithoutThreadsInput = {
    create?: XOR<WorkspaceCreateWithoutThreadsInput, WorkspaceUncheckedCreateWithoutThreadsInput>
    connectOrCreate?: WorkspaceCreateOrConnectWithoutThreadsInput
    connect?: WorkspaceWhereUniqueInput
  }

  export type UserCreateNestedOneWithoutThreadsInput = {
    create?: XOR<UserCreateWithoutThreadsInput, UserUncheckedCreateWithoutThreadsInput>
    connectOrCreate?: UserCreateOrConnectWithoutThreadsInput
    connect?: UserWhereUniqueInput
  }

  export type ThreadMessageCreateNestedManyWithoutThreadInput = {
    create?: XOR<ThreadMessageCreateWithoutThreadInput, ThreadMessageUncheckedCreateWithoutThreadInput> | ThreadMessageCreateWithoutThreadInput[] | ThreadMessageUncheckedCreateWithoutThreadInput[]
    connectOrCreate?: ThreadMessageCreateOrConnectWithoutThreadInput | ThreadMessageCreateOrConnectWithoutThreadInput[]
    createMany?: ThreadMessageCreateManyThreadInputEnvelope
    connect?: ThreadMessageWhereUniqueInput | ThreadMessageWhereUniqueInput[]
  }

  export type ThreadMessageUncheckedCreateNestedManyWithoutThreadInput = {
    create?: XOR<ThreadMessageCreateWithoutThreadInput, ThreadMessageUncheckedCreateWithoutThreadInput> | ThreadMessageCreateWithoutThreadInput[] | ThreadMessageUncheckedCreateWithoutThreadInput[]
    connectOrCreate?: ThreadMessageCreateOrConnectWithoutThreadInput | ThreadMessageCreateOrConnectWithoutThreadInput[]
    createMany?: ThreadMessageCreateManyThreadInputEnvelope
    connect?: ThreadMessageWhereUniqueInput | ThreadMessageWhereUniqueInput[]
  }

  export type NullableDateTimeFieldUpdateOperationsInput = {
    set?: Date | string | null
  }

  export type WorkspaceUpdateOneRequiredWithoutThreadsNestedInput = {
    create?: XOR<WorkspaceCreateWithoutThreadsInput, WorkspaceUncheckedCreateWithoutThreadsInput>
    connectOrCreate?: WorkspaceCreateOrConnectWithoutThreadsInput
    upsert?: WorkspaceUpsertWithoutThreadsInput
    connect?: WorkspaceWhereUniqueInput
    update?: XOR<XOR<WorkspaceUpdateToOneWithWhereWithoutThreadsInput, WorkspaceUpdateWithoutThreadsInput>, WorkspaceUncheckedUpdateWithoutThreadsInput>
  }

  export type UserUpdateOneRequiredWithoutThreadsNestedInput = {
    create?: XOR<UserCreateWithoutThreadsInput, UserUncheckedCreateWithoutThreadsInput>
    connectOrCreate?: UserCreateOrConnectWithoutThreadsInput
    upsert?: UserUpsertWithoutThreadsInput
    connect?: UserWhereUniqueInput
    update?: XOR<XOR<UserUpdateToOneWithWhereWithoutThreadsInput, UserUpdateWithoutThreadsInput>, UserUncheckedUpdateWithoutThreadsInput>
  }

  export type ThreadMessageUpdateManyWithoutThreadNestedInput = {
    create?: XOR<ThreadMessageCreateWithoutThreadInput, ThreadMessageUncheckedCreateWithoutThreadInput> | ThreadMessageCreateWithoutThreadInput[] | ThreadMessageUncheckedCreateWithoutThreadInput[]
    connectOrCreate?: ThreadMessageCreateOrConnectWithoutThreadInput | ThreadMessageCreateOrConnectWithoutThreadInput[]
    upsert?: ThreadMessageUpsertWithWhereUniqueWithoutThreadInput | ThreadMessageUpsertWithWhereUniqueWithoutThreadInput[]
    createMany?: ThreadMessageCreateManyThreadInputEnvelope
    set?: ThreadMessageWhereUniqueInput | ThreadMessageWhereUniqueInput[]
    disconnect?: ThreadMessageWhereUniqueInput | ThreadMessageWhereUniqueInput[]
    delete?: ThreadMessageWhereUniqueInput | ThreadMessageWhereUniqueInput[]
    connect?: ThreadMessageWhereUniqueInput | ThreadMessageWhereUniqueInput[]
    update?: ThreadMessageUpdateWithWhereUniqueWithoutThreadInput | ThreadMessageUpdateWithWhereUniqueWithoutThreadInput[]
    updateMany?: ThreadMessageUpdateManyWithWhereWithoutThreadInput | ThreadMessageUpdateManyWithWhereWithoutThreadInput[]
    deleteMany?: ThreadMessageScalarWhereInput | ThreadMessageScalarWhereInput[]
  }

  export type ThreadMessageUncheckedUpdateManyWithoutThreadNestedInput = {
    create?: XOR<ThreadMessageCreateWithoutThreadInput, ThreadMessageUncheckedCreateWithoutThreadInput> | ThreadMessageCreateWithoutThreadInput[] | ThreadMessageUncheckedCreateWithoutThreadInput[]
    connectOrCreate?: ThreadMessageCreateOrConnectWithoutThreadInput | ThreadMessageCreateOrConnectWithoutThreadInput[]
    upsert?: ThreadMessageUpsertWithWhereUniqueWithoutThreadInput | ThreadMessageUpsertWithWhereUniqueWithoutThreadInput[]
    createMany?: ThreadMessageCreateManyThreadInputEnvelope
    set?: ThreadMessageWhereUniqueInput | ThreadMessageWhereUniqueInput[]
    disconnect?: ThreadMessageWhereUniqueInput | ThreadMessageWhereUniqueInput[]
    delete?: ThreadMessageWhereUniqueInput | ThreadMessageWhereUniqueInput[]
    connect?: ThreadMessageWhereUniqueInput | ThreadMessageWhereUniqueInput[]
    update?: ThreadMessageUpdateWithWhereUniqueWithoutThreadInput | ThreadMessageUpdateWithWhereUniqueWithoutThreadInput[]
    updateMany?: ThreadMessageUpdateManyWithWhereWithoutThreadInput | ThreadMessageUpdateManyWithWhereWithoutThreadInput[]
    deleteMany?: ThreadMessageScalarWhereInput | ThreadMessageScalarWhereInput[]
  }

  export type ThreadCreateNestedOneWithoutMessagesInput = {
    create?: XOR<ThreadCreateWithoutMessagesInput, ThreadUncheckedCreateWithoutMessagesInput>
    connectOrCreate?: ThreadCreateOrConnectWithoutMessagesInput
    connect?: ThreadWhereUniqueInput
  }

  export type EnumThreadMessageRoleFieldUpdateOperationsInput = {
    set?: $Enums.ThreadMessageRole
  }

  export type ThreadUpdateOneRequiredWithoutMessagesNestedInput = {
    create?: XOR<ThreadCreateWithoutMessagesInput, ThreadUncheckedCreateWithoutMessagesInput>
    connectOrCreate?: ThreadCreateOrConnectWithoutMessagesInput
    upsert?: ThreadUpsertWithoutMessagesInput
    connect?: ThreadWhereUniqueInput
    update?: XOR<XOR<ThreadUpdateToOneWithWhereWithoutMessagesInput, ThreadUpdateWithoutMessagesInput>, ThreadUncheckedUpdateWithoutMessagesInput>
  }

  export type UserCreateNestedOneWithoutCredentialsInput = {
    create?: XOR<UserCreateWithoutCredentialsInput, UserUncheckedCreateWithoutCredentialsInput>
    connectOrCreate?: UserCreateOrConnectWithoutCredentialsInput
    connect?: UserWhereUniqueInput
  }

  export type EnumAIProviderFieldUpdateOperationsInput = {
    set?: $Enums.AIProvider
  }

  export type UserUpdateOneRequiredWithoutCredentialsNestedInput = {
    create?: XOR<UserCreateWithoutCredentialsInput, UserUncheckedCreateWithoutCredentialsInput>
    connectOrCreate?: UserCreateOrConnectWithoutCredentialsInput
    upsert?: UserUpsertWithoutCredentialsInput
    connect?: UserWhereUniqueInput
    update?: XOR<XOR<UserUpdateToOneWithWhereWithoutCredentialsInput, UserUpdateWithoutCredentialsInput>, UserUncheckedUpdateWithoutCredentialsInput>
  }

  export type UserCreateNestedOneWithoutModelPreferencesInput = {
    create?: XOR<UserCreateWithoutModelPreferencesInput, UserUncheckedCreateWithoutModelPreferencesInput>
    connectOrCreate?: UserCreateOrConnectWithoutModelPreferencesInput
    connect?: UserWhereUniqueInput
  }

  export type UserUpdateOneRequiredWithoutModelPreferencesNestedInput = {
    create?: XOR<UserCreateWithoutModelPreferencesInput, UserUncheckedCreateWithoutModelPreferencesInput>
    connectOrCreate?: UserCreateOrConnectWithoutModelPreferencesInput
    upsert?: UserUpsertWithoutModelPreferencesInput
    connect?: UserWhereUniqueInput
    update?: XOR<XOR<UserUpdateToOneWithWhereWithoutModelPreferencesInput, UserUpdateWithoutModelPreferencesInput>, UserUncheckedUpdateWithoutModelPreferencesInput>
  }

  export type NestedStringFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringFilter<$PrismaModel> | string
  }

  export type NestedBoolFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolFilter<$PrismaModel> | boolean
  }

  export type NestedStringNullableFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringNullableFilter<$PrismaModel> | string | null
  }

  export type NestedEnumPersonalityPresetFilter<$PrismaModel = never> = {
    equals?: $Enums.PersonalityPreset | EnumPersonalityPresetFieldRefInput<$PrismaModel>
    in?: $Enums.PersonalityPreset[] | ListEnumPersonalityPresetFieldRefInput<$PrismaModel>
    notIn?: $Enums.PersonalityPreset[] | ListEnumPersonalityPresetFieldRefInput<$PrismaModel>
    not?: NestedEnumPersonalityPresetFilter<$PrismaModel> | $Enums.PersonalityPreset
  }

  export type NestedEnumThemePreferenceFilter<$PrismaModel = never> = {
    equals?: $Enums.ThemePreference | EnumThemePreferenceFieldRefInput<$PrismaModel>
    in?: $Enums.ThemePreference[] | ListEnumThemePreferenceFieldRefInput<$PrismaModel>
    notIn?: $Enums.ThemePreference[] | ListEnumThemePreferenceFieldRefInput<$PrismaModel>
    not?: NestedEnumThemePreferenceFilter<$PrismaModel> | $Enums.ThemePreference
  }

  export type NestedEnumThreadListOrganizeByFilter<$PrismaModel = never> = {
    equals?: $Enums.ThreadListOrganizeBy | EnumThreadListOrganizeByFieldRefInput<$PrismaModel>
    in?: $Enums.ThreadListOrganizeBy[] | ListEnumThreadListOrganizeByFieldRefInput<$PrismaModel>
    notIn?: $Enums.ThreadListOrganizeBy[] | ListEnumThreadListOrganizeByFieldRefInput<$PrismaModel>
    not?: NestedEnumThreadListOrganizeByFilter<$PrismaModel> | $Enums.ThreadListOrganizeBy
  }

  export type NestedEnumThreadListSortByFilter<$PrismaModel = never> = {
    equals?: $Enums.ThreadListSortBy | EnumThreadListSortByFieldRefInput<$PrismaModel>
    in?: $Enums.ThreadListSortBy[] | ListEnumThreadListSortByFieldRefInput<$PrismaModel>
    notIn?: $Enums.ThreadListSortBy[] | ListEnumThreadListSortByFieldRefInput<$PrismaModel>
    not?: NestedEnumThreadListSortByFilter<$PrismaModel> | $Enums.ThreadListSortBy
  }

  export type NestedDateTimeFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeFilter<$PrismaModel> | Date | string
  }

  export type NestedStringWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringWithAggregatesFilter<$PrismaModel> | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedStringFilter<$PrismaModel>
    _max?: NestedStringFilter<$PrismaModel>
  }

  export type NestedIntFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[] | ListIntFieldRefInput<$PrismaModel>
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntFilter<$PrismaModel> | number
  }

  export type NestedBoolWithAggregatesFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolWithAggregatesFilter<$PrismaModel> | boolean
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedBoolFilter<$PrismaModel>
    _max?: NestedBoolFilter<$PrismaModel>
  }

  export type NestedStringNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringNullableWithAggregatesFilter<$PrismaModel> | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedStringNullableFilter<$PrismaModel>
    _max?: NestedStringNullableFilter<$PrismaModel>
  }

  export type NestedIntNullableFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel> | null
    in?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntNullableFilter<$PrismaModel> | number | null
  }

  export type NestedEnumPersonalityPresetWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.PersonalityPreset | EnumPersonalityPresetFieldRefInput<$PrismaModel>
    in?: $Enums.PersonalityPreset[] | ListEnumPersonalityPresetFieldRefInput<$PrismaModel>
    notIn?: $Enums.PersonalityPreset[] | ListEnumPersonalityPresetFieldRefInput<$PrismaModel>
    not?: NestedEnumPersonalityPresetWithAggregatesFilter<$PrismaModel> | $Enums.PersonalityPreset
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumPersonalityPresetFilter<$PrismaModel>
    _max?: NestedEnumPersonalityPresetFilter<$PrismaModel>
  }

  export type NestedEnumThemePreferenceWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.ThemePreference | EnumThemePreferenceFieldRefInput<$PrismaModel>
    in?: $Enums.ThemePreference[] | ListEnumThemePreferenceFieldRefInput<$PrismaModel>
    notIn?: $Enums.ThemePreference[] | ListEnumThemePreferenceFieldRefInput<$PrismaModel>
    not?: NestedEnumThemePreferenceWithAggregatesFilter<$PrismaModel> | $Enums.ThemePreference
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumThemePreferenceFilter<$PrismaModel>
    _max?: NestedEnumThemePreferenceFilter<$PrismaModel>
  }

  export type NestedEnumThreadListOrganizeByWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.ThreadListOrganizeBy | EnumThreadListOrganizeByFieldRefInput<$PrismaModel>
    in?: $Enums.ThreadListOrganizeBy[] | ListEnumThreadListOrganizeByFieldRefInput<$PrismaModel>
    notIn?: $Enums.ThreadListOrganizeBy[] | ListEnumThreadListOrganizeByFieldRefInput<$PrismaModel>
    not?: NestedEnumThreadListOrganizeByWithAggregatesFilter<$PrismaModel> | $Enums.ThreadListOrganizeBy
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumThreadListOrganizeByFilter<$PrismaModel>
    _max?: NestedEnumThreadListOrganizeByFilter<$PrismaModel>
  }

  export type NestedEnumThreadListSortByWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.ThreadListSortBy | EnumThreadListSortByFieldRefInput<$PrismaModel>
    in?: $Enums.ThreadListSortBy[] | ListEnumThreadListSortByFieldRefInput<$PrismaModel>
    notIn?: $Enums.ThreadListSortBy[] | ListEnumThreadListSortByFieldRefInput<$PrismaModel>
    not?: NestedEnumThreadListSortByWithAggregatesFilter<$PrismaModel> | $Enums.ThreadListSortBy
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumThreadListSortByFilter<$PrismaModel>
    _max?: NestedEnumThreadListSortByFilter<$PrismaModel>
  }

  export type NestedDateTimeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeWithAggregatesFilter<$PrismaModel> | Date | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedDateTimeFilter<$PrismaModel>
    _max?: NestedDateTimeFilter<$PrismaModel>
  }

  export type NestedDateTimeNullableFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableFilter<$PrismaModel> | Date | string | null
  }

  export type NestedDateTimeNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableWithAggregatesFilter<$PrismaModel> | Date | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedDateTimeNullableFilter<$PrismaModel>
    _max?: NestedDateTimeNullableFilter<$PrismaModel>
  }

  export type NestedEnumThreadMessageRoleFilter<$PrismaModel = never> = {
    equals?: $Enums.ThreadMessageRole | EnumThreadMessageRoleFieldRefInput<$PrismaModel>
    in?: $Enums.ThreadMessageRole[] | ListEnumThreadMessageRoleFieldRefInput<$PrismaModel>
    notIn?: $Enums.ThreadMessageRole[] | ListEnumThreadMessageRoleFieldRefInput<$PrismaModel>
    not?: NestedEnumThreadMessageRoleFilter<$PrismaModel> | $Enums.ThreadMessageRole
  }

  export type NestedEnumThreadMessageRoleWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.ThreadMessageRole | EnumThreadMessageRoleFieldRefInput<$PrismaModel>
    in?: $Enums.ThreadMessageRole[] | ListEnumThreadMessageRoleFieldRefInput<$PrismaModel>
    notIn?: $Enums.ThreadMessageRole[] | ListEnumThreadMessageRoleFieldRefInput<$PrismaModel>
    not?: NestedEnumThreadMessageRoleWithAggregatesFilter<$PrismaModel> | $Enums.ThreadMessageRole
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumThreadMessageRoleFilter<$PrismaModel>
    _max?: NestedEnumThreadMessageRoleFilter<$PrismaModel>
  }
  export type NestedJsonFilter<$PrismaModel = never> =
    | PatchUndefined<
        Either<Required<NestedJsonFilterBase<$PrismaModel>>, Exclude<keyof Required<NestedJsonFilterBase<$PrismaModel>>, 'path'>>,
        Required<NestedJsonFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<NestedJsonFilterBase<$PrismaModel>>, 'path'>>

  export type NestedJsonFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    path?: string[]
    mode?: QueryMode | EnumQueryModeFieldRefInput<$PrismaModel>
    string_contains?: string | StringFieldRefInput<$PrismaModel>
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    lt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    lte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
  }
  export type NestedJsonNullableFilter<$PrismaModel = never> =
    | PatchUndefined<
        Either<Required<NestedJsonNullableFilterBase<$PrismaModel>>, Exclude<keyof Required<NestedJsonNullableFilterBase<$PrismaModel>>, 'path'>>,
        Required<NestedJsonNullableFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<NestedJsonNullableFilterBase<$PrismaModel>>, 'path'>>

  export type NestedJsonNullableFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    path?: string[]
    mode?: QueryMode | EnumQueryModeFieldRefInput<$PrismaModel>
    string_contains?: string | StringFieldRefInput<$PrismaModel>
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    lt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    lte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
  }

  export type NestedEnumAIProviderFilter<$PrismaModel = never> = {
    equals?: $Enums.AIProvider | EnumAIProviderFieldRefInput<$PrismaModel>
    in?: $Enums.AIProvider[] | ListEnumAIProviderFieldRefInput<$PrismaModel>
    notIn?: $Enums.AIProvider[] | ListEnumAIProviderFieldRefInput<$PrismaModel>
    not?: NestedEnumAIProviderFilter<$PrismaModel> | $Enums.AIProvider
  }

  export type NestedEnumAIProviderWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.AIProvider | EnumAIProviderFieldRefInput<$PrismaModel>
    in?: $Enums.AIProvider[] | ListEnumAIProviderFieldRefInput<$PrismaModel>
    notIn?: $Enums.AIProvider[] | ListEnumAIProviderFieldRefInput<$PrismaModel>
    not?: NestedEnumAIProviderWithAggregatesFilter<$PrismaModel> | $Enums.AIProvider
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumAIProviderFilter<$PrismaModel>
    _max?: NestedEnumAIProviderFilter<$PrismaModel>
  }

  export type WorkspaceCreateWithoutSelectedByUsersInput = {
    id?: string
    name: string
    rootPath?: string | null
    description?: string | null
    isArchived?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
    user: UserCreateNestedOneWithoutOwnedWorkspacesInput
    threads?: ThreadCreateNestedManyWithoutWorkspaceInput
  }

  export type WorkspaceUncheckedCreateWithoutSelectedByUsersInput = {
    id?: string
    userId: string
    name: string
    rootPath?: string | null
    description?: string | null
    isArchived?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
    threads?: ThreadUncheckedCreateNestedManyWithoutWorkspaceInput
  }

  export type WorkspaceCreateOrConnectWithoutSelectedByUsersInput = {
    where: WorkspaceWhereUniqueInput
    create: XOR<WorkspaceCreateWithoutSelectedByUsersInput, WorkspaceUncheckedCreateWithoutSelectedByUsersInput>
  }

  export type WorkspaceCreateWithoutUserInput = {
    id?: string
    name: string
    rootPath?: string | null
    description?: string | null
    isArchived?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
    selectedByUsers?: UserCreateNestedManyWithoutSelectedWorkspaceInput
    threads?: ThreadCreateNestedManyWithoutWorkspaceInput
  }

  export type WorkspaceUncheckedCreateWithoutUserInput = {
    id?: string
    name: string
    rootPath?: string | null
    description?: string | null
    isArchived?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
    selectedByUsers?: UserUncheckedCreateNestedManyWithoutSelectedWorkspaceInput
    threads?: ThreadUncheckedCreateNestedManyWithoutWorkspaceInput
  }

  export type WorkspaceCreateOrConnectWithoutUserInput = {
    where: WorkspaceWhereUniqueInput
    create: XOR<WorkspaceCreateWithoutUserInput, WorkspaceUncheckedCreateWithoutUserInput>
  }

  export type WorkspaceCreateManyUserInputEnvelope = {
    data: WorkspaceCreateManyUserInput | WorkspaceCreateManyUserInput[]
    skipDuplicates?: boolean
  }

  export type ThreadCreateWithoutUserInput = {
    id?: string
    title: string
    summary?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    archivedAt?: Date | string | null
    workspace: WorkspaceCreateNestedOneWithoutThreadsInput
    messages?: ThreadMessageCreateNestedManyWithoutThreadInput
  }

  export type ThreadUncheckedCreateWithoutUserInput = {
    id?: string
    workspaceId: string
    title: string
    summary?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    archivedAt?: Date | string | null
    messages?: ThreadMessageUncheckedCreateNestedManyWithoutThreadInput
  }

  export type ThreadCreateOrConnectWithoutUserInput = {
    where: ThreadWhereUniqueInput
    create: XOR<ThreadCreateWithoutUserInput, ThreadUncheckedCreateWithoutUserInput>
  }

  export type ThreadCreateManyUserInputEnvelope = {
    data: ThreadCreateManyUserInput | ThreadCreateManyUserInput[]
    skipDuplicates?: boolean
  }

  export type ProviderCredentialCreateWithoutUserInput = {
    id?: string
    provider: $Enums.AIProvider
    encryptedConfig: string
    isEnabled?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type ProviderCredentialUncheckedCreateWithoutUserInput = {
    id?: string
    provider: $Enums.AIProvider
    encryptedConfig: string
    isEnabled?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type ProviderCredentialCreateOrConnectWithoutUserInput = {
    where: ProviderCredentialWhereUniqueInput
    create: XOR<ProviderCredentialCreateWithoutUserInput, ProviderCredentialUncheckedCreateWithoutUserInput>
  }

  export type ProviderCredentialCreateManyUserInputEnvelope = {
    data: ProviderCredentialCreateManyUserInput | ProviderCredentialCreateManyUserInput[]
    skipDuplicates?: boolean
  }

  export type ModelPreferenceCreateWithoutUserInput = {
    id?: string
    provider: $Enums.AIProvider
    modelId: string
    isCustom?: boolean
    isEnabled?: boolean
    createdAt?: Date | string
  }

  export type ModelPreferenceUncheckedCreateWithoutUserInput = {
    id?: string
    provider: $Enums.AIProvider
    modelId: string
    isCustom?: boolean
    isEnabled?: boolean
    createdAt?: Date | string
  }

  export type ModelPreferenceCreateOrConnectWithoutUserInput = {
    where: ModelPreferenceWhereUniqueInput
    create: XOR<ModelPreferenceCreateWithoutUserInput, ModelPreferenceUncheckedCreateWithoutUserInput>
  }

  export type ModelPreferenceCreateManyUserInputEnvelope = {
    data: ModelPreferenceCreateManyUserInput | ModelPreferenceCreateManyUserInput[]
    skipDuplicates?: boolean
  }

  export type WorkspaceUpsertWithoutSelectedByUsersInput = {
    update: XOR<WorkspaceUpdateWithoutSelectedByUsersInput, WorkspaceUncheckedUpdateWithoutSelectedByUsersInput>
    create: XOR<WorkspaceCreateWithoutSelectedByUsersInput, WorkspaceUncheckedCreateWithoutSelectedByUsersInput>
    where?: WorkspaceWhereInput
  }

  export type WorkspaceUpdateToOneWithWhereWithoutSelectedByUsersInput = {
    where?: WorkspaceWhereInput
    data: XOR<WorkspaceUpdateWithoutSelectedByUsersInput, WorkspaceUncheckedUpdateWithoutSelectedByUsersInput>
  }

  export type WorkspaceUpdateWithoutSelectedByUsersInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    rootPath?: NullableStringFieldUpdateOperationsInput | string | null
    description?: NullableStringFieldUpdateOperationsInput | string | null
    isArchived?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    user?: UserUpdateOneRequiredWithoutOwnedWorkspacesNestedInput
    threads?: ThreadUpdateManyWithoutWorkspaceNestedInput
  }

  export type WorkspaceUncheckedUpdateWithoutSelectedByUsersInput = {
    id?: StringFieldUpdateOperationsInput | string
    userId?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    rootPath?: NullableStringFieldUpdateOperationsInput | string | null
    description?: NullableStringFieldUpdateOperationsInput | string | null
    isArchived?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    threads?: ThreadUncheckedUpdateManyWithoutWorkspaceNestedInput
  }

  export type WorkspaceUpsertWithWhereUniqueWithoutUserInput = {
    where: WorkspaceWhereUniqueInput
    update: XOR<WorkspaceUpdateWithoutUserInput, WorkspaceUncheckedUpdateWithoutUserInput>
    create: XOR<WorkspaceCreateWithoutUserInput, WorkspaceUncheckedCreateWithoutUserInput>
  }

  export type WorkspaceUpdateWithWhereUniqueWithoutUserInput = {
    where: WorkspaceWhereUniqueInput
    data: XOR<WorkspaceUpdateWithoutUserInput, WorkspaceUncheckedUpdateWithoutUserInput>
  }

  export type WorkspaceUpdateManyWithWhereWithoutUserInput = {
    where: WorkspaceScalarWhereInput
    data: XOR<WorkspaceUpdateManyMutationInput, WorkspaceUncheckedUpdateManyWithoutUserInput>
  }

  export type WorkspaceScalarWhereInput = {
    AND?: WorkspaceScalarWhereInput | WorkspaceScalarWhereInput[]
    OR?: WorkspaceScalarWhereInput[]
    NOT?: WorkspaceScalarWhereInput | WorkspaceScalarWhereInput[]
    id?: StringFilter<"Workspace"> | string
    userId?: StringFilter<"Workspace"> | string
    name?: StringFilter<"Workspace"> | string
    rootPath?: StringNullableFilter<"Workspace"> | string | null
    description?: StringNullableFilter<"Workspace"> | string | null
    isArchived?: BoolFilter<"Workspace"> | boolean
    createdAt?: DateTimeFilter<"Workspace"> | Date | string
    updatedAt?: DateTimeFilter<"Workspace"> | Date | string
  }

  export type ThreadUpsertWithWhereUniqueWithoutUserInput = {
    where: ThreadWhereUniqueInput
    update: XOR<ThreadUpdateWithoutUserInput, ThreadUncheckedUpdateWithoutUserInput>
    create: XOR<ThreadCreateWithoutUserInput, ThreadUncheckedCreateWithoutUserInput>
  }

  export type ThreadUpdateWithWhereUniqueWithoutUserInput = {
    where: ThreadWhereUniqueInput
    data: XOR<ThreadUpdateWithoutUserInput, ThreadUncheckedUpdateWithoutUserInput>
  }

  export type ThreadUpdateManyWithWhereWithoutUserInput = {
    where: ThreadScalarWhereInput
    data: XOR<ThreadUpdateManyMutationInput, ThreadUncheckedUpdateManyWithoutUserInput>
  }

  export type ThreadScalarWhereInput = {
    AND?: ThreadScalarWhereInput | ThreadScalarWhereInput[]
    OR?: ThreadScalarWhereInput[]
    NOT?: ThreadScalarWhereInput | ThreadScalarWhereInput[]
    id?: StringFilter<"Thread"> | string
    workspaceId?: StringFilter<"Thread"> | string
    userId?: StringFilter<"Thread"> | string
    title?: StringFilter<"Thread"> | string
    summary?: StringNullableFilter<"Thread"> | string | null
    createdAt?: DateTimeFilter<"Thread"> | Date | string
    updatedAt?: DateTimeFilter<"Thread"> | Date | string
    archivedAt?: DateTimeNullableFilter<"Thread"> | Date | string | null
  }

  export type ProviderCredentialUpsertWithWhereUniqueWithoutUserInput = {
    where: ProviderCredentialWhereUniqueInput
    update: XOR<ProviderCredentialUpdateWithoutUserInput, ProviderCredentialUncheckedUpdateWithoutUserInput>
    create: XOR<ProviderCredentialCreateWithoutUserInput, ProviderCredentialUncheckedCreateWithoutUserInput>
  }

  export type ProviderCredentialUpdateWithWhereUniqueWithoutUserInput = {
    where: ProviderCredentialWhereUniqueInput
    data: XOR<ProviderCredentialUpdateWithoutUserInput, ProviderCredentialUncheckedUpdateWithoutUserInput>
  }

  export type ProviderCredentialUpdateManyWithWhereWithoutUserInput = {
    where: ProviderCredentialScalarWhereInput
    data: XOR<ProviderCredentialUpdateManyMutationInput, ProviderCredentialUncheckedUpdateManyWithoutUserInput>
  }

  export type ProviderCredentialScalarWhereInput = {
    AND?: ProviderCredentialScalarWhereInput | ProviderCredentialScalarWhereInput[]
    OR?: ProviderCredentialScalarWhereInput[]
    NOT?: ProviderCredentialScalarWhereInput | ProviderCredentialScalarWhereInput[]
    id?: StringFilter<"ProviderCredential"> | string
    userId?: StringFilter<"ProviderCredential"> | string
    provider?: EnumAIProviderFilter<"ProviderCredential"> | $Enums.AIProvider
    encryptedConfig?: StringFilter<"ProviderCredential"> | string
    isEnabled?: BoolFilter<"ProviderCredential"> | boolean
    createdAt?: DateTimeFilter<"ProviderCredential"> | Date | string
    updatedAt?: DateTimeFilter<"ProviderCredential"> | Date | string
  }

  export type ModelPreferenceUpsertWithWhereUniqueWithoutUserInput = {
    where: ModelPreferenceWhereUniqueInput
    update: XOR<ModelPreferenceUpdateWithoutUserInput, ModelPreferenceUncheckedUpdateWithoutUserInput>
    create: XOR<ModelPreferenceCreateWithoutUserInput, ModelPreferenceUncheckedCreateWithoutUserInput>
  }

  export type ModelPreferenceUpdateWithWhereUniqueWithoutUserInput = {
    where: ModelPreferenceWhereUniqueInput
    data: XOR<ModelPreferenceUpdateWithoutUserInput, ModelPreferenceUncheckedUpdateWithoutUserInput>
  }

  export type ModelPreferenceUpdateManyWithWhereWithoutUserInput = {
    where: ModelPreferenceScalarWhereInput
    data: XOR<ModelPreferenceUpdateManyMutationInput, ModelPreferenceUncheckedUpdateManyWithoutUserInput>
  }

  export type ModelPreferenceScalarWhereInput = {
    AND?: ModelPreferenceScalarWhereInput | ModelPreferenceScalarWhereInput[]
    OR?: ModelPreferenceScalarWhereInput[]
    NOT?: ModelPreferenceScalarWhereInput | ModelPreferenceScalarWhereInput[]
    id?: StringFilter<"ModelPreference"> | string
    userId?: StringFilter<"ModelPreference"> | string
    provider?: EnumAIProviderFilter<"ModelPreference"> | $Enums.AIProvider
    modelId?: StringFilter<"ModelPreference"> | string
    isCustom?: BoolFilter<"ModelPreference"> | boolean
    isEnabled?: BoolFilter<"ModelPreference"> | boolean
    createdAt?: DateTimeFilter<"ModelPreference"> | Date | string
  }

  export type UserCreateWithoutOwnedWorkspacesInput = {
    id: string
    name: string
    email: string
    emailVerified?: boolean
    image?: string | null
    nickname?: string | null
    occupation?: string | null
    aboutUser?: string | null
    personalityPreset?: $Enums.PersonalityPreset
    customInstructions?: string | null
    themePreference?: $Enums.ThemePreference
    threadListOrganizeBy?: $Enums.ThreadListOrganizeBy
    threadListSortBy?: $Enums.ThreadListSortBy
    createdAt?: Date | string
    updatedAt?: Date | string
    selectedWorkspace?: WorkspaceCreateNestedOneWithoutSelectedByUsersInput
    threads?: ThreadCreateNestedManyWithoutUserInput
    credentials?: ProviderCredentialCreateNestedManyWithoutUserInput
    modelPreferences?: ModelPreferenceCreateNestedManyWithoutUserInput
  }

  export type UserUncheckedCreateWithoutOwnedWorkspacesInput = {
    id: string
    name: string
    email: string
    emailVerified?: boolean
    image?: string | null
    nickname?: string | null
    occupation?: string | null
    aboutUser?: string | null
    personalityPreset?: $Enums.PersonalityPreset
    customInstructions?: string | null
    themePreference?: $Enums.ThemePreference
    selectedWorkspaceId?: string | null
    threadListOrganizeBy?: $Enums.ThreadListOrganizeBy
    threadListSortBy?: $Enums.ThreadListSortBy
    createdAt?: Date | string
    updatedAt?: Date | string
    threads?: ThreadUncheckedCreateNestedManyWithoutUserInput
    credentials?: ProviderCredentialUncheckedCreateNestedManyWithoutUserInput
    modelPreferences?: ModelPreferenceUncheckedCreateNestedManyWithoutUserInput
  }

  export type UserCreateOrConnectWithoutOwnedWorkspacesInput = {
    where: UserWhereUniqueInput
    create: XOR<UserCreateWithoutOwnedWorkspacesInput, UserUncheckedCreateWithoutOwnedWorkspacesInput>
  }

  export type UserCreateWithoutSelectedWorkspaceInput = {
    id: string
    name: string
    email: string
    emailVerified?: boolean
    image?: string | null
    nickname?: string | null
    occupation?: string | null
    aboutUser?: string | null
    personalityPreset?: $Enums.PersonalityPreset
    customInstructions?: string | null
    themePreference?: $Enums.ThemePreference
    threadListOrganizeBy?: $Enums.ThreadListOrganizeBy
    threadListSortBy?: $Enums.ThreadListSortBy
    createdAt?: Date | string
    updatedAt?: Date | string
    ownedWorkspaces?: WorkspaceCreateNestedManyWithoutUserInput
    threads?: ThreadCreateNestedManyWithoutUserInput
    credentials?: ProviderCredentialCreateNestedManyWithoutUserInput
    modelPreferences?: ModelPreferenceCreateNestedManyWithoutUserInput
  }

  export type UserUncheckedCreateWithoutSelectedWorkspaceInput = {
    id: string
    name: string
    email: string
    emailVerified?: boolean
    image?: string | null
    nickname?: string | null
    occupation?: string | null
    aboutUser?: string | null
    personalityPreset?: $Enums.PersonalityPreset
    customInstructions?: string | null
    themePreference?: $Enums.ThemePreference
    threadListOrganizeBy?: $Enums.ThreadListOrganizeBy
    threadListSortBy?: $Enums.ThreadListSortBy
    createdAt?: Date | string
    updatedAt?: Date | string
    ownedWorkspaces?: WorkspaceUncheckedCreateNestedManyWithoutUserInput
    threads?: ThreadUncheckedCreateNestedManyWithoutUserInput
    credentials?: ProviderCredentialUncheckedCreateNestedManyWithoutUserInput
    modelPreferences?: ModelPreferenceUncheckedCreateNestedManyWithoutUserInput
  }

  export type UserCreateOrConnectWithoutSelectedWorkspaceInput = {
    where: UserWhereUniqueInput
    create: XOR<UserCreateWithoutSelectedWorkspaceInput, UserUncheckedCreateWithoutSelectedWorkspaceInput>
  }

  export type UserCreateManySelectedWorkspaceInputEnvelope = {
    data: UserCreateManySelectedWorkspaceInput | UserCreateManySelectedWorkspaceInput[]
    skipDuplicates?: boolean
  }

  export type ThreadCreateWithoutWorkspaceInput = {
    id?: string
    title: string
    summary?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    archivedAt?: Date | string | null
    user: UserCreateNestedOneWithoutThreadsInput
    messages?: ThreadMessageCreateNestedManyWithoutThreadInput
  }

  export type ThreadUncheckedCreateWithoutWorkspaceInput = {
    id?: string
    userId: string
    title: string
    summary?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    archivedAt?: Date | string | null
    messages?: ThreadMessageUncheckedCreateNestedManyWithoutThreadInput
  }

  export type ThreadCreateOrConnectWithoutWorkspaceInput = {
    where: ThreadWhereUniqueInput
    create: XOR<ThreadCreateWithoutWorkspaceInput, ThreadUncheckedCreateWithoutWorkspaceInput>
  }

  export type ThreadCreateManyWorkspaceInputEnvelope = {
    data: ThreadCreateManyWorkspaceInput | ThreadCreateManyWorkspaceInput[]
    skipDuplicates?: boolean
  }

  export type UserUpsertWithoutOwnedWorkspacesInput = {
    update: XOR<UserUpdateWithoutOwnedWorkspacesInput, UserUncheckedUpdateWithoutOwnedWorkspacesInput>
    create: XOR<UserCreateWithoutOwnedWorkspacesInput, UserUncheckedCreateWithoutOwnedWorkspacesInput>
    where?: UserWhereInput
  }

  export type UserUpdateToOneWithWhereWithoutOwnedWorkspacesInput = {
    where?: UserWhereInput
    data: XOR<UserUpdateWithoutOwnedWorkspacesInput, UserUncheckedUpdateWithoutOwnedWorkspacesInput>
  }

  export type UserUpdateWithoutOwnedWorkspacesInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    emailVerified?: BoolFieldUpdateOperationsInput | boolean
    image?: NullableStringFieldUpdateOperationsInput | string | null
    nickname?: NullableStringFieldUpdateOperationsInput | string | null
    occupation?: NullableStringFieldUpdateOperationsInput | string | null
    aboutUser?: NullableStringFieldUpdateOperationsInput | string | null
    personalityPreset?: EnumPersonalityPresetFieldUpdateOperationsInput | $Enums.PersonalityPreset
    customInstructions?: NullableStringFieldUpdateOperationsInput | string | null
    themePreference?: EnumThemePreferenceFieldUpdateOperationsInput | $Enums.ThemePreference
    threadListOrganizeBy?: EnumThreadListOrganizeByFieldUpdateOperationsInput | $Enums.ThreadListOrganizeBy
    threadListSortBy?: EnumThreadListSortByFieldUpdateOperationsInput | $Enums.ThreadListSortBy
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    selectedWorkspace?: WorkspaceUpdateOneWithoutSelectedByUsersNestedInput
    threads?: ThreadUpdateManyWithoutUserNestedInput
    credentials?: ProviderCredentialUpdateManyWithoutUserNestedInput
    modelPreferences?: ModelPreferenceUpdateManyWithoutUserNestedInput
  }

  export type UserUncheckedUpdateWithoutOwnedWorkspacesInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    emailVerified?: BoolFieldUpdateOperationsInput | boolean
    image?: NullableStringFieldUpdateOperationsInput | string | null
    nickname?: NullableStringFieldUpdateOperationsInput | string | null
    occupation?: NullableStringFieldUpdateOperationsInput | string | null
    aboutUser?: NullableStringFieldUpdateOperationsInput | string | null
    personalityPreset?: EnumPersonalityPresetFieldUpdateOperationsInput | $Enums.PersonalityPreset
    customInstructions?: NullableStringFieldUpdateOperationsInput | string | null
    themePreference?: EnumThemePreferenceFieldUpdateOperationsInput | $Enums.ThemePreference
    selectedWorkspaceId?: NullableStringFieldUpdateOperationsInput | string | null
    threadListOrganizeBy?: EnumThreadListOrganizeByFieldUpdateOperationsInput | $Enums.ThreadListOrganizeBy
    threadListSortBy?: EnumThreadListSortByFieldUpdateOperationsInput | $Enums.ThreadListSortBy
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    threads?: ThreadUncheckedUpdateManyWithoutUserNestedInput
    credentials?: ProviderCredentialUncheckedUpdateManyWithoutUserNestedInput
    modelPreferences?: ModelPreferenceUncheckedUpdateManyWithoutUserNestedInput
  }

  export type UserUpsertWithWhereUniqueWithoutSelectedWorkspaceInput = {
    where: UserWhereUniqueInput
    update: XOR<UserUpdateWithoutSelectedWorkspaceInput, UserUncheckedUpdateWithoutSelectedWorkspaceInput>
    create: XOR<UserCreateWithoutSelectedWorkspaceInput, UserUncheckedCreateWithoutSelectedWorkspaceInput>
  }

  export type UserUpdateWithWhereUniqueWithoutSelectedWorkspaceInput = {
    where: UserWhereUniqueInput
    data: XOR<UserUpdateWithoutSelectedWorkspaceInput, UserUncheckedUpdateWithoutSelectedWorkspaceInput>
  }

  export type UserUpdateManyWithWhereWithoutSelectedWorkspaceInput = {
    where: UserScalarWhereInput
    data: XOR<UserUpdateManyMutationInput, UserUncheckedUpdateManyWithoutSelectedWorkspaceInput>
  }

  export type UserScalarWhereInput = {
    AND?: UserScalarWhereInput | UserScalarWhereInput[]
    OR?: UserScalarWhereInput[]
    NOT?: UserScalarWhereInput | UserScalarWhereInput[]
    id?: StringFilter<"User"> | string
    name?: StringFilter<"User"> | string
    email?: StringFilter<"User"> | string
    emailVerified?: BoolFilter<"User"> | boolean
    image?: StringNullableFilter<"User"> | string | null
    nickname?: StringNullableFilter<"User"> | string | null
    occupation?: StringNullableFilter<"User"> | string | null
    aboutUser?: StringNullableFilter<"User"> | string | null
    personalityPreset?: EnumPersonalityPresetFilter<"User"> | $Enums.PersonalityPreset
    customInstructions?: StringNullableFilter<"User"> | string | null
    themePreference?: EnumThemePreferenceFilter<"User"> | $Enums.ThemePreference
    selectedWorkspaceId?: StringNullableFilter<"User"> | string | null
    threadListOrganizeBy?: EnumThreadListOrganizeByFilter<"User"> | $Enums.ThreadListOrganizeBy
    threadListSortBy?: EnumThreadListSortByFilter<"User"> | $Enums.ThreadListSortBy
    createdAt?: DateTimeFilter<"User"> | Date | string
    updatedAt?: DateTimeFilter<"User"> | Date | string
  }

  export type ThreadUpsertWithWhereUniqueWithoutWorkspaceInput = {
    where: ThreadWhereUniqueInput
    update: XOR<ThreadUpdateWithoutWorkspaceInput, ThreadUncheckedUpdateWithoutWorkspaceInput>
    create: XOR<ThreadCreateWithoutWorkspaceInput, ThreadUncheckedCreateWithoutWorkspaceInput>
  }

  export type ThreadUpdateWithWhereUniqueWithoutWorkspaceInput = {
    where: ThreadWhereUniqueInput
    data: XOR<ThreadUpdateWithoutWorkspaceInput, ThreadUncheckedUpdateWithoutWorkspaceInput>
  }

  export type ThreadUpdateManyWithWhereWithoutWorkspaceInput = {
    where: ThreadScalarWhereInput
    data: XOR<ThreadUpdateManyMutationInput, ThreadUncheckedUpdateManyWithoutWorkspaceInput>
  }

  export type WorkspaceCreateWithoutThreadsInput = {
    id?: string
    name: string
    rootPath?: string | null
    description?: string | null
    isArchived?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
    user: UserCreateNestedOneWithoutOwnedWorkspacesInput
    selectedByUsers?: UserCreateNestedManyWithoutSelectedWorkspaceInput
  }

  export type WorkspaceUncheckedCreateWithoutThreadsInput = {
    id?: string
    userId: string
    name: string
    rootPath?: string | null
    description?: string | null
    isArchived?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
    selectedByUsers?: UserUncheckedCreateNestedManyWithoutSelectedWorkspaceInput
  }

  export type WorkspaceCreateOrConnectWithoutThreadsInput = {
    where: WorkspaceWhereUniqueInput
    create: XOR<WorkspaceCreateWithoutThreadsInput, WorkspaceUncheckedCreateWithoutThreadsInput>
  }

  export type UserCreateWithoutThreadsInput = {
    id: string
    name: string
    email: string
    emailVerified?: boolean
    image?: string | null
    nickname?: string | null
    occupation?: string | null
    aboutUser?: string | null
    personalityPreset?: $Enums.PersonalityPreset
    customInstructions?: string | null
    themePreference?: $Enums.ThemePreference
    threadListOrganizeBy?: $Enums.ThreadListOrganizeBy
    threadListSortBy?: $Enums.ThreadListSortBy
    createdAt?: Date | string
    updatedAt?: Date | string
    selectedWorkspace?: WorkspaceCreateNestedOneWithoutSelectedByUsersInput
    ownedWorkspaces?: WorkspaceCreateNestedManyWithoutUserInput
    credentials?: ProviderCredentialCreateNestedManyWithoutUserInput
    modelPreferences?: ModelPreferenceCreateNestedManyWithoutUserInput
  }

  export type UserUncheckedCreateWithoutThreadsInput = {
    id: string
    name: string
    email: string
    emailVerified?: boolean
    image?: string | null
    nickname?: string | null
    occupation?: string | null
    aboutUser?: string | null
    personalityPreset?: $Enums.PersonalityPreset
    customInstructions?: string | null
    themePreference?: $Enums.ThemePreference
    selectedWorkspaceId?: string | null
    threadListOrganizeBy?: $Enums.ThreadListOrganizeBy
    threadListSortBy?: $Enums.ThreadListSortBy
    createdAt?: Date | string
    updatedAt?: Date | string
    ownedWorkspaces?: WorkspaceUncheckedCreateNestedManyWithoutUserInput
    credentials?: ProviderCredentialUncheckedCreateNestedManyWithoutUserInput
    modelPreferences?: ModelPreferenceUncheckedCreateNestedManyWithoutUserInput
  }

  export type UserCreateOrConnectWithoutThreadsInput = {
    where: UserWhereUniqueInput
    create: XOR<UserCreateWithoutThreadsInput, UserUncheckedCreateWithoutThreadsInput>
  }

  export type ThreadMessageCreateWithoutThreadInput = {
    id?: string
    messageId: string
    role: $Enums.ThreadMessageRole
    parts: JsonNullValueInput | InputJsonValue
    metadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type ThreadMessageUncheckedCreateWithoutThreadInput = {
    id?: string
    messageId: string
    role: $Enums.ThreadMessageRole
    parts: JsonNullValueInput | InputJsonValue
    metadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type ThreadMessageCreateOrConnectWithoutThreadInput = {
    where: ThreadMessageWhereUniqueInput
    create: XOR<ThreadMessageCreateWithoutThreadInput, ThreadMessageUncheckedCreateWithoutThreadInput>
  }

  export type ThreadMessageCreateManyThreadInputEnvelope = {
    data: ThreadMessageCreateManyThreadInput | ThreadMessageCreateManyThreadInput[]
    skipDuplicates?: boolean
  }

  export type WorkspaceUpsertWithoutThreadsInput = {
    update: XOR<WorkspaceUpdateWithoutThreadsInput, WorkspaceUncheckedUpdateWithoutThreadsInput>
    create: XOR<WorkspaceCreateWithoutThreadsInput, WorkspaceUncheckedCreateWithoutThreadsInput>
    where?: WorkspaceWhereInput
  }

  export type WorkspaceUpdateToOneWithWhereWithoutThreadsInput = {
    where?: WorkspaceWhereInput
    data: XOR<WorkspaceUpdateWithoutThreadsInput, WorkspaceUncheckedUpdateWithoutThreadsInput>
  }

  export type WorkspaceUpdateWithoutThreadsInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    rootPath?: NullableStringFieldUpdateOperationsInput | string | null
    description?: NullableStringFieldUpdateOperationsInput | string | null
    isArchived?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    user?: UserUpdateOneRequiredWithoutOwnedWorkspacesNestedInput
    selectedByUsers?: UserUpdateManyWithoutSelectedWorkspaceNestedInput
  }

  export type WorkspaceUncheckedUpdateWithoutThreadsInput = {
    id?: StringFieldUpdateOperationsInput | string
    userId?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    rootPath?: NullableStringFieldUpdateOperationsInput | string | null
    description?: NullableStringFieldUpdateOperationsInput | string | null
    isArchived?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    selectedByUsers?: UserUncheckedUpdateManyWithoutSelectedWorkspaceNestedInput
  }

  export type UserUpsertWithoutThreadsInput = {
    update: XOR<UserUpdateWithoutThreadsInput, UserUncheckedUpdateWithoutThreadsInput>
    create: XOR<UserCreateWithoutThreadsInput, UserUncheckedCreateWithoutThreadsInput>
    where?: UserWhereInput
  }

  export type UserUpdateToOneWithWhereWithoutThreadsInput = {
    where?: UserWhereInput
    data: XOR<UserUpdateWithoutThreadsInput, UserUncheckedUpdateWithoutThreadsInput>
  }

  export type UserUpdateWithoutThreadsInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    emailVerified?: BoolFieldUpdateOperationsInput | boolean
    image?: NullableStringFieldUpdateOperationsInput | string | null
    nickname?: NullableStringFieldUpdateOperationsInput | string | null
    occupation?: NullableStringFieldUpdateOperationsInput | string | null
    aboutUser?: NullableStringFieldUpdateOperationsInput | string | null
    personalityPreset?: EnumPersonalityPresetFieldUpdateOperationsInput | $Enums.PersonalityPreset
    customInstructions?: NullableStringFieldUpdateOperationsInput | string | null
    themePreference?: EnumThemePreferenceFieldUpdateOperationsInput | $Enums.ThemePreference
    threadListOrganizeBy?: EnumThreadListOrganizeByFieldUpdateOperationsInput | $Enums.ThreadListOrganizeBy
    threadListSortBy?: EnumThreadListSortByFieldUpdateOperationsInput | $Enums.ThreadListSortBy
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    selectedWorkspace?: WorkspaceUpdateOneWithoutSelectedByUsersNestedInput
    ownedWorkspaces?: WorkspaceUpdateManyWithoutUserNestedInput
    credentials?: ProviderCredentialUpdateManyWithoutUserNestedInput
    modelPreferences?: ModelPreferenceUpdateManyWithoutUserNestedInput
  }

  export type UserUncheckedUpdateWithoutThreadsInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    emailVerified?: BoolFieldUpdateOperationsInput | boolean
    image?: NullableStringFieldUpdateOperationsInput | string | null
    nickname?: NullableStringFieldUpdateOperationsInput | string | null
    occupation?: NullableStringFieldUpdateOperationsInput | string | null
    aboutUser?: NullableStringFieldUpdateOperationsInput | string | null
    personalityPreset?: EnumPersonalityPresetFieldUpdateOperationsInput | $Enums.PersonalityPreset
    customInstructions?: NullableStringFieldUpdateOperationsInput | string | null
    themePreference?: EnumThemePreferenceFieldUpdateOperationsInput | $Enums.ThemePreference
    selectedWorkspaceId?: NullableStringFieldUpdateOperationsInput | string | null
    threadListOrganizeBy?: EnumThreadListOrganizeByFieldUpdateOperationsInput | $Enums.ThreadListOrganizeBy
    threadListSortBy?: EnumThreadListSortByFieldUpdateOperationsInput | $Enums.ThreadListSortBy
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    ownedWorkspaces?: WorkspaceUncheckedUpdateManyWithoutUserNestedInput
    credentials?: ProviderCredentialUncheckedUpdateManyWithoutUserNestedInput
    modelPreferences?: ModelPreferenceUncheckedUpdateManyWithoutUserNestedInput
  }

  export type ThreadMessageUpsertWithWhereUniqueWithoutThreadInput = {
    where: ThreadMessageWhereUniqueInput
    update: XOR<ThreadMessageUpdateWithoutThreadInput, ThreadMessageUncheckedUpdateWithoutThreadInput>
    create: XOR<ThreadMessageCreateWithoutThreadInput, ThreadMessageUncheckedCreateWithoutThreadInput>
  }

  export type ThreadMessageUpdateWithWhereUniqueWithoutThreadInput = {
    where: ThreadMessageWhereUniqueInput
    data: XOR<ThreadMessageUpdateWithoutThreadInput, ThreadMessageUncheckedUpdateWithoutThreadInput>
  }

  export type ThreadMessageUpdateManyWithWhereWithoutThreadInput = {
    where: ThreadMessageScalarWhereInput
    data: XOR<ThreadMessageUpdateManyMutationInput, ThreadMessageUncheckedUpdateManyWithoutThreadInput>
  }

  export type ThreadMessageScalarWhereInput = {
    AND?: ThreadMessageScalarWhereInput | ThreadMessageScalarWhereInput[]
    OR?: ThreadMessageScalarWhereInput[]
    NOT?: ThreadMessageScalarWhereInput | ThreadMessageScalarWhereInput[]
    id?: StringFilter<"ThreadMessage"> | string
    threadId?: StringFilter<"ThreadMessage"> | string
    messageId?: StringFilter<"ThreadMessage"> | string
    role?: EnumThreadMessageRoleFilter<"ThreadMessage"> | $Enums.ThreadMessageRole
    parts?: JsonFilter<"ThreadMessage">
    metadata?: JsonNullableFilter<"ThreadMessage">
    createdAt?: DateTimeFilter<"ThreadMessage"> | Date | string
    updatedAt?: DateTimeFilter<"ThreadMessage"> | Date | string
  }

  export type ThreadCreateWithoutMessagesInput = {
    id?: string
    title: string
    summary?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    archivedAt?: Date | string | null
    workspace: WorkspaceCreateNestedOneWithoutThreadsInput
    user: UserCreateNestedOneWithoutThreadsInput
  }

  export type ThreadUncheckedCreateWithoutMessagesInput = {
    id?: string
    workspaceId: string
    userId: string
    title: string
    summary?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    archivedAt?: Date | string | null
  }

  export type ThreadCreateOrConnectWithoutMessagesInput = {
    where: ThreadWhereUniqueInput
    create: XOR<ThreadCreateWithoutMessagesInput, ThreadUncheckedCreateWithoutMessagesInput>
  }

  export type ThreadUpsertWithoutMessagesInput = {
    update: XOR<ThreadUpdateWithoutMessagesInput, ThreadUncheckedUpdateWithoutMessagesInput>
    create: XOR<ThreadCreateWithoutMessagesInput, ThreadUncheckedCreateWithoutMessagesInput>
    where?: ThreadWhereInput
  }

  export type ThreadUpdateToOneWithWhereWithoutMessagesInput = {
    where?: ThreadWhereInput
    data: XOR<ThreadUpdateWithoutMessagesInput, ThreadUncheckedUpdateWithoutMessagesInput>
  }

  export type ThreadUpdateWithoutMessagesInput = {
    id?: StringFieldUpdateOperationsInput | string
    title?: StringFieldUpdateOperationsInput | string
    summary?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    archivedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    workspace?: WorkspaceUpdateOneRequiredWithoutThreadsNestedInput
    user?: UserUpdateOneRequiredWithoutThreadsNestedInput
  }

  export type ThreadUncheckedUpdateWithoutMessagesInput = {
    id?: StringFieldUpdateOperationsInput | string
    workspaceId?: StringFieldUpdateOperationsInput | string
    userId?: StringFieldUpdateOperationsInput | string
    title?: StringFieldUpdateOperationsInput | string
    summary?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    archivedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
  }

  export type UserCreateWithoutCredentialsInput = {
    id: string
    name: string
    email: string
    emailVerified?: boolean
    image?: string | null
    nickname?: string | null
    occupation?: string | null
    aboutUser?: string | null
    personalityPreset?: $Enums.PersonalityPreset
    customInstructions?: string | null
    themePreference?: $Enums.ThemePreference
    threadListOrganizeBy?: $Enums.ThreadListOrganizeBy
    threadListSortBy?: $Enums.ThreadListSortBy
    createdAt?: Date | string
    updatedAt?: Date | string
    selectedWorkspace?: WorkspaceCreateNestedOneWithoutSelectedByUsersInput
    ownedWorkspaces?: WorkspaceCreateNestedManyWithoutUserInput
    threads?: ThreadCreateNestedManyWithoutUserInput
    modelPreferences?: ModelPreferenceCreateNestedManyWithoutUserInput
  }

  export type UserUncheckedCreateWithoutCredentialsInput = {
    id: string
    name: string
    email: string
    emailVerified?: boolean
    image?: string | null
    nickname?: string | null
    occupation?: string | null
    aboutUser?: string | null
    personalityPreset?: $Enums.PersonalityPreset
    customInstructions?: string | null
    themePreference?: $Enums.ThemePreference
    selectedWorkspaceId?: string | null
    threadListOrganizeBy?: $Enums.ThreadListOrganizeBy
    threadListSortBy?: $Enums.ThreadListSortBy
    createdAt?: Date | string
    updatedAt?: Date | string
    ownedWorkspaces?: WorkspaceUncheckedCreateNestedManyWithoutUserInput
    threads?: ThreadUncheckedCreateNestedManyWithoutUserInput
    modelPreferences?: ModelPreferenceUncheckedCreateNestedManyWithoutUserInput
  }

  export type UserCreateOrConnectWithoutCredentialsInput = {
    where: UserWhereUniqueInput
    create: XOR<UserCreateWithoutCredentialsInput, UserUncheckedCreateWithoutCredentialsInput>
  }

  export type UserUpsertWithoutCredentialsInput = {
    update: XOR<UserUpdateWithoutCredentialsInput, UserUncheckedUpdateWithoutCredentialsInput>
    create: XOR<UserCreateWithoutCredentialsInput, UserUncheckedCreateWithoutCredentialsInput>
    where?: UserWhereInput
  }

  export type UserUpdateToOneWithWhereWithoutCredentialsInput = {
    where?: UserWhereInput
    data: XOR<UserUpdateWithoutCredentialsInput, UserUncheckedUpdateWithoutCredentialsInput>
  }

  export type UserUpdateWithoutCredentialsInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    emailVerified?: BoolFieldUpdateOperationsInput | boolean
    image?: NullableStringFieldUpdateOperationsInput | string | null
    nickname?: NullableStringFieldUpdateOperationsInput | string | null
    occupation?: NullableStringFieldUpdateOperationsInput | string | null
    aboutUser?: NullableStringFieldUpdateOperationsInput | string | null
    personalityPreset?: EnumPersonalityPresetFieldUpdateOperationsInput | $Enums.PersonalityPreset
    customInstructions?: NullableStringFieldUpdateOperationsInput | string | null
    themePreference?: EnumThemePreferenceFieldUpdateOperationsInput | $Enums.ThemePreference
    threadListOrganizeBy?: EnumThreadListOrganizeByFieldUpdateOperationsInput | $Enums.ThreadListOrganizeBy
    threadListSortBy?: EnumThreadListSortByFieldUpdateOperationsInput | $Enums.ThreadListSortBy
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    selectedWorkspace?: WorkspaceUpdateOneWithoutSelectedByUsersNestedInput
    ownedWorkspaces?: WorkspaceUpdateManyWithoutUserNestedInput
    threads?: ThreadUpdateManyWithoutUserNestedInput
    modelPreferences?: ModelPreferenceUpdateManyWithoutUserNestedInput
  }

  export type UserUncheckedUpdateWithoutCredentialsInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    emailVerified?: BoolFieldUpdateOperationsInput | boolean
    image?: NullableStringFieldUpdateOperationsInput | string | null
    nickname?: NullableStringFieldUpdateOperationsInput | string | null
    occupation?: NullableStringFieldUpdateOperationsInput | string | null
    aboutUser?: NullableStringFieldUpdateOperationsInput | string | null
    personalityPreset?: EnumPersonalityPresetFieldUpdateOperationsInput | $Enums.PersonalityPreset
    customInstructions?: NullableStringFieldUpdateOperationsInput | string | null
    themePreference?: EnumThemePreferenceFieldUpdateOperationsInput | $Enums.ThemePreference
    selectedWorkspaceId?: NullableStringFieldUpdateOperationsInput | string | null
    threadListOrganizeBy?: EnumThreadListOrganizeByFieldUpdateOperationsInput | $Enums.ThreadListOrganizeBy
    threadListSortBy?: EnumThreadListSortByFieldUpdateOperationsInput | $Enums.ThreadListSortBy
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    ownedWorkspaces?: WorkspaceUncheckedUpdateManyWithoutUserNestedInput
    threads?: ThreadUncheckedUpdateManyWithoutUserNestedInput
    modelPreferences?: ModelPreferenceUncheckedUpdateManyWithoutUserNestedInput
  }

  export type UserCreateWithoutModelPreferencesInput = {
    id: string
    name: string
    email: string
    emailVerified?: boolean
    image?: string | null
    nickname?: string | null
    occupation?: string | null
    aboutUser?: string | null
    personalityPreset?: $Enums.PersonalityPreset
    customInstructions?: string | null
    themePreference?: $Enums.ThemePreference
    threadListOrganizeBy?: $Enums.ThreadListOrganizeBy
    threadListSortBy?: $Enums.ThreadListSortBy
    createdAt?: Date | string
    updatedAt?: Date | string
    selectedWorkspace?: WorkspaceCreateNestedOneWithoutSelectedByUsersInput
    ownedWorkspaces?: WorkspaceCreateNestedManyWithoutUserInput
    threads?: ThreadCreateNestedManyWithoutUserInput
    credentials?: ProviderCredentialCreateNestedManyWithoutUserInput
  }

  export type UserUncheckedCreateWithoutModelPreferencesInput = {
    id: string
    name: string
    email: string
    emailVerified?: boolean
    image?: string | null
    nickname?: string | null
    occupation?: string | null
    aboutUser?: string | null
    personalityPreset?: $Enums.PersonalityPreset
    customInstructions?: string | null
    themePreference?: $Enums.ThemePreference
    selectedWorkspaceId?: string | null
    threadListOrganizeBy?: $Enums.ThreadListOrganizeBy
    threadListSortBy?: $Enums.ThreadListSortBy
    createdAt?: Date | string
    updatedAt?: Date | string
    ownedWorkspaces?: WorkspaceUncheckedCreateNestedManyWithoutUserInput
    threads?: ThreadUncheckedCreateNestedManyWithoutUserInput
    credentials?: ProviderCredentialUncheckedCreateNestedManyWithoutUserInput
  }

  export type UserCreateOrConnectWithoutModelPreferencesInput = {
    where: UserWhereUniqueInput
    create: XOR<UserCreateWithoutModelPreferencesInput, UserUncheckedCreateWithoutModelPreferencesInput>
  }

  export type UserUpsertWithoutModelPreferencesInput = {
    update: XOR<UserUpdateWithoutModelPreferencesInput, UserUncheckedUpdateWithoutModelPreferencesInput>
    create: XOR<UserCreateWithoutModelPreferencesInput, UserUncheckedCreateWithoutModelPreferencesInput>
    where?: UserWhereInput
  }

  export type UserUpdateToOneWithWhereWithoutModelPreferencesInput = {
    where?: UserWhereInput
    data: XOR<UserUpdateWithoutModelPreferencesInput, UserUncheckedUpdateWithoutModelPreferencesInput>
  }

  export type UserUpdateWithoutModelPreferencesInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    emailVerified?: BoolFieldUpdateOperationsInput | boolean
    image?: NullableStringFieldUpdateOperationsInput | string | null
    nickname?: NullableStringFieldUpdateOperationsInput | string | null
    occupation?: NullableStringFieldUpdateOperationsInput | string | null
    aboutUser?: NullableStringFieldUpdateOperationsInput | string | null
    personalityPreset?: EnumPersonalityPresetFieldUpdateOperationsInput | $Enums.PersonalityPreset
    customInstructions?: NullableStringFieldUpdateOperationsInput | string | null
    themePreference?: EnumThemePreferenceFieldUpdateOperationsInput | $Enums.ThemePreference
    threadListOrganizeBy?: EnumThreadListOrganizeByFieldUpdateOperationsInput | $Enums.ThreadListOrganizeBy
    threadListSortBy?: EnumThreadListSortByFieldUpdateOperationsInput | $Enums.ThreadListSortBy
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    selectedWorkspace?: WorkspaceUpdateOneWithoutSelectedByUsersNestedInput
    ownedWorkspaces?: WorkspaceUpdateManyWithoutUserNestedInput
    threads?: ThreadUpdateManyWithoutUserNestedInput
    credentials?: ProviderCredentialUpdateManyWithoutUserNestedInput
  }

  export type UserUncheckedUpdateWithoutModelPreferencesInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    emailVerified?: BoolFieldUpdateOperationsInput | boolean
    image?: NullableStringFieldUpdateOperationsInput | string | null
    nickname?: NullableStringFieldUpdateOperationsInput | string | null
    occupation?: NullableStringFieldUpdateOperationsInput | string | null
    aboutUser?: NullableStringFieldUpdateOperationsInput | string | null
    personalityPreset?: EnumPersonalityPresetFieldUpdateOperationsInput | $Enums.PersonalityPreset
    customInstructions?: NullableStringFieldUpdateOperationsInput | string | null
    themePreference?: EnumThemePreferenceFieldUpdateOperationsInput | $Enums.ThemePreference
    selectedWorkspaceId?: NullableStringFieldUpdateOperationsInput | string | null
    threadListOrganizeBy?: EnumThreadListOrganizeByFieldUpdateOperationsInput | $Enums.ThreadListOrganizeBy
    threadListSortBy?: EnumThreadListSortByFieldUpdateOperationsInput | $Enums.ThreadListSortBy
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    ownedWorkspaces?: WorkspaceUncheckedUpdateManyWithoutUserNestedInput
    threads?: ThreadUncheckedUpdateManyWithoutUserNestedInput
    credentials?: ProviderCredentialUncheckedUpdateManyWithoutUserNestedInput
  }

  export type WorkspaceCreateManyUserInput = {
    id?: string
    name: string
    rootPath?: string | null
    description?: string | null
    isArchived?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type ThreadCreateManyUserInput = {
    id?: string
    workspaceId: string
    title: string
    summary?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    archivedAt?: Date | string | null
  }

  export type ProviderCredentialCreateManyUserInput = {
    id?: string
    provider: $Enums.AIProvider
    encryptedConfig: string
    isEnabled?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type ModelPreferenceCreateManyUserInput = {
    id?: string
    provider: $Enums.AIProvider
    modelId: string
    isCustom?: boolean
    isEnabled?: boolean
    createdAt?: Date | string
  }

  export type WorkspaceUpdateWithoutUserInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    rootPath?: NullableStringFieldUpdateOperationsInput | string | null
    description?: NullableStringFieldUpdateOperationsInput | string | null
    isArchived?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    selectedByUsers?: UserUpdateManyWithoutSelectedWorkspaceNestedInput
    threads?: ThreadUpdateManyWithoutWorkspaceNestedInput
  }

  export type WorkspaceUncheckedUpdateWithoutUserInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    rootPath?: NullableStringFieldUpdateOperationsInput | string | null
    description?: NullableStringFieldUpdateOperationsInput | string | null
    isArchived?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    selectedByUsers?: UserUncheckedUpdateManyWithoutSelectedWorkspaceNestedInput
    threads?: ThreadUncheckedUpdateManyWithoutWorkspaceNestedInput
  }

  export type WorkspaceUncheckedUpdateManyWithoutUserInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    rootPath?: NullableStringFieldUpdateOperationsInput | string | null
    description?: NullableStringFieldUpdateOperationsInput | string | null
    isArchived?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ThreadUpdateWithoutUserInput = {
    id?: StringFieldUpdateOperationsInput | string
    title?: StringFieldUpdateOperationsInput | string
    summary?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    archivedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    workspace?: WorkspaceUpdateOneRequiredWithoutThreadsNestedInput
    messages?: ThreadMessageUpdateManyWithoutThreadNestedInput
  }

  export type ThreadUncheckedUpdateWithoutUserInput = {
    id?: StringFieldUpdateOperationsInput | string
    workspaceId?: StringFieldUpdateOperationsInput | string
    title?: StringFieldUpdateOperationsInput | string
    summary?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    archivedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    messages?: ThreadMessageUncheckedUpdateManyWithoutThreadNestedInput
  }

  export type ThreadUncheckedUpdateManyWithoutUserInput = {
    id?: StringFieldUpdateOperationsInput | string
    workspaceId?: StringFieldUpdateOperationsInput | string
    title?: StringFieldUpdateOperationsInput | string
    summary?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    archivedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
  }

  export type ProviderCredentialUpdateWithoutUserInput = {
    id?: StringFieldUpdateOperationsInput | string
    provider?: EnumAIProviderFieldUpdateOperationsInput | $Enums.AIProvider
    encryptedConfig?: StringFieldUpdateOperationsInput | string
    isEnabled?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ProviderCredentialUncheckedUpdateWithoutUserInput = {
    id?: StringFieldUpdateOperationsInput | string
    provider?: EnumAIProviderFieldUpdateOperationsInput | $Enums.AIProvider
    encryptedConfig?: StringFieldUpdateOperationsInput | string
    isEnabled?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ProviderCredentialUncheckedUpdateManyWithoutUserInput = {
    id?: StringFieldUpdateOperationsInput | string
    provider?: EnumAIProviderFieldUpdateOperationsInput | $Enums.AIProvider
    encryptedConfig?: StringFieldUpdateOperationsInput | string
    isEnabled?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ModelPreferenceUpdateWithoutUserInput = {
    id?: StringFieldUpdateOperationsInput | string
    provider?: EnumAIProviderFieldUpdateOperationsInput | $Enums.AIProvider
    modelId?: StringFieldUpdateOperationsInput | string
    isCustom?: BoolFieldUpdateOperationsInput | boolean
    isEnabled?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ModelPreferenceUncheckedUpdateWithoutUserInput = {
    id?: StringFieldUpdateOperationsInput | string
    provider?: EnumAIProviderFieldUpdateOperationsInput | $Enums.AIProvider
    modelId?: StringFieldUpdateOperationsInput | string
    isCustom?: BoolFieldUpdateOperationsInput | boolean
    isEnabled?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ModelPreferenceUncheckedUpdateManyWithoutUserInput = {
    id?: StringFieldUpdateOperationsInput | string
    provider?: EnumAIProviderFieldUpdateOperationsInput | $Enums.AIProvider
    modelId?: StringFieldUpdateOperationsInput | string
    isCustom?: BoolFieldUpdateOperationsInput | boolean
    isEnabled?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type UserCreateManySelectedWorkspaceInput = {
    id: string
    name: string
    email: string
    emailVerified?: boolean
    image?: string | null
    nickname?: string | null
    occupation?: string | null
    aboutUser?: string | null
    personalityPreset?: $Enums.PersonalityPreset
    customInstructions?: string | null
    themePreference?: $Enums.ThemePreference
    threadListOrganizeBy?: $Enums.ThreadListOrganizeBy
    threadListSortBy?: $Enums.ThreadListSortBy
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type ThreadCreateManyWorkspaceInput = {
    id?: string
    userId: string
    title: string
    summary?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    archivedAt?: Date | string | null
  }

  export type UserUpdateWithoutSelectedWorkspaceInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    emailVerified?: BoolFieldUpdateOperationsInput | boolean
    image?: NullableStringFieldUpdateOperationsInput | string | null
    nickname?: NullableStringFieldUpdateOperationsInput | string | null
    occupation?: NullableStringFieldUpdateOperationsInput | string | null
    aboutUser?: NullableStringFieldUpdateOperationsInput | string | null
    personalityPreset?: EnumPersonalityPresetFieldUpdateOperationsInput | $Enums.PersonalityPreset
    customInstructions?: NullableStringFieldUpdateOperationsInput | string | null
    themePreference?: EnumThemePreferenceFieldUpdateOperationsInput | $Enums.ThemePreference
    threadListOrganizeBy?: EnumThreadListOrganizeByFieldUpdateOperationsInput | $Enums.ThreadListOrganizeBy
    threadListSortBy?: EnumThreadListSortByFieldUpdateOperationsInput | $Enums.ThreadListSortBy
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    ownedWorkspaces?: WorkspaceUpdateManyWithoutUserNestedInput
    threads?: ThreadUpdateManyWithoutUserNestedInput
    credentials?: ProviderCredentialUpdateManyWithoutUserNestedInput
    modelPreferences?: ModelPreferenceUpdateManyWithoutUserNestedInput
  }

  export type UserUncheckedUpdateWithoutSelectedWorkspaceInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    emailVerified?: BoolFieldUpdateOperationsInput | boolean
    image?: NullableStringFieldUpdateOperationsInput | string | null
    nickname?: NullableStringFieldUpdateOperationsInput | string | null
    occupation?: NullableStringFieldUpdateOperationsInput | string | null
    aboutUser?: NullableStringFieldUpdateOperationsInput | string | null
    personalityPreset?: EnumPersonalityPresetFieldUpdateOperationsInput | $Enums.PersonalityPreset
    customInstructions?: NullableStringFieldUpdateOperationsInput | string | null
    themePreference?: EnumThemePreferenceFieldUpdateOperationsInput | $Enums.ThemePreference
    threadListOrganizeBy?: EnumThreadListOrganizeByFieldUpdateOperationsInput | $Enums.ThreadListOrganizeBy
    threadListSortBy?: EnumThreadListSortByFieldUpdateOperationsInput | $Enums.ThreadListSortBy
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    ownedWorkspaces?: WorkspaceUncheckedUpdateManyWithoutUserNestedInput
    threads?: ThreadUncheckedUpdateManyWithoutUserNestedInput
    credentials?: ProviderCredentialUncheckedUpdateManyWithoutUserNestedInput
    modelPreferences?: ModelPreferenceUncheckedUpdateManyWithoutUserNestedInput
  }

  export type UserUncheckedUpdateManyWithoutSelectedWorkspaceInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    emailVerified?: BoolFieldUpdateOperationsInput | boolean
    image?: NullableStringFieldUpdateOperationsInput | string | null
    nickname?: NullableStringFieldUpdateOperationsInput | string | null
    occupation?: NullableStringFieldUpdateOperationsInput | string | null
    aboutUser?: NullableStringFieldUpdateOperationsInput | string | null
    personalityPreset?: EnumPersonalityPresetFieldUpdateOperationsInput | $Enums.PersonalityPreset
    customInstructions?: NullableStringFieldUpdateOperationsInput | string | null
    themePreference?: EnumThemePreferenceFieldUpdateOperationsInput | $Enums.ThemePreference
    threadListOrganizeBy?: EnumThreadListOrganizeByFieldUpdateOperationsInput | $Enums.ThreadListOrganizeBy
    threadListSortBy?: EnumThreadListSortByFieldUpdateOperationsInput | $Enums.ThreadListSortBy
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ThreadUpdateWithoutWorkspaceInput = {
    id?: StringFieldUpdateOperationsInput | string
    title?: StringFieldUpdateOperationsInput | string
    summary?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    archivedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    user?: UserUpdateOneRequiredWithoutThreadsNestedInput
    messages?: ThreadMessageUpdateManyWithoutThreadNestedInput
  }

  export type ThreadUncheckedUpdateWithoutWorkspaceInput = {
    id?: StringFieldUpdateOperationsInput | string
    userId?: StringFieldUpdateOperationsInput | string
    title?: StringFieldUpdateOperationsInput | string
    summary?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    archivedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    messages?: ThreadMessageUncheckedUpdateManyWithoutThreadNestedInput
  }

  export type ThreadUncheckedUpdateManyWithoutWorkspaceInput = {
    id?: StringFieldUpdateOperationsInput | string
    userId?: StringFieldUpdateOperationsInput | string
    title?: StringFieldUpdateOperationsInput | string
    summary?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    archivedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
  }

  export type ThreadMessageCreateManyThreadInput = {
    id?: string
    messageId: string
    role: $Enums.ThreadMessageRole
    parts: JsonNullValueInput | InputJsonValue
    metadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type ThreadMessageUpdateWithoutThreadInput = {
    id?: StringFieldUpdateOperationsInput | string
    messageId?: StringFieldUpdateOperationsInput | string
    role?: EnumThreadMessageRoleFieldUpdateOperationsInput | $Enums.ThreadMessageRole
    parts?: JsonNullValueInput | InputJsonValue
    metadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ThreadMessageUncheckedUpdateWithoutThreadInput = {
    id?: StringFieldUpdateOperationsInput | string
    messageId?: StringFieldUpdateOperationsInput | string
    role?: EnumThreadMessageRoleFieldUpdateOperationsInput | $Enums.ThreadMessageRole
    parts?: JsonNullValueInput | InputJsonValue
    metadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ThreadMessageUncheckedUpdateManyWithoutThreadInput = {
    id?: StringFieldUpdateOperationsInput | string
    messageId?: StringFieldUpdateOperationsInput | string
    role?: EnumThreadMessageRoleFieldUpdateOperationsInput | $Enums.ThreadMessageRole
    parts?: JsonNullValueInput | InputJsonValue
    metadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }



  /**
   * Batch Payload for updateMany & deleteMany & createMany
   */

  export type BatchPayload = {
    count: number
  }

  /**
   * DMMF
   */
  export const dmmf: runtime.BaseDMMF
}