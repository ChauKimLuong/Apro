import { Prisma } from '../generated/prisma/client';

export function isTransactionWriteConflict(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === 'P2034';
  }

  // The PostgreSQL adapter can report a serialization conflict at commit.
  const cause =
    error instanceof Error && error.name === 'DriverAdapterError'
      ? error.cause
      : undefined;
  return (
    typeof cause === 'object' &&
    cause !== null &&
    'kind' in cause &&
    cause.kind === 'TransactionWriteConflict'
  );
}
