import "@/styles/hjemmebane.css";
import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { toast } from "sonner";
import PasswordStrengthIndicator, { getPasswordScore } from "@/components/PasswordStrengthIndicator";
import { HbCard } from "@/components/hjemmebane/HbCard";
import { HbButton } from "@/components/hjemmebane/HbButton";
import { HbRaadgiverPortraetter } from "@/components/hjemmebane/HbRaadgiverPortraetter";

/* Hb-felter (trin 10-12): ingen HbInput findes i huset, så klasserne står
   her ét sted. Radius og hairline er Hb-tokens; fokus-ringen er evergreen
   som HbButton. Fælles ydre ramme for alle fem tilstande: HB_RAMME. */
const HB_RAMME = "theme-hjemmebane min-h-screen bg-hb-paper font-body text-hb-ink antialiased px-4 py-12";
const HB_EYEBROW = "text-sm font-medium uppercase tracking-widest text-hb-rust";
const HB_H1 = "font-editorial text-3xl font-medium leading-tight text-hb-ink md:text-4xl";
const HB_LABEL = "mb-1.5 block text-xs font-medium text-hb-ink-soft";
const HB_INPUT =
  "w-full rounded-hb border border-hb-line bg-hb-surface px-4 py-3 text-[15px] text-hb-ink placeholder:text-hb-ink-soft/60 focus:outline-none focus:ring-2 focus:ring-hb-evergreen/40";
const HB_INPUT_LAAST = "bg-hb-paper text-hb-ink-soft cursor-default";

const GoogleIkon = () => (
  <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden>
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
);

const Auth = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const inviteToken = searchParams.get("invite") || "";
  const returnUrl = searchParams.get("returnUrl") || "";
  const modeParam = searchParams.get("mode");
  // Signup is only allowed with an invite token OR explicit mode=signup (advisor invitations)
  const hasInvitation = !!inviteToken || modeParam === "signup";
  const [isLogin, setIsLogin] = useState(!hasInvitation);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [companyName] = useState("");
  const [showReset, setShowReset] = useState(false);
  const [signupResult, setSignupResult] = useState<"auto" | "confirm" | null>(null);
  const [signupEmail, setSignupEmail] = useState("");
  /* Adgangsrejsen trin 1-2 (2/9): opslaget giver nu også invitationens
     e-mail og companies.contact_person (migration 20260902190000).
     `kontakt` er NULL for alt der ikke er Monday-oprettet efter 2/9 —
     fladen skal tåle det. */
  const [inviteCompany, setInviteCompany] = useState<{
    name: string;
    logo_url: string | null;
    email?: string | null;
    kontakt?: string | null;
  } | null>(null);
  /* Mailen er låst når den kommer fra invitationen: det er den adresse vi
     lige har sendt til, og skriver medlemmet en anden, matcher triggeren
     (handle_new_user) ingen invitation og afviser signup med P0001. */
  const [emailLaast, setEmailLaast] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  // Redirect after successful auth
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_IN" && session) {
        if (returnUrl && returnUrl.startsWith("https://")) {
          window.location.href = returnUrl;
          return;
        }

        // Check if user is a legat user and redirect accordingly
        const { data: legatRow } = await (supabase as any)
          .from("legat_enrollments")
          .select("id")
          .eq("user_id", session.user.id)
          .eq("status", "active")
          .maybeSingle();
        if (legatRow) {
          navigate("/legat", { replace: true });
          return;
        }

        navigate(returnUrl || "/", { replace: true });
      }
    });
    return () => subscription.unsubscribe();
  }, [returnUrl, navigate]);

  // If already logged in and returnUrl is set, redirect immediately
  useEffect(() => {
    if (!returnUrl) return;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session && returnUrl.startsWith("https://")) {
        window.location.href = returnUrl;
      }
    });
  }, [returnUrl]);

  // Look up company info from invite token — og forudfyld mail + navn.
  // Svarer opslaget null (ukendt eller brugt token), sker intet nyt her:
  // felterne står tomme og redigerbare som før, og triggeren afgør.
  useEffect(() => {
    if (!inviteToken) return;
    supabase
      .rpc("lookup_invite_company_info", { invite_token: inviteToken })
      .then(({ data }) => {
        if (data && typeof data === "object" && (data as any).name) {
          const info = data as { name: string; logo_url: string | null; email?: string | null; kontakt?: string | null };
          setInviteCompany(info);
          const invitationsMail = (info.email ?? "").trim().toLowerCase();
          if (invitationsMail) {
            setEmail(invitationsMail);
            setEmailLaast(true);
          }
          // Navnet forudfyldes men låses IKKE: det kan være stavet forkert i
          // Monday, og det er personens eget. Null → tomt og redigerbart.
          const kontakt = (info.kontakt ?? "").trim();
          if (kontakt) setFullName((nuvaerende) => nuvaerende || kontakt);
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
    // company_name i metadata bruges kun af triggeren når invitationen
    // ingen company_id har (navngiver en NY virksomhed). Med token er
    // virksomheden kendt, så feltet udgår; rådgivervejen (mode=signup uden
    // token) beholder det som før.
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: inviteToken
          ? { full_name: fullName, invite_token: inviteToken }
          : { full_name: fullName, company_name: companyName },
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
    // BEVIDST URØRT (2/9): tokenet ligger kun i redirect_uri, ikke i
    // user-metadata, så triggeren falder til e-mail-match — den låste mail
    // på formen ovenfor hjælper ikke her. Hvad Lovables OAuth-lag lægger i
    // raw_user_meta_data er ikke målt. Eget trin.
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

  /* ── NULSTIL ADGANGSKODE — Hjemmebane (trin 10-12, anden del). Adfærd
     som før: handleReset sender Supabase-linket til /reset-password og
     toaster svaret. Én kort tilstand: eyebrow, overskrift, én linje, ét
     felt, én knap — og vejen tilbage. */
  if (showReset) {
    return (
      <div className={HB_RAMME}>
        <div className="mx-auto max-w-md space-y-8">
          <div className="space-y-3 text-center">
            <p className={HB_EYEBROW}>The Boardroom</p>
            <h1 className={HB_H1}>Nulstil adgangskode</h1>
            <p className="text-hb-ink-soft">Skriv din e-mail, så sender vi dig et link til at vælge en ny.</p>
          </div>
          <HbCard className="p-6 md:p-8">
            <form onSubmit={handleReset} className="space-y-4">
              <div>
                <label className={HB_LABEL}>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className={HB_INPUT}
                  placeholder="din@email.dk"
                />
              </div>
              <HbButton type="submit" disabled={loading} className="w-full">
                {loading ? "Sender..." : "Send link"}
              </HbButton>
              <div className="pt-1 text-center">
                <button
                  type="button"
                  onClick={() => setShowReset(false)}
                  className="text-sm text-hb-ink-soft transition-colors hover:text-hb-ink"
                >
                  Tilbage til login
                </button>
              </div>
            </form>
          </HbCard>
        </div>
      </div>
    );
  }

  /* ── EFTER SIGNUP — Hjemmebane. To korte tilstande uden kort: «Konto
     oprettet» (auto-confirm er slået til, §3 — onAuthStateChange sender
     videre om et øjeblik) og «Tjek din mail» (kun hvis bekræftelsen
     skulle blive slået til igen). Adfærd som før: «Tilbage til login»
     nulstiller resultatet og skifter til login. */
  if (signupResult) {
    return (
      <div className={HB_RAMME}>
        <div className="mx-auto max-w-md space-y-8">
          <div className="space-y-3 text-center">
            <p className={HB_EYEBROW}>The Boardroom</p>
            {signupResult === "auto" ? (
              <>
                <h1 className={HB_H1}>Konto oprettet</h1>
                <p className="text-hb-ink-soft">Et øjeblik — vi logger dig ind.</p>
              </>
            ) : (
              <>
                <h1 className={HB_H1}>Tjek din mail</h1>
                <p className="text-hb-ink-soft">
                  Vi har sendt en bekræftelsesmail til <span className="text-hb-ink">{signupEmail}</span>. Bekræft din konto via linket, så er du inde.
                </p>
                <p className="text-sm text-hb-ink-soft">Kan du ikke se den? Kig i spam, eller prøv igen om et øjeblik.</p>
              </>
            )}
          </div>
          {signupResult === "confirm" && (
            <div className="text-center">
              <HbButton
                type="button"
                variant="secondary"
                onClick={() => { setSignupResult(null); setIsLogin(true); }}
              >
                Tilbage til login
              </HbButton>
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ── SIGNUP — Hjemmebane, delt skærm (docs/indgangen-overhaling.md §7.5,
     trin 10-12).

     INGEN GOOGLE-KNAP HER (Jonas 2/9 nat, målt i recon-adgangsruten §5d):
     Google-vejen bærer ikke invitationstokenet i metadata — det ligger
     kun i redirect_uri, og triggeren falder tilbage til e-mail-match.
     Vælger man en Google-konto med en anden adresse end invitationens,
     afvises signup med P0001. Vi låser mailfeltet omhyggeligt og skal
     ikke tilbyde en vej udenom lige ved siden af. Google bliver KUN på
     login; at KOBLE en Google-konto på en eksisterende konto bagefter er
     et selvstændigt stykke (kontoindstilling), ikke dette.

     Formularens ADFÆRD er ordret som før: navn forudfyldt fra invitationen
     og redigerbart; mail forudfyldt og LÅST når invitationen bærer den
     (readOnly + aria-readonly + hint), ellers redigerbar; adgangskode
     minLength 8 + styrkeindikator; «Har du allerede en konto? Log ind» /
     «Kun adgang via invitation». Kun udtrykket er nyt.

     DOM-orden: kontekst-spalten (virksomhed, portrætter, linjen) står
     FØRST, så den ligger ØVERST på mobil — man ser hvem der inviterer,
     før man taster. På md+ flyttes den til HØJRE med md:order-2.

     Uden invitation (ukendt/brugt token, eller mode=signup fra rådgiver-
     vejen): intet virksomhedsnavn — spalten viser eyebrow, portrætterne
     og linjen alene. Ingen «Du er inviteret til …» uden en virksomhed. */
  if (!isLogin) {
    const mailLaast = emailLaast;
    return (
      <div className={HB_RAMME}>
        <div className="mx-auto max-w-5xl">
          <div className="grid gap-10 md:grid-cols-2 md:items-start md:gap-16">
            <aside className="text-center md:order-2 md:pt-10 md:text-left">
              <p className="text-sm font-medium uppercase tracking-widest text-hb-rust">The Boardroom</p>
              {inviteCompany ? (
                <>
                  {inviteCompany.logo_url && (
                    <img
                      src={inviteCompany.logo_url}
                      alt={inviteCompany.name}
                      className="mx-auto mt-5 h-12 w-12 rounded-hb border border-hb-line object-cover md:mx-0"
                    />
                  )}
                  <h2 className="mt-4 font-editorial text-3xl font-medium leading-tight text-hb-ink md:text-4xl">
                    Du er inviteret til {inviteCompany.name}
                  </h2>
                </>
              ) : null}
              <HbRaadgiverPortraetter className="mt-8 md:justify-start" />
              <p className="mx-auto mt-6 max-w-sm text-base leading-relaxed text-hb-ink-soft md:mx-0">
                To rådgivere, der følger din virksomhed tæt — og et sted, hvor dine tal bliver til beslutninger.
              </p>
            </aside>

            <div className="md:order-1">
              <h1 className="font-editorial text-3xl font-medium leading-tight text-hb-ink md:text-4xl">Opret din konto</h1>
              <HbCard className="mt-6 p-6 md:p-8">
                <form onSubmit={handleSignup} className="space-y-4">
                  <div>
                    <label className={HB_LABEL}>Fulde navn</label>
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      required
                      className={HB_INPUT}
                      placeholder="Dit fulde navn"
                    />
                  </div>
                  <div>
                    <label className={HB_LABEL}>Email</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      // Låst kun når invitationen bærer en mail — samme regel som før.
                      readOnly={mailLaast}
                      aria-readonly={mailLaast}
                      className={`${HB_INPUT} ${mailLaast ? HB_INPUT_LAAST : ""}`}
                      placeholder="din@email.dk"
                    />
                    {mailLaast && (
                      <p className="mt-1.5 text-xs text-hb-ink-soft">Invitationen er sendt til denne adresse.</p>
                    )}
                  </div>
                  <div>
                    <label className={HB_LABEL}>Adgangskode</label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={8}
                      className={HB_INPUT}
                      placeholder="••••••••"
                    />
                  </div>

                  <PasswordStrengthIndicator password={password} />

                  <HbButton type="submit" disabled={loading} className="w-full">
                    {loading ? "Vent..." : "Opret konto"}
                  </HbButton>

                  <div className="pt-1 text-center">
                    {hasInvitation ? (
                      <button
                        type="button"
                        onClick={() => { setIsLogin(true); setSignupResult(null); }}
                        className="text-sm text-hb-ink-soft transition-colors hover:text-hb-ink"
                      >
                        Har du allerede en konto? Log ind
                      </button>
                    ) : (
                      <span className="text-sm text-hb-ink-soft">Kun adgang via invitation</span>
                    )}
                  </div>
                </form>
              </HbCard>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ── LOGIN — Hjemmebane (trin 10-12, anden del). Jonas' retning: login
     ses hver uge og skal være ROLIG og hurtig — ingen delt skærm, ingen
     portrætter, ingen citater. Formularen, godt sat, med luft.

     Adfærd ordret som før: e-mail + adgangskode (minLength 8) → handleLogin,
     som toaster Supabases fejlbesked; Google-knappen (handleGoogleLogin —
     bliver HER, ikke på signup, se ovenfor); «Glemt adgangskode?» →
     nulstil-tilstanden; skift til signup KUN når det er tilladt i dag
     (hasInvitation: token eller mode=signup), ellers «Kun adgang via
     invitation».

     Det gamle login-træ bar signup-grene (!isLogin: navnefelt, låst mail
     + hint, styrkeindikator, «Opret konto»-knap, «Opret med Google»-tekst,
     «Har du allerede en konto?»-tekst). De blev ikke nået efter signups
     egen return (#549) og er fjernet her — signup bor alene ovenfor. */
  return (
    <div className={HB_RAMME}>
      <div className="mx-auto max-w-md space-y-8">
        <div className="space-y-3 text-center">
          <p className={HB_EYEBROW}>The Boardroom</p>
          <h1 className={HB_H1}>Log ind</h1>
        </div>
        <HbCard className="p-6 md:p-8">
          <HbButton
            type="button"
            variant="secondary"
            onClick={handleGoogleLogin}
            disabled={googleLoading || loading}
            className="w-full"
          >
            {googleLoading ? "Vent..." : (<><GoogleIkon /> Log ind med Google</>)}
          </HbButton>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-hb-line" /></div>
            <div className="relative flex justify-center text-xs"><span className="bg-hb-surface px-2 text-hb-ink-soft">eller</span></div>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className={HB_LABEL}>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className={HB_INPUT}
                placeholder="din@email.dk"
              />
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-xs font-medium text-hb-ink-soft">Adgangskode</label>
                <button
                  type="button"
                  onClick={() => setShowReset(true)}
                  className="text-xs text-hb-ink-soft transition-colors hover:text-hb-ink"
                >
                  Glemt adgangskode?
                </button>
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className={HB_INPUT}
                placeholder="••••••••"
              />
            </div>

            <HbButton type="submit" disabled={loading} className="w-full">
              {loading ? "Vent..." : "Log ind"}
            </HbButton>

            <div className="pt-1 text-center">
              {hasInvitation ? (
                <button
                  type="button"
                  onClick={() => { setIsLogin(false); setSignupResult(null); }}
                  className="text-sm text-hb-ink-soft transition-colors hover:text-hb-ink"
                >
                  Har du ikke en konto? Opret
                </button>
              ) : (
                <span className="text-sm text-hb-ink-soft">Kun adgang via invitation</span>
              )}
            </div>
          </form>
        </HbCard>
      </div>
    </div>
  );
};

export default Auth;
