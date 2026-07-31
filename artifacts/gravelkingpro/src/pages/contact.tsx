import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Mail, Globe, Building2, Zap, MessageSquare } from "lucide-react";
import { motion } from "framer-motion";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

export default function Contact() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const { toast } = useToast();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    const mailto = `mailto:kevm@gravelkingpro.it.com?subject=${encodeURIComponent(subject || "GravelKing Productions Inquiry")}&body=${encodeURIComponent(`Name: ${name}\nEmail: ${email}\n\n${message}`)}`;
    window.location.href = mailto;
    setTimeout(() => {
      setSending(false);
      toast({ title: "Opening email client", description: "Your default mail app will open to send this message." });
    }, 600);
  };

  return (
    <Layout>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-3xl mx-auto space-y-8">

        <div className="text-center space-y-3 pt-2">
          <div className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-full px-4 py-1.5 text-xs font-medium text-amber-400">
            <Zap className="w-3.5 h-3.5" /> All N One LLC
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Get in Touch</h1>
          <p className="text-muted-foreground max-w-md mx-auto">
            Questions about licensing, partnerships, the GravelKing kernel, or custom integration work — reach out directly.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { icon: <Mail className="w-5 h-5 text-amber-500" />, label: "Email", value: "kevm@gravelkingpro.it.com", href: "mailto:kevm@gravelkingpro.it.com" },
            { icon: <Globe className="w-5 h-5 text-sky-400" />, label: "Website", value: "gravelkingpro.it.com", href: "https://gravelkingpro.it.com" },
            { icon: <Building2 className="w-5 h-5 text-emerald-400" />, label: "Company", value: "All N One LLC", href: undefined },
          ].map((item) => (
            <Card key={item.label} className="border-border/40 bg-card/40">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-secondary/60 flex items-center justify-center shrink-0">
                  {item.icon}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                  {item.href ? (
                    <a href={item.href} className="text-sm font-medium hover:text-amber-400 transition-colors">{item.value}</a>
                  ) : (
                    <p className="text-sm font-medium">{item.value}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="border-border/40 bg-card/40">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <MessageSquare className="w-4 h-4 text-amber-500" />
                <span className="font-semibold">Send a Message</span>
              </div>
              <form onSubmit={handleSubmit} className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground font-medium">Your Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="w-full bg-secondary/40 border border-border/40 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-amber-500/60 transition-colors"
                    placeholder="Full name"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground font-medium">Your Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full bg-secondary/40 border border-border/40 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-amber-500/60 transition-colors"
                    placeholder="you@email.com"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground font-medium">Subject</label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="w-full bg-secondary/40 border border-border/40 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-amber-500/60 transition-colors"
                    placeholder="Licensing / Partnership / Support"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground font-medium">Message</label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    required
                    rows={4}
                    className="w-full bg-secondary/40 border border-border/40 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-amber-500/60 transition-colors resize-none"
                    placeholder="Tell us what you need..."
                  />
                </div>
                <Button type="submit" disabled={sending} className="w-full bg-amber-500 hover:bg-amber-600 text-black font-semibold">
                  <Mail className="w-4 h-4 mr-2" />
                  {sending ? "Opening mail..." : "Send Message"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card className="border-border/40 bg-card/40">
              <CardContent className="p-5 space-y-3">
                <h3 className="font-semibold text-sm">Licensing & Enterprise</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Interested in licensing the GravelKing kernel (MLK v2/v3) for your own product or DAW integration? We offer commercial licenses for the All N One LLC audio processing stack.
                </p>
              </CardContent>
            </Card>
            <Card className="border-border/40 bg-card/40">
              <CardContent className="p-5 space-y-3">
                <h3 className="font-semibold text-sm">Custom Integration</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Need the GravelKing protocol integrated into your studio workflow, plugin, or app? We provide professional software integration services.
                </p>
              </CardContent>
            </Card>
            <Card className="border-border/40 bg-card/40">
              <CardContent className="p-5 space-y-3">
                <h3 className="font-semibold text-sm">Node Auditor Access</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Node Auditor ($249.50) includes remote kernel endpoint access, raw telemetry feed, and direct support. Contact us to discuss your specific needs.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

      </motion.div>
    </Layout>
  );
}
