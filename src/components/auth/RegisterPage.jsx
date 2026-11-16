import { Dog, Lock, Mail, UserPlus, Heart } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { MfaFlow } from "@/components/auth/MfaFlow";
import { MfaScreen } from "@/components/auth/MfaParts";
import { AuthError, AuthLink, GoogleButton, OrDivider, SubmitButton } from "@/components/auth/parts";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { safeReturnTo } from "@/lib/authReturnTo";
import { cn } from "@/lib/utils";

const isAlreadyVerified = (err) => err?.status === 400 && /already verified/i.test(err?.message ?? "");

const ACCOUNT_TYPES = [
  { id: "breeder", label: "Hodowca", hint: "dodaję ogłoszenia", icon: Dog },
  { id: "enthusiast", label: "Użytkownik", hint: "szukam zwierzaka", icon: Heart },
];

/**
 * Rejestracja w jednym kroku: typ konta wybierany na formularzu, po weryfikacji
 * od razu przekierowanie na /profile (bez ekranu onboarding).
 */
export function RegisterPage() {
  const returnTo = safeReturnTo();
  const [accountType, setAccountType] = useState("breeder");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [step, setStep] = useState("form");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [mfaChallenge, setMfaChallenge] = useState(null);

  function finish(token) {
    if (token) base44.auth.setToken(token);
    localStorage.setItem("purre:account_type", accountType);
    const target = returnTo && returnTo !== "/" ? returnTo : "/profile";
    window.location.href = target;
  }

  async function register(e) {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Hasła nie są identyczne");
      return;
    }
    setBusy(true);
    try {
      const result = await base44.auth.register(email, password);
      if (result?.access_token) {
        finish(result.access_token);
        return;
      }
      setStep("otp");
    } catch (err) {
      setError(err.message || "Rejestracja nie powiodła się");
    } finally {
      setBusy(false);
    }
  }

  async function verify(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result = await base44.auth.verifyOtp(email, otpCode);
      if (result?.mfa_required) {
        setMfaChallenge(result);
        return;
      }
      finish(result?.access_token);
    } catch (err) {
      if (isAlreadyVerified(err)) setStep("already_verified");
      else setError(err.message || "Nieprawidłowy kod weryfikacyjny");
      setBusy(false);
    }
  }

  async function resend() {
    setError("");
    try {
      await base44.auth.resendOtp(email);
      toast("Kod wysłany", { description: "Sprawdź skrzynkę — przyszedł nowy kod." });
    } catch (err) {
      if (isAlreadyVerified(err)) setStep("already_verified");
      else setError(err.message || "Nie udało się wysłać kodu ponownie");
    }
  }

  if (mfaChallenge) return <MfaScreen><MfaFlow challenge={mfaChallenge} returnTo={returnTo} /></MfaScreen>;

  if (step === "already_verified") {
    return (
      <AuthLayout icon={UserPlus} title="Załóż konto" subtitle="Dołącz do PURRE PETS">
        <p className="mb-4 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{email}</span> jest już zweryfikowany. Zaloguj się, aby kontynuować.
        </p>
        <AuthLink to="/login" returnTo={returnTo} className="inline-flex h-12 w-full items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90">
          Zaloguj się
        </AuthLink>
      </AuthLayout>
    );
  }

  if (step === "otp") {
    return (
      <AuthLayout icon={UserPlus} title="Załóż konto" subtitle="Dołącz do PURRE PETS">
        <form onSubmit={verify}>
          <p className="mb-4 text-sm text-muted-foreground">
            Wysłaliśmy 6-cyfrowy kod na <span className="font-medium text-foreground">{email}</span>.
          </p>
          <AuthError>{error}</AuthError>
          <div className="mb-6 flex justify-center">
            <InputOTP maxLength={6} value={otpCode} onChange={setOtpCode} autoFocus autoComplete="one-time-code">
              <InputOTPGroup>
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <InputOTPSlot key={i} index={i} />
                ))}
              </InputOTPGroup>
            </InputOTP>
          </div>
          <SubmitButton busy={busy} busyLabel="Weryfikuję..." disabled={busy || otpCode.length < 6}>
            Zweryfikuj
          </SubmitButton>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Nie dostałeś kodu?{" "}
            <button type="button" onClick={resend} className="font-medium text-primary hover:underline">
              Wyślij ponownie
            </button>
          </p>
        </form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout icon={UserPlus} title="Załóż konto" subtitle="Dołącz do PURRE PETS">
      <GoogleButton returnTo={returnTo} onError={setError} />
      <OrDivider />
      <AuthError>{error}</AuthError>

      <div className="mb-4">
        <p className="mb-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Rodzaj konta</p>
        <div className="grid grid-cols-2 gap-2">
          {ACCOUNT_TYPES.map((option) => {
            const Icon = option.icon;
            const selected = accountType === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setAccountType(option.id)}
                aria-pressed={selected}
                className={cn(
                  "flex flex-col items-start gap-1 rounded-xl border px-3 py-2.5 text-left transition",
                  selected ? "border-primary/70 bg-primary/10" : "border-border/70"
                )}
              >
                <Icon className={cn("h-4 w-4", selected ? "text-primary" : "text-muted-foreground")} />
                <span className="text-xs font-semibold">{option.label}</span>
                <span className="text-[10px] text-muted-foreground">{option.hint}</span>
              </button>
            );
          })}
        </div>
      </div>

      <form onSubmit={register} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="register-email">E-mail</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input id="register-email" type="email" autoComplete="email" autoFocus placeholder="ty@example.com" value={email} onChange={(e) => setEmail(e.target.value)} className="h-12 pl-10" disabled={busy} required />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="register-password">Hasło</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input id="register-password" type="password" autoComplete="new-password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} className="h-12 pl-10" disabled={busy} required />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="register-confirm">Powtórz hasło</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input id="register-confirm" type="password" autoComplete="new-password" placeholder="••••••••" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="h-12 pl-10" disabled={busy} required />
          </div>
        </div>
        <SubmitButton busy={busy} busyLabel="Tworzę konto...">
          Załóż konto
        </SubmitButton>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Masz już konto?{" "}
        <AuthLink to="/login" returnTo={returnTo}>
          Zaloguj się
        </AuthLink>
      </p>
    </AuthLayout>
  );
}
