import { LoginForm } from '@/components/login-form';

type Props = { searchParams: Promise<{ error?: string }> };

export default async function Login({ searchParams }: Props) {
  const { error } = await searchParams;
  return (
    <main className="centered">
      <div className="card">
        <h1>LinkedIn Archive</h1>
        <p className="muted">Sign in with your email. We&rsquo;ll send you a link.</p>
        {error ? <p className="error">{error}</p> : null}
        <LoginForm />
      </div>
    </main>
  );
}
