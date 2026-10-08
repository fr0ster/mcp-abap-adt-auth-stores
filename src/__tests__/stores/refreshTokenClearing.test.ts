/**
 * `refreshToken: ''` is THE clearing operation for the stored refresh token.
 *
 * A session write with `refreshToken: ''` removes the stored refresh token; a
 * write with `refreshToken` omitted (or `undefined`) keeps the one stored. The
 * consumer — the broker, after a provider answered a token with no refresh
 * token where one was held — relies on exactly this, in every session store.
 * A file store is reloaded through a new instance, so what is checked is what
 * the file holds, not what one instance remembers.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { ISessionStore } from '@mcp-abap-adt/interfaces-auth-broker';
import { AbapSessionStore } from '../../stores/abap/AbapSessionStore';
import { SafeAbapSessionStore } from '../../stores/abap/SafeAbapSessionStore';
import { EnvFileSessionStore } from '../../stores/env/EnvFileSessionStore';
import { SafeXsuaaSessionStore } from '../../stores/xsuaa/SafeXsuaaSessionStore';
import { XsuaaSessionStore } from '../../stores/xsuaa/XsuaaSessionStore';

interface Variant {
  name: string;
  /** The store the writes go through. */
  make: (dir: string) => ISessionStore;
  /** What a reload reads: a new instance on the same files, or the same store. */
  reload: (dir: string, store: ISessionStore) => ISessionStore;
}

const VARIANTS: Variant[] = [
  {
    name: 'AbapSessionStore',
    make: (dir) => new AbapSessionStore(dir),
    reload: (dir) => new AbapSessionStore(dir),
  },
  {
    name: 'XsuaaSessionStore',
    make: (dir) => new XsuaaSessionStore(dir),
    reload: (dir) => new XsuaaSessionStore(dir),
  },
  {
    name: 'EnvFileSessionStore',
    make: (dir) => new EnvFileSessionStore(path.join(dir, 'D.env')),
    reload: (dir) => new EnvFileSessionStore(path.join(dir, 'D.env')),
  },
  {
    name: 'SafeAbapSessionStore',
    make: () => new SafeAbapSessionStore(),
    reload: (_dir, store) => store,
  },
  {
    name: 'SafeXsuaaSessionStore',
    make: () => new SafeXsuaaSessionStore(),
    reload: (_dir, store) => store,
  },
];

describe.each(VARIANTS)('$name: clearing the refresh token', (variant) => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'refresh-clearing-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  async function storedWithRefresh(): Promise<ISessionStore> {
    const store = variant.make(dir);
    await store.saveSession('D', {
      authorizationToken: 'access-1',
      refreshToken: 'refresh-R',
    });
    const before = await variant.reload(dir, store).loadSession('D');
    expect(before?.refreshToken).toBe('refresh-R');
    return store;
  }

  it("refreshToken '' with a new access token removes the stored refresh token", async () => {
    const store = await storedWithRefresh();
    await store.saveSession('D', {
      authorizationToken: 'access-2',
      refreshToken: '',
    });
    const after = await variant.reload(dir, store).loadSession('D');
    expect(after?.authorizationToken).toBe('access-2');
    expect(after).not.toHaveProperty('refreshToken');
  });

  it('refreshToken omitted with a new access token keeps the stored one', async () => {
    const store = await storedWithRefresh();
    await store.saveSession('D', { authorizationToken: 'access-2' });
    const after = await variant.reload(dir, store).loadSession('D');
    expect(after?.authorizationToken).toBe('access-2');
    expect(after?.refreshToken).toBe('refresh-R');
  });

  it('refreshToken undefined with a new access token keeps the stored one', async () => {
    const store = await storedWithRefresh();
    await store.saveSession('D', {
      authorizationToken: 'access-2',
      refreshToken: undefined,
    });
    const after = await variant.reload(dir, store).loadSession('D');
    expect(after?.authorizationToken).toBe('access-2');
    expect(after?.refreshToken).toBe('refresh-R');
  });
});
