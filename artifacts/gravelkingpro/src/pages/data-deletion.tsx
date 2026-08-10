import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Clock3, FileText, Mail, ShieldCheck, Trash2 } from "lucide-react";

const deletionEmail = "kevm@gravelkingpro.it.com";
const requestSubject = "GravelKing Pro data deletion request";
const requestBody = `Please delete my GravelKing Pro personal data.

Email or account identifier:
Information to delete (if known):
Additional details (optional):`;
const requestHref = `mailto:${deletionEmail}?subject=${encodeURIComponent(requestSubject)}&body=${encodeURIComponent(requestBody)}`;
const accessSubject = "GravelKing Pro personal data access request";
const accessBody = `Please send me a copy of the personal data GravelKing Pro holds about me.

Email or account identifier:
Information requested:
Additional details (optional):`;
const accessHref = `mailto:${deletionEmail}?subject=${encodeURIComponent(accessSubject)}&body=${encodeURIComponent(accessBody)}`;

/**
 * Public, unauthenticated request page for users and app-store reviewers.
 * Reachable at /data-deletion without signing in.
 * This is intentionally a mailto flow: deletion is reviewed manually rather
 * than performed automatically, including any third-party billing records.
 */
export default function DataDeletionPage() {
  return (
    <Layout>
      <div className="max-w-3xl mx-auto px-2 py-8 sm:px-6 sm:py-16">
        <div className="mb-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-400">
            <Trash2 className="h-3.5 w-3.5" />
            Data deletion request
          </div>
          <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">Delete your GravelKing Pro data</h1>
          <p className="mt-3 max-w-2xl text-muted-foreground leading-relaxed">
            You may ask us to delete personal information associated with your use of GravelKing Pro.
            This public page explains what to send and what happens next; no sign-in is required.
          </p>
        </div>

        <section className="mb-8 rounded-xl border border-border/50 bg-card/50 p-5 sm:p-7">
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <Mail className="h-5 w-5 text-amber-400" />
            Submit a request
          </h2>
          <p className="mt-3 text-muted-foreground leading-relaxed">
            Email us from the address connected to your account or use another identifier that helps us
            locate your records. Do not include payment-card information in your message.
          </p>
          <Button asChild className="mt-5 bg-amber-500 font-semibold text-black hover:bg-amber-600">
            <a href={requestHref}>
              <Mail className="mr-2 h-4 w-4" />
              Email a deletion request
            </a>
          </Button>
          <p className="mt-3 text-sm text-muted-foreground">
            Or email{" "}
            <a className="text-amber-400 underline underline-offset-4" href={`mailto:${deletionEmail}`}>
              {deletionEmail}
            </a>{" "}
            with the subject "{requestSubject}".
          </p>
        </section>

        <section className="mb-8 rounded-xl border border-sky-500/20 bg-sky-500/5 p-5 sm:p-7">
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <FileText className="h-5 w-5 text-sky-400" />
            Request a copy of your data
          </h2>
          <p className="mt-3 text-muted-foreground leading-relaxed">
            You can also ask what personal information we hold about you, request a copy, or ask us to
            correct inaccurate information. Email us from the address connected to your account and
            include the records or correction you are asking about.
          </p>
          <Button asChild variant="outline" className="mt-5 border-sky-400/40 hover:bg-sky-400/10">
            <a href={accessHref}>
              <FileText className="mr-2 h-4 w-4" />
              Request my data
            </a>
          </Button>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold">Information you can request us to delete</h2>
          <ul className="mt-4 space-y-3 text-muted-foreground">
            <li className="flex gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
              <span>Account profile and session information, including your email address and account identifiers.</span>
            </li>
            <li className="flex gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
              <span>Emails submitted through contact, waitlist, free-tool, or enterprise inquiry forms.</span>
            </li>
            <li className="flex gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
              <span>Uploaded audio and processing records that remain in our systems, subject to the limits below.</span>
            </li>
            <li className="flex gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
              <span>Song drafts and library records associated with the identifier you provide.</span>
            </li>
          </ul>
        </section>

        <section className="mb-8 rounded-xl border border-border/50 bg-secondary/20 p-5 sm:p-7">
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <Clock3 className="h-5 w-5 text-sky-400" />
            What happens after you ask
          </h2>
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-muted-foreground">
            <li>We confirm that we can match the request to the relevant account or record.</li>
            <li>We delete the applicable GravelKing Pro records and active sessions.</li>
            <li>We reply when the request is completed or if we need more information to identify the records.</li>
          </ol>
          <p className="mt-4 text-muted-foreground leading-relaxed">
            We aim to respond within 30 days. If a request needs more time or cannot be fully completed,
            we will explain why in our response.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold">Limits and third-party records</h2>
          <div className="mt-4 space-y-3 text-muted-foreground leading-relaxed">
            <p>
              Some information may need to be retained where required for fraud prevention, dispute
              handling, legal obligations, or to protect the integrity of an IP certification record.
            </p>
            <p>
              Stripe processes payment information. We do not receive or store full payment-card
              numbers. Subscription, invoice, and payment records held by Stripe are subject to
              Stripe's own retention and deletion procedures.
            </p>
            <p>
              A certification record may have a backup in Google Cloud Firestore to preserve a
              verifiable chain of custody. We will assess deletion requests for these records
              individually and explain any record that must be retained.
            </p>
          </div>
        </section>

        <section className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-5 sm:p-7">
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <ShieldCheck className="h-5 w-5 text-emerald-400" />
            Transfer security
          </h2>
          <p className="mt-3 text-muted-foreground leading-relaxed">
            Data sent between your browser or app and GravelKing Pro uses HTTPS/TLS where supported.
            Our connections to providers such as Stripe and Google Cloud also use their HTTPS/TLS
            interfaces where supported. This is transport encryption, not end-to-end encryption:
            audio is processed by our service, and temporary local processing is not a network transfer.
          </p>
        </section>

        <p className="mt-10 text-sm text-muted-foreground">
          See our full{" "}
          <Link href="/privacy" className="text-amber-400 underline underline-offset-4">
            Privacy Policy
          </Link>
          {" "}for details about data collection and use.
        </p>
      </div>
    </Layout>
  );
}
