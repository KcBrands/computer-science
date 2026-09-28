// Tiny JSON-file order store. Swap for a real database in production.
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';

export function createOrderStore(file) {
  let queue = Promise.resolve();

  async function readAll() {
    try {
      return JSON.parse(await readFile(file, 'utf8'));
    } catch (err) {
      if (err.code === 'ENOENT') return [];
      throw err;
    }
  }

  async function writeAll(orders) {
    await mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    await writeFile(tmp, JSON.stringify(orders, null, 2));
    await rename(tmp, file);
  }

  // Serialize writes so concurrent requests cannot clobber each other.
  function mutate(fn) {
    const run = queue.then(async () => {
      const orders = await readAll();
      const result = fn(orders);
      await writeAll(orders);
      return result;
    });
    queue = run.catch(() => {});
    return run;
  }

  return {
    list: readAll,
    async get(id) {
      return (await readAll()).find((o) => o.id === id) || null;
    },
    add(order) {
      return mutate((orders) => {
        orders.push(order);
        return order;
      });
    },
    update(id, patch) {
      return mutate((orders) => {
        const order = orders.find((o) => o.id === id);
        if (order) Object.assign(order, patch, { updatedAt: new Date().toISOString() });
        return order || null;
      });
    },
  };
}
