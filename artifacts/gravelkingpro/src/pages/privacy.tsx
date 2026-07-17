import { Layout } from "@/components/layout";

export default function PrivacyPolicy() {
  return (
    <Layout>
      <div className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-muted-foreground text-sm mb-10">Last updated: July 17, 2026</p>

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
            <li>Audio files you upload for processing (mastering, vocal separation, beat analysis)</li>
            <li>Session identifiers used to track your subscription status</li>
            <li>Email addresses provided voluntarily for waitlist or contact forms</li>
            <li>Basic usage analytics (pages visited, features used) — no personally identifiable information</li>
            <li>Device type and operating system for app compatibility purposes</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">3. How We Use Your Information</h2>
          <ul className="list-disc list-inside text-muted-foreground space-y-2">
            <li>To provide and maintain our audio processing services</li>
            <li>To manage your subscription and billing via Stripe</li>
            <li>To respond to support requests</li>
            <li>To improve our Service based on usage patterns</li>
            <li>To send important service updates (not marketing) to users who have provided email addresses</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">4. Audio Data</h2>
          <p className="text-muted-foreground leading-relaxed">
            Audio files you upload are processed solely to provide the requested service (mastering,
            separation, or analysis). We do not sell, share, or use your audio content for any
            purpose other than delivering your results. Processed files are stored temporarily and
            deleted after your session expires or upon your request.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">5. Third-Party Services</h2>
          <p className="text-muted-foreground leading-relaxed mb-3">
            We use the following third-party services that may collect information:
          </p>
          <ul className="list-disc list-inside text-muted-foreground space-y-2">
            <li><strong>Stripe</strong> — payment processing. Subject to Stripe's Privacy Policy.</li>
            <li><strong>Google Cloud</strong> — AI transcription and audio analysis features.</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">6. Data Retention</h2>
          <p className="text-muted-foreground leading-relaxed">
            We retain session data for as long as your account is active. Uploaded audio files
            are retained only as long as needed to deliver your results. You may request deletion
            of your data at any time by contacting us.
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
            You have the right to access, correct, or delete any personal data we hold about you.
            To exercise these rights, contact us at the email below. We will respond within 30 days.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">9. Changes to This Policy</h2>
          <p className="text-muted-foreground leading-relaxed">
            We may update this Privacy Policy from time to time. We will notify you of any changes
            by posting the new policy on this page with an updated date. Continued use of the
            Service after changes constitutes your acceptance of the updated policy.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">10. Contact Us</h2>
          <p className="text-muted-foreground leading-relaxed">
            If you have any questions about this Privacy Policy, please contact us at:<br />
            <a href="mailto:support@gravelkingpro.com" className="text-primary underline">
              support@gravelkingpro.com
            </a>
          </p>
        </section>
      </div>
    </Layout>
  );
}
