export default function PrivacyPage() {
  return (
    <div className="p-6 max-w-3xl space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-foreground">AI & Data Privacy</h2>
        <p className="text-muted-foreground text-sm mt-1">How your data is handled</p>
      </div>

      <section className="bg-card border border-border rounded-lg p-6 space-y-4">
        <h3 className="text-foreground font-semibold">Your Data, Your Control</h3>
        <div className="space-y-3 text-foreground text-sm leading-relaxed">
          <p>Lewhof AI Dashboard is a <strong className="text-foreground">personal tool</strong>. Your data is stored in your own Supabase database and is not shared with anyone.</p>

          <p><strong className="text-foreground">AI Conversations:</strong> Messages sent to AI models (Claude, Groq, Gemini, Perplexity) are processed by their respective providers. Your conversations are <strong className="text-foreground">not used to train any AI models</strong>. Each provider has their own data retention policies.</p>

          <p><strong className="text-foreground">Document Storage:</strong> Files you upload are stored in your Supabase Storage bucket. They are only accessible via signed URLs that expire after 1 hour.</p>

          <p><strong className="text-foreground">Vault Encryption:</strong> Sensitive data in the Vault (passwords, PINs, API keys) is encrypted with AES-256-GCM before storage. Values are only decrypted when you click Reveal.</p>

          <p><strong className="text-foreground">Microsoft Integration:</strong> Calendar and email access uses OAuth2 tokens stored in your database. Tokens auto-refresh and can be revoked in Settings &gt; Connections at any time.</p>

          <p><strong className="text-foreground">Helicone Monitoring:</strong> AI API calls are proxied through Helicone for cost tracking. Helicone logs request/response metadata but does not store your conversation content long-term.</p>
        </div>
      </section>

      <section className="bg-card border border-border rounded-lg p-6 space-y-4">
        <h3 className="text-foreground font-semibold">Data Providers</h3>
        <div className="space-y-2">
          {[
            { name: 'Supabase', role: 'Database & file storage', link: 'https://supabase.com/privacy' },
            { name: 'Anthropic (Claude)', role: 'AI model provider', link: 'https://www.anthropic.com/privacy' },
            { name: 'Google (Gemini)', role: 'AI model + image gen', link: 'https://policies.google.com/privacy' },
            { name: 'Groq', role: 'AI model provider', link: 'https://groq.com/privacy-policy' },
            { name: 'Vercel', role: 'Hosting & deployment', link: 'https://vercel.com/legal/privacy-policy' },
            { name: 'Clerk', role: 'Authentication', link: 'https://clerk.com/legal/privacy' },
            { name: 'Helicone', role: 'AI cost monitoring', link: 'https://helicone.ai/privacy' },
            { name: 'Microsoft', role: 'Calendar & email', link: 'https://privacy.microsoft.com' },
          ].map((p) => (
            <div key={p.name} className="flex items-center justify-between py-2 border-b border-border last:border-0">
              <div>
                <p className="text-foreground text-sm font-medium">{p.name}</p>
                <p className="text-muted-foreground text-xs">{p.role}</p>
              </div>
              <a href={p.link} target="_blank" className="text-primary text-xs hover:underline">Privacy policy</a>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-card border border-border rounded-lg p-6 space-y-4">
        <h3 className="text-foreground font-semibold">Your Rights</h3>
        <div className="space-y-2 text-foreground text-sm">
          <p>You can export all your data at any time from Settings &gt; General &gt; Data Export.</p>
          <p>You can clear all conversations, documents, and notes from Settings &gt; General &gt; Data Management.</p>
          <p>You can disconnect any third-party integration from Settings &gt; Connections.</p>
          <p>You can delete your account entirely through Clerk.</p>
        </div>
      </section>
    </div>
  );
}
