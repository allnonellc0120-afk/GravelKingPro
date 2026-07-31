import { useState, useRef, useEffect } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Play, Pause, Volume2, CheckCircle2, Loader2, AlertCircle, Zap, Clock, FileAudio, ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

/* ─── Audio demo player ──────────────────────────────────────────── */
function DemoPlayer({ label, sub, src, isAfter }: { label: string; sub: string; src: string; isAfter?: boolean }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const toggle = async () => {
    const el = ref.current;
    if (!el) return;
    if (playing) { el.pause(); setPlaying(false); }
    else { await el.play(); setPlaying(true); }
  };
  return (
    <div className={`border p-5 space-y-3 transition-colors ${isAfter ? "border-amber-500/40 bg-amber-500/5" : "border-border/40 bg-card/30"}`}>
      <div className="flex items-center justify-between">
        <div>
          <span className={`text-[10px] font-bold px-2 py-0.5 ${isAfter ? "bg-amber-500 text-black" : "bg-zinc-700 text-zinc-300"}`}>{label}</span>
          <p className="text-xs text-muted-foreground mt-1">{sub}</p>
        </div>
        <Volume2 className="w-4 h-4 text-muted-foreground" />
      </div>
      <audio ref={ref} src={src} onEnded={() => setPlaying(false)} preload="none" />
      <Button size="sm" variant={isAfter ? "default" : "outline"}
        className={`w-full h-9 font-semibold text-xs ${isAfter ? "bg-amber-500 hover:bg-amber-600 text-black" : ""}`}
        onClick={toggle}>
        {playing ? <><Pause className="w-3.5 h-3.5 mr-1.5" />Pause</> : <><Play className="w-3.5 h-3.5 mr-1.5 fill-current" />Play {label}</>}
      </Button>
    </div>
  );
}

export default function WeekendSpecial() {
  const [checkoutState, setCheckoutState] = useState<"idle" | "loading" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [orderState, setOrderState] = useState<"sales" | "verifying" | "upload" | "submitted" | "error">("sales");
  const [files, setFiles] = useState<Array<File | null>>([null, null, null]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");

  const sessionId = new URLSearchParams(window.location.search).get("session_id");
  const fulfillmentToken = new URLSearchParams(window.location.search).get("fulfillment_token");
  const checkoutCancelled =
    new URLSearchParams(window.location.search).get("checkout") === "cancelled";

  const handleCheckout = async () => {
    setCheckoutState("loading");
    setErrorMessage(null);

    try {
      const response = await fetch("/api/weekend-special/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });

      if (!response.ok) {
        const data = await response.json() as { error?: string };
        throw new Error(data.error ?? "Checkout failed");
      }

      const data = await response.json() as { url: string };
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error("No checkout URL returned");
      }
    } catch (err: unknown) {
      setCheckoutState("error");
      setErrorMessage(err instanceof Error ? err.message : "Something went wrong");
    }
  };

  useEffect(() => {
    window.scrollTo(0, 0);
    if (!sessionId || !fulfillmentToken) return;
    setOrderState("verifying");
    fetch(`/api/weekend-special/order?session_id=${encodeURIComponent(sessionId)}&fulfillment_token=${encodeURIComponent(fulfillmentToken)}`)
      .then(async (response) => {
        const data = await response.json() as { paid?: boolean; submitted?: boolean; error?: string };
        if (!response.ok || !data.paid) throw new Error(data.error ?? "Payment could not be confirmed");
        setOrderState(data.submitted ? "submitted" : "upload");
      })
      .catch((error: unknown) => {
        setErrorMessage(error instanceof Error ? error.message : "Order lookup failed");
        setOrderState("error");
      });
  }, [sessionId, fulfillmentToken]);

  const submitTracks = async () => {
    if (!sessionId || !fulfillmentToken || files.some((file) => !file)) return;
    setUploading(true);
    setErrorMessage(null);
    try {
      const uploaded: Array<{ name: string; objectPath: string }> = [];
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index] as File;
        setUploadProgress(`Uploading track ${index + 1} of 3...`);
        const formData = new FormData();
        formData.append("index", String(index));
        formData.append("file", file);
        const urlResponse = await fetch(
          `/api/weekend-special/upload?session_id=${encodeURIComponent(sessionId)}&fulfillment_token=${encodeURIComponent(fulfillmentToken)}`,
          {
          method: "POST",
          body: formData,
          },
        );
        const urlData = await urlResponse.json() as { objectPath?: string; name?: string; error?: string };
        if (!urlResponse.ok || !urlData.objectPath) {
          throw new Error(urlData.error ?? `Could not upload track ${index + 1}`);
        }
        uploaded.push({ name: urlData.name ?? file.name, objectPath: urlData.objectPath });
      }
      setUploadProgress("Finalizing your order...");
      const submitResponse = await fetch("/api/weekend-special/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, fulfillmentToken, files: uploaded }),
      });
      const submitData = await submitResponse.json() as { success?: boolean; error?: string };
      if (!submitResponse.ok || !submitData.success) {
        throw new Error(submitData.error ?? "Could not finalize your order");
      }
      setOrderState("submitted");
      window.history.replaceState({}, "", "/weekend-special?submitted=1");
    } catch (error: unknown) {
      setErrorMessage(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploading(false);
      setUploadProgress("");
    }
  };

  if (orderState !== "sales") {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto py-16 px-4">
          <div className="border border-amber-500/30 bg-card/30 p-8 sm:p-10">
            {orderState === "verifying" && (
              <div className="text-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-amber-500 mx-auto" />
                <h1 className="text-2xl font-black mt-5">Confirming your payment</h1>
                <p className="text-muted-foreground mt-2">This normally takes only a few seconds.</p>
              </div>
            )}
            {orderState === "error" && (
              <div className="text-center py-8">
                <AlertCircle className="w-9 h-9 text-red-400 mx-auto" />
                <h1 className="text-2xl font-black mt-5">We could not open this order</h1>
                <p className="text-muted-foreground mt-2">{errorMessage}</p>
                <a href="/contact" className="inline-block text-amber-500 underline mt-5">Contact support</a>
              </div>
            )}
            {orderState === "upload" && (
              <div>
                <Badge variant="outline" className="border-emerald-500/40 text-emerald-400">Payment confirmed</Badge>
                <h1 className="text-4xl font-black mt-4">Upload your 3 songs</h1>
                <p className="text-muted-foreground mt-3">
                  Choose exactly three WAV, MP3, AIFF, FLAC, or M4A files. Your 24–48 hour delivery window starts after all three arrive.
                </p>
                <div className="space-y-4 mt-8">
                  {[0, 1, 2].map((index) => (
                    <label key={index} className="block border border-border/50 bg-background/40 p-4">
                      <span className="text-sm font-bold">Track {index + 1}</span>
                      <input
                        type="file"
                        accept=".wav,.mp3,.aif,.aiff,.flac,.m4a,audio/*"
                        className="block w-full mt-3 text-sm text-muted-foreground file:mr-4 file:border-0 file:bg-amber-500 file:px-4 file:py-2 file:font-bold file:text-black"
                        disabled={uploading}
                        onChange={(event) => {
                          const next = [...files];
                          next[index] = event.target.files?.[0] ?? null;
                          setFiles(next);
                        }}
                      />
                    </label>
                  ))}
                </div>
                {errorMessage && (
                  <div className="mt-5 border border-red-500/40 bg-red-500/5 p-4 text-sm text-red-300">{errorMessage}</div>
                )}
                <Button
                  size="lg"
                  className="w-full h-14 mt-6 bg-amber-500 hover:bg-amber-600 text-black font-bold"
                  disabled={uploading || files.some((file) => !file)}
                  onClick={submitTracks}
                >
                  {uploading ? <><Loader2 className="w-5 h-5 mr-2 animate-spin" />{uploadProgress}</> : "Submit all 3 tracks"}
                </Button>
                <p className="text-xs text-muted-foreground mt-3 text-center">Keep this page open until all three uploads finish.</p>
              </div>
            )}
            {orderState === "submitted" && (
              <div className="text-center py-8">
                <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
                <h1 className="text-3xl font-black mt-5">Your 3 tracks are in</h1>
                <p className="text-muted-foreground mt-3 max-w-md mx-auto">
                  Your order is confirmed. Delivery is expected within 24–48 hours after submission.
                </p>
                <p className="text-sm mt-4">Delivery updates will go to the email used at checkout.</p>
              </div>
            )}
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-3xl mx-auto py-12 px-4 space-y-12">

        {/* ══════════════════════════════════════════
            HERO — The offer
        ══════════════════════════════════════════ */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6 text-center"
        >
          {checkoutCancelled && (
            <div className="max-w-xl mx-auto border border-amber-500/40 bg-amber-500/5 px-5 py-4 text-sm text-amber-200">
              Checkout was canceled. You were not charged, and the offer is still available below.
            </div>
          )}
          <div className="space-y-2">
            <Badge variant="outline" className="border-amber-500/40 text-amber-400 text-xs font-bold px-3 py-1">
              Weekend Special — Limited Capacity
            </Badge>
            <h1 className="text-5xl sm:text-6xl font-black tracking-tight leading-none">
              3 Songs Mastered<br />
              <span className="text-amber-500">for $9.99</span>
            </h1>
            <p className="text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed">
              Get three release-ready masters this weekend. MLK v3 mastering engine. 24–48 hour delivery after upload. One payment, no subscription.
            </p>
          </div>

          {/* Primary CTA */}
          <div className="pt-2">
            <Button
              size="lg"
              className="bg-amber-500 hover:bg-amber-600 text-black font-bold h-14 px-10 text-lg shadow-lg shadow-amber-500/20"
              onClick={handleCheckout}
              disabled={checkoutState === "loading"}
              data-testid="button-checkout-primary"
            >
              {checkoutState === "loading" ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Loading checkout...
                </>
              ) : (
                <>
                  Get 3 Masters for $9.99
                  <ArrowRight className="w-5 h-5 ml-2" />
                </>
              )}
            </Button>
          </div>

          {/* Error state */}
          <AnimatePresence>
            {checkoutState === "error" && errorMessage && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="flex items-start gap-3 border border-red-500/40 bg-red-500/5 px-5 py-4 text-left max-w-lg mx-auto"
                data-testid="checkout-error"
              >
                <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-red-400">Checkout failed</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{errorMessage}</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Value props */}
          <div className="flex items-center justify-center gap-4 flex-wrap pt-2 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              One-time payment
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              No subscription
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              24–48 hour delivery
            </span>
          </div>
        </motion.div>

        {/* ══════════════════════════════════════════
            HOW IT WORKS — Process clarity
        ══════════════════════════════════════════ */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="border border-border/40 bg-card/30 p-8 space-y-6"
        >
          <div className="text-center space-y-1">
            <h2 className="text-2xl font-black">How it works</h2>
            <p className="text-sm text-muted-foreground">Simple process, fast turnaround.</p>
          </div>

          <div className="space-y-5">
            {[
              {
                step: "1",
                icon: <Zap className="w-5 h-5 text-amber-400" />,
                title: "Pay $9.99 once",
                body: "One-time payment. No recurring charges. No hidden fees.",
              },
              {
                step: "2",
                icon: <FileAudio className="w-5 h-5 text-sky-400" />,
                title: "Upload 3 songs",
                body: "WAV or MP3 accepted. You'll receive upload instructions after checkout.",
              },
              {
                step: "3",
                icon: <Clock className="w-5 h-5 text-emerald-400" />,
                title: "Get masters in 24–48 hours",
                body: "We'll process your tracks through the MLK v3 mastering engine and deliver lossless WAV files.",
              },
            ].map((item) => (
              <div key={item.step} className="flex items-start gap-4">
                <div className="flex items-center justify-center w-10 h-10 bg-muted/50 border border-border/30 font-bold text-lg shrink-0">
                  {item.step}
                </div>
                <div className="flex-1 pt-1">
                  <div className="flex items-center gap-2 mb-1">
                    {item.icon}
                    <h3 className="font-bold text-base">{item.title}</h3>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{item.body}</p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* ══════════════════════════════════════════
            WHAT YOU GET — Offer details
        ══════════════════════════════════════════ */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="space-y-5"
        >
          <div className="text-center space-y-1">
            <h2 className="text-2xl font-black">What you get</h2>
            <p className="text-sm text-muted-foreground">Release-ready masters, lossless output.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { icon: <CheckCircle2 className="w-5 h-5 text-emerald-500" />, text: "3 mastered tracks" },
              { icon: <CheckCircle2 className="w-5 h-5 text-emerald-500" />, text: "MLK v3 mastering engine" },
              { icon: <CheckCircle2 className="w-5 h-5 text-emerald-500" />, text: "Lossless WAV output" },
              { icon: <CheckCircle2 className="w-5 h-5 text-emerald-500" />, text: "One revision per track" },
              { icon: <CheckCircle2 className="w-5 h-5 text-emerald-500" />, text: "24–48 hour delivery" },
              { icon: <CheckCircle2 className="w-5 h-5 text-emerald-500" />, text: "WAV or MP3 accepted" },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-3 border border-border/30 bg-card/20 px-4 py-3">
                {item.icon}
                <span className="text-sm font-medium">{item.text}</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* ══════════════════════════════════════════
            AUDIO DEMO — Before/After
        ══════════════════════════════════════════ */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="space-y-5"
        >
          <div className="text-center space-y-1">
            <h2 className="text-xl font-bold">Hear the difference</h2>
            <p className="text-sm text-muted-foreground">Same track, before and after MLK v3 mastering.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <DemoPlayer label="Before" sub="Raw upload" src="/demo_original.wav" />
            <DemoPlayer label="After" sub="MLK v3 Mastered" src="/demo_mastered.wav" isAfter />
          </div>
        </motion.div>

        {/* ══════════════════════════════════════════
            DETAILS — Fine print
        ══════════════════════════════════════════ */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="border border-border/30 bg-card/10 p-6 space-y-4"
        >
          <h3 className="text-base font-bold">The details</h3>
          <ul className="space-y-2 text-sm text-muted-foreground leading-relaxed">
            <li className="flex items-start gap-2">
              <span className="text-amber-500 shrink-0 mt-0.5">•</span>
              <span><strong className="text-foreground">One-time payment:</strong> $9.99 total. No recurring charges. No subscription.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-amber-500 shrink-0 mt-0.5">•</span>
              <span><strong className="text-foreground">Three songs:</strong> Upload up to three tracks. WAV or MP3 accepted.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-amber-500 shrink-0 mt-0.5">•</span>
              <span><strong className="text-foreground">Delivery:</strong> 24–48 hours after you submit all three files. Masters delivered as lossless WAV.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-amber-500 shrink-0 mt-0.5">•</span>
              <span><strong className="text-foreground">One revision:</strong> Each track includes one revision if you need adjustments.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-amber-500 shrink-0 mt-0.5">•</span>
              <span><strong className="text-foreground">Limited capacity:</strong> We process weekend special orders in batches to maintain quality. Slots are first-come, first-served.</span>
            </li>
          </ul>
        </motion.div>

        {/* ══════════════════════════════════════════
            FINAL CTA
        ══════════════════════════════════════════ */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="border border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-amber-400/5 to-transparent p-8 text-center space-y-5"
        >
          <div className="space-y-2">
            <h2 className="text-3xl font-black">Get started now</h2>
            <p className="text-muted-foreground max-w-lg mx-auto">
              Pay once. Upload three tracks. Get release-ready masters in 24–48 hours.
            </p>
          </div>
          <Button
            size="lg"
            className="bg-amber-500 hover:bg-amber-600 text-black font-bold h-14 px-10 text-lg"
            onClick={handleCheckout}
            disabled={checkoutState === "loading"}
            data-testid="button-checkout-secondary"
          >
            {checkoutState === "loading" ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Loading checkout...
              </>
            ) : (
              <>
                Get 3 Masters for $9.99
                <ArrowRight className="w-5 h-5 ml-2" />
              </>
            )}
          </Button>
          <p className="text-xs text-muted-foreground">
            Questions? <a href="/contact" className="text-amber-500 underline underline-offset-2">Contact us</a>
          </p>
        </motion.div>

      </div>
    </Layout>
  );
}
