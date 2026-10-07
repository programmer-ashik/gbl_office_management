import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { AuthBackdrop } from "../components/AuthBackdrop";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(email, password);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className='auth-shell'>
      <AuthBackdrop />

      <section className='auth-panel'>
        <form className='auth-card' onSubmit={onSubmit}>
          <div className='auth-brand-mark'>
            <img
              src='/gbl-logo.png'
              alt='GBL Enterprise'
              className='auth-logo'
              width={72}
              height={72}
            />
            <div className='auth-brand-copy'>
              <p className='auth-brand-name'>Gobal Enterprise</p>
              <p className='auth-brand-tag'>Office management</p>
            </div>
          </div>

          <div className='auth-card-head'>
            <h1>Sign in</h1>
            <p className='muted'>
              Use the account credentials provided by your administrator.
            </p>
          </div>

          <label>
            Email
            <input
              type='email'
              autoComplete='email'
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              placeholder='gbl@company.com'
            />
          </label>

          <label>
            Password
            <input
              type='password'
              autoComplete='current-password'
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              placeholder='••••••••'
            />
          </label>

          {error ? <p className='form-error'>{error}</p> : null}

          <button type='submit' disabled={submitting} className='bg-[#0F384F]'>
            {submitting ? "Signing in…" : "Sign in"}
          </button>

          <p className='switch-auth muted'>
            Need access? Contact your system administrator.
          </p>
        </form>
      </section>
    </div>
  );
}
