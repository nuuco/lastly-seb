import { LogsRepository } from './logs.repository';

/**
 * 지운 항목(archived)의 기록이 달력·메모 검색·주간 완료 수에 섞이지 않는지 본다.
 * Supabase 쿼리 빌더를 체인 그대로 흉내 내고, 걸린 조건만 확인한다.
 */
function buildRepository() {
  const calls: Array<[string, unknown[]]> = [];
  const chain: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'gte', 'lte', 'ilike', 'order', 'limit']) {
    chain[method] = (...args: unknown[]) => {
      calls.push([method, args]);
      return chain;
    };
  }
  // await 하면 빈 결과로 끝난다.
  chain.then = (resolve: (v: unknown) => void) => resolve({ data: [], error: null, count: 0 });

  const supabase = { admin: { from: jest.fn().mockReturnValue(chain) } };
  return { repo: new LogsRepository(supabase as never), calls };
}

const select = (calls: Array<[string, unknown[]]>) => calls.find(([m]) => m === 'select')?.[1][0];
const filtersActiveItems = (calls: Array<[string, unknown[]]>) =>
  calls.some(([m, args]) => m === 'eq' && args[0] === 'items.status' && args[1] === 'active');

describe('LogsRepository — 지운 항목의 기록 제외', () => {
  it('달력(listBetween)은 살아 있는 항목의 기록만 읽는다', async () => {
    const { repo, calls } = buildRepository();
    await repo.listBetween('user-1', '2026-10-01', '2026-10-31');

    expect(select(calls)).toContain('items!inner(');
    expect(filtersActiveItems(calls)).toBe(true);
  });

  it('메모 검색(searchByNote)은 살아 있는 항목의 기록만 읽는다', async () => {
    const { repo, calls } = buildRepository();
    await repo.searchByNote('user-1', '필터');

    expect(select(calls)).toContain('items!inner(');
    expect(filtersActiveItems(calls)).toBe(true);
  });

  it('주간 완료 수(countSince)는 살아 있는 항목의 기록만 센다', async () => {
    const { repo, calls } = buildRepository();
    await repo.countSince('user-1', new Date('2026-09-28T00:00:00'));

    expect(select(calls)).toContain('items!inner(');
    expect(filtersActiveItems(calls)).toBe(true);
  });
});
