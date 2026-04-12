import SEO from "@/components/SEO";
import V3Header from "@/components/v3/V3Header";
import { Link } from "react-router-dom";

const TermsOfService = () => {
  return (
    <>
      <SEO
        title="Terms of Service – KTrenZ"
        titleKo="서비스 약관 – KTrenZ"
        description="KTrenZ Terms of Service — the rules and guidelines for using our platform."
        descriptionKo="KTrenZ 서비스 약관 — 플랫폼 이용 규칙 및 가이드라인입니다."
        path="/terms"
      />
      <div className="min-h-screen bg-background">
        <V3Header />
        <div className="max-w-3xl mx-auto px-4 py-12 md:py-20">
          <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-8">Terms of Service</h1>
          <p className="text-xs text-muted-foreground mb-6">Last updated: April 12, 2026</p>

          <div className="prose prose-sm prose-invert max-w-none space-y-6 text-sm text-muted-foreground leading-relaxed">
            <section>
              <h2 className="text-base font-semibold text-foreground mb-2">1. Acceptance of Terms</h2>
              <p>By accessing or using KTrenZ (the "Service"), operated by Fantagram, Inc. ("Company", "we", "us"), you agree to be bound by these Terms of Service. If you do not agree, please do not use the Service.</p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-foreground mb-2">2. Description of Service</h2>
              <p>KTrenZ is a K-Pop trend intelligence platform that provides real-time keyword-based trend detection, scoring, grading, and fan engagement features including trend predictions (Battles) and reward points (K-Points).</p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-foreground mb-2">3. User Accounts</h2>
              <ul className="list-disc pl-5 space-y-1">
                <li>You must be at least 13 years old to create an account.</li>
                <li>You are responsible for maintaining the confidentiality of your account credentials.</li>
                <li>You agree to provide accurate and complete information during registration.</li>
                <li>One person may not maintain more than one account.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-base font-semibold text-foreground mb-2">4. K-Points & Rewards</h2>
              <ul className="list-disc pl-5 space-y-1">
                <li>K-Points are virtual reward points earned through platform activities such as trend predictions, daily missions, and welcome bonuses.</li>
                <li>K-Points have no monetary value and cannot be exchanged for real currency.</li>
                <li>We reserve the right to modify the K-Points system, including earning rates and redemption options, at any time.</li>
                <li>Abuse of the rewards system (including multiple accounts, automated participation, or exploitation of bugs) may result in account suspension and forfeiture of points.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-base font-semibold text-foreground mb-2">5. Acceptable Use</h2>
              <p>You agree not to:</p>
              <ul className="list-disc pl-5 space-y-1 mt-2">
                <li>Use the Service for any unlawful purpose.</li>
                <li>Attempt to gain unauthorized access to any part of the Service.</li>
                <li>Scrape, crawl, or use automated means to access the Service without permission.</li>
                <li>Interfere with or disrupt the Service or its infrastructure.</li>
                <li>Impersonate another person or entity.</li>
                <li>Post or transmit harmful, offensive, or infringing content.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-base font-semibold text-foreground mb-2">6. Intellectual Property</h2>
              <p>All content, features, and functionality of KTrenZ — including text, graphics, logos, data, and software — are owned by Fantagram, Inc. and protected by intellectual property laws. You may not reproduce, distribute, or create derivative works without our written permission.</p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-foreground mb-2">7. Disclaimer of Warranties</h2>
              <p>The Service is provided "AS IS" and "AS AVAILABLE" without warranties of any kind, either express or implied. We do not guarantee that the Service will be uninterrupted, error-free, or secure. Trend data, scores, and predictions are for informational and entertainment purposes only.</p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-foreground mb-2">8. Limitation of Liability</h2>
              <p>To the fullest extent permitted by law, Fantagram, Inc. shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the Service, including but not limited to loss of data, revenue, or profits.</p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-foreground mb-2">9. Termination</h2>
              <p>We may suspend or terminate your account at any time for violation of these Terms or for any other reason at our sole discretion. Upon termination, your right to use the Service will cease immediately.</p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-foreground mb-2">10. Governing Law</h2>
              <p>These Terms are governed by and construed in accordance with the laws of the State of Delaware, United States, without regard to conflict of law principles.</p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-foreground mb-2">11. Changes to Terms</h2>
              <p>We reserve the right to modify these Terms at any time. Changes will be effective upon posting to this page. Your continued use of the Service after changes constitutes acceptance of the updated Terms.</p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-foreground mb-2">12. Contact</h2>
              <p>
                Fantagram, Inc.<br />
                131 Continental Dr., Suite 305<br />
                City of Newark, DE 19713 U.S.A.
              </p>
            </section>
          </div>

          <div className="mt-12 pt-6 border-t border-border flex items-center gap-4 text-xs text-muted-foreground">
            <Link to="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
            <span>·</span>
            <Link to="/about" className="hover:text-foreground transition-colors">About</Link>
          </div>
        </div>
      </div>
    </>
  );
};

export default TermsOfService;
