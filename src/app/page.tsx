import { auth, signIn, signOut } from "./auth";

export default async function Home() {
  const session = await auth();
  // Get cookies from next/headers
  let cookieString = '';
  try {
    const { cookies } = await import('next/headers');
    // Get all cookies as a string
    cookieString = cookies().toString();
  } catch {}

  return (
    <div className="container">
      {session?.user ? (
        <div className="auth-container">
          <p>Welcome {session.user.name}!</p>
          <p><strong>Session Cookie:</strong> <code>{cookieString}</code></p>
          <form action={async () => { 'use server'; await signOut(); }}>
            <button className="button button-signout">
              Sign Out
            </button>
          </form>
        </div>
      ) : (
        <form action={async () => { 'use server'; await signIn('google'); }}>
          <button className="button button-signin">
            Sign in with Google
          </button>
        </form>
      )}
    </div>
  );
}
