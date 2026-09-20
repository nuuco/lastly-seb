/**
 * 짧은 조각("청소", "필터")은 여러 항목에 들어가므로 붙이지 않는다.
 */
export function matchKnownUnique(
  name: string | null,
  items: Array<{ id: string; name: string }>,
): string | null {
  if (!name || items.length === 0) return null;
  const trimmed = name.replace(/\s+/g, ' ').trim();
  const exact = items.filter((item) => item.name === trimmed);
  if (exact.length === 1) return exact[0]!.id;
  if (exact.length > 1) return null;

  const contained = items.filter(
    (item) => item.name.includes(trimmed) || trimmed.includes(item.name),
  );
  if (contained.length === 1) return contained[0]!.id;
  return null;
}

/** 정확 일치이거나 유일 포함이면 Gemma 이름 검수를 생략한다. */
export function needsNameReview(
  draftName: string | null,
  items: Array<{ id: string; name: string }>,
): boolean {
  if (!draftName) return true;
  return matchKnownUnique(draftName, items) == null;
}
