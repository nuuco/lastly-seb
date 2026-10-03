import { ItemsRepository } from './items.repository';

/** findActiveById 만 지운 항목을 거른다. findById 는 되살리기에 쓰이므로 거르면 안 된다. */
function buildRepository() {
  const calls: Array<[string, unknown[]]> = [];
  const chain: Record<string, unknown> = {};
  for (const method of ['select', 'eq']) {
    chain[method] = (...args: unknown[]) => {
      calls.push([method, args]);
      return chain;
    };
  }
  chain.maybeSingle = () => Promise.resolve({ data: { id: 'item-1' }, error: null });

  const supabase = { admin: { from: jest.fn().mockReturnValue(chain) } };
  return { repo: new ItemsRepository(supabase as never), calls };
}

const filtersActive = (calls: Array<[string, unknown[]]>) =>
  calls.some(([m, args]) => m === 'eq' && args[0] === 'status' && args[1] === 'active');

describe('ItemsRepository — id 로 찾기', () => {
  it('findActiveById 는 쓰고 있는 항목만 찾는다', async () => {
    const { repo, calls } = buildRepository();
    await repo.findActiveById('user-1', 'item-1');
    expect(filtersActive(calls)).toBe(true);
  });

  it('findById 는 지운 항목도 찾는다', async () => {
    const { repo, calls } = buildRepository();
    await repo.findById('user-1', 'item-1');
    expect(filtersActive(calls)).toBe(false);
  });
});
