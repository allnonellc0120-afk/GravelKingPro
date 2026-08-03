import { useMemo } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { ArrowLeft, BookOpen, CheckCircle2, ChevronRight, FileText, Gavel, LockKeyhole, Printer, ShieldAlert, Wrench } from "lucide-react";
import { Layout } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { helpTopicBySlug, helpTopics, type HelpTopic } from "@/lib/help-content";

const statusStyles: Record<HelpTopic["status"], string> = {
  Live: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  "Tested locally": "border-sky-500/30 bg-sky-500/10 text-sky-300",
  Implemented: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  Policy: "border-violet-500/30 bg-violet-500/10 text-violet-300",
};

function StatusBadge({ status }: { status: HelpTopic["status"] }) {
  return <Badge variant="outline" className={statusStyles[status]}>{status}</Badge>;
}

function TopicCard({ topic }: { topic: HelpTopic }) {
  return (
    <Link href={`/help/${topic.slug}`} className="group block rounded-xl border border-border/50 bg-card/40 p-4 transition-colors hover:border-amber-500/40 hover:bg-amber-500/[0.04]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-amber-500/80">{topic.eyebrow}</p>
          <h2 className="mt-1 font-semibold group-hover:text-amber-300">{topic.title}</h2>
        </div>
        <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground group-hover:text-amber-400" />
      </div>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{topic.summary}</p>
      <div className="mt-3"><StatusBadge status={topic.status} /></div>
    </Link>
  );
}

function EvidenceLegend() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {([
        ["Live", "Checked on a public page or endpoint."],
        ["Tested locally", "Passed an end-to-end test in the running project."],
        ["Implemented", "Present in code; public production proof may still be pending."],
        ["Policy", "A service rule or legal/evidence reference, not a feature claim."],
      ] as const).map(([label, description]) => (
        <div key={label} className="rounded-lg border border-border/40 bg-background/40 p-3">
          <StatusBadge status={label} />
          <p className="mt-2 text-xs leading-5 text-muted-foreground">{description}</p>
        </div>
      ))}
    </div>
  );
}

function HelpIndex() {
  return (
    <Layout>
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/[0.10] via-card/70 to-card/40 p-6 sm:p-9">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="max-w-3xl">
              <p className="text-xs uppercase tracking-[0.22em] text-amber-500">GravelKing Pro Help</p>
              <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Tools, rights, and service rules</h1>
              <p className="mt-4 text-base leading-7 text-muted-foreground">
                A first-party reference for using the production tools, preserving your creative record, understanding IP evidence, and following the rules that keep the service reliable.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="gap-2" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print guide</Button>
              <Link href="/help/user-rules"><Button className="gap-2 bg-amber-500 text-black hover:bg-amber-600"><ShieldAlert className="h-4 w-4" /> User rules</Button></Link>
            </div>
          </div>
        </header>

        <EvidenceLegend />

        <section className="grid gap-4 md:grid-cols-3">
          {[
            { icon: Wrench, title: "Use the tools", body: "Each page explains what the tool does, how to use it, the engine behind it, and the relevant service route." },
            { icon: Gavel, title: "Preserve your rights record", body: "Keep originals, licenses, drafts, performances, certificate IDs, and verification results together." },
            { icon: LockKeyhole, title: "Use the service honestly", body: "Do not bypass gates, falsify ownership, manipulate evidence, overload the service, or share private sessions." },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-xl border border-border/50 bg-card/30 p-5">
              <Icon className="h-5 w-5 text-amber-400" />
              <h2 className="mt-3 font-semibold">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
            </div>
          ))}
        </section>

        <section>
          <div className="mb-4 flex items-end justify-between gap-4">
            <div><p className="text-xs uppercase tracking-[0.18em] text-amber-500">Full reference</p><h2 className="mt-1 text-2xl font-semibold">Tool and policy pages</h2></div>
            <span className="text-sm text-muted-foreground">{helpTopics.length} topics</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{helpTopics.map((topic) => <TopicCard key={topic.slug} topic={topic} />)}</div>
        </section>

        <section className="rounded-xl border border-violet-500/25 bg-violet-500/[0.05] p-5">
          <div className="flex gap-3">
            <Gavel className="mt-0.5 h-5 w-5 shrink-0 text-violet-300" />
            <div>
              <h2 className="font-semibold">Legal reference notice</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                The legal quotations and rights explanations are educational product guidance, not legal advice. A certificate, authorship score, hash, or verification result supports evidence and provenance; it does not create copyright, prove exclusive ownership, or guarantee a court result.
              </p>
              <Link href="/help/legal-quotations" className="mt-3 inline-flex items-center gap-1 text-sm text-violet-300 hover:text-violet-200">Read the quoted provisions <ChevronRight className="h-4 w-4" /></Link>
            </div>
          </div>
        </section>
      </div>
    </Layout>
  );
}

function HelpDetail({ topic }: { topic: HelpTopic }) {
  const index = helpTopics.findIndex((item) => item.slug === topic.slug);
  const previous = helpTopics[index - 1];
  const next = helpTopics[index + 1];
  return (
    <Layout>
      <article className="mx-auto max-w-5xl space-y-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/help" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-amber-400"><ArrowLeft className="h-4 w-4" /> All Help</Link>
          <StatusBadge status={topic.status} />
        </div>
        <header className="border-b border-border/50 pb-7">
          <p className="text-xs uppercase tracking-[0.22em] text-amber-500">{topic.eyebrow}</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{topic.title}</h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground">{topic.summary}</p>
        </header>

        <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
          <div className="space-y-6">
            <section className="rounded-xl border border-border/50 bg-card/30 p-5">
              <h2 className="flex items-center gap-2 text-lg font-semibold"><CheckCircle2 className="h-5 w-5 text-emerald-400" /> What it does</h2>
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">{topic.functions.map((item) => <li key={item} className="rounded-lg bg-background/40 px-3 py-2 text-sm leading-6 text-muted-foreground">{item}</li>)}</ul>
            </section>
            <section className="rounded-xl border border-border/50 bg-card/30 p-5">
              <h2 className="flex items-center gap-2 text-lg font-semibold"><BookOpen className="h-5 w-5 text-amber-400" /> How to use it</h2>
              <ol className="mt-4 space-y-3">{topic.howTo.map((item, i) => <li key={item} className="flex gap-3 text-sm leading-6 text-muted-foreground"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-amber-500/30 text-xs text-amber-400">{i + 1}</span><span>{item}</span></li>)}</ol>
            </section>
            <section className="rounded-xl border border-border/50 bg-card/30 p-5">
              <h2 className="text-lg font-semibold">Engine and service routes</h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{topic.engine}</p>
              <div className="mt-4 flex flex-wrap gap-2">{topic.routes.map((route) => <code key={route} className="rounded-md border border-border/50 bg-background/60 px-2 py-1 text-xs text-amber-200">{route}</code>)}</div>
            </section>
            <section className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-5">
              <h2 className="text-lg font-semibold">IP and rights meaning</h2>
              <p className="mt-3 whitespace-pre-line text-sm leading-7 text-muted-foreground">{topic.rights}</p>
            </section>
            <section className="rounded-xl border border-rose-500/20 bg-rose-500/[0.04] p-5">
              <h2 className="text-lg font-semibold">Limits and honest-use notes</h2>
              <ul className="mt-3 space-y-2">{topic.limitations.map((item) => <li key={item} className="flex gap-2 text-sm leading-6 text-muted-foreground"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400" />{item}</li>)}</ul>
            </section>
          </div>
          <aside className="space-y-4">
            <div className="rounded-xl border border-border/50 bg-card/30 p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">In this guide</p>
              <nav className="mt-3 space-y-1">{helpTopics.map((item) => <Link key={item.slug} href={`/help/${item.slug}`} className={`block rounded-md px-2 py-1.5 text-sm ${item.slug === topic.slug ? "bg-amber-500/15 text-amber-300" : "text-muted-foreground hover:bg-white/5 hover:text-foreground"}`}>{item.title}</Link>)}</nav>
            </div>
            <div className="rounded-xl border border-violet-500/25 bg-violet-500/[0.05] p-4">
              <FileText className="h-5 w-5 text-violet-300" />
              <p className="mt-3 text-sm leading-6 text-muted-foreground">Keep the exact file, original source, licenses, certificate ID, and verification result together. This is the strongest practical record the product can help you organize.</p>
            </div>
          </aside>
        </div>
        <div className="flex justify-between gap-3 border-t border-border/50 pt-5">
          {previous ? <Link href={`/help/${previous.slug}`} className="text-sm text-muted-foreground hover:text-amber-300">← {previous.title}</Link> : <span />}
          {next ? <Link href={`/help/${next.slug}`} className="text-sm text-muted-foreground hover:text-amber-300">{next.title} →</Link> : <span />}
        </div>
      </article>
    </Layout>
  );
}

export default function HelpPage() {
  const [isDetail, params] = useRoute("/help/:slug");
  const [location] = useLocation();
  const topic = useMemo(() => (isDetail && params?.slug ? helpTopicBySlug.get(params.slug) : undefined), [isDetail, params?.slug]);
  if (location === "/help" || location === "/help/") return <HelpIndex />;
  if (topic) return <HelpDetail topic={topic} />;
  return <HelpIndex />;
}