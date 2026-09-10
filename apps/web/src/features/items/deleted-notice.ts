/**
 * 삭제한 항목을 홈으로 넘기는 쪽지.
 *
 * 지운 뒤에도 그 항목의 상세 화면에 머물면 "오늘 했어요" 버튼이 살아 있어
 * 지워진 것을 다시 기록할 수 있다. 그래서 곧바로 홈으로 보내는데,
 * 되돌리기 토스트는 홈에서 떠야 하므로 이름과 id 를 넘겨줄 자리가 필요하다.
 *
 * sessionStorage 를 쓰는 이유: 주소에 남기면 새로고침할 때마다 토스트가
 * 다시 뜨고, 전역 상태로 두기에는 한 번 쓰고 버리는 값이다.
 */
const KEY = 'lastly:deleted-item';

export interface DeletedNotice {
  id: string;
  name: string;
}

export function putDeletedNotice(notice: DeletedNotice): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(notice));
  } catch {
    // 저장이 막힌 브라우저에서는 토스트만 없고 삭제는 정상 동작한다.
  }
}

/** 한 번 읽으면 지운다. 새로고침해도 다시 뜨지 않아야 한다. */
export function takeDeletedNotice(): DeletedNotice | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    return JSON.parse(raw) as DeletedNotice;
  } catch {
    return null;
  }
}
