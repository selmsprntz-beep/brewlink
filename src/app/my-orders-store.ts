const PREFIX = 'brewlink_orders:';
const TABLE_KEY = 'brewlink_table';
const TABLE_TTL = 4 * 60 * 60 * 1000; // 4 hours


function key(table: string | null): string {
  const tableToken = table?.trim();

  return PREFIX + (tableToken || 'web');
}


function readList(storageKey: string): string[] {
  const saved = localStorage.getItem(storageKey);

  if (!saved) {
    return [];
  }

  const parsed: unknown = JSON.parse(saved);

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed
    .filter(
      (item): item is string =>
        typeof item === 'string' && item.trim().length > 0,
    )
    .map((item) => item.trim());
}


function allOrderKeys(): string[] {
  const keys: string[] = [];

  for (let i = 0; i < localStorage.length; i++) {
    const storageKey = localStorage.key(i);

    if (storageKey && storageKey.startsWith(PREFIX)) {
      keys.push(storageKey);
    }
  }

  return keys;
}


export function readMyOrders(table: string | null): string[] {
  try {
    const preferred = key(table);

    const keys = [
      preferred,
      ...allOrderKeys().filter((storageKey) => storageKey !== preferred),
    ];

    const merged: string[] = [];

    for (const storageKey of keys) {
      try {
        merged.push(...readList(storageKey));
      } catch (error) {
        console.error('Unable to read saved orders:', storageKey, error);
      }
    }

    return [...new Set(merged)];
  } catch (error) {
    console.error('Unable to read saved orders:', error);
    return [];
  }
}

/**
 * Save order numbers without duplicates.
 */
export function saveMyOrders(
  table: string | null,
  list: string[],
): void {
  try {
    const validOrders = list
      .filter(
        (item): item is string =>
          typeof item === 'string' && item.trim().length > 0,
      )
      .map((item) => item.trim());

    const uniqueOrders = [...new Set(validOrders)];

    localStorage.setItem(key(table), JSON.stringify(uniqueOrders));
  } catch (error) {
    console.error('Unable to save orders:', error);
  }
}


export function addMyOrder(
  table: string | null,
  orderNumber: string,
): void {
  const number = orderNumber.trim();

  if (!number) {
    return;
  }

  let existingOrders: string[] = [];

  try {
    // Only this key's own list, so each key keeps its own orders.
    existingOrders = readList(key(table));
  } catch (error) {
    console.error('Unable to read saved orders:', error);
  }

  if (existingOrders.includes(number)) {
    return;
  }

  saveMyOrders(table, [number, ...existingOrders]);
}


export function forgetTable(): void {
  try {
    localStorage.removeItem(TABLE_KEY);
  } catch (error) {
    console.error('Unable to clear table session:', error);
  }
}

export function currentTable(
  urlToken: string | null,
): string | null {
  try {
    const token = urlToken?.trim();

    if (token) {
      localStorage.setItem(
        TABLE_KEY,
        JSON.stringify({
          token,
          at: Date.now(),
        }),
      );

      return token;
    }

    const raw = localStorage.getItem(TABLE_KEY);

    if (!raw) {
      return null;
    }

    const saved: unknown = JSON.parse(raw);

    if (
      saved === null ||
      typeof saved !== 'object' ||
      !('token' in saved) ||
      !('at' in saved)
    ) {
      localStorage.removeItem(TABLE_KEY);
      return null;
    }

    const session = saved as {
      token: unknown;
      at: unknown;
    };

    const now = Date.now();

    const validSession =
      typeof session.token === 'string' &&
      session.token.trim().length > 0 &&
      typeof session.at === 'number' &&
      Number.isFinite(session.at) &&
      session.at <= now &&
      now - session.at < TABLE_TTL;

    if (validSession) {
      return session.token as string;
    }

    localStorage.removeItem(TABLE_KEY);
  } catch (error) {
    console.error('Unable to restore table session:', error);
  }

  return null;
}