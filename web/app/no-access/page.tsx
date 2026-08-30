export default function NoAccess() {
  return (
    <main className="centered">
      <div className="card">
        <h1>No access</h1>
        <p className="muted">
          You are signed in, but this address is not on the archive&rsquo;s member list. Ask a
          member to add you.
        </p>
        <form action="/auth/signout" method="post">
          <button type="submit">Sign out</button>
        </form>
      </div>
    </main>
  );
}
