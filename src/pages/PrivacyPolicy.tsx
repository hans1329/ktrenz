import SEO from "@/components/SEO";
import V3Header from "@/components/v3/V3Header";
import { Link } from "react-router-dom";

const PrivacyPolicy = () => {
  return (
    <>
      <SEO
        title="Privacy Policy – KTrenZ"
        titleKo="개인정보 처리방침 – KTrenZ"
        description="KTrenZ Privacy Policy — how we collect, use, and protect your personal information."
        descriptionKo="KTrenZ 개인정보 처리방침 — 개인정보의 수집, 이용 및 보호에 대한 안내입니다."
        path="/privacy"
      />
      <div className="min-h-screen bg-background">
        <V3Header />
        <div className="max-w-3xl mx-auto px-4 py-12 md:py-20">
          <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-8">Privacy Policy</h1>
          <p className="text-xs text-muted-foreground mb-6">Last updated: April 12, 2026</p>

          <div className="prose prose-sm prose-invert max-w-none space-y-6 text-sm text-muted-foreground leading-relaxed">
            <section>
              <h2 className="text-base font-semibold text-foreground mb-2">1. Company Information</h2>
              <p>
                Fantagram, Inc.<br />
                131 Continental Dr., Suite 305<br />
                City of Newark, DE 19713 U.S.A.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-foreground mb-2">2. Information We Collect</h2>
              <p>We collect the following types of information when you use KTrenZ:</p>
              <ul className="list-disc pl-5 space-y-1 mt-2">
                <li><strong>Account Information:</strong> Email address, display name, and profile picture when you sign up or log in via Google OAuth.</li>
                <li><strong>Usage Data:</strong> Pages visited, features used, interactions with trend predictions and battles.</li>
                <li><strong>Device Information:</strong> Browser type, operating system, device identifiers, and IP address.</li>
                <li><strong>Cookies & Local Storage:</strong> Session tokens, language preferences, and UI settings.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-base font-semibold text-foreground mb-2">3. How We Use Your Information</h2>
              <ul className="list-disc pl-5 space-y-1">
                <li>To provide and maintain our services, including trend analysis and fan engagement features.</li>
                <li>To personalize your experience and deliver relevant content.</li>
                <li>To process K-Points transactions and reward distributions.</li>
                <li>To communicate service updates, security alerts, and promotional content (with your consent).</li>
                <li>To analyze usage patterns and improve our platform.</li>
                <li>To detect and prevent fraud or abuse.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-base font-semibold text-foreground mb-2">4. Data Sharing</h2>
              <p>We do not sell your personal information. We may share data with:</p>
              <ul className="list-disc pl-5 space-y-1 mt-2">
                <li><strong>Service Providers:</strong> Cloud hosting (Supabase, Cloudflare), authentication, and analytics services that help us operate the platform.</li>
                <li><strong>Legal Compliance:</strong> When required by law, regulation, or legal process.</li>
                <li><strong>Business Transfers:</strong> In connection with a merger, acquisition, or sale of assets.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-base font-semibold text-foreground mb-2">5. Data Security</h2>
              <p>We implement industry-standard security measures including encryption in transit (TLS), secure authentication, and access controls. However, no method of transmission over the Internet is 100% secure.</p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-foreground mb-2">6. Data Retention</h2>
              <p>We retain your personal information for as long as your account is active or as needed to provide services. You may request deletion of your account and associated data at any time by contacting us.</p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-foreground mb-2">7. Your Rights</h2>
              <ul className="list-disc pl-5 space-y-1">
                <li>Access, correct, or delete your personal data.</li>
                <li>Opt out of promotional communications.</li>
                <li>Request a copy of your data in a portable format.</li>
                <li>Withdraw consent for data processing where applicable.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-base font-semibold text-foreground mb-2">8. Children's Privacy</h2>
              <p>KTrenZ is not intended for children under 13. We do not knowingly collect personal information from children under 13. If you believe a child has provided us with personal data, please contact us.</p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-foreground mb-2">9. Changes to This Policy</h2>
              <p>We may update this Privacy Policy from time to time. We will notify you of any material changes by posting the updated policy on this page with a revised "Last updated" date.</p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-foreground mb-2">10. Contact Us</h2>
              <p>
                If you have questions about this Privacy Policy, please contact us at:<br />
                Fantagram, Inc.<br />
                131 Continental Dr., Suite 305<br />
                City of Newark, DE 19713 U.S.A.
              </p>
            </section>
          </div>

          <div className="mt-12 pt-6 border-t border-border flex items-center gap-4 text-xs text-muted-foreground">
            <Link to="/terms" className="hover:text-foreground transition-colors">Terms of Service</Link>
            <span>·</span>
            <Link to="/about" className="hover:text-foreground transition-colors">About</Link>
          </div>
        </div>
      </div>
    </>
  );
};

export default PrivacyPolicy;
