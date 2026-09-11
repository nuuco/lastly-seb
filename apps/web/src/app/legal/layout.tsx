import Link from 'next/link';

/**
 * 약관·방침 문서의 공통 틀.
 *
 * 로그인 없이 열려야 한다. 구글 OAuth 동의 화면이 이 주소를 검사하고,
 * 약관을 읽으려고 계정을 만들라는 것도 앞뒤가 맞지 않는다.
 * 미들웨어의 PUBLIC_PATHS 에 /legal 이 함께 들어가 있다.
 */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="safe-top mx-auto min-h-dvh max-w-[720px] px-[30px] pb-16 pt-10">
      <Link href="/" className="text-13 font-semibold text-accent-ink underline underline-offset-4">
        Lastly
      </Link>
      <article className="legal mt-6">{children}</article>
    </main>
  );
}
