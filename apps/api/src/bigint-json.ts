/**
 * `File.size` is `BigInt` in Postgres/Prisma. `JSON.stringify` throws on `BigInt` by
 * default ("Do not know how to serialize a BigInt"), and Nest's Express adapter uses
 * `JSON.stringify` under the hood for every response. Rather than manually converting
 * `size` at every call site, this teaches `JSON.stringify` how to serialize `BigInt` —
 * as a string, matching `z.string()` in the contract (see libs/contracts/src/lib/common.ts).
 *
 * Imported once, for its side effect, at the top of main.ts before the app boots.
 */
declare global {
  interface BigInt {
    toJSON(): string;
  }
}

BigInt.prototype.toJSON = function (this: bigint) {
  return this.toString();
};

export {};
