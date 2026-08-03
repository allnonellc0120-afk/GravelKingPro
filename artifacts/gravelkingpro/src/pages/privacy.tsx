import { Layout } from "@/components/layout";
import { Link } from "wouter";

export default function PrivacyPolicy() {
  return (
    <Layout>
      <div className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-muted-foreground text-sm mb-10">Last updated: August 3, 2026</p>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">1. Overview</h2>
          <p className="text-muted-foreground leading-relaxed">
            GravelKing Pro ("we," "us," or "our") operates the GravelKing Pro mobile application
            and website (the "Service"). This page informs you of our policies regarding the
            collection, use, and disclosure of personal data when you use our Service and the
            choices you have associated with that data.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">2. Information We Collect</h2>
          <p className="text-muted-foreground leading-relaxed mb-3">
            We collect the following types of information when you use our Service:
          </p>
          <ul className="list-disc list-inside text-muted-foreground space-y-2">
            <li>Audio files you upload for processing, plus related file names and processing status</li>
            <li>Account, session, and subscription identifiers used to provide access to the Service</li>
            <li>Email addresses provided for account, waitlist, contact, free-tool, or enterprise inquiry purposes</li>
            <li>Basic first-party usage analytics, including pages visited, referrer, and a pseudonymous browser identifier</li>
            <li>Device type and operating system for app compatibility purposes</li>
            <li>Song drafts and IP certification information when you choose to use those features</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">3. How We Use Your Information</h2>
          <ul className="list-disc list-inside text-muted-foreground space-y-2">
            <li>To provide and maintain our audio processing services</li>
            <li>To manage your subscription and billing via Stripe</li>
            <li>To respond to support requests</li>
            <li>To improve our Service based on usage patterns</li>
            <li>To send service updates or communications related to a request you make</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">4. Audio Data</h2>
          <p className="text-muted-foreground leading-relaxed">
            Audio files you upload are processed solely to provide the requested service (mastering,
            or analysis). We do not sell your audio or use it to train public AI models. Uploaded and
            processed files are kept only as needed to deliver results, except where you choose a
            feature that stores a library item or certification record. You can request deletion of
            applicable audio data using our data deletion page.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">5. Third-Party Services</h2>
          <p className="text-muted-foreground leading-relaxed mb-3">
            We use the following third-party services that may collect information:
          </p>
          <ul className="list-disc list-inside text-muted-foreground space-y-2">
            <li><strong>Stripe</strong> — payment processing. Subject to Stripe's Privacy Policy.</li>
            <li><strong>Google Cloud</strong> — transcription, storage, and certification backup features when used.</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">6. Data Retention</h2>
          <p className="text-muted-foreground leading-relaxed">
            We retain account and session data while an account or subscription is active. Uploaded
            audio is retained only as long as needed to deliver results unless you save an item to
            your library or create a certification record. We may retain limited information for
            fraud prevention, disputes, legal obligations, and certification integrity.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">7. Children's Privacy</h2>
          <p className="text-muted-foreground leading-relaxed">
            Our Service is not directed to anyone under the age of 13. We do not knowingly
            collect personally identifiable information from children. If you believe your child
            has provided us with personal data, please contact us so we can delete it.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">8. Your Rights</h2>
          <p className="text-muted-foreground leading-relaxed">
            You may request access to, correction of, or deletion of personal data we hold about
            you. Visit our{" "}
            <Link href="/data-deletion" className="text-primary underline">
              Data Deletion Request page
            </Link>
            {" "}or contact us at the email below. We aim to respond within 30 days.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">9. Security and Data Transfers</h2>
          <p className="text-muted-foreground leading-relaxed">
            Data sent between your browser or app and GravelKing Pro is protected using HTTPS/TLS.
            Our connections to Stripe and Google Cloud use their HTTPS/TLS interfaces. This is
            transport encryption, not end-to-end encryption: audio is processed by our service,
            and temporary local processing is not a network transfer.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">10. Changes to This Policy</h2>
          <p className="text-muted-foreground leading-relaxed">
            We may update this Privacy Policy from time to time. We will notify you of any changes
            by posting the new policy on this page with an updated date. Continued use of the
            Service after changes constitutes your acceptance of the updated policy.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">11. Contact Us</h2>
          <p className="text-muted-foreground leading-relaxed">
            If you have any questions about this Privacy Policy, please contact us at:<br />
            <a href="mailto:kevm@gravelkingpro.it.com" className="text-primary underline">
              kevm@gravelkingpro.it.com
            </a>
          </p>
        </section>
      </div>
    </Layout>
  );
}
