import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { toast } from "sonner";
import { Mail, Lock, User, LogIn, UserPlus, CheckCircle } from "lucide-react";
import { APP_BRANDING } from "@/lib/appConfig";
import PasswordStrengthIndicator, { getPasswordScore } from "@/components/PasswordStrengthIndicator";
import { getInitials } from "@/lib/uiUtils";
import topixIconGreen from "@/assets/topix-icon-green.png";
import topixIconWhite from "@/assets/topix-icon-white.png";

const Auth = () => {
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get("invite") || "";
  const [isLogin, setIsLogin] = useState(searchParams.get("mode") !== "signup");
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [companyName] = useState("");
  const [showReset, setShowReset] = useState(false);
  const [signupResult, setSignupResult] = useState<"auto" | "confirm" | null>(null);
  const [signupEmail, setSignupEmail] = useState("");
  const [inviteCompany, setInviteCompany] = useState<{ name: string; logo_url: string | null } | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);

  // Look up company info from invite token
  useEffect(() => {
    if (!inviteToken) return;
    supabase
      .rpc("lookup_invite_company_info", { invite_token: inviteToken })
      .then(({ data }) => {
        if (data && typeof data === "object" && (data as any).name) {
          setInviteCompany(data as { name: string; logo_url: string | null });
        }
      });
  }, [inviteToken]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast.error(error.message);
    }
    setLoading(false);
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      toast.error("Indtast dit fulde navn");
      return;
    }
    if (getPasswordScore(password) < 2) {
      toast.error("Vælg en stærkere adgangskode");
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { full_name: fullName, company_name: companyName, ...(inviteToken ? { invite_token: inviteToken } : {}) },
      },
    });
    if (error) {
      toast.error(error.message);
    } else {
      setSignupEmail(email);
      setSignupResult(data.session ? "auto" : "confirm");
    }
    setLoading(false);
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Tjek din email for reset-link");
    }
    setLoading(false);
  };

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    const redirectUri = inviteToken
      ? `${window.location.origin}/auth?invite=${inviteToken}`
      : window.location.origin;
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: redirectUri,
    });
    if (result?.error) {
      toast.error("Google login fejlede: " + (result.error as Error).message);
      setGoogleLoading(false);
    }
  };

  if (showReset) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="h-12 w-12 rounded-xl bg-primary flex items-center justify-center mx-auto mb-4">
              <img src={topixIconWhite} alt="Topix" className="h-7 w-7 object-contain" />
            </div>
            <h1 className="text-xl font-brand font-bold text-foreground">Nulstil adgangskode</h1>
          </div>
          <form onSubmit={handleReset} className="bg-card border border-border shadow-sm rounded-xl p-6 space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full pl-10 pr-3 py-2.5 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="din@email.dk"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {loading ? "Sender..." : "Send reset-link"}
            </button>
            <button type="button" onClick={() => setShowReset(false)} className="w-full text-xs text-muted-foreground hover:text-foreground">
              Tilbage til login
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (signupResult) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            {inviteCompany ? (
              <>
                {inviteCompany.logo_url ? (
                  <img
                    src={inviteCompany.logo_url}
                    alt={inviteCompany.name}
                    className="h-12 w-12 rounded-xl object-cover mx-auto mb-4"
                  />
                ) : (
                  <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                    <span className="text-primary font-display font-bold text-lg">
                      {getInitials(inviteCompany.name)}
                    </span>
                  </div>
                )}
                <p className="text-sm text-muted-foreground mt-1">
                  Du er inviteret til {inviteCompany.name}
                </p>
              </>
            ) : (
              <div className="h-12 w-12 rounded-xl bg-primary flex items-center justify-center mx-auto mb-4">
                <img src={topixIconWhite} alt="Topix" className="h-7 w-7 object-contain" />
              </div>
            )}
          </div>

          <div className="bg-card border border-border shadow-sm rounded-xl p-6 text-center space-y-4">
            {signupResult === "auto" ? (
              <>
                <CheckCircle className="h-10 w-10 text-primary mx-auto" />
                <h1 className="text-xl font-display font-bold text-foreground">Konto oprettet</h1>
                <p className="text-sm text-muted-foreground">Vi logger dig ind nu...</p>
              </>
            ) : (
              <>
                <Mail className="h-10 w-10 text-primary mx-auto" />
                <h1 className="text-xl font-display font-bold text-foreground">Tjek din mail</h1>
                <p className="text-sm text-muted-foreground">
                  Vi har sendt en bekræftelsesmail til <strong className="text-foreground">{signupEmail}</strong>. Du skal bekræfte din konto via mailen, før du kan fortsætte.
                </p>
                <p className="text-xs text-muted-foreground">
                  Kan du ikke se mailen? Tjek spam eller prøv igen om et øjeblik.
                </p>
                <button
                  type="button"
                  onClick={() => { setSignupResult(null); setIsLogin(true); }}
                  className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                >
                  Tilbage til login
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          {inviteCompany && !isLogin ? (
            <>
              {inviteCompany.logo_url ? (
                <img
                  src={inviteCompany.logo_url}
                  alt={inviteCompany.name}
                  className="h-12 w-12 rounded-xl object-cover mx-auto mb-4"
                />
              ) : (
                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <span className="text-primary font-display font-bold text-lg">
                    {getInitials(inviteCompany.name)}
                  </span>
                </div>
              )}
              <h1 className="text-xl font-brand font-bold text-foreground">Opret konto</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Du er inviteret til {inviteCompany.name}
              </p>
            </>
          ) : (
            <>
              <div className="h-12 w-12 rounded-xl bg-primary flex items-center justify-center mx-auto mb-4">
                <img src={topixIconWhite} alt="Topix" className="h-7 w-7 object-contain" />
              </div>
              <h1 className="text-xl font-brand font-bold text-foreground">
                {isLogin ? "Log ind på The Boardroom" : "Opret konto"}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                {isLogin ? "Velkommen tilbage" : "Bliv en del af The Boardroom"}
              </p>
            </>
          )}
        </div>

        <div className="bg-card border border-border shadow-sm rounded-xl p-6 space-y-4">
          {/* Google login button */}
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={googleLoading || loading}
            className="w-full inline-flex items-center justify-center gap-3 py-2.5 rounded-lg bg-background border border-border text-sm font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-50"
          >
            {googleLoading ? (
              "Vent..."
            ) : (
              <>
                <svg className="h-4 w-4" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                {isLogin ? "Log ind med Google" : "Opret med Google"}
              </>
            )}
          </button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-card px-2 text-muted-foreground">eller</span>
            </div>
          </div>

        <form onSubmit={isLogin ? handleLogin : handleSignup} className="space-y-4">
          {!isLogin && (
            <>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Fulde navn</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    className="w-full pl-10 pr-3 py-2.5 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                    placeholder="Dit fulde navn"
                  />
                </div>
              </div>
            </>
          )}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full pl-10 pr-3 py-2.5 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                placeholder="din@email.dk"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Adgangskode</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full pl-10 pr-3 py-2.5 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                placeholder="••••••••"
              />
            </div>
          </div>

          {!isLogin && <PasswordStrengthIndicator password={password} />}

          <button
            type="submit"
            disabled={loading}
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {loading ? (
              "Vent..."
            ) : isLogin ? (
              <>
                <LogIn className="h-4 w-4" /> Log ind
              </>
            ) : (
              <>
                <UserPlus className="h-4 w-4" /> Opret konto
              </>
            )}
          </button>

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => { setIsLogin(!isLogin); setSignupResult(null); }}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {isLogin ? "Har du ikke en konto? Opret" : "Har du allerede en konto? Log ind"}
            </button>

            {isLogin && (
              <button
                type="button"
                onClick={() => setShowReset(true)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Glemt kode?
              </button>
            )}
          </div>
        </form>
        </div>
      </div>
    </div>
  );
};

export default Auth;
