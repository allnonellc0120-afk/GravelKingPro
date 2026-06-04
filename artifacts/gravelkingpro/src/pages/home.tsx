import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { 
  ArrowRight, 
  Cpu, 
  Layers, 
  Settings2, 
  SlidersHorizontal,
  Mail,
  Zap,
  Lock
} from "lucide-react";
import { useState } from "react";

const PRODUCTS = [
  {
    name: "GravelKing DAW",
    tagline: "The Flagship Environment",
    description: "A proprietary, hyper-optimized digital audio workstation built on a custom C++ audio engine. Features zero-latency routing, infinite plugin chaining, and a UI that stays out of the way.",
    badge: "Flagship",
    icon: <Cpu className="w-6 h-6 text-primary" />,
    features: ["Custom Audio Engine", "VST3/AU Support", "Real-time Collaboration"]
  },
  {
    name: "GravelMix Pro",
    tagline: "Surgical Mixing Suite",
    description: "A comprehensive mixing suite featuring analog-modeled EQs, transparent dynamic control, and AI-assisted spectral balancing.",
    badge: "Active Users",
    icon: <SlidersHorizontal className="w-6 h-6 text-primary" />,
    features: ["Analog Modeling", "Spectral Balancing", "Dynamic EQ"]
  },
  {
    name: "GravelBeat",
    tagline: "Polyrhythmic Sequencing",
    description: "An advanced drum machine and sequencer designed for complex polyrhythms and generative beat creation.",
    badge: "In Development",
    icon: <Settings2 className="w-6 h-6 text-primary" />,
    features: ["Generative Sequencing", "Micro-timing", "Sample Slicing"]
  },
  {
    name: "GravelMaster",
    tagline: "Final Polish",
    description: "An intelligent mastering suite that ensures broadcast-ready levels while preserving dynamic range and punch.",
    badge: "Beta",
    icon: <Layers className="w-6 h-6 text-primary" />,
    features: ["True Peak Limiting", "Stereo Widening", "Loudness Metering"]
  }
];

const WHY_ACQUIRE = [
  {
    title: "Proprietary Audio Engine",
    description: "Our custom C++ engine outperforms industry standards in CPU efficiency and latency, representing significant intellectual property.",
    icon: <Zap className="w-8 h-8 text-primary" />
  },
  {
    title: "Established User Base",
    description: "A dedicated community of professional producers and engineers who rely on GravelKing tools daily for commercial releases.",
    icon: <Settings2 className="w-8 h-8 text-primary" />
  },
  {
    title: "Cross-Platform Codebase",
    description: "A meticulously maintained, modern codebase supporting macOS (Apple Silicon/Intel) and Windows natively.",
    icon: <Cpu className="w-8 h-8 text-primary" />
  },
  {
    title: "Acquisition-Ready",
    description: "Clean cap table, fully documented architecture, and zero technical debt. Ready for immediate integration.",
    icon: <Lock className="w-8 h-8 text-primary" />
  }
];

export default function Home() {
  const [formState, setFormState] = useState<"idle" | "submitting" | "success">("idle");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormState("submitting");
    setTimeout(() => {
      setFormState("success");
    }, 1500);
  };

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary selection:text-primary-foreground font-sans">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 border-b border-border/40 bg-background/80 backdrop-blur-md">
        <div className="container mx-auto px-6 h-20 flex items-center justify-between">
          <div className="font-mono font-bold text-xl tracking-tighter">
            GravelKing<span className="text-primary">Pro</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm font-mono tracking-tight text-muted-foreground">
            <button onClick={() => scrollTo("portfolio")} className="hover:text-foreground transition-colors">Portfolio</button>
            <button onClick={() => scrollTo("why-acquire")} className="hover:text-foreground transition-colors">Business Case</button>
            <button onClick={() => scrollTo("valuation")} className="hover:text-foreground transition-colors">Terms</button>
          </div>
          <Button 
            onClick={() => scrollTo("contact")}
            className="font-mono uppercase tracking-wider text-xs rounded-none border-2 border-primary bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground transition-all duration-300"
          >
            Inquire
          </Button>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative min-h-[100dvh] flex items-center pt-20 overflow-hidden">
        {/* Background Image & Overlay */}
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-background/90 z-10" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent z-10" />
          <img 
            src="/hero-bg.png" 
            alt="Abstract music production interface" 
            className="w-full h-full object-cover opacity-30 mix-blend-screen"
          />
        </div>

        <div className="container relative z-20 mx-auto px-6">
          <div className="max-w-4xl">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="inline-flex items-center gap-2 px-3 py-1 border border-primary/30 bg-primary/5 text-primary text-xs font-mono tracking-wider mb-8">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                ACQUISITION OPPORTUNITY
              </div>
            </motion.div>

            <motion.h1 
              className="text-6xl md:text-8xl font-bold tracking-tighter leading-[0.9] mb-8"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            >
              The Software <br/>
              Portfolio.
            </motion.h1>

            <motion.p 
              className="text-xl md:text-2xl text-muted-foreground font-light max-w-2xl mb-12"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            >
              Precision tools for music creators. A complete, proprietary ecosystem of professional audio software, available for strategic acquisition.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
            >
              <Button 
                onClick={() => scrollTo("contact")}
                size="lg"
                className="h-16 px-8 rounded-none bg-primary text-primary-foreground hover:bg-primary/90 font-mono uppercase tracking-widest text-sm group"
              >
                Schedule Acquisition Inquiry
                <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Button>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Portfolio */}
      <section id="portfolio" className="py-32 bg-secondary/30 relative">
        <div className="container mx-auto px-6">
          <div className="mb-16 md:mb-24">
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">The Suite</h2>
            <p className="text-muted-foreground text-lg max-w-xl font-light">
              Four distinct, interconnected products sharing a unified codebase and design language.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {PRODUCTS.map((product, index) => (
              <motion.div
                key={product.name}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                className={`p-8 border border-border bg-card/50 backdrop-blur-sm relative group overflow-hidden ${index === 0 ? 'md:col-span-2 md:p-12' : ''}`}
              >
                <div className="absolute top-0 left-0 w-1 h-full bg-primary origin-top scale-y-0 group-hover:scale-y-100 transition-transform duration-500" />
                
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-8">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-secondary rounded-none border border-border">
                      {product.icon}
                    </div>
                    <div>
                      <h3 className="text-2xl font-bold tracking-tight">{product.name}</h3>
                      <div className="text-primary font-mono text-xs uppercase tracking-wider mt-1">{product.tagline}</div>
                    </div>
                  </div>
                  <Badge variant="outline" className="font-mono text-xs uppercase tracking-wider rounded-none border-primary/50 text-primary self-start">
                    {product.badge}
                  </Badge>
                </div>

                <p className={`text-muted-foreground font-light mb-8 ${index === 0 ? 'text-xl max-w-3xl' : 'text-base'}`}>
                  {product.description}
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-t border-border pt-8 mt-auto">
                  {product.features.map((feature, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm text-foreground/80 font-mono">
                      <div className="w-1 h-1 bg-primary rounded-full" />
                      {feature}
                    </div>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Why Acquire */}
      <section id="why-acquire" className="py-32">
        <div className="container mx-auto px-6">
          <div className="max-w-2xl mb-16">
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">The Business Case</h2>
            <p className="text-muted-foreground text-lg font-light">
              Why GravelKingPro represents a strategic acceleration for existing audio-tech portfolios.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {WHY_ACQUIRE.map((item, index) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="flex flex-col"
              >
                <div className="mb-6 opacity-80">{item.icon}</div>
                <h3 className="text-xl font-bold mb-3">{item.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {item.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Valuation & Terms */}
      <section id="valuation" className="py-32 bg-primary text-primary-foreground">
        <div className="container mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">Terms of Engagement</h2>
              <p className="text-primary-foreground/80 text-xl font-light mb-8 max-w-lg">
                GravelKingPro is seeking a strategic exit to accelerate the distribution and evolution of our core technology.
              </p>
              
              <ul className="space-y-4 font-mono text-sm uppercase tracking-wider">
                <li className="flex items-center gap-3">
                  <ArrowRight className="w-4 h-4" /> 100% Asset Acquisition
                </li>
                <li className="flex items-center gap-3">
                  <ArrowRight className="w-4 h-4" /> IP Licensing Deals
                </li>
                <li className="flex items-center gap-3">
                  <ArrowRight className="w-4 h-4" /> Team Acqui-hire Options
                </li>
              </ul>
            </div>
            
            <div className="p-8 md:p-12 bg-background text-foreground border border-primary/20">
              <h3 className="font-mono text-primary text-sm uppercase tracking-wider mb-4">Confidentiality</h3>
              <p className="mb-8 text-muted-foreground">
                Detailed metrics, MAU data, retention cohorts, and architectural deep-dives are available to qualified parties under a standard Non-Disclosure Agreement.
              </p>
              <Button 
                onClick={() => scrollTo("contact")}
                variant="outline" 
                className="w-full rounded-none border-primary text-primary hover:bg-primary hover:text-primary-foreground font-mono uppercase tracking-widest"
              >
                Request NDA
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Contact */}
      <section id="contact" className="py-32 border-t border-border bg-secondary/10">
        <div className="container mx-auto px-6 max-w-4xl">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">Direct Inquiry</h2>
            <p className="text-muted-foreground">For corporate development and M&A teams only.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-mono text-muted-foreground uppercase tracking-wider">Full Name</label>
                <Input required className="rounded-none bg-background border-border focus-visible:ring-primary h-12" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-mono text-muted-foreground uppercase tracking-wider">Corporate Email</label>
                <Input type="email" required className="rounded-none bg-background border-border focus-visible:ring-primary h-12" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-mono text-muted-foreground uppercase tracking-wider">Company</label>
                <Input required className="rounded-none bg-background border-border focus-visible:ring-primary h-12" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-mono text-muted-foreground uppercase tracking-wider">Title / Role</label>
                <Input required className="rounded-none bg-background border-border focus-visible:ring-primary h-12" />
              </div>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-mono text-muted-foreground uppercase tracking-wider">Statement of Intent</label>
              <Textarea 
                required 
                className="rounded-none bg-background border-border focus-visible:ring-primary min-h-[150px] resize-none" 
              />
            </div>

            <Button 
              type="submit" 
              disabled={formState !== "idle"}
              className="w-full h-16 rounded-none bg-primary text-primary-foreground hover:bg-primary/90 font-mono uppercase tracking-widest text-sm"
            >
              {formState === "idle" && "Submit Acquisition Inquiry"}
              {formState === "submitting" && "Transmitting..."}
              {formState === "success" && "Inquiry Received"}
            </Button>
          </form>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-background py-12">
        <div className="container mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="font-mono font-bold text-xl tracking-tighter">
            GravelKing<span className="text-primary">Pro</span>
          </div>
          <div className="text-muted-foreground text-sm font-light">
            © {new Date().getFullYear()} GravelKing Software. All rights reserved.
          </div>
          <div className="font-mono text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Lock className="w-3 h-3" /> For Acquisition Inquiries Only
          </div>
        </div>
      </footer>
    </div>
  );
}
