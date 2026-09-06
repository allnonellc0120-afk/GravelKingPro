import { getUncachableStripeClient } from "./stripeClient";

const associationUrl =
  "https://gravelkingpro.com/.well-known/apple-developer-merchantid-domain-association";
const paymentMethodDomainId =
  process.env.STRIPE_PAYMENT_METHOD_DOMAIN_ID ?? "pmd_1UCKnWCxsQjjsZPGbAEsuCv6";

function formatFailure(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function verifyLiveAssociationFile(): Promise<void> {
  const response = await fetch(associationUrl, {
    headers: { Accept: "application/octet-stream, text/plain, */*" },
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await response.text()).trim();

  if (!response.ok) {
    throw new Error(
      `association URL returned HTTP ${response.status} (expected 200)`,
    );
  }

  // A missing static asset can still return HTTP 200 when the SPA fallback
  // serves index.html. Reject that false-positive response explicitly.
  if (
    body.length < 1_000 ||
    !/^[0-9a-f]+$/i.test(body)
  ) {
    throw new Error(
      `association URL returned HTTP 200 but not the Apple verification file`,
    );
  }

  try {
    const decoded = JSON.parse(Buffer.from(body, "hex").toString("utf8")) as {
      pspId?: unknown;
      signature?: unknown;
    };
    if (typeof decoded.pspId !== "string" || typeof decoded.signature !== "string") {
      throw new Error("missing signed association fields");
    }
  } catch (error) {
    throw new Error(
      `association URL returned HTTP 200 but the verification file is malformed: ${formatFailure(error)}`,
    );
  }
}

async function verifyPaymentMethodDomain(): Promise<void> {
  const stripe = await getUncachableStripeClient();
  const domain = await stripe.paymentMethodDomains.validate(paymentMethodDomainId);
  const appleStatus = domain.apple_pay?.status;
  const googleStatus = domain.google_pay?.status;

  if (domain.domain_name !== "gravelkingpro.com") {
    throw new Error(
      `Stripe returned domain ${domain.domain_name ?? "unknown"} for ${paymentMethodDomainId}`,
    );
  }

  if (appleStatus !== "active" || googleStatus !== "active") {
    throw new Error(
      `Stripe PMD ${paymentMethodDomainId} is not wallet-active ` +
        `(apple_pay=${appleStatus ?? "unknown"}, google_pay=${googleStatus ?? "unknown"})`,
    );
  }
}

async function main(): Promise<void> {
  const checks = [
    ["live association URL", verifyLiveAssociationFile()],
    ["Stripe Payment Method Domain", verifyPaymentMethodDomain()],
  ] as const;
  const results = await Promise.allSettled(checks.map(([, check]) => check));
  const failures: string[] = [];

  for (let index = 0; index < checks.length; index += 1) {
    const [name] = checks[index];
    const result = results[index];
    if (result.status === "fulfilled") {
      console.log(`PASS ${name}`);
    } else {
      const message = formatFailure(result.reason);
      failures.push(`${name}: ${message}`);
      console.error(`FAIL ${name}: ${message}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `Wallet verification failed (${failures.length}/${checks.length} checks). ` +
        "Do not publish or advertise wallet checkout until every check passes.",
    );
  }

  console.log(
    `PASS wallet checkout: ${paymentMethodDomainId} and ${associationUrl} are healthy`,
  );
}

main().catch((error: unknown) => {
  console.error(`FAIL wallet checkout verification: ${formatFailure(error)}`);
  process.exitCode = 1;
});