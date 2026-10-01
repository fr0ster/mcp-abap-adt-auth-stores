import { InvalidConfigError } from '../errors/StoreErrors';

/**
 * A destination name is a file name in the store's directory. One with a path
 * separator (`/` or `\`, on every platform), `..` or a NUL would read or write
 * outside that directory, and is refused. `''` is the file named `.env`.
 */
export function assertDestinationName(destination: string): void {
  if (
    typeof destination !== 'string' ||
    /[/\\\0]/.test(destination) ||
    destination.includes('..')
  ) {
    throw new InvalidConfigError(
      `Invalid destination name ${JSON.stringify(destination)}: a destination name may not contain a path separator or '..'`,
      ['destination'],
    );
  }
}
