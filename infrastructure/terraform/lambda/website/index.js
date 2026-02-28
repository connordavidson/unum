'use strict';

// ============================================================
// Unum website Lambda handler
// Serves legal pages for useunum.xyz via CloudFront
//
// Routes:
//   GET /          → 301 redirect to /privacy
//   GET /privacy   → Privacy Policy HTML
//   GET /terms     → Terms of Service HTML
//   GET /support   → Support page HTML
//   *              → 404
// ============================================================

const CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
    background: #fff;
    color: #111;
    max-width: 760px;
    margin: 0 auto;
    padding: 48px 24px 80px;
    line-height: 1.6;
  }
  header {
    margin-bottom: 40px;
    padding-bottom: 24px;
    border-bottom: 1px solid #eee;
  }
  header a { text-decoration: none; color: inherit; }
  header .logo { font-size: 20px; font-weight: 700; letter-spacing: -0.5px; }
  header .logo span { color: #555; font-weight: 400; }
  h1 { font-size: 28px; font-weight: 700; margin-bottom: 6px; }
  .meta { font-size: 13px; color: #999; margin-bottom: 32px; }
  h2 { font-size: 17px; font-weight: 600; margin-top: 32px; margin-bottom: 8px; color: #000; }
  p { font-size: 15px; color: #444; margin-bottom: 12px; }
  ul { font-size: 15px; color: #444; padding-left: 20px; margin-bottom: 12px; }
  ul li { margin-bottom: 4px; }
  a { color: #333; }
  footer { margin-top: 56px; padding-top: 24px; border-top: 1px solid #eee; font-size: 13px; color: #999; }
  footer a { color: #666; }
  nav { margin-top: 8px; }
  nav a { margin-right: 16px; color: #555; font-size: 13px; }
`;

function html(title, bodyContent) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} — Unum</title>
  <style>${CSS}</style>
</head>
<body>
  <header>
    <a href="/"><div class="logo">Unum <span>· useunum.xyz</span></div></a>
  </header>
  ${bodyContent}
  <footer>
    &copy; ${new Date().getFullYear()} Unum. All rights reserved.
    <nav>
      <a href="/privacy">Privacy Policy</a>
      <a href="/terms">Terms of Service</a>
      <a href="/support">Support</a>
    </nav>
  </footer>
</body>
</html>`;
}

function privacyPage() {
  return html('Privacy Policy', `
    <h1>Privacy Policy</h1>
    <p class="meta">Last updated: February 2, 2026</p>

    <h2>1. Information We Collect</h2>
    <p>When you use Unum, we collect the following information:</p>
    <p><strong>Account Information:</strong> When you sign in with Apple, we receive your Apple ID identifier and, if you choose to share it, your email address. We use this solely to identify your account.</p>
    <p><strong>Location Data:</strong> When you create a post, we collect the GPS coordinates from your device to place the content on the map. Location is only collected at the moment of posting.</p>
    <p><strong>Photos and Videos:</strong> Content you upload is stored on our servers (Amazon Web Services) and displayed publicly on the map.</p>
    <p><strong>Device Information:</strong> We collect basic device and crash data through Firebase Crashlytics to improve app stability. This includes device model, OS version, and crash logs. We also use Firebase Analytics to understand how features are used (e.g., screen views, button taps). Analytics data is not linked to your identity.</p>

    <h2>2. How We Use Your Information</h2>
    <p>We use your information to:</p>
    <ul>
      <li>Display your posts on the map for other users to see</li>
      <li>Identify your account so you can manage your posts and votes</li>
      <li>Moderate content to ensure community safety</li>
      <li>Diagnose and fix app crashes and bugs</li>
      <li>Enforce our Terms of Service</li>
    </ul>

    <h2>3. Content Moderation</h2>
    <p>All uploaded content is automatically screened using AWS Rekognition for inappropriate material, including explicit, violent, or otherwise objectionable content. Content that violates our guidelines is rejected before it is posted. Users may also report content, and posts that receive multiple reports are automatically hidden for review.</p>

    <h2>4. Data Storage and Security</h2>
    <p>Your data is stored securely on Amazon Web Services (AWS) infrastructure, including:</p>
    <ul>
      <li>DynamoDB for account and post data</li>
      <li>S3 for media files (photos and videos)</li>
      <li>Cognito for authentication</li>
    </ul>
    <p>We use industry-standard encryption in transit (TLS) and at rest. Authentication tokens are stored in your device's secure keychain.</p>

    <h2>5. Third-Party Services</h2>
    <p>We use the following third-party services:</p>
    <ul>
      <li><strong>Apple Sign-In</strong> — Authentication</li>
      <li><strong>Amazon Web Services</strong> — Data storage, content moderation</li>
      <li><strong>Apple Maps</strong> — Map display</li>
      <li><strong>Firebase Crashlytics</strong> — Crash reporting</li>
      <li><strong>Firebase Analytics</strong> — Usage analytics</li>
    </ul>
    <p>These services have their own privacy policies governing their use of your data.</p>

    <h2>6. Data Sharing</h2>
    <p>We do not sell your personal information. Your posts (photos, videos, and their locations) are visible to all users of the app. We may share data with law enforcement if required by law.</p>

    <h2>7. Data Retention and Deletion</h2>
    <p>You can delete your account at any time from the profile menu. When you delete your account, we permanently delete:</p>
    <ul>
      <li>All your posts and associated media</li>
      <li>Your votes and reports</li>
      <li>Your account profile</li>
      <li>All locally stored data</li>
    </ul>
    <p>This action is irreversible.</p>

    <h2>8. Children's Privacy</h2>
    <p>Unum is not intended for children under 17. We do not knowingly collect personal information from children. If you believe a child has provided us with personal information, please contact us so we can delete it.</p>

    <h2>9. Your Rights</h2>
    <p>You have the right to:</p>
    <ul>
      <li>Access your data (visible through the app)</li>
      <li>Delete your data (via account deletion)</li>
      <li>Block other users</li>
      <li>Report inappropriate content</li>
    </ul>

    <h2>10. Changes to This Policy</h2>
    <p>We may update this Privacy Policy from time to time. We will notify users of significant changes through the app. Continued use of Unum after changes constitutes acceptance of the updated policy.</p>

    <h2>11. Contact Us</h2>
    <p>If you have questions about this Privacy Policy or your data, please contact us at:<br>
    <a href="mailto:support@useunum.xyz">support@useunum.xyz</a></p>
  `);
}

function termsPage() {
  return html('Terms of Service', `
    <h1>Terms of Service</h1>
    <p class="meta">Last updated: January 31, 2025</p>

    <p>By using Unum, you agree to these Terms of Service and our End User License Agreement (EULA). If you do not agree, do not use the app.</p>

    <h2>1. Acceptable Use</h2>
    <p>Unum allows you to share photos and videos tied to real-world locations. You agree to use Unum only for lawful purposes and in accordance with these terms. You are responsible for all content you post.</p>

    <h2>2. Prohibited Content</h2>
    <p>You may not upload or share content that:</p>
    <ul>
      <li>Contains nudity, sexually explicit material, or pornography</li>
      <li>Depicts graphic violence or gore</li>
      <li>Promotes harassment, bullying, or hate speech</li>
      <li>Contains threats or incitement to violence</li>
      <li>Infringes on intellectual property rights</li>
      <li>Contains spam, advertisements, or solicitations</li>
      <li>Depicts illegal activities</li>
      <li>Targets or exploits minors</li>
    </ul>
    <p>Content is automatically screened and may be rejected. Users can also report violations, and content with multiple reports will be removed.</p>

    <h2>3. Account and Authentication</h2>
    <p>You must sign in with Apple to create content. You are responsible for maintaining the security of your account. You must not share your account or use another person's account.</p>

    <h2>4. Content Ownership and License</h2>
    <p>You retain ownership of content you upload. By posting content on Unum, you grant us a non-exclusive, worldwide, royalty-free license to display, distribute, and store your content within the app. This license ends when you delete your content or account.</p>

    <h2>5. Content Moderation</h2>
    <p>We use automated systems (AWS Rekognition) and user reports to moderate content. We reserve the right to remove any content that violates these terms without notice. Content that receives multiple reports may be automatically hidden.</p>

    <h2>6. User Conduct</h2>
    <p>You agree not to:</p>
    <ul>
      <li>Abuse the reporting system by filing false reports</li>
      <li>Attempt to circumvent content moderation</li>
      <li>Interfere with or disrupt the app's operation</li>
      <li>Collect or harvest data from the app or its users</li>
      <li>Impersonate another person or entity</li>
    </ul>

    <h2>7. Account Termination</h2>
    <p>We may suspend or terminate your account if you violate these terms. You may delete your account at any time from the profile menu. Account deletion permanently removes all your data, posts, and votes.</p>

    <h2>8. End User License Agreement (EULA)</h2>
    <p>This app is licensed, not sold, to you. Your use is subject to Apple's standard EULA terms, available at:<br>
    <a href="https://www.apple.com/legal/internet-services/itunes/dev/stdeula/">https://www.apple.com/legal/internet-services/itunes/dev/stdeula/</a></p>
    <p>In addition:</p>
    <ul>
      <li>The app is provided "as is" without warranty</li>
      <li>We are not liable for user-generated content</li>
      <li>We reserve the right to modify or discontinue the app at any time</li>
      <li>You may not reverse engineer, decompile, or disassemble the app</li>
    </ul>

    <h2>9. Privacy</h2>
    <p>Your use of Unum is also governed by our <a href="/privacy">Privacy Policy</a>, which describes how we collect, use, and protect your data.</p>

    <h2>10. Limitation of Liability</h2>
    <p>To the maximum extent permitted by law, Unum and its developers shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the app. We are not responsible for content posted by other users.</p>

    <h2>11. Changes to These Terms</h2>
    <p>We may update these Terms of Service from time to time. Continued use of the app after changes constitutes acceptance of the updated terms.</p>

    <h2>12. Contact Us</h2>
    <p>If you have questions about these Terms of Service, please contact us at:<br>
    <a href="mailto:support@useunum.xyz">support@useunum.xyz</a></p>
  `);
}

function supportPage() {
  return html('Support', `
    <h1>Support</h1>

    <p>Need help with Unum? We're here for you.</p>

    <h2>Contact Us</h2>
    <p>Email us at <a href="mailto:support@useunum.xyz">support@useunum.xyz</a> and we'll get back to you as soon as possible.</p>

    <h2>Frequently Asked Questions</h2>

    <h2>How do I sign in?</h2>
    <p>Unum uses Sign in with Apple — just tap the button on the sign-in screen. No password or separate account is needed.</p>

    <h2>How do I post a photo or video?</h2>
    <p>Tap the camera icon on the map. Tap the capture button to take a photo, or hold it to record video (up to 60 seconds). Swipe up while holding to zoom, swipe right to lock hands-free recording. Then tap "Post" to share it at your current location.</p>

    <h2>How do I delete my account?</h2>
    <p>Tap the profile icon (top-left of the map) and select "Delete Account." This permanently removes all your posts, votes, and account data. This action cannot be undone.</p>

    <h2>Why does the app need my location?</h2>
    <p>Your location is used to center the map and to place your posts at the correct coordinates when you tap "Post." The app does not track your location in the background or continuously.</p>

    <h2>How is content moderated?</h2>
    <p>Every photo and video is automatically screened by AWS Rekognition before it goes live. You can also report any post using the three-dot menu on a post card.</p>

    <h2>Legal</h2>
    <p><a href="/privacy">Privacy Policy</a> · <a href="/terms">Terms of Service</a></p>
  `);
}

function notFoundPage() {
  return html('Page Not Found', `
    <h1>Page Not Found</h1>
    <p>The page you're looking for doesn't exist.</p>
    <p><a href="/privacy">Privacy Policy</a> · <a href="/terms">Terms of Service</a> · <a href="/support">Support</a></p>
  `);
}

exports.handler = async (event) => {
  // Lambda Function URL sends requests slightly differently than API Gateway
  const rawPath = event.rawPath || event.path || '/';
  const path = rawPath.split('?')[0].toLowerCase();

  if (path === '/' || path === '') {
    return {
      statusCode: 301,
      headers: { Location: '/privacy' },
      body: '',
    };
  }

  if (path === '/privacy') {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
      body: privacyPage(),
    };
  }

  if (path === '/terms') {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
      body: termsPage(),
    };
  }

  if (path === '/support') {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
      body: supportPage(),
    };
  }

  return {
    statusCode: 404,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
    body: notFoundPage(),
  };
};
