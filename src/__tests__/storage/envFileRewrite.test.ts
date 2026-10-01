/**
 * How a store rewrites a `.env` file it shares (3.0.0).
 *
 * - The keys a write sets or removes are found where dotenv finds them — one
 *   key per line, as the stores write, but also a hand-written `KEY: value`,
 *   `export KEY=`, a duplicate, CRLF line ends, and a multi-line quoted value
 *   whose body looks like another key. Every other key keeps its value.
 * - The file is never left readable by others: a new file is `0600`, an
 *   existing one is narrowed to its owner's bits, never widened.
 * - A value no quoting reads back unchanged, or one with a line break, is
 *   refused naming its key, and the file is left as it was.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as dotenv from 'dotenv';
import { StorageError } from '../../errors/StoreErrors';
import { rewriteEnvKeys } from '../../storage/envFile';
import { AbapSessionStore } from '../../stores/abap/AbapSessionStore';
import { EnvDestinationStore } from '../../stores/destination/EnvDestinationStore';

const onWindows = process.platform === 'win32';

describe('rewriting a shared .env file', () => {
  let dir: string;
  let file: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rewrite-'));
    file = path.join(dir, 'D.env');
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  describe('finds a key where dotenv finds it', () => {
    const cases: Record<string, string> = {
      'colon syntax': 'SAP_URL=https://u\nSAP_JWT_TOKEN: old\n',
      'a multi-line quoted value whose body looks like the key':
        'SAP_SAML_NOTE="line1\nSAP_JWT_TOKEN=inside\nend"\nSAP_URL=https://u\n',
      export: 'export SAP_JWT_TOKEN=old\nSAP_URL=https://u\n',
      duplicate:
        'SAP_JWT_TOKEN=first\nSAP_URL=https://u\nSAP_JWT_TOKEN=second\n',
      CRLF: 'SAP_URL=https://u\r\nSAP_JWT_TOKEN=old\r\nSAP_PASSWORD=pw\r\n',
      'a comment line after the key':
        'SAP_JWT_TOKEN=old\n# keep this comment\nSAP_URL=https://u\n',
    };

    it.each(Object.entries(cases))(
      '%s: set, then removed',
      async (_n, content) => {
        fs.writeFileSync(file, content);
        const others = dotenv.parse(content);
        delete others.SAP_JWT_TOKEN;
        const store = new AbapSessionStore(dir);

        await store.saveSession('D', { authorizationToken: 'NEW' });
        expect(await store.loadSession('D')).toEqual({
          authorizationToken: 'NEW',
        });
        const afterSet = dotenv.parse(fs.readFileSync(file, 'utf8'));
        expect(afterSet).toEqual({ ...others, SAP_JWT_TOKEN: 'NEW' });

        await store.deleteSession('D');
        expect(await store.loadSession('D')).toBeNull();
        expect(dotenv.parse(fs.readFileSync(file, 'utf8'))).toEqual(others);
      },
    );

    it('keeps a comment line that follows a rewritten key', () => {
      fs.writeFileSync(
        file,
        'SAP_JWT_TOKEN=old\n# keep this comment\nSAP_URL=u\n',
      );
      rewriteEnvKeys(file, { SAP_JWT_TOKEN: 'new' });
      expect(fs.readFileSync(file, 'utf8')).toBe(
        'SAP_JWT_TOKEN=new\n# keep this comment\nSAP_URL=u\n',
      );
    });

    it('keeps CRLF line ends of the lines it does not rewrite', () => {
      fs.writeFileSync(
        file,
        'SAP_URL=u\r\nSAP_JWT_TOKEN=old\r\nSAP_PASSWORD=pw\r\n',
      );
      rewriteEnvKeys(file, { SAP_JWT_TOKEN: 'new' });
      expect(fs.readFileSync(file, 'utf8')).toBe(
        'SAP_URL=u\r\nSAP_JWT_TOKEN=new\r\nSAP_PASSWORD=pw\r\n',
      );
    });
  });

  it('refuses a rewrite that would not read back as written, leaving the file', () => {
    fs.writeFileSync(file, 'SAP_URL=u\n');
    // a key name dotenv cannot parse: written, it would not read back
    const failure = (() => {
      try {
        rewriteEnvKeys(file, { 'NOT A KEY': 'v' });
      } catch (e) {
        return e;
      }
    })();
    expect(failure).toBeInstanceOf(StorageError);
    expect((failure as Error).message).toContain('D.env');
    expect((failure as Error).message).toContain('NOT A KEY');
    expect((failure as Error).message).toContain('one key per line');
    expect(fs.readFileSync(file, 'utf8')).toBe('SAP_URL=u\n');
  });

  describe('file mode', () => {
    const mode = () => fs.statSync(file).mode & 0o777;

    (onWindows ? it.skip : it)(
      'creates a new file 0600 (skipped on Windows: no POSIX modes)',
      () => {
        rewriteEnvKeys(file, { SAP_JWT_TOKEN: 't' });
        expect(mode()).toBe(0o600);
      },
    );

    (onWindows ? it.skip : it)(
      'narrows an existing 0644 or 0640 file to 0600 (skipped on Windows: no POSIX modes)',
      () => {
        for (const start of [0o644, 0o640, 0o666]) {
          fs.writeFileSync(file, 'SAP_URL=u\n');
          fs.chmodSync(file, start);
          rewriteEnvKeys(file, { SAP_JWT_TOKEN: 't' });
          expect(mode()).toBe(0o600);
        }
      },
    );

    (onWindows ? it.skip : it)(
      'never widens: a 0400 file stays 0400 (skipped on Windows: no POSIX modes)',
      () => {
        fs.writeFileSync(file, 'SAP_URL=u\n');
        fs.chmodSync(file, 0o400);
        rewriteEnvKeys(file, { SAP_JWT_TOKEN: 't' });
        expect(mode()).toBe(0o400);
      },
    );

    it("never touches another writer's temporary file (2.x writes <file>.tmp)", () => {
      fs.writeFileSync(file, 'SAP_URL=u\n');
      fs.writeFileSync(`${file}.tmp`, 'IN_FLIGHT=other writer\n');
      rewriteEnvKeys(file, { SAP_JWT_TOKEN: 't' });
      expect(fs.readFileSync(`${file}.tmp`, 'utf8')).toBe(
        'IN_FLIGHT=other writer\n',
      );
      expect(fs.readFileSync(file, 'utf8')).toBe(
        'SAP_URL=u\nSAP_JWT_TOKEN=t\n',
      );
    });

    it('leaves no temporary file behind', () => {
      rewriteEnvKeys(file, { SAP_JWT_TOKEN: 't' });
      rewriteEnvKeys(file, { SAP_URL: 'u' });
      expect(fs.readdirSync(dir).filter((f) => f.endsWith('.tmp'))).toEqual([]);
    });
  });

  describe('values that cannot be written', () => {
    const store = () => new EnvDestinationStore(dir);

    it.each([
      ['a line feed', 'a\nb'],
      ['a carriage return', 'a\rb'],
    ])(
      'a value with %s is refused naming the key, nothing written',
      async (_n, value) => {
        fs.writeFileSync(file, 'SAP_URL=u\n');
        const failure = await store()
          .setDestination('D', { password: value })
          .catch((e: unknown) => e);
        expect(failure).toBeInstanceOf(StorageError);
        expect((failure as Error).message).toContain('SAP_PASSWORD');
        expect((failure as Error).message).toContain('line break');
        expect((failure as Error).message).not.toContain(value);
        expect(fs.readFileSync(file, 'utf8')).toBe('SAP_URL=u\n');
      },
    );

    it('a value with \', ` and " together is refused naming the key', async () => {
      const failure = await store()
        .setDestination('D', { password: `a'b"c\`d` })
        .catch((e: unknown) => e);
      expect(failure).toBeInstanceOf(StorageError);
      expect((failure as Error).message).toContain('SAP_PASSWORD');
      expect(fs.existsSync(file)).toBe(false);
    });
  });
});
